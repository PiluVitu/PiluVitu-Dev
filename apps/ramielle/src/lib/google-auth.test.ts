import { describe, expect, test } from 'vitest'
import {
  assinarJwt,
  getAccessToken,
  parseServiceAccount,
  type ServiceAccount,
} from './google-auth'

describe('parseServiceAccount', () => {
  test('recusa JSON inválido com mensagem acionável citando GOOGLE_SA_JSON', () => {
    expect(() => parseServiceAccount('{')).toThrow(/GOOGLE_SA_JSON/)
  })

  test('recusa JSON válido sem os campos obrigatórios, citando o campo que falta', () => {
    expect(() => parseServiceAccount('{"client_email":"a@b.c"}')).toThrow(
      /private_key/,
    )
  })

  test('recusa quando falta só token_uri (client_email e private_key presentes)', () => {
    expect(() =>
      parseServiceAccount(
        JSON.stringify({ client_email: 'a@b.c', private_key: 'chave' }),
      ),
    ).toThrow(/token_uri/)
  })

  test('recusa campo vazio como se estivesse ausente', () => {
    expect(() =>
      parseServiceAccount(
        JSON.stringify({
          client_email: 'a@b.c',
          private_key: '',
          token_uri: 'https://oauth2.googleapis.com/token',
        }),
      ),
    ).toThrow(/private_key/)
  })

  test('recusa JSON que não é um objeto (array, string, número)', () => {
    expect(() => parseServiceAccount('[1,2,3]')).toThrow(/GOOGLE_SA_JSON/)
    expect(() => parseServiceAccount('"texto"')).toThrow(/GOOGLE_SA_JSON/)
    expect(() => parseServiceAccount('42')).toThrow(/GOOGLE_SA_JSON/)
  })

  test('aceita e devolve os três campos, ignorando campos extras do JSON real da service account', () => {
    const json = JSON.stringify({
      type: 'service_account',
      project_id: 'projeto-de-teste',
      client_email: 'conta@projeto-de-teste.iam.gserviceaccount.com',
      private_key:
        '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
      token_uri: 'https://oauth2.googleapis.com/token',
      private_key_id: 'abc123',
    })
    const sa = parseServiceAccount(json)
    expect(sa).toEqual<ServiceAccount>({
      client_email: 'conta@projeto-de-teste.iam.gserviceaccount.com',
      private_key:
        '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n',
      token_uri: 'https://oauth2.googleapis.com/token',
    })
  })
})

// --------------------------------------------------------------------
// Chave de TESTE gerada dentro do próprio teste, via
// crypto.subtle.generateKey + exportKey('pkcs8') envelopado em PEM — NUNCA
// a chave real de uma service account, nem uma chave de teste com
// aparência de real. Devolve também a chave PÚBLICA para o teste que
// verifica a assinatura de verdade (crypto.subtle.verify), não só a forma.
// --------------------------------------------------------------------
async function gerarServiceAccountDeTeste(
  clientEmail = 'teste@projeto-de-teste.iam.gserviceaccount.com',
): Promise<{ sa: ServiceAccount; chavePublica: CryptoKey }> {
  const par = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', par.privateKey)
  const bytes = new Uint8Array(pkcs8)
  let binario = ''
  for (let i = 0; i < bytes.length; i++)
    binario += String.fromCharCode(bytes[i])
  const base64 = btoa(binario)
  const linhas = base64.match(/.{1,64}/g) ?? [base64]
  const pem = `-----BEGIN PRIVATE KEY-----\n${linhas.join('\n')}\n-----END PRIVATE KEY-----\n`

  return {
    sa: {
      client_email: clientEmail,
      private_key: pem,
      token_uri: 'https://oauth2.googleapis.com/token',
    },
    chavePublica: par.publicKey,
  }
}

// `Uint8Array<ArrayBuffer>`, não o bare — mesmo achado MEDIDO em
// domain/tiebreak.ts e google-auth.ts: crypto.subtle.verify pede
// `ArrayBufferView<ArrayBuffer>`, e o default genérico do TS 5.7+ é
// `ArrayBufferLike` (que inclui SharedArrayBuffer, não atribuível).
function base64urlParaBytes(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

describe('assinarJwt', () => {
  test('produz um JWT de 3 partes com header RS256, as claims certas, e assinatura VERIFICADA de verdade', async () => {
    const { sa, chavePublica } = await gerarServiceAccountDeTeste()

    const jwt = await assinarJwt(
      sa,
      'escopo/teste',
      new Date('2026-08-06T12:00:00Z'),
    )
    const partes = jwt.split('.')
    expect(partes).toHaveLength(3)
    const [h, c, s] = partes

    expect(JSON.parse(atob(h.replace(/-/g, '+').replace(/_/g, '/')))).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })

    const claims = JSON.parse(atob(c.replace(/-/g, '+').replace(/_/g, '/')))
    expect(claims.iss).toBe(sa.client_email)
    expect(claims.aud).toBe(sa.token_uri)
    expect(claims.scope).toBe('escopo/teste')
    // exp = iat + 3600, e iat sai do relógio INJETADO
    expect(claims.iat).toBe(
      Math.floor(Date.parse('2026-08-06T12:00:00Z') / 1000),
    )
    expect(claims.exp).toBe(claims.iat + 3600)

    // O teste que vale de verdade: a assinatura FECHA sobre `header.claims`,
    // verificada com a chave PÚBLICA do par gerado neste teste. Sem isto,
    // uma implementação que assinasse a string errada (ou nada) passaria
    // nas asserções acima.
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      chavePublica,
      base64urlParaBytes(s),
      new TextEncoder().encode(`${h}.${c}`),
    )
    expect(ok).toBe(true)
  })

  // Step 5 do brief: sem `base64url` removendo o `=`/trocando `+`,`/`, este
  // é o único teste que pega o defeito — o Google rejeita um JWT com
  // padding, mas `crypto.subtle.verify` continua fechando (a assinatura é
  // sobre a mesma entrada de bytes, só a REPRESENTAÇÃO de texto muda).
  // MUTAÇÃO CONFIRMADA (revertida): fazer base64url manter o `=` de
  // padding derruba exatamente este teste, sem derrubar o de cima.
  test('nenhuma das 3 partes contém "=", "+" ou "/" — base64url de verdade, não btoa cru', async () => {
    const { sa } = await gerarServiceAccountDeTeste()
    const jwt = await assinarJwt(
      sa,
      'escopo/teste',
      new Date('2026-08-06T12:00:00Z'),
    )
    for (const parte of jwt.split('.')) {
      expect(parte).not.toMatch(/[=+/]/)
    }
  })

  test('a chave PEM com \\n literais (como o JSON.parse já entrega) funciona sem dupla conversão', async () => {
    // Mesmo helper de geração, mas prova que o PEM tal como
    // parseServiceAccount devolveria (quebras de linha REAIS, não `\\n`
    // escapado) é aceito sem transformação extra.
    const { sa } = await gerarServiceAccountDeTeste()
    const json = JSON.stringify({
      client_email: sa.client_email,
      private_key: sa.private_key,
      token_uri: sa.token_uri,
    })
    const saDoParse = parseServiceAccount(json)
    await expect(
      assinarJwt(saDoParse, 'escopo/teste', new Date('2026-08-06T12:00:00Z')),
    ).resolves.toEqual(expect.stringMatching(/^[^.]+\.[^.]+\.[^.]+$/))
  })
})

// --------------------------------------------------------------------
// Nunca chamamos o Google de verdade. globalThis.fetch é sobrescrito só
// para o token_uri exato do service account de teste, delegando todo o
// resto pro fetch original, restaurado num `finally` — o mesmo padrão que
// lib/auth.test.ts já usa (o fetchMock do cloudflare:test não existe na
// versão instalada).
// --------------------------------------------------------------------
function instalarMockTokenEndpoint(
  tokenUri: string,
  handler: () => Response,
): { restaurar: () => void; chamadas: () => number } {
  let chamadas = 0
  const fetchOriginal = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto === tokenUri) {
      chamadas++
      return handler()
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  return {
    restaurar: () => {
      globalThis.fetch = fetchOriginal
    },
    chamadas: () => chamadas,
  }
}

function respostaTokenOk(accessToken: string, expiresIn = 3599): Response {
  return new Response(
    JSON.stringify({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
}

describe('getAccessToken — cache por isolate', () => {
  test('primeira chamada faz fetch; segunda, dentro da validade, não faz; avançando o relógio pra dentro da margem, faz de novo', async () => {
    const { sa } = await gerarServiceAccountDeTeste()
    const scope = 'escopo/cache-teste-1'
    let numeroDoToken = 0
    const mock = instalarMockTokenEndpoint(sa.token_uri, () => {
      numeroDoToken++
      return respostaTokenOk(`token-${numeroDoToken}`, 3599)
    })

    try {
      const inicio = new Date('2026-08-06T12:00:00Z')

      const t1 = await getAccessToken(sa, scope, { now: inicio })
      expect(mock.chamadas()).toBe(1)
      expect(t1).toBe('token-1')

      // Bem dentro da validade (1 minuto depois, expira só em 3599s).
      const t2 = await getAccessToken(sa, scope, {
        now: new Date(inicio.getTime() + 60_000),
      })
      expect(mock.chamadas()).toBe(1) // não fez fetch de novo
      expect(t2).toBe('token-1')

      // Dentro da margem de renovação (5 min antes do exp real).
      const dentroDaMargem = new Date(
        inicio.getTime() + (3599 - 60) * 1000, // 60s antes do exp: dentro dos 5min de margem
      )
      const t3 = await getAccessToken(sa, scope, { now: dentroDaMargem })
      expect(mock.chamadas()).toBe(2) // renovou
      expect(t3).toBe('token-2')
    } finally {
      mock.restaurar()
    }
  })

  test('escopos diferentes para o mesmo client_email têm entradas de cache independentes', async () => {
    const { sa } = await gerarServiceAccountDeTeste(
      'teste-escopos@projeto-de-teste.iam.gserviceaccount.com',
    )
    let numeroDoToken = 0
    const mock = instalarMockTokenEndpoint(sa.token_uri, () => {
      numeroDoToken++
      return respostaTokenOk(`token-${numeroDoToken}`, 3599)
    })

    try {
      const agora = new Date('2026-08-06T13:00:00Z')
      const tSheets = await getAccessToken(sa, 'escopo/sheets', { now: agora })
      const tDrive = await getAccessToken(sa, 'escopo/drive', { now: agora })
      expect(mock.chamadas()).toBe(2)
      expect(tSheets).not.toBe(tDrive)

      // Repetir os dois: nenhuma chamada nova, cada um serve do seu cache.
      await getAccessToken(sa, 'escopo/sheets', { now: agora })
      await getAccessToken(sa, 'escopo/drive', { now: agora })
      expect(mock.chamadas()).toBe(2)
    } finally {
      mock.restaurar()
    }
  })
})

describe('getAccessToken — o token endpoint pode falhar', () => {
  test('400 invalid_grant vira mensagem acionável, sem ecoar o corpo cru da resposta', async () => {
    const { sa } = await gerarServiceAccountDeTeste(
      'teste-erro-400@projeto-de-teste.iam.gserviceaccount.com',
    )
    const scope = 'escopo/erro-400'
    const detalheSensivel = 'detalhe-de-credencial-que-nao-pode-vazar'
    const mock = instalarMockTokenEndpoint(
      sa.token_uri,
      () =>
        new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: detalheSensivel,
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    )

    try {
      await expect(
        getAccessToken(sa, scope, { now: new Date('2026-08-06T12:00:00Z') }),
      ).rejects.toThrow()

      let mensagem = ''
      try {
        await getAccessToken(sa, scope, {
          now: new Date('2026-08-06T12:00:00Z'),
        })
      } catch (err) {
        mensagem = String(err)
      }
      expect(mensagem.length).toBeGreaterThan(0)
      expect(mensagem).not.toContain(detalheSensivel)
      expect(mensagem).not.toContain('error_description')
      // A mensagem é ACIONÁVEL: cita o secret que o dono precisa conferir.
      expect(mensagem).toMatch(/GOOGLE_SA_JSON/)
    } finally {
      mock.restaurar()
    }
  })

  test('401 também vira mensagem acionável (não só 400)', async () => {
    const { sa } = await gerarServiceAccountDeTeste(
      'teste-erro-401@projeto-de-teste.iam.gserviceaccount.com',
    )
    const mock = instalarMockTokenEndpoint(
      sa.token_uri,
      () =>
        new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    )

    try {
      await expect(
        getAccessToken(sa, 'escopo/erro-401', {
          now: new Date('2026-08-06T12:00:00Z'),
        }),
      ).rejects.toThrow(/GOOGLE_SA_JSON/)
    } finally {
      mock.restaurar()
    }
  })

  test('resposta 200 sem access_token/expires_in também é rejeitada com mensagem clara', async () => {
    const { sa } = await gerarServiceAccountDeTeste(
      'teste-formato-ruim@projeto-de-teste.iam.gserviceaccount.com',
    )
    const mock = instalarMockTokenEndpoint(
      sa.token_uri,
      () =>
        new Response(JSON.stringify({ token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )

    try {
      await expect(
        getAccessToken(sa, 'escopo/formato-ruim', {
          now: new Date('2026-08-06T12:00:00Z'),
        }),
      ).rejects.toThrow(/access_token/)
    } finally {
      mock.restaurar()
    }
  })
})

describe('segurança — a mensagem de erro nunca vaza segredo', () => {
  test('o erro de getAccessToken não contém a chave privada, o JWT nem nenhum access token', async () => {
    const { sa } = await gerarServiceAccountDeTeste(
      'teste-seguranca@projeto-de-teste.iam.gserviceaccount.com',
    )
    const scope = 'escopo/seguranca'
    const now = new Date('2026-08-06T12:00:00Z')

    // O JWT que a chamada real teria enviado — usado só pra provar que ele
    // não aparece na mensagem de erro, nunca enviado ao endpoint mockado.
    const jwtQueSeriaEnviado = await assinarJwt(sa, scope, now)

    const mock = instalarMockTokenEndpoint(
      sa.token_uri,
      () =>
        new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: `assertion contained secret material: ${jwtQueSeriaEnviado}`,
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    )

    try {
      let mensagem = ''
      try {
        await getAccessToken(sa, scope, { now })
      } catch (err) {
        mensagem = String(err) + (err instanceof Error ? (err.stack ?? '') : '')
      }
      expect(mensagem.length).toBeGreaterThan(0)
      expect(mensagem).not.toContain(sa.private_key)
      expect(mensagem).not.toContain('BEGIN PRIVATE KEY')
      expect(mensagem).not.toContain(jwtQueSeriaEnviado)
    } finally {
      mock.restaurar()
    }
  })

  test('o access token cacheado com sucesso não aparece caso getAccessToken seja chamado de novo e falhe depois', async () => {
    // Cenário: primeira chamada tem sucesso e cacheia um token; se uma
    // chamada NOVA (escopo diferente) falhar depois, o token da primeira
    // não pode vazar na mensagem da segunda.
    const { sa } = await gerarServiceAccountDeTeste(
      'teste-seguranca-cache@projeto-de-teste.iam.gserviceaccount.com',
    )
    const now = new Date('2026-08-06T12:00:00Z')
    const tokenSecreto = 'access-token-super-secreto-nao-pode-vazar'

    let deveFalhar = false
    const mock = instalarMockTokenEndpoint(sa.token_uri, () => {
      if (deveFalhar) {
        return new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })
      }
      return respostaTokenOk(tokenSecreto, 3599)
    })

    try {
      const t1 = await getAccessToken(sa, 'escopo/seguranca-cache-ok', {
        now,
      })
      expect(t1).toBe(tokenSecreto)

      deveFalhar = true
      let mensagem = ''
      try {
        await getAccessToken(sa, 'escopo/seguranca-cache-falha', { now })
      } catch (err) {
        mensagem = String(err)
      }
      expect(mensagem.length).toBeGreaterThan(0)
      expect(mensagem).not.toContain(tokenSecreto)
    } finally {
      mock.restaurar()
    }
  })
})
