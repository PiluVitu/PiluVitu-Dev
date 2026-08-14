// Testes do harness de comparação lado a lado (fatia ④, Task 4 + fix round
// 1). Roda sob `vitest.scripts.config.ts` (environment: 'node', SEM o pool
// do Miniflare/cloudflareTest do resto do Worker) — mesmo padrão de
// gerar-import.test.mjs, este script também é Node puro (fetch nativo, sem
// D1/Worker). `pnpm --filter @piluvitu/ramielle run test` encadeia os dois
// configs.
//
// ⚠️ Fix round 1 (revisão do coordenador): a entrega original relatava
// "os dois lados recusaram" (cookie expirado ⇒ 401/401; conta não-admin ⇒
// 403/403) como SUCESSO — `Resumo: 7/7 rotas iguais`, exit 0, ZERO rotas de
// fato comparadas. Três correções: (1) pré-voo (`preVoo`) que aborta com
// exit 3 se `GET /auth/me` não for 200+admin nos dois lados; (2) um
// terceiro estado `'nao-comparado'` em `compararRespostas` pra quando os
// dois lados recusam de forma IDÊNTICA por qualquer outro motivo; (3) um
// piso explícito no relatório (`ROTAS_ESPERADAS`) que força `exit 1` quando
// há rota pulada, não-comparada, ou quando nada foi de fato comparado. As
// fixtures usam os SHAPES reais medidos nas rotas (PascalCase de
// `sessionToWire`, snake_case de `/admin/users`/`/sessions/{id}/votes`/
// `/auth/me` — ver apps/ramielle/src/lib/wire.ts e
// apps/ramielle/src/routes/auth.ts), não objetos genéricos.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  ROTAS_ESPERADAS,
  chamar,
  compararRespostas,
  diffProfundo,
  ehStatusDeSucesso,
  executarComparacao,
  extrairPrimeiroIdDeSessao,
  formatarRelatorio,
  normalizarTimestamp,
  parseArgs,
  preVoo,
  run,
} from './comparar-com-go.mjs'

// -------------------------------------------------------------------------
// Fixtures — shapes reais (ver cabeçalho do arquivo).
// -------------------------------------------------------------------------

function envelope(data, notifications = []) {
  return { ok: true, data, notifications }
}

function resp(status, body) {
  return { status, body }
}

/** Espelha WireSession (src/lib/wire.ts) — PascalCase, sem tag `json:` no Go. */
function sessaoWire(overrides = {}) {
  return {
    ID: 42,
    Title: 'Sessão de teste',
    Status: 'closed',
    CreatedBy: 1,
    CreatedAt: '2026-05-19T12:00:00Z',
    ClosedAt: '2026-05-19T13:00:00Z',
    WinnerMovieID: 7,
    WinnerMethod: 'votes',
    SortOptionsJSON: '{"title":"x"}',
    ...overrides,
  }
}

/** Espelha o shape de `GET /auth/me` — 5 campos, idêntico nos dois lados (routes/auth.ts). */
function respostaAuthMeOk(overrides = {}) {
  return resp(
    200,
    envelope({
      id: 1,
      name: 'Dono',
      email: 'dono@example.com',
      picture: '',
      is_admin: true,
      ...overrides,
    }),
  )
}

// -------------------------------------------------------------------------
// normalizarTimestamp — a função pura que a allowlist de campos usa.
// -------------------------------------------------------------------------

describe('normalizarTimestamp', () => {
  test('formato Go (espaço, sem Z) normaliza pro mesmo instante que o RFC3339 do ramielle', () => {
    expect(normalizarTimestamp('2026-05-19 12:00:00')).toBe(
      normalizarTimestamp('2026-05-19T12:00:00Z'),
    )
  })

  test('string vazia devolve null (não finge que normalizou)', () => {
    expect(normalizarTimestamp('')).toBeNull()
    expect(normalizarTimestamp('   ')).toBeNull()
  })

  test('lixo não-data devolve null', () => {
    expect(normalizarTimestamp('não é uma data')).toBeNull()
  })

  test('não-string devolve null', () => {
    expect(normalizarTimestamp(12345)).toBeNull()
    expect(normalizarTimestamp(null)).toBeNull()
    expect(normalizarTimestamp(undefined)).toBeNull()
  })

  test('instantes genuinamente diferentes NÃO normalizam pro mesmo valor', () => {
    // Afirma a pré-condição antes de qualquer teste que dependa dela: os
    // dois formatos abaixo são horários DIFERENTES, não o mesmo instante em
    // representações diferentes — se normalizarTimestamp os igualasse, a
    // normalização estaria "engolindo" uma divergência real.
    expect(normalizarTimestamp('2026-05-19 12:00:00')).not.toBe(
      normalizarTimestamp('2026-05-20 12:00:00'),
    )
  })
})

// -------------------------------------------------------------------------
// diffProfundo — casos isolados de tipo/array, antes de ir pro nível de
// compararRespostas (envelope inteiro).
// -------------------------------------------------------------------------

describe('diffProfundo', () => {
  test('valores primitivos iguais não geram divergência', () => {
    const divergencias = []
    diffProfundo('data', { a: 1, b: 'x' }, { a: 1, b: 'x' }, divergencias)
    expect(divergencias).toEqual([])
  })

  test('array de tamanhos diferentes é detectado, incluindo os índices que sobram', () => {
    const divergencias = []
    diffProfundo('data.xs', [1, 2, 3], [1, 2], divergencias)
    expect(divergencias.some((d) => d.includes('tamanho de array diferente'))).toBe(true)
  })

  test('object vs array no mesmo caminho é detectado como tipos diferentes', () => {
    const divergencias = []
    diffProfundo('data.x', { a: 1 }, [1], divergencias)
    expect(divergencias.some((d) => d.includes('tipos diferentes'))).toBe(true)
  })
})

// -------------------------------------------------------------------------
// ehStatusDeSucesso — a fronteira que decide o terceiro estado (I1).
// -------------------------------------------------------------------------

describe('ehStatusDeSucesso', () => {
  test('200-299 é sucesso', () => {
    expect(ehStatusDeSucesso(200)).toBe(true)
    expect(ehStatusDeSucesso(201)).toBe(true)
    expect(ehStatusDeSucesso(299)).toBe(true)
  })

  test('fora de 200-299 não é sucesso', () => {
    expect(ehStatusDeSucesso(199)).toBe(false)
    expect(ehStatusDeSucesso(300)).toBe(false)
    expect(ehStatusDeSucesso(401)).toBe(false)
    expect(ehStatusDeSucesso(403)).toBe(false)
    expect(ehStatusDeSucesso(500)).toBe(false)
    expect(ehStatusDeSucesso(530)).toBe(false)
  })
})

// -------------------------------------------------------------------------
// compararRespostas — os 8 casos do Step 3 do brief original, mais os
// casos do terceiro estado (I1) e do campo `field` (M2).
// -------------------------------------------------------------------------

describe('compararRespostas — Step 3 do brief', () => {
  test('respostas idênticas ⇒ estado igual, sem divergência', () => {
    const go = resp(200, envelope({ session: sessaoWire(), movies: [] }))
    const ramielle = resp(200, envelope({ session: sessaoWire(), movies: [] }))

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.estado).toBe('igual')
    expect(resultado.divergencias).toEqual([])
  })

  test('status diferente (200 × 500) é detectado como diff', () => {
    const go = resp(200, envelope({ session: sessaoWire() }))
    const ramielle = resp(500, {
      ok: false,
      data: null,
      notifications: [{ type: 'error', code: 'internal_error', message: 'erro interno — tente novamente' }],
    })

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.estado).toBe('diff')
    expect(resultado.divergencias.some((d) => d.includes('status: Go=200, ramielle=500'))).toBe(
      true,
    )
  })

  test('code diferente na notificação de erro é detectado (mesmo status/mensagem)', () => {
    const go = resp(400, {
      ok: false,
      data: null,
      notifications: [{ type: 'error', code: 'invalid_id', message: 'Identificador inválido.' }],
    })
    const ramielle = resp(400, {
      ok: false,
      data: null,
      notifications: [{ type: 'error', code: 'session_not_found', message: 'Identificador inválido.' }],
    })

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.estado).toBe('diff')
    expect(
      resultado.divergencias.some((d) => d.includes('notifications[0].code') && d.includes('invalid_id') && d.includes('session_not_found')),
    ).toBe(true)
  })

  test('mensagem diferente com o MESMO code é detectada — nunca cosmética', () => {
    const go = resp(401, {
      ok: false,
      data: null,
      notifications: [{ type: 'error', code: 'not_authenticated', message: 'Você precisa estar logado.' }],
    })
    const ramielle = resp(401, {
      ok: false,
      data: null,
      notifications: [{ type: 'error', code: 'not_authenticated', message: 'requisição sem sessão válida' }],
    })

    const resultado = compararRespostas('GET /votacao/sessions', go, ramielle)

    expect(resultado.estado).toBe('diff')
    expect(
      resultado.divergencias.some(
        (d) => d.includes('notifications[0].message') && d.includes('Você precisa estar logado.'),
      ),
    ).toBe(true)
  })

  test('campo faltando de um dos lados (ramielle sem WinnerMethod) é detectado', () => {
    const sessaoCompleta = sessaoWire()
    const sessaoSemCampo = { ...sessaoWire() }
    delete sessaoSemCampo.WinnerMethod

    const go = resp(200, envelope({ session: sessaoCompleta }))
    const ramielle = resp(200, envelope({ session: sessaoSemCampo }))

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.estado).toBe('diff')
    expect(
      resultado.divergencias.some(
        (d) => d.includes('data.session.WinnerMethod') && d.includes('ausente no ramielle'),
      ),
    ).toBe(true)
  })

  test('campo extra de um dos lados (ramielle inventa um campo) é detectado', () => {
    const go = resp(200, envelope({ session: sessaoWire() }))
    const ramielle = resp(
      200,
      envelope({ session: { ...sessaoWire(), CampoInventado: 'não deveria existir' } }),
    )

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.estado).toBe('diff')
    expect(
      resultado.divergencias.some(
        (d) => d.includes('data.session.CampoInventado') && d.includes('presente no ramielle'),
      ),
    ).toBe(true)
  })

  test('null × string vazia é detectado — divergência clássica deste porte', () => {
    const filmeGo = { ID: 1, SessionID: 42, PosterURL: '' }
    const filmeRamielle = { ID: 1, SessionID: 42, PosterURL: null }

    const go = resp(200, envelope({ movies: [filmeGo] }))
    const ramielle = resp(200, envelope({ movies: [filmeRamielle] }))

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.estado).toBe('diff')
    expect(
      resultado.divergencias.some(
        (d) => d.includes('data.movies[0].PosterURL') && d.includes('tipos diferentes'),
      ),
    ).toBe(true)
  })

  describe('normalização de timestamp — seletiva, não cega', () => {
    test('created_at em formatos DIFERENTES mas MESMO instante é engolido (estado igual)', () => {
      const go = resp(
        200,
        envelope({
          users: [{ id: 1, email: 'a@example.com', created_at: '2026-05-19 12:00:00' }],
        }),
      )
      const ramielle = resp(
        200,
        envelope({
          users: [{ id: 1, email: 'a@example.com', created_at: '2026-05-19T12:00:00Z' }],
        }),
      )

      const resultado = compararRespostas('GET /admin/users', go, ramielle)

      expect(resultado.estado).toBe('igual')
      expect(resultado.divergencias).toEqual([])
    })

    test('created_at genuinamente DIFERENTE (instantes distintos) continua sendo detectado', () => {
      const go = resp(
        200,
        envelope({
          users: [{ id: 1, email: 'a@example.com', created_at: '2026-05-19 12:00:00' }],
        }),
      )
      const ramielle = resp(
        200,
        envelope({
          users: [{ id: 1, email: 'a@example.com', created_at: '2026-05-20T12:00:00Z' }],
        }),
      )

      const resultado = compararRespostas('GET /admin/users', go, ramielle)

      expect(resultado.estado).toBe('diff')
      expect(
        resultado.divergencias.some(
          (d) => d.includes('data.users[0].created_at') && d.includes('instantes diferentes'),
        ),
      ).toBe(true)
    })

    test('a normalização NÃO é cega pro resto do objeto — um campo vizinho diferente ainda é pego mesmo com created_at batendo', () => {
      const go = resp(
        200,
        envelope({
          users: [{ id: 1, email: 'a@example.com', created_at: '2026-05-19 12:00:00' }],
        }),
      )
      const ramielle = resp(
        200,
        envelope({
          users: [{ id: 1, email: 'OUTRO@example.com', created_at: '2026-05-19T12:00:00Z' }],
        }),
      )

      const resultado = compararRespostas('GET /admin/users', go, ramielle)

      expect(resultado.estado).toBe('diff')
      expect(resultado.divergencias.some((d) => d.includes('data.users[0].email'))).toBe(true)
      expect(resultado.divergencias.some((d) => d.includes('created_at'))).toBe(false)
    })

    test('campo com sufixo parecido mas fora da allowlist (ex.: "format") NÃO é tratado como timestamp', () => {
      const go = resp(200, envelope({ format: '2026-05-19 12:00:00' }))
      const ramielle = resp(200, envelope({ format: '2026-05-19T12:00:00Z' }))

      const resultado = compararRespostas('rota fictícia', go, ramielle)

      expect(resultado.estado).toBe('diff')
      expect(resultado.divergencias.some((d) => d.includes('data.format'))).toBe(true)
    })
  })

  describe('M2 — notifications[].field entra na comparação', () => {
    test('field presente de um lado só (ex.: title_required) é detectado', () => {
      const go = resp(400, {
        ok: false,
        data: null,
        notifications: [
          { type: 'error', code: 'title_required', message: 'Informe um título para a sessão.', field: 'title' },
        ],
      })
      const ramielle = resp(400, {
        ok: false,
        data: null,
        notifications: [
          { type: 'error', code: 'title_required', message: 'Informe um título para a sessão.' },
        ],
      })

      const resultado = compararRespostas('POST /votacao/sessions', go, ramielle)

      expect(resultado.estado).toBe('diff')
      expect(
        resultado.divergencias.some(
          (d) => d.includes('notifications[0].field') && d.includes('"title"'),
        ),
      ).toBe(true)
    })

    test('field idêntico (incluindo os dois ausentes) NÃO gera divergência de field', () => {
      const go = resp(200, envelope({ x: 1 }, [{ type: 'success', message: 'ok' }]))
      const ramielle = resp(200, envelope({ x: 1 }, [{ type: 'success', message: 'ok' }]))

      const resultado = compararRespostas('rota fictícia', go, ramielle)

      expect(resultado.estado).toBe('igual')
    })
  })

  describe('I1 — terceiro estado: "os dois lados recusaram" NÃO é "igual"', () => {
    test('401 × 401 idênticos (cookie expirado nos dois) ⇒ nao-comparado, nunca igual', () => {
      const notificacao401 = [{ type: 'error', code: 'not_authenticated', message: 'Você precisa estar logado.' }]
      const go = resp(401, { ok: false, data: null, notifications: notificacao401 })
      const ramielle = resp(401, { ok: false, data: null, notifications: notificacao401 })

      const resultado = compararRespostas('GET /votacao/sessions', go, ramielle)

      expect(resultado.estado).toBe('nao-comparado')
      expect(resultado.divergencias).toEqual([])
      expect(resultado.motivo).toMatch(/dois lados recusaram/)
    })

    test('403 × 403 idênticos (conta não-admin nos dois) ⇒ nao-comparado', () => {
      const notificacao403 = [{ type: 'error', code: 'admin_only', message: 'Acesso restrito a administradores.' }]
      const go = resp(403, { ok: false, data: null, notifications: notificacao403 })
      const ramielle = resp(403, { ok: false, data: null, notifications: notificacao403 })

      const resultado = compararRespostas('GET /admin/users', go, ramielle)

      expect(resultado.estado).toBe('nao-comparado')
    })

    test('530 com corpo vazio nos dois lados (serviço fora do ar) ⇒ nao-comparado', () => {
      const go = resp(530, null)
      const ramielle = resp(530, null)

      const resultado = compararRespostas('GET /votacao/categorias', go, ramielle)

      expect(resultado.estado).toBe('nao-comparado')
    })

    test('SELETIVIDADE — 401 × 403 (falhas DIFERENTES) continua sendo diff, não nao-comparado', () => {
      // Afirma que a condição de "ambos recusaram" exige recusa IDÊNTICA,
      // não só "os dois são não-2xx" — senão duas falhas de NATUREZAS
      // diferentes ficariam mascaradas como "rodada inválida" em vez de
      // reportadas como a divergência real que são.
      const go = resp(401, {
        ok: false,
        data: null,
        notifications: [{ type: 'error', code: 'not_authenticated', message: 'Você precisa estar logado.' }],
      })
      const ramielle = resp(403, {
        ok: false,
        data: null,
        notifications: [{ type: 'error', code: 'admin_only', message: 'Acesso restrito a administradores.' }],
      })

      const resultado = compararRespostas('GET /admin/users', go, ramielle)

      expect(resultado.estado).toBe('diff')
      expect(resultado.divergencias.some((d) => d.includes('status: Go=401, ramielle=403'))).toBe(
        true,
      )
    })

    test('SELETIVIDADE — mesmo status de falha (401×401) mas notification diferente continua sendo diff', () => {
      const go = resp(401, {
        ok: false,
        data: null,
        notifications: [{ type: 'error', code: 'not_authenticated', message: 'Você precisa estar logado.' }],
      })
      const ramielle = resp(401, {
        ok: false,
        data: null,
        notifications: [{ type: 'error', code: 'invalid_session', message: 'sessão inválida' }],
      })

      const resultado = compararRespostas('GET /votacao/sessions', go, ramielle)

      expect(resultado.estado).toBe('diff')
    })

    test('SELETIVIDADE — um sucesso (200) e um erro (500) nunca vira nao-comparado', () => {
      const go = resp(200, envelope({ sessions: [] }))
      const ramielle = resp(500, {
        ok: false,
        data: null,
        notifications: [{ type: 'error', code: 'internal_error', message: 'erro interno — tente novamente' }],
      })

      const resultado = compararRespostas('GET /votacao/sessions', go, ramielle)

      expect(resultado.estado).toBe('diff')
    })
  })
})

// -------------------------------------------------------------------------
// extrairPrimeiroIdDeSessao
// -------------------------------------------------------------------------

describe('extrairPrimeiroIdDeSessao', () => {
  test('devolve o ID da primeira sessão', () => {
    expect(
      extrairPrimeiroIdDeSessao(envelope({ sessions: [sessaoWire({ ID: 99 }), sessaoWire({ ID: 1 })] })),
    ).toBe(99)
  })

  test('lista vazia devolve null', () => {
    expect(extrairPrimeiroIdDeSessao(envelope({ sessions: [] }))).toBeNull()
  })

  test('data ausente (ex.: resposta de erro) devolve null', () => {
    expect(extrairPrimeiroIdDeSessao({ ok: false, data: null, notifications: [] })).toBeNull()
  })

  test('sessions ausente devolve null', () => {
    expect(extrairPrimeiroIdDeSessao(envelope({}))).toBeNull()
  })
})

// -------------------------------------------------------------------------
// preVoo — I1.2: gating ANTES de qualquer outra chamada.
// -------------------------------------------------------------------------

describe('preVoo', () => {
  function mockAuthMe(bodyGo, bodyRamielle) {
    return async (url) => {
      const ehGo = url.startsWith('http://go')
      const alvo = ehGo ? bodyGo : bodyRamielle
      return { status: alvo.status, text: async () => JSON.stringify(alvo.body) }
    }
  }

  test('200 + is_admin true nos dois lados ⇒ ok:true, devolve as duas respostas', async () => {
    const go = respostaAuthMeOk()
    const ramielle = respostaAuthMeOk()

    const resultado = await preVoo(mockAuthMe(go, ramielle), 'http://go', 'http://ramielle', 'cg', 'cr')

    expect(resultado.ok).toBe(true)
    expect(resultado.go).toEqual(go)
    expect(resultado.ramielle).toEqual(ramielle)
  })

  test('Go não-200 (cookie expirado) ⇒ ok:false, motivo cita a Go', async () => {
    const go = resp(401, { ok: false, data: null, notifications: [] })
    const ramielle = respostaAuthMeOk()

    const resultado = await preVoo(mockAuthMe(go, ramielle), 'http://go', 'http://ramielle', 'cg', 'cr')

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toMatch(/Go:.*401/)
  })

  test('ramielle não-200 (cookie expirado) ⇒ ok:false, motivo cita o ramielle', async () => {
    const go = respostaAuthMeOk()
    const ramielle = resp(401, { ok: false, data: null, notifications: [] })

    const resultado = await preVoo(mockAuthMe(go, ramielle), 'http://go', 'http://ramielle', 'cg', 'cr')

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toMatch(/ramielle:.*401/)
  })

  test('Go com is_admin:false ⇒ ok:false, motivo cita "não é admin"', async () => {
    const go = respostaAuthMeOk({ is_admin: false })
    const ramielle = respostaAuthMeOk()

    const resultado = await preVoo(mockAuthMe(go, ramielle), 'http://go', 'http://ramielle', 'cg', 'cr')

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toMatch(/Go:.*não é admin/i)
  })

  test('ramielle com is_admin:false ⇒ ok:false', async () => {
    const go = respostaAuthMeOk()
    const ramielle = respostaAuthMeOk({ is_admin: false })

    const resultado = await preVoo(mockAuthMe(go, ramielle), 'http://go', 'http://ramielle', 'cg', 'cr')

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toMatch(/ramielle:.*não é admin/i)
  })

  test('os dois lados falhando ⇒ motivo cita os dois', async () => {
    const go = resp(401, { ok: false, data: null, notifications: [] })
    const ramielle = resp(403, { ok: false, data: null, notifications: [] })

    const resultado = await preVoo(mockAuthMe(go, ramielle), 'http://go', 'http://ramielle', 'cg', 'cr')

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toMatch(/Go:/)
    expect(resultado.motivo).toMatch(/ramielle:/)
  })

  test('⚠️ o cookie NUNCA aparece no motivo de falha', async () => {
    const go = resp(401, { ok: false, data: null, notifications: [] })
    const ramielle = resp(403, { ok: false, data: null, notifications: [] })
    const cookieMarcadorGo = 'piluvitu_session=segredo-preVoo-go'
    const cookieMarcadorRamielle = 'better-auth.session_token=segredo-preVoo-ramielle'

    const resultado = await preVoo(
      mockAuthMe(go, ramielle),
      'http://go',
      'http://ramielle',
      cookieMarcadorGo,
      cookieMarcadorRamielle,
    )

    expect(resultado.motivo).not.toContain('segredo-preVoo-go')
    expect(resultado.motivo).not.toContain('segredo-preVoo-ramielle')
  })
})

// -------------------------------------------------------------------------
// formatarRelatorio
// -------------------------------------------------------------------------

describe('formatarRelatorio', () => {
  test('tudo igual ⇒ deveFalhar false, resumo com o piso esperado', () => {
    const { texto, deveFalhar } = formatarRelatorio(
      [
        { rota: 'A', estado: 'igual', divergencias: [] },
        { rota: 'B', estado: 'igual', divergencias: [] },
      ],
      2,
    )
    expect(deveFalhar).toBe(false)
    expect(texto).toContain('OK    A')
    expect(texto).toContain('Resumo: 2/2 rotas iguais — esperado 2, comparadas 2.')
  })

  test('alguma divergência ⇒ deveFalhar true, divergências listadas', () => {
    const { texto, deveFalhar } = formatarRelatorio(
      [
        { rota: 'A', estado: 'igual', divergencias: [] },
        { rota: 'B', estado: 'diff', divergencias: ['status: Go=200, ramielle=500'] },
      ],
      2,
    )
    expect(deveFalhar).toBe(true)
    expect(texto).toContain('DIFF  B')
    expect(texto).toContain('status: Go=200, ramielle=500')
    expect(texto).toContain('Resumo: 1/2 rotas iguais — esperado 2, comparadas 2.')
  })

  test('rota pulada (I2): aparece como AVISO, some do denominador, e SOZINHA já força deveFalhar', () => {
    const { texto, deveFalhar } = formatarRelatorio(
      [
        { rota: 'A', estado: 'igual', divergencias: [] },
        { rota: 'B', estado: 'pulada', divergencias: [], motivo: 'PULADO — sem dado.' },
      ],
      2,
    )
    expect(deveFalhar).toBe(true)
    expect(texto).toContain('AVISO B')
    expect(texto).toContain('PULADO — sem dado.')
    expect(texto).toContain('Resumo: 1/1 rotas iguais — esperado 2, comparadas 1, puladas 1.')
  })

  test('rota não-comparada (I1): aparece como NAO-COMPARADO, some do denominador, e SOZINHA já força deveFalhar', () => {
    const { texto, deveFalhar } = formatarRelatorio(
      [
        { rota: 'A', estado: 'igual', divergencias: [] },
        {
          rota: 'B',
          estado: 'nao-comparado',
          divergencias: [],
          motivo: 'os dois lados recusaram de forma idêntica (status 401) — ...',
        },
      ],
      2,
    )
    expect(deveFalhar).toBe(true)
    expect(texto).toContain('NAO-COMPARADO B')
    expect(texto).toContain('Resumo: 1/1 rotas iguais — esperado 2, comparadas 1, não-comparadas 1.')
  })

  test('I2 — nada foi comparado (array vazio) força deveFalhar, mesmo sem divergência nenhuma', () => {
    // Prova direta da mutação pedida na revisão: "faça executarComparacao
    // devolver [] e confirme que não sai 0" — aqui é o nível abaixo
    // (formatarRelatorio puro), a prova ponta a ponta via run() está no
    // describe run() mais abaixo.
    const { texto, deveFalhar } = formatarRelatorio([], 8)

    expect(deveFalhar).toBe(true)
    expect(texto).toContain('Resumo: 0/0 rotas iguais — esperado 8, comparadas 0.')
  })

  test('ROTAS_ESPERADAS é usado como default do parâmetro esperado', () => {
    const { texto } = formatarRelatorio([])
    expect(texto).toContain(`esperado ${ROTAS_ESPERADAS}`)
  })
})

// -------------------------------------------------------------------------
// parseArgs
// -------------------------------------------------------------------------

describe('parseArgs', () => {
  test('defaults quando nenhum argumento é passado', () => {
    const args = parseArgs([])
    expect(args.goUrl).toBe('http://localhost:8080')
    expect(args.ramielleUrl).toBe('http://localhost:8788')
    expect(args.relatorio).toBeUndefined()
    expect(args.error).toBeNull()
  })

  test('--go-url e --ramielle-url sobrescrevem os defaults', () => {
    const args = parseArgs(['--go-url', 'http://x:1', '--ramielle-url', 'http://y:2'])
    expect(args.goUrl).toBe('http://x:1')
    expect(args.ramielleUrl).toBe('http://y:2')
  })

  test('--relatorio com sufixo .report.txt é aceito', () => {
    const args = parseArgs(['--relatorio', 'saida.report.txt'])
    expect(args.relatorio).toBe('saida.report.txt')
    expect(args.error).toBeNull()
  })

  test('M4 — --relatorio SEM o sufixo .report.txt é recusado (nunca escreve fora do padrão do .gitignore)', () => {
    const args = parseArgs(['--relatorio', 'saida.txt'])
    expect(args.relatorio).toBeUndefined()
    expect(args.error).toMatch(/\.report\.txt/)
  })

  test('--help marca help', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  test('opção desconhecida vira erro', () => {
    expect(parseArgs(['--bogus']).error).toMatch(/desconhecida/)
  })

  test('opção que precisa de valor sem valor vira erro', () => {
    expect(parseArgs(['--go-url']).error).toMatch(/precisa de um valor/)
  })
})

// -------------------------------------------------------------------------
// chamar — parsing HTTP mínimo (mockado, nunca rede de verdade em teste).
// -------------------------------------------------------------------------

describe('chamar', () => {
  test('envia o cookie no header quando fornecido', async () => {
    let headersRecebidos
    const fetchImpl = async (_url, init) => {
      headersRecebidos = init.headers
      return { status: 200, text: async () => JSON.stringify({ ok: true, data: null, notifications: [] }) }
    }

    await chamar(fetchImpl, 'http://x', '/rota', 'session=abc')

    expect(headersRecebidos).toEqual({ cookie: 'session=abc' })
  })

  test('sem cookie não envia header nenhum', async () => {
    let headersRecebidos
    const fetchImpl = async (_url, init) => {
      headersRecebidos = init.headers
      return { status: 200, text: async () => JSON.stringify({ ok: true, data: null, notifications: [] }) }
    }

    await chamar(fetchImpl, 'http://x', '/rota', undefined)

    expect(headersRecebidos).toEqual({})
  })

  test('JSON inválido lança erro explícito (não silencia como resposta vazia)', async () => {
    const fetchImpl = async () => ({ status: 200, text: async () => 'não é json' })

    await expect(chamar(fetchImpl, 'http://x', '/rota', undefined)).rejects.toThrow(
      /não devolveu JSON válido/,
    )
  })

  test('corpo vazio vira body null, sem lançar', async () => {
    const fetchImpl = async () => ({ status: 204, text: async () => '' })

    const resultado = await chamar(fetchImpl, 'http://x', '/rota', undefined)

    expect(resultado).toEqual({ status: 204, body: null })
  })
})

// -------------------------------------------------------------------------
// executarComparacao — pré-voo + orquestração das 8 rotas com fetch mockado.
// -------------------------------------------------------------------------

describe('executarComparacao', () => {
  function criarFetchMock(mapaGo, mapaRamielle) {
    return async (url) => {
      const base = url.startsWith('http://go') ? mapaGo : mapaRamielle
      const caminho = url.replace(/^http:\/\/(go|ramielle)/, '')
      const body = base[caminho]
      if (body === undefined) {
        throw new Error(`rota não mockada: ${caminho}`)
      }
      return { status: body.status, text: async () => JSON.stringify(body.envelope) }
    }
  }

  const authMeOkMock = { status: 200, envelope: envelope({ id: 1, name: 'Dono', email: 'd@x.com', picture: '', is_admin: true }) }

  test('pré-voo passa, descobre o id da primeira sessão da Go e usa nas 3 rotas de detalhe (8 resultados)', async () => {
    const sessoesGo = { status: 200, envelope: envelope({ sessions: [sessaoWire({ ID: 7 })] }) }
    const sessoesRamielle = { status: 200, envelope: envelope({ sessions: [sessaoWire({ ID: 7 })] }) }
    const detalheOk = { status: 200, envelope: envelope({ session: sessaoWire({ ID: 7 }) }) }
    const resultsOk = { status: 200, envelope: envelope({ results: [], total_votes: 0, total_voters: 0 }) }
    const votesOk = { status: 200, envelope: envelope({ votes: [], total: 0 }) }
    const categoriasOk = { status: 200, envelope: envelope({ categories: [] }) }
    const usersOk = { status: 200, envelope: envelope({ users: [] }) }
    const backupsOk = { status: 200, envelope: envelope({ backups: [] }) }

    const mapa = {
      '/auth/me': authMeOkMock,
      '/votacao/sessions': sessoesGo,
      '/votacao/categorias': categoriasOk,
      '/admin/users': usersOk,
      '/admin/backups': backupsOk,
      '/votacao/sessions/7': detalheOk,
      '/votacao/sessions/7/results': resultsOk,
      '/votacao/sessions/7/votes': votesOk,
    }
    const mapaRamielle = { ...mapa, '/votacao/sessions': sessoesRamielle }

    const resultado = await executarComparacao(
      { goUrl: 'http://go', ramielleUrl: 'http://ramielle', cookieGo: 'g', cookieRamielle: 'r' },
      { fetchImpl: criarFetchMock(mapa, mapaRamielle) },
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.resultados).toHaveLength(8)
    expect(resultado.resultados.every((r) => r.estado === 'igual')).toBe(true)
    const rotas = resultado.resultados.map((r) => r.rota)
    expect(rotas).toContain('GET /auth/me')
    expect(rotas).toContain('GET /votacao/sessions/{id}')
    expect(rotas).toContain('GET /votacao/sessions/{id}/results')
    expect(rotas).toContain('GET /votacao/sessions/{id}/votes')
  })

  test('lista de sessões vazia gera 3 avisos INDIVIDUAIS (uma entrada por rota, não agregada) — 8 resultados no total', async () => {
    const vazio = { status: 200, envelope: envelope({ sessions: [] }) }
    const categoriasOk = { status: 200, envelope: envelope({ categories: [] }) }
    const usersOk = { status: 200, envelope: envelope({ users: [] }) }
    const backupsOk = { status: 200, envelope: envelope({ backups: [] }) }

    const mapa = {
      '/auth/me': authMeOkMock,
      '/votacao/sessions': vazio,
      '/votacao/categorias': categoriasOk,
      '/admin/users': usersOk,
      '/admin/backups': backupsOk,
    }

    const resultado = await executarComparacao(
      { goUrl: 'http://go', ramielleUrl: 'http://ramielle', cookieGo: 'g', cookieRamielle: 'r' },
      { fetchImpl: criarFetchMock(mapa, mapa) },
    )

    expect(resultado.ok).toBe(true)
    expect(resultado.resultados).toHaveLength(8) // auth/me + sessions + 3 sem-id + 3 puladas
    const puladas = resultado.resultados.filter((r) => r.estado === 'pulada')
    expect(puladas).toHaveLength(3)
    expect(puladas.map((r) => r.rota)).toEqual([
      'GET /votacao/sessions/{id}',
      'GET /votacao/sessions/{id}/results',
      'GET /votacao/sessions/{id}/votes',
    ])
    expect(puladas.every((r) => /PULADO/.test(r.motivo))).toBe(true)
  })

  test('I1.2 — pré-voo falhando ABORTA antes de qualquer outra chamada (nenhuma rota extra é mockada, e nenhuma é atingida)', async () => {
    const chamadas = []
    const fetchImpl = async (url) => {
      chamadas.push(url)
      const ehGo = url.startsWith('http://go')
      // Só /auth/me está "mockado" — qualquer outra chamada lançaria por
      // rota desconhecida. A Go devolve 401 (cookie expirado).
      if (url.endsWith('/auth/me')) {
        const corpo = ehGo
          ? { status: 401, envelope: { ok: false, data: null, notifications: [] } }
          : authMeOkMock
        return { status: corpo.status, text: async () => JSON.stringify(corpo.envelope) }
      }
      throw new Error(`rota não deveria ter sido chamada: ${url}`)
    }

    const resultado = await executarComparacao(
      { goUrl: 'http://go', ramielleUrl: 'http://ramielle', cookieGo: 'g', cookieRamielle: 'r' },
      { fetchImpl },
    )

    expect(resultado.ok).toBe(false)
    expect(resultado.motivo).toMatch(/Go:.*401/)
    // Só as 2 chamadas de /auth/me (Go + ramielle) — nada mais.
    expect(chamadas).toHaveLength(2)
    expect(chamadas.every((u) => u.endsWith('/auth/me'))).toBe(true)
  })

  test('M1 — propaga o cookie certo pra cada base URL (nunca troca Go × ramielle) — contagem EXATA, não `.every` vazio', async () => {
    const chamadasGo = []
    const chamadasRamielle = []
    const sessoesVazias = { status: 200, envelope: envelope({ sessions: [] }) }
    const categoriasOk = { status: 200, envelope: envelope({ categories: [] }) }
    const usersOk = { status: 200, envelope: envelope({ users: [] }) }
    const backupsOk = { status: 200, envelope: envelope({ backups: [] }) }

    const mapa = {
      '/auth/me': authMeOkMock,
      '/votacao/sessions': sessoesVazias,
      '/votacao/categorias': categoriasOk,
      '/admin/users': usersOk,
      '/admin/backups': backupsOk,
    }

    const fetchImpl = async (url, init) => {
      if (url.startsWith('http://go')) chamadasGo.push(init.headers?.cookie)
      else chamadasRamielle.push(init.headers?.cookie)
      const caminho = url.replace(/^http:\/\/(go|ramielle)/, '')
      const corpo = mapa[caminho]
      return { status: corpo.status, text: async () => JSON.stringify(corpo.envelope) }
    }

    await executarComparacao(
      { goUrl: 'http://go', ramielleUrl: 'http://ramielle', cookieGo: 'cookie-go', cookieRamielle: 'cookie-ramielle' },
      { fetchImpl },
    )

    // M1 (revisão): `[].every(...)` é `true` — sem afirmar o TAMANHO, este
    // teste continuaria verde mesmo se `executarComparacao` não chamasse o
    // fetch NENHUMA vez. auth/me + sessions + categorias + users + backups
    // = 5 chamadas por lado (sem sessão, as 3 rotas de detalhe não rodam).
    expect(chamadasGo).toHaveLength(5)
    expect(chamadasRamielle).toHaveLength(5)
    expect(chamadasGo.every((c) => c === 'cookie-go')).toBe(true)
    expect(chamadasRamielle.every((c) => c === 'cookie-ramielle')).toBe(true)
  })
})

// -------------------------------------------------------------------------
// run — CLI ponta a ponta com fetch mockado.
// -------------------------------------------------------------------------

describe('run', () => {
  const tmpDirs = []
  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  const authMeOkBody = envelope({ id: 1, name: 'Dono', email: 'd@x.com', picture: '', is_admin: true })

  /**
   * Fetch mock padrão: pré-voo OK, e as 8 rotas OK e iguais — INCLUINDO uma
   * sessão real (id 1), pra que as 3 rotas de detalhe rodem de verdade em
   * vez de virarem "pulada". Desde o fix I2, QUALQUER pulada força
   * `deveFalhar` — um mock sem sessão nenhuma nunca chegaria em exit 0, e
   * não provaria o caminho feliz de verdade.
   */
  function fetchTudoOk() {
    return async (url) => {
      const caminho = url.split(/:8080|:8788/)[1]
      const corpo = {
        '/auth/me': authMeOkBody,
        '/votacao/sessions': envelope({ sessions: [sessaoWire({ ID: 1 })] }),
        '/votacao/categorias': envelope({ categories: [] }),
        '/admin/users': envelope({ users: [] }),
        '/admin/backups': envelope({ backups: [] }),
        '/votacao/sessions/1': envelope({ session: sessaoWire({ ID: 1 }), movies: [], has_voted: false, voted_movie_ids: [] }),
        '/votacao/sessions/1/results': envelope({ results: [], total_votes: 0, total_voters: 0 }),
        '/votacao/sessions/1/votes': envelope({ votes: [], total: 0 }),
      }[caminho]
      return { status: 200, text: async () => JSON.stringify(corpo) }
    }
  }

  test('sem COOKIE_GO/COOKIE_RAMIELLE devolve 2 e não chama fetch', async () => {
    let chamouFetch = false
    const codigo = await run([], {
      env: {},
      fetchImpl: async () => {
        chamouFetch = true
        throw new Error('não deveria ter chamado fetch')
      },
      log: () => {},
      logError: () => {},
    })
    expect(codigo).toBe(2)
    expect(chamouFetch).toBe(false)
  })

  test('--help devolve 0 sem exigir cookie', async () => {
    const codigo = await run(['--help'], { env: {}, log: () => {}, logError: () => {} })
    expect(codigo).toBe(0)
  })

  test('I1.2 — pré-voo falhando devolve 3, não 0 nem 1', async () => {
    const fetchImpl = async (url) => {
      const ehGo = url.includes('8080')
      const corpo = ehGo
        ? { ok: false, data: null, notifications: [] } // 401 simulado abaixo
        : authMeOkBody
      return { status: ehGo ? 401 : 200, text: async () => JSON.stringify(corpo) }
    }

    const codigo = await run([], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      fetchImpl,
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(3)
  })

  test('tudo igual (as 8 rotas) devolve 0', async () => {
    const codigo = await run([], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      fetchImpl: fetchTudoOk(),
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(0)
  })

  test('divergência real devolve 1', async () => {
    const fetchImpl = async (url) => {
      const ehGo = url.includes('8080')
      const caminho = url.split(/:8080|:8788/)[1]
      if (caminho === '/auth/me') {
        return { status: 200, text: async () => JSON.stringify(authMeOkBody) }
      }
      if (caminho === '/votacao/sessions') {
        return {
          status: ehGo ? 200 : 500,
          text: async () =>
            JSON.stringify(
              ehGo
                ? envelope({ sessions: [] })
                : { ok: false, data: null, notifications: [{ type: 'error', code: 'internal_error', message: 'erro interno — tente novamente' }] },
            ),
        }
      }
      return { status: 200, text: async () => JSON.stringify(envelope({})) }
    }

    const codigo = await run([], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      fetchImpl,
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(1)
  })

  test('I2 — nada comparado (executarComparacaoImpl devolve resultados vazio) devolve 1, NÃO 0', async () => {
    // Prova ponta a ponta, via run(), da mutação pedida na revisão: "faça
    // executarComparacao devolver [] e confirme que não sai 0". A injeção
    // de `executarComparacaoImpl` existe SÓ pra tornar este cenário
    // testável sem reimplementar toda a orquestração — em produção `run`
    // sempre usa a `executarComparacao` real.
    const codigo = await run([], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      executarComparacaoImpl: async () => ({ ok: true, resultados: [] }),
      fetchImpl: async () => {
        throw new Error('não deveria chamar fetch — executarComparacaoImpl foi substituído')
      },
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(1)
  })

  test('--relatorio (com sufixo .report.txt) grava o texto no arquivo pedido', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'comparar-com-go-'))
    tmpDirs.push(dir)
    const arquivo = path.join(dir, 'saida.report.txt')

    const codigo = await run(['--relatorio', arquivo], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      fetchImpl: fetchTudoOk(),
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(0)
    const conteudo = readFileSync(arquivo, 'utf8')
    expect(conteudo).toContain('Resumo:')
  })

  test('--relatorio sem o sufixo .report.txt é recusado ANTES de qualquer chamada de rede (exit 2)', async () => {
    let chamouFetch = false
    const codigo = await run(['--relatorio', 'saida.txt'], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      fetchImpl: async () => {
        chamouFetch = true
        throw new Error('não deveria ter chamado fetch')
      },
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(2)
    expect(chamouFetch).toBe(false)
  })

  describe('I3 — o cookie NUNCA vaza (reescrito: logError capturado de verdade, exercitando erro E divergência)', () => {
    test('caminho de ERRO (fetch rejeitando) e caminho de DIVERGÊNCIA, nenhum dos dois ecoa o cookie em log ou arquivo', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'comparar-com-go-'))
      tmpDirs.push(dir)
      const arquivo = path.join(dir, 'saida.report.txt')

      const cookieSecretoGo = 'piluvitu_session=segredo-go-nao-pode-vazar'
      const cookieSecretoRamielle = 'better-auth.session_token=segredo-ramielle-nao-pode-vazar'

      // --- Cenário 1: fetch REJEITA no meio da comparação (rede caiu). ---
      // Confirma primeiro que o cenário de fato é um erro de rede, não uma
      // suposição — se `fetchImpl` não lançasse aqui, este sub-teste não
      // estaria provando nada sobre o caminho de erro.
      const logsErro = []
      const errosErro = []
      const fetchQueRejeita = async (url) => {
        const caminho = url.split(/:8080|:8788/)[1]
        if (caminho === '/auth/me') {
          return { status: 200, text: async () => JSON.stringify(authMeOkBody) }
        }
        if (caminho === '/votacao/sessions') {
          throw new Error('fetch failed: ECONNREFUSED (simulado)')
        }
        return { status: 200, text: async () => JSON.stringify(envelope({})) }
      }

      const codigoErro = await run([], {
        env: { COOKIE_GO: cookieSecretoGo, COOKIE_RAMIELLE: cookieSecretoRamielle },
        fetchImpl: fetchQueRejeita,
        log: (msg) => logsErro.push(msg),
        logError: (msg) => errosErro.push(msg),
      })

      expect(codigoErro).toBe(1)
      // Afirma que o caminho de erro FOI exercitado de verdade (não é um
      // teste "tudo OK" disfarçado) — sem isto, um `errosErro` vazio
      // passaria pelas asserções abaixo sem ter testado nada.
      expect(errosErro.some((m) => /erro ao comparar/.test(m))).toBe(true)

      const textoLogadoErro = [...logsErro, ...errosErro].join('\n')
      expect(textoLogadoErro).not.toContain('segredo-go-nao-pode-vazar')
      expect(textoLogadoErro).not.toContain('segredo-ramielle-nao-pode-vazar')

      // --- Cenário 2: as 8 rotas respondem, mas DIVERGEM (não é "tudo OK"). ---
      const logsDiff = []
      const errosDiff = []
      const fetchComDivergencia = async (url) => {
        const ehGo = url.includes('8080')
        const caminho = url.split(/:8080|:8788/)[1]
        if (caminho === '/auth/me') {
          return { status: 200, text: async () => JSON.stringify(authMeOkBody) }
        }
        if (caminho === '/admin/users') {
          const corpo = ehGo
            ? envelope({ users: [{ id: 1, email: 'a@x.com' }] })
            : envelope({ users: [{ id: 1, email: 'DIFERENTE@x.com' }] })
          return { status: 200, text: async () => JSON.stringify(corpo) }
        }
        return { status: 200, text: async () => JSON.stringify(envelope({})) }
      }

      const codigoDiff = await run(['--relatorio', arquivo], {
        env: { COOKIE_GO: cookieSecretoGo, COOKIE_RAMIELLE: cookieSecretoRamielle },
        fetchImpl: fetchComDivergencia,
        log: (msg) => logsDiff.push(msg),
        logError: (msg) => errosDiff.push(msg),
      })

      expect(codigoDiff).toBe(1)
      // Afirma que a divergência FOI de fato produzida — sem isto, um
      // relatório "tudo igual" passaria pelas asserções de não-vazamento
      // sem ter testado o caminho de divergência nenhuma vez.
      const textoLogadoDiff = logsDiff.join('\n')
      expect(textoLogadoDiff).toContain('DIFF')
      expect(textoLogadoDiff).toContain('data.users[0].email')

      const textoCompletoDiff = [...logsDiff, ...errosDiff].join('\n')
      expect(textoCompletoDiff).not.toContain('segredo-go-nao-pode-vazar')
      expect(textoCompletoDiff).not.toContain('segredo-ramielle-nao-pode-vazar')

      const conteudoArquivo = readFileSync(arquivo, 'utf8')
      expect(conteudoArquivo).not.toContain('segredo-go-nao-pode-vazar')
      expect(conteudoArquivo).not.toContain('segredo-ramielle-nao-pode-vazar')
    })
  })
})
