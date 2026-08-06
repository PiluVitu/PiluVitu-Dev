import { describe, expect, test } from 'vitest'
import { getCategories, parseRow, readMovies, type SheetMovie } from './gsheets'
import type { ServiceAccount } from './google-auth'

describe('parseRow', () => {
  test('linha REAL da planilha: título na coluna B (índice 1), categoria na D (índice 3)', () => {
    const row = ['1', '(500) Dias com Ela', 'Filme', 'Romance', 'FALSE']
    expect(parseRow(row)).toEqual<SheetMovie>({
      number: 1,
      title: '(500) Dias com Ela',
      type: 'filme',
      category: 'romance',
      watched: false,
    })
  })

  test('len(row) < 5 descarta', () => {
    expect(parseRow(['1', 'Título', 'Filme', 'Categoria'])).toBeNull()
    expect(parseRow(['1', 'Título'])).toBeNull()
    expect(parseRow([])).toBeNull()
  })

  test('largura 6 (nota na coluna F) continua usável', () => {
    expect(
      parseRow(['1', 'Título', 'Filme', 'Categoria', 'sim', '8']),
    ).not.toBeNull()
  })

  test('título vazio (após trim) descarta', () => {
    expect(parseRow(['1', '   ', 'Filme', 'Categoria', 'sim'])).toBeNull()
    expect(parseRow(['1', '', 'Filme', 'Categoria', 'sim'])).toBeNull()
  })

  test('categoria vazia (após trim) descarta', () => {
    expect(parseRow(['1', 'Título', 'Filme', '   ', 'sim'])).toBeNull()
    expect(parseRow(['1', 'Título', 'Filme', '', 'sim'])).toBeNull()
  })

  test('categoria vai para minúscula, trimada', () => {
    expect(
      parseRow(['1', 'Título', 'Filme', '  Aventura  ', 'sim'])?.category,
    ).toBe('aventura')
  })

  // ⚠️ Mutação obrigatória do brief: trocar o índice 3 pelo 1 na leitura da
  // categoria faz este teste (e o da linha real acima) FALHAR — categoria
  // viraria "(500) dias com ela" (o título minúsculo) em vez de "romance".
  test('a categoria NÃO é a coluna do título — troca de índice quebraria isto', () => {
    const row = ['1', 'Título do Filme', 'Filme', 'Suspense', 'sim']
    const parsed = parseRow(row)
    expect(parsed?.category).toBe('suspense')
    expect(parsed?.category).not.toBe('título do filme')
  })

  test.each([
    ['abc', 0],
    ['', 0],
    ['   ', 0],
    ['12.5', 0], // Atoi rejeita float — não é parse parcial (não vira 12)
    ['-3', -3],
    ['42', 42],
  ])(
    'number tolerante: %p vira %p (nunca descarta a linha por causa disso)',
    (raw, esperado) => {
      const row = [raw, 'Título', 'Filme', 'Categoria', 'sim']
      const parsed = parseRow(row)
      expect(parsed).not.toBeNull()
      expect(parsed?.number).toBe(esperado)
    },
  )

  test.each([
    ['serie', 'serie'],
    ['série', 'serie'], // planilha real usa a forma acentuada
    ['SÉRIE', 'serie'],
    ['  Série  ', 'serie'],
    ['Filme', 'filme'],
    ['filme', 'filme'],
    ['qualquer coisa', 'filme'],
    ['', 'filme'],
  ])('type: %p vira %p', (raw, esperado) => {
    const row = ['1', 'Título', raw, 'Categoria', 'sim']
    expect(parseRow(row)?.type).toBe(esperado)
  })

  test.each([
    ['sim', true],
    ['SIM', true],
    ['  sim  ', true],
    ['yes', true],
    ['true', true],
    ['1', true],
    ['não', false],
    ['no', false],
    ['0', false],
    ['', false],
    ['qualquer coisa', false],
  ])('watched: %p vira %p', (raw, esperado) => {
    const row = ['1', 'Título', 'Filme', 'Categoria', raw]
    expect(parseRow(row)?.watched).toBe(esperado)
  })
})

// --------------------------------------------------------------------------
// readMovies/getCategories — NUNCA chamam o Google de verdade. Mocka
// globalThis.fetch interceptando só o token endpoint (SA de teste) e o
// endpoint de values do Sheets, delegando o resto pro fetch original,
// restaurado num `finally` — mesmo padrão de lib/auth.test.ts e
// lib/google-auth.test.ts (o fetchMock do cloudflare:test não existe na
// versão instalada).
// --------------------------------------------------------------------------

async function gerarServiceAccountDeTeste(
  clientEmail: string,
): Promise<ServiceAccount> {
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
    client_email: clientEmail,
    private_key: pem,
    token_uri: 'https://oauth2.googleapis.com/token',
  }
}

function instalarMockGoogleSheets(
  tokenUri: string,
  spreadsheetId: string,
  range: string,
  valuesOuStatus: unknown[][] | number,
): { restaurar: () => void } {
  const fetchOriginal = globalThis.fetch
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto === tokenUri) {
      return new Response(
        JSON.stringify({
          access_token: 'token-de-teste-gsheets',
          token_type: 'Bearer',
          expires_in: 3599,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    if (urlTexto === valuesUrl) {
      if (typeof valuesOuStatus === 'number') {
        return new Response('erro simulado', { status: valuesOuStatus })
      }
      return new Response(JSON.stringify({ values: valuesOuStatus }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0], init)
  }) as typeof fetch
  return {
    restaurar: () => {
      globalThis.fetch = fetchOriginal
    },
  }
}

describe('readMovies — descarte em massa (paridade com a planilha real)', () => {
  test('4 linhas — 1 curta (len<5), 1 sem título, 1 sem categoria, 1 boa ⇒ devolve 1', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-descarte@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-descarte',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      [
        ['1', 'Curta'], // len < 5, descarta
        ['2', '   ', 'Filme', 'Drama', 'sim'], // sem título, descarta
        ['3', 'Sem Categoria', 'Filme', '   ', 'sim'], // sem categoria, descarta
        ['4', 'Boa', 'Filme', 'Comédia', 'sim'], // boa, sobrevive
      ],
    )
    try {
      const movies = await readMovies(cfg)
      expect(movies).toHaveLength(1)
      expect(movies[0]).toEqual<SheetMovie>({
        number: 4,
        title: 'Boa',
        type: 'filme',
        category: 'comédia',
        watched: true,
      })
    } finally {
      mock.restaurar()
    }
  })

  test('resposta sem "values" (planilha vazia) devolve lista vazia, não lança', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-vazia@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-vazia',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      [],
    )
    try {
      await expect(readMovies(cfg)).resolves.toEqual([])
    } finally {
      mock.restaurar()
    }
  })

  test('resposta não-ok do Sheets lança (a rota mapeia isto pra 502)', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-falha-sheets@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-falha',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      500,
    )
    try {
      await expect(readMovies(cfg)).rejects.toThrow()
    } finally {
      mock.restaurar()
    }
  })
})

describe('getCategories — dedupe + ordenação de BYTE, não localeCompare', () => {
  test('categorias reais medidas, incluindo acentuadas, saem deduplicadas e na ordem de byte/codepoint UTF', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-categorias@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-categorias',
      range: 'A2:F',
    }
    // Entrada fora de ordem, com uma duplicata proposital (Romance 2x).
    const categoriasEntrada = [
      'Terror',
      'Romance',
      'Ação',
      'Animação',
      'Aventura',
      'Comédia',
      'Crime / Investigação',
      'Documentário',
      'Drama',
      'Ficção Científica',
      'Suspense',
      'Romance',
    ]
    const rows = categoriasEntrada.map((cat, i) => [
      String(i + 1),
      `Filme ${i}`,
      'Filme',
      cat,
      'sim',
    ])
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      rows,
    )
    try {
      const categorias = await getCategories(cfg)
      // ⚠️ Esta ordem SÓ passa com comparação de byte/codepoint (o `sort()`
      // default do JS). Sob `localeCompare('pt-BR')`, `ação` colateria perto
      // do início (`ç`~`c`), produzindo
      // [ação, animação, aventura, comédia, ...] em vez desta — MEDIDO.
      expect(categorias).toEqual([
        'animação',
        'aventura',
        'ação',
        'comédia',
        'crime / investigação',
        'documentário',
        'drama',
        'ficção científica',
        'romance',
        'suspense',
        'terror',
      ])
      // Dedupe: 12 linhas de entrada (Romance duplicado), 11 categorias únicas.
      expect(categorias).toHaveLength(11)
    } finally {
      mock.restaurar()
    }
  })
})
