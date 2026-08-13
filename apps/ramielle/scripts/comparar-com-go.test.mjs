// Testes do harness de comparação lado a lado (fatia ④, Task 4). Roda sob
// `vitest.scripts.config.ts` (environment: 'node', SEM o pool do
// Miniflare/cloudflareTest do resto do Worker) — mesmo padrão de
// gerar-import.test.mjs, este script também é Node puro (fetch nativo, sem
// D1/Worker). `pnpm --filter @piluvitu/ramielle run test` encadeia os dois
// configs.
//
// ⚠️ O foco pesado aqui é o COMPARADOR (`compararRespostas`/`diffProfundo`)
// contra respostas MOCKADAS — é o Step 3 do brief, e é o que a mutação
// obrigatória (rodada manualmente, ver o relatório da task) mutila pra
// provar que os testes realmente detectam divergência, não só ficam verdes
// por acaso. As fixtures usam os SHAPES reais medidos nas rotas (PascalCase
// de `sessionToWire`, snake_case de `/admin/users` e `/sessions/{id}/votes`
// — ver apps/ramielle/src/lib/wire.ts e apps/ramielle/CLAUDE.md), não
// objetos genéricos, porque um teste escrito contra um shape fictício não
// prova nada sobre a rota real.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  chamar,
  compararRespostas,
  diffProfundo,
  executarComparacao,
  extrairPrimeiroIdDeSessao,
  formatarRelatorio,
  normalizarTimestamp,
  parseArgs,
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
// compararRespostas — os 8 casos do Step 3 do brief, cada um contra o shape
// real da rota que ele está simulando.
// -------------------------------------------------------------------------

describe('compararRespostas — Step 3 do brief', () => {
  test('respostas idênticas ⇒ sem divergência', () => {
    const go = resp(200, envelope({ session: sessaoWire(), movies: [] }))
    const ramielle = resp(200, envelope({ session: sessaoWire(), movies: [] }))

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.igual).toBe(true)
    expect(resultado.divergencias).toEqual([])
  })

  test('status diferente (200 × 500) é detectado', () => {
    const go = resp(200, envelope({ session: sessaoWire() }))
    const ramielle = resp(
      500,
      { ok: false, data: null, notifications: [{ type: 'error', code: 'internal_error', message: 'erro interno — tente novamente' }] },
    )

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.igual).toBe(false)
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

    expect(resultado.igual).toBe(false)
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

    expect(resultado.igual).toBe(false)
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

    expect(resultado.igual).toBe(false)
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

    expect(resultado.igual).toBe(false)
    expect(
      resultado.divergencias.some(
        (d) => d.includes('data.session.CampoInventado') && d.includes('presente no ramielle'),
      ),
    ).toBe(true)
  })

  test('null × string vazia é detectado — divergência clássica deste porte', () => {
    // PosterURL: Go declara `string` (nunca ponteiro) e o D1 pode ter
    // gravado NULL numa coluna antiga — um dos dois lados deveria emitir
    // "" e não null, mas simula-se aqui o caso em que um dos ports esqueceu
    // o `?? ''` (ver lib/wire.ts#movieToWire).
    const filmeGo = { ID: 1, SessionID: 42, PosterURL: '' }
    const filmeRamielle = { ID: 1, SessionID: 42, PosterURL: null }

    const go = resp(200, envelope({ movies: [filmeGo] }))
    const ramielle = resp(200, envelope({ movies: [filmeRamielle] }))

    const resultado = compararRespostas('GET /votacao/sessions/{id}', go, ramielle)

    expect(resultado.igual).toBe(false)
    expect(
      resultado.divergencias.some(
        (d) => d.includes('data.movies[0].PosterURL') && d.includes('tipos diferentes'),
      ),
    ).toBe(true)
  })

  describe('normalização de timestamp — seletiva, não cega', () => {
    test('created_at em formatos DIFERENTES mas MESMO instante é engolido (não gera divergência)', () => {
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

      expect(resultado.igual).toBe(true)
      expect(resultado.divergencias).toEqual([])
    })

    test('created_at genuinamente DIFERENTE (instantes distintos) continua sendo detectado', () => {
      // Prova que a normalização não vira uma licença pra ignorar
      // created_at inteiro — só equaliza REPRESENTAÇÃO, nunca VALOR.
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

      expect(resultado.igual).toBe(false)
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

      expect(resultado.igual).toBe(false)
      expect(resultado.divergencias.some((d) => d.includes('data.users[0].email'))).toBe(true)
      // E o created_at, que de fato bate, não deveria ter entrado na lista.
      expect(resultado.divergencias.some((d) => d.includes('created_at'))).toBe(false)
    })

    test('campo com sufixo parecido mas fora da allowlist (ex.: "format") NÃO é tratado como timestamp', () => {
      // Afirma a seletividade da allowlist: só os 3 nomes exatos
      // (CreatedAt/ClosedAt/created_at) normalizam. Qualquer outro campo,
      // mesmo com formato de data, é comparado literalmente.
      const go = resp(200, envelope({ format: '2026-05-19 12:00:00' }))
      const ramielle = resp(200, envelope({ format: '2026-05-19T12:00:00Z' }))

      const resultado = compararRespostas('rota fictícia', go, ramielle)

      expect(resultado.igual).toBe(false)
      expect(resultado.divergencias.some((d) => d.includes('data.format'))).toBe(true)
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
// formatarRelatorio
// -------------------------------------------------------------------------

describe('formatarRelatorio', () => {
  test('tudo igual ⇒ algumaDivergencia false, resumo "N/N"', () => {
    const { texto, algumaDivergencia } = formatarRelatorio([
      { rota: 'A', igual: true, divergencias: [] },
      { rota: 'B', igual: true, divergencias: [] },
    ])
    expect(algumaDivergencia).toBe(false)
    expect(texto).toContain('OK    A')
    expect(texto).toContain('Resumo: 2/2 rotas iguais.')
  })

  test('alguma divergência ⇒ algumaDivergencia true, divergências listadas', () => {
    const { texto, algumaDivergencia } = formatarRelatorio([
      { rota: 'A', igual: true, divergencias: [] },
      { rota: 'B', igual: false, divergencias: ['status: Go=200, ramielle=500'] },
    ])
    expect(algumaDivergencia).toBe(true)
    expect(texto).toContain('DIFF  B')
    expect(texto).toContain('status: Go=200, ramielle=500')
    expect(texto).toContain('Resumo: 1/2 rotas iguais.')
  })

  test('rota pulada (aviso) não conta no denominador do resumo', () => {
    const { texto, algumaDivergencia } = formatarRelatorio([
      { rota: 'A', igual: true, divergencias: [] },
      { rota: 'B', igual: true, divergencias: [], aviso: 'PULADO — sem dado.' },
    ])
    expect(algumaDivergencia).toBe(false)
    expect(texto).toContain('AVISO B')
    expect(texto).toContain('Resumo: 1/1 rotas iguais, 1 pulada(s).')
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

  test('--relatorio grava o caminho', () => {
    const args = parseArgs(['--relatorio', 'saida.txt'])
    expect(args.relatorio).toBe('saida.txt')
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
// executarComparacao — orquestração das 7 rotas com fetch mockado.
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

  test('descobre o id da primeira sessão da Go e usa nas 3 rotas de detalhe', async () => {
    const sessoesGo = { status: 200, envelope: envelope({ sessions: [sessaoWire({ ID: 7 })] }) }
    const sessoesRamielle = {
      status: 200,
      envelope: envelope({ sessions: [sessaoWire({ ID: 7 })] }),
    }
    const detalheOk = { status: 200, envelope: envelope({ session: sessaoWire({ ID: 7 }) }) }
    const resultsOk = { status: 200, envelope: envelope({ results: [], total_votes: 0, total_voters: 0 }) }
    const votesOk = { status: 200, envelope: envelope({ votes: [], total: 0 }) }
    const categoriasOk = { status: 200, envelope: envelope({ categories: [] }) }
    const usersOk = { status: 200, envelope: envelope({ users: [] }) }
    const backupsOk = { status: 200, envelope: envelope({ backups: [] }) }

    const mapaGo = {
      '/votacao/sessions': sessoesGo,
      '/votacao/categorias': categoriasOk,
      '/admin/users': usersOk,
      '/admin/backups': backupsOk,
      '/votacao/sessions/7': detalheOk,
      '/votacao/sessions/7/results': resultsOk,
      '/votacao/sessions/7/votes': votesOk,
    }
    const mapaRamielle = {
      '/votacao/sessions': sessoesRamielle,
      '/votacao/categorias': categoriasOk,
      '/admin/users': usersOk,
      '/admin/backups': backupsOk,
      '/votacao/sessions/7': detalheOk,
      '/votacao/sessions/7/results': resultsOk,
      '/votacao/sessions/7/votes': votesOk,
    }

    const resultados = await executarComparacao(
      { goUrl: 'http://go', ramielleUrl: 'http://ramielle', cookieGo: 'g', cookieRamielle: 'r' },
      { fetchImpl: criarFetchMock(mapaGo, mapaRamielle) },
    )

    expect(resultados).toHaveLength(7)
    expect(resultados.every((r) => r.igual)).toBe(true)
    expect(resultados.map((r) => r.rota)).toContain('GET /votacao/sessions/{id}')
    expect(resultados.map((r) => r.rota)).toContain('GET /votacao/sessions/{id}/results')
    expect(resultados.map((r) => r.rota)).toContain('GET /votacao/sessions/{id}/votes')
  })

  test('lista de sessões vazia pula as 3 rotas de detalhe com aviso, mas ainda compara as outras 4', async () => {
    const vazio = { status: 200, envelope: envelope({ sessions: [] }) }
    const categoriasOk = { status: 200, envelope: envelope({ categories: [] }) }
    const usersOk = { status: 200, envelope: envelope({ users: [] }) }
    const backupsOk = { status: 200, envelope: envelope({ backups: [] }) }

    const mapa = {
      '/votacao/sessions': vazio,
      '/votacao/categorias': categoriasOk,
      '/admin/users': usersOk,
      '/admin/backups': backupsOk,
    }

    const resultados = await executarComparacao(
      { goUrl: 'http://go', ramielleUrl: 'http://ramielle', cookieGo: 'g', cookieRamielle: 'r' },
      { fetchImpl: criarFetchMock(mapa, mapa) },
    )

    expect(resultados).toHaveLength(5) // sessions + 3 sem-id + 1 aviso agregado
    const aviso = resultados.find((r) => r.aviso)
    expect(aviso).toBeDefined()
    expect(aviso.aviso).toMatch(/PULADO/)
  })

  test('propaga o cookie certo pra cada base URL (nunca troca Go × ramielle)', async () => {
    const chamadasGo = []
    const chamadasRamielle = []
    const okBody = { status: 200, envelope: envelope({ sessions: [] }) }
    const categoriasOk = { status: 200, envelope: envelope({ categories: [] }) }
    const usersOk = { status: 200, envelope: envelope({ users: [] }) }
    const backupsOk = { status: 200, envelope: envelope({ backups: [] }) }

    const fetchImpl = async (url, init) => {
      if (url.startsWith('http://go')) chamadasGo.push(init.headers?.cookie)
      else chamadasRamielle.push(init.headers?.cookie)
      const caminho = url.replace(/^http:\/\/(go|ramielle)/, '')
      const corpo = { '/votacao/sessions': okBody, '/votacao/categorias': categoriasOk, '/admin/users': usersOk, '/admin/backups': backupsOk }[caminho]
      return { status: corpo.status, text: async () => JSON.stringify(corpo.envelope) }
    }

    await executarComparacao(
      { goUrl: 'http://go', ramielleUrl: 'http://ramielle', cookieGo: 'cookie-go', cookieRamielle: 'cookie-ramielle' },
      { fetchImpl },
    )

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

  test('tudo igual devolve 0', async () => {
    const okVazio = envelope({ sessions: [] })
    const fetchImpl = async (url) => {
      const caminho = url.split('localhost:8080')[1] ?? url.split('localhost:8788')[1]
      const corpo = {
        '/votacao/sessions': okVazio,
        '/votacao/categorias': envelope({ categories: [] }),
        '/admin/users': envelope({ users: [] }),
        '/admin/backups': envelope({ backups: [] }),
      }[caminho]
      return { status: 200, text: async () => JSON.stringify(corpo) }
    }

    const codigo = await run([], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      fetchImpl,
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(0)
  })

  test('divergência real devolve 1', async () => {
    const fetchImpl = async (url) => {
      const ehGo = url.includes('8080')
      const caminho = url.split(/:8080|:8788/)[1]
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

  test('--relatorio grava o texto no arquivo pedido', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'comparar-com-go-'))
    tmpDirs.push(dir)
    const arquivo = path.join(dir, 'saida.txt')

    const fetchImpl = async (url) => {
      const caminho = url.split(/:8080|:8788/)[1]
      const corpo = {
        '/votacao/sessions': envelope({ sessions: [] }),
        '/votacao/categorias': envelope({ categories: [] }),
        '/admin/users': envelope({ users: [] }),
        '/admin/backups': envelope({ backups: [] }),
      }[caminho]
      return { status: 200, text: async () => JSON.stringify(corpo) }
    }

    const codigo = await run(['--relatorio', arquivo], {
      env: { COOKIE_GO: 'g', COOKIE_RAMIELLE: 'r' },
      fetchImpl,
      log: () => {},
      logError: () => {},
    })

    expect(codigo).toBe(0)
    const conteudo = readFileSync(arquivo, 'utf8')
    expect(conteudo).toContain('Resumo:')
  })

  test('⚠️ o cookie NUNCA aparece no texto logado nem no arquivo do relatório', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'comparar-com-go-'))
    tmpDirs.push(dir)
    const arquivo = path.join(dir, 'saida.txt')
    const logs = []

    const cookieSecretoGo = 'piluvitu_session=segredo-go-nao-pode-vazar'
    const cookieSecretoRamielle = 'better-auth.session_token=segredo-ramielle-nao-pode-vazar'

    const fetchImpl = async (url) => {
      const caminho = url.split(/:8080|:8788/)[1]
      const corpo = {
        '/votacao/sessions': envelope({ sessions: [] }),
        '/votacao/categorias': envelope({ categories: [] }),
        '/admin/users': envelope({ users: [] }),
        '/admin/backups': envelope({ backups: [] }),
      }[caminho]
      return { status: 200, text: async () => JSON.stringify(corpo) }
    }

    await run(['--relatorio', arquivo], {
      env: { COOKIE_GO: cookieSecretoGo, COOKIE_RAMIELLE: cookieSecretoRamielle },
      fetchImpl,
      log: (msg) => logs.push(msg),
      logError: () => {},
    })

    const textoLogado = logs.join('\n')
    expect(textoLogado).not.toContain('segredo-go-nao-pode-vazar')
    expect(textoLogado).not.toContain('segredo-ramielle-nao-pode-vazar')

    const conteudoArquivo = readFileSync(arquivo, 'utf8')
    expect(conteudoArquivo).not.toContain('segredo-go-nao-pode-vazar')
    expect(conteudoArquivo).not.toContain('segredo-ramielle-nao-pode-vazar')
  })
})
