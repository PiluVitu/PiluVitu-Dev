// Testes do comando de insight (fatia ⑨, Task 4). Roda sob
// `vitest.scripts.config.ts` (environment: 'node', SEM o pool do
// Miniflare/cloudflareTest do resto do app) — mesmo motivo de
// pdf-import.test.mjs: este CLI é Node puro, fora do Worker de propósito.
//
// Nada aqui chama o Ollama nem a API de verdade: as duas são sempre
// stubadas via injeção de dependência (`fetchImpl`/`env`/`now` em `run()`).
// A prova de que o comando funciona CONTRA O OLLAMA REAL fica registrada
// em CLAUDE.md (rodado manualmente, não neste arquivo) — mesma separação
// que pdf-import.test.mjs já usa.
//
// Rodar: pnpm --filter @piluvitu/financas run test:pdf-import
// (mesmo comando de pdf-import.test.mjs — vitest.scripts.config.ts inclui
// scripts/**/*.test.mjs inteiro, não só um arquivo)

import { describe, test, expect } from 'vitest'
import {
  buildPrompt,
  callOllama,
  fetchNumbers,
  postInsight,
  parseArgs,
  competenciaAtual,
  run,
  DEFAULT_MODEL,
  DEFAULT_OLLAMA_URL,
  DEFAULT_API_URL,
} from './insight.mjs'

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function fakeNumbers(overrides = {}) {
  return {
    competence: '2026-07',
    previous_competence: '2026-06',
    top_categories: [
      {
        category_id: 'c1',
        category_name: 'Mercado',
        category_slug: 'mercado',
        total_cents: -90000,
      },
      {
        category_id: 'c2',
        category_name: 'Transporte',
        category_slug: 'transporte',
        total_cents: -30000,
      },
    ],
    total_cents: -120000,
    previous_total_cents: -100000,
    variation_cents: 20000,
    variation_pct: 20,
    biggest_increase: {
      category_id: 'c1',
      category_name: 'Mercado',
      category_slug: 'mercado',
      current_cents: -90000,
      previous_cents: -70000,
      delta_cents: 20000,
    },
    ...overrides,
  }
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

function textResponse(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => {
      throw new Error('não é JSON')
    },
    text: async () => text,
  }
}

function envelope(data) {
  return { ok: true, data, notifications: [] }
}

function envelopeErro(message, code = 'algum_erro') {
  return {
    ok: false,
    data: null,
    notifications: [{ type: 'error', code, message }],
  }
}

// ---------------------------------------------------------------------
// competenciaAtual — mesma armadilha UTC já provada em cashflow.test.ts
// (Worker) e no `todayInTeresina` da SPA: um instante logo depois da meia-
// noite UTC ainda é o dia/mês ANTERIOR em Teresina (UTC-3).
// ---------------------------------------------------------------------

describe('competenciaAtual', () => {
  test('1h da manhã UTC de 01/02 é 31/01 em Teresina — competência fica em 2026-01', () => {
    expect(competenciaAtual(new Date('2026-02-01T01:00:00Z'))).toBe('2026-01')
  })

  test('meio-dia UTC não atravessa fronteira nenhuma', () => {
    expect(competenciaAtual(new Date('2026-07-15T12:00:00Z'))).toBe('2026-07')
  })
})

// ---------------------------------------------------------------------
// buildPrompt — o modelo só pode ver os agregados; toda REGRA que proíbe
// inventar número precisa estar no texto.
// ---------------------------------------------------------------------

describe('buildPrompt', () => {
  test('nunca inclui um centavo cru (número grande sem formatação) — só formatBRL', () => {
    const prompt = buildPrompt(fakeNumbers())
    // Os totais crus (-120000, -100000, -90000, -30000, -70000, 20000) não
    // podem aparecer como número solto — só formatados em R$.
    expect(prompt).not.toMatch(/-?120000\b/)
    expect(prompt).not.toMatch(/-?90000\b/)
    expect(prompt).toContain('R$ 1.200,00') // |total_cents|
    expect(prompt).toContain('R$ 900,00') // |Mercado|
  })

  test('lista as categorias na ordem recebida, sem reordenar', () => {
    const prompt = buildPrompt(fakeNumbers())
    const idxMercado = prompt.indexOf('1. Mercado')
    const idxTransporte = prompt.indexOf('2. Transporte')
    expect(idxMercado).toBeGreaterThan(-1)
    expect(idxTransporte).toBeGreaterThan(idxMercado)
  })

  test('inclui as regras obrigatórias que proíbem inventar número', () => {
    const prompt = buildPrompt(fakeNumbers())
    expect(prompt).toMatch(/NUNCA invente/i)
    expect(prompt).toMatch(/SOMENTE os números/i)
  })

  test('top_categories vazio: mensagem explícita, não uma lista vazia silenciosa', () => {
    const prompt = buildPrompt(fakeNumbers({ top_categories: [] }))
    expect(prompt).toContain('(nenhum gasto registrado nesta competência)')
  })

  test('variation_pct null: "sem base de comparação", nunca um número inventado', () => {
    const prompt = buildPrompt(
      fakeNumbers({
        variation_cents: 0,
        variation_pct: null,
        previous_total_cents: 0,
      }),
    )
    expect(prompt).toMatch(/Sem base de comparação/)
  })

  test('variation_cents zero (com base válida): "sem variação", não "aumento de R$ 0,00"', () => {
    const prompt = buildPrompt(
      fakeNumbers({ variation_cents: 0, variation_pct: 0 }),
    )
    expect(prompt).toMatch(/Sem variação em relação a 2026-06/)
  })

  test('biggest_increase null: marcador explícito, não um "undefined" vazando pro prompt', () => {
    const prompt = buildPrompt(fakeNumbers({ biggest_increase: null }))
    expect(prompt).toContain('(sem dado suficiente para apontar)')
    expect(prompt).not.toMatch(/undefined/)
  })

  test('biggest_increase com queda (delta negativo): rotulado "redução", não "aumento" mentiroso', () => {
    const prompt = buildPrompt(
      fakeNumbers({
        biggest_increase: {
          category_id: 'c3',
          category_name: 'Lazer',
          category_slug: 'lazer',
          current_cents: -1000,
          previous_cents: -5000,
          delta_cents: -4000,
        },
      }),
    )
    expect(prompt).toMatch(
      /Lazer: foi de R\$ 50,00 para R\$ 10,00 \(redução de R\$ 40,00\)/,
    )
  })
})

// ---------------------------------------------------------------------
// callOllama — mesmos quatro casos de erro de pdf-import.mjs, mensagens
// nunca cruas.
// ---------------------------------------------------------------------

describe('callOllama', () => {
  test('caminho feliz: envia temperature 0 e stream false, devolve o texto', async () => {
    let corpoEnviado = null
    const resposta = await callOllama({
      model: 'modelo-x',
      prompt: 'prompt-x',
      url: 'http://localhost:11434/api/generate',
      fetchImpl: async (url, init) => {
        corpoEnviado = JSON.parse(init.body)
        return jsonResponse(200, { response: 'Você gastou mais em Mercado.' })
      },
    })
    expect(resposta).toBe('Você gastou mais em Mercado.')
    expect(corpoEnviado.model).toBe('modelo-x')
    expect(corpoEnviado.prompt).toBe('prompt-x')
    expect(corpoEnviado.stream).toBe(false)
    expect(corpoEnviado.options).toEqual({ temperature: 0 })
  })

  test('conexão recusada (Ollama desligado): mensagem de como iniciar, nunca ECONNREFUSED cru', async () => {
    await expect(
      callOllama({
        model: 'm',
        prompt: 'p',
        url: 'http://localhost:11434/api/generate',
        fetchImpl: async () => {
          const err = new Error('fetch failed')
          err.cause = { code: 'ECONNREFUSED' }
          throw err
        },
      }),
    ).rejects.toThrow(/ollama serve/)
  })

  test('modelo não instalado (404): comando exato de "ollama pull"', async () => {
    await expect(
      callOllama({
        model: 'modelo-inexistente',
        prompt: 'p',
        url: 'http://localhost:11434/api/generate',
        fetchImpl: async () =>
          textResponse(
            404,
            JSON.stringify({ error: "model 'modelo-inexistente' not found" }),
          ),
      }),
    ).rejects.toThrow(/ollama pull modelo-inexistente/)
  })

  test('outro erro HTTP do Ollama: status citado, corpo cru limitado', async () => {
    await expect(
      callOllama({
        model: 'm',
        prompt: 'p',
        url: 'http://localhost:11434/api/generate',
        fetchImpl: async () => textResponse(500, 'erro interno'),
      }),
    ).rejects.toThrow(/500/)
  })

  test('resposta sem o campo "response": erro nomeando o problema', async () => {
    await expect(
      callOllama({
        model: 'm',
        prompt: 'p',
        url: 'http://localhost:11434/api/generate',
        fetchImpl: async () => jsonResponse(200, { algumaOutraCoisa: true }),
      }),
    ).rejects.toThrow(/campo "response"/)
  })
})

// ---------------------------------------------------------------------
// fetchNumbers / postInsight — API inalcançável (rede) vs. API recusou
// (401/outro status) são mensagens DIFERENTES, de propósito.
// ---------------------------------------------------------------------

describe('fetchNumbers', () => {
  const base = {
    apiUrl: 'https://financas.piluvitu.com.br',
    token: 'tok',
    competence: '2026-07',
  }

  test('caminho feliz: manda Authorization Bearer, devolve data do envelope', async () => {
    let headersRecebidos = null
    let urlChamada = null
    const data = await fetchNumbers({
      ...base,
      fetchImpl: async (url, init) => {
        urlChamada = url
        headersRecebidos = init.headers
        return jsonResponse(200, envelope(fakeNumbers()))
      },
    })
    expect(urlChamada).toBe(
      'https://financas.piluvitu.com.br/api/insights/numbers?competence=2026-07',
    )
    expect(headersRecebidos.authorization).toBe('Bearer tok')
    expect(data.competence).toBe('2026-07')
  })

  test('rede indisponível (fetch lança): "não consegui alcançar a API", nunca o erro cru sozinho', async () => {
    await expect(
      fetchNumbers({
        ...base,
        fetchImpl: async () => {
          throw new TypeError('fetch failed')
        },
      }),
    ).rejects.toThrow(/não consegui alcançar a API/)
  })

  test('API recusa com 401: mensagem cita o INGEST_TOKEN, distinta de "não alcancei"', async () => {
    await expect(
      fetchNumbers({
        ...base,
        fetchImpl: async () =>
          textResponse(401, JSON.stringify(envelopeErro('token inválido'))),
      }),
    ).rejects.toThrow(/INGEST_TOKEN/)
  })

  test('API recusa com outro status: mensagem cita o status, distinta da recusa de token', async () => {
    await expect(
      fetchNumbers({
        ...base,
        fetchImpl: async () =>
          textResponse(
            400,
            JSON.stringify(envelopeErro('competência inválida')),
          ),
      }),
    ).rejects.toThrow(/400/)
  })

  test('envelope ok:false (200 mas recusado no corpo): mensagem da própria API', async () => {
    await expect(
      fetchNumbers({
        ...base,
        fetchImpl: async () =>
          jsonResponse(200, envelopeErro('algo deu errado no domínio')),
      }),
    ).rejects.toThrow(/algo deu errado no domínio/)
  })

  test('resposta não é JSON: erro nomeado, não um crash cru', async () => {
    await expect(
      fetchNumbers({
        ...base,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('unexpected token')
          },
        }),
      }),
    ).rejects.toThrow(/não é JSON válido/)
  })
})

describe('postInsight', () => {
  const base = {
    apiUrl: 'https://financas.piluvitu.com.br',
    token: 'tok',
    texto: 'texto gerado',
    modelo: 'qwen2.5:7b-instruct',
    periodo: '2026-07',
  }

  test('caminho feliz: POST com corpo texto/modelo/periodo, Authorization Bearer', async () => {
    let urlChamada = null
    let corpo = null
    let metodo = null
    const data = await postInsight({
      ...base,
      fetchImpl: async (url, init) => {
        urlChamada = url
        corpo = JSON.parse(init.body)
        metodo = init.method
        return jsonResponse(201, envelope({ id: 'i1', texto: base.texto }))
      },
    })
    expect(urlChamada).toBe('https://financas.piluvitu.com.br/api/insights')
    expect(metodo).toBe('POST')
    expect(corpo).toEqual({
      texto: 'texto gerado',
      modelo: base.modelo,
      periodo: base.periodo,
    })
    expect(data.id).toBe('i1')
  })

  test('rede indisponível: "não consegui alcançar a API"', async () => {
    await expect(
      postInsight({
        ...base,
        fetchImpl: async () => {
          throw new TypeError('fetch failed')
        },
      }),
    ).rejects.toThrow(/não consegui alcançar a API/)
  })

  test('token errado (401): mensagem cita INGEST_TOKEN', async () => {
    await expect(
      postInsight({
        ...base,
        fetchImpl: async () =>
          textResponse(401, JSON.stringify(envelopeErro('token inválido'))),
      }),
    ).rejects.toThrow(/INGEST_TOKEN/)
  })
})

// ---------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------

describe('parseArgs', () => {
  test('sem argumentos: tudo undefined, sem erro', () => {
    const args = parseArgs([])
    expect(args.error).toBeNull()
    expect(args.competence).toBeUndefined()
    expect(args.model).toBeUndefined()
  })

  test('aceita os aliases --competencia/--competence, --modelo/--model, --api-url/--api', () => {
    expect(parseArgs(['--competencia', '2026-07']).competence).toBe('2026-07')
    expect(parseArgs(['--competence', '2026-07']).competence).toBe('2026-07')
    expect(parseArgs(['--modelo', 'm1']).model).toBe('m1')
    expect(parseArgs(['--model', 'm1']).model).toBe('m1')
    expect(parseArgs(['--api-url', 'http://x']).apiUrl).toBe('http://x')
    expect(parseArgs(['--api', 'http://x']).apiUrl).toBe('http://x')
    expect(parseArgs(['--url', 'http://y']).ollamaUrl).toBe('http://y')
  })

  test('--help / -h vira flag, sem exigir mais nada', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['-h']).help).toBe(true)
  })

  test('flag sem valor: erro nomeando a opção', () => {
    const args = parseArgs(['--modelo'])
    expect(args.error).toMatch(/--modelo/)
  })

  test('opção desconhecida: erro, não ignorado em silêncio', () => {
    const args = parseArgs(['--bagunca'])
    expect(args.error).toMatch(/--bagunca/)
  })
})

// ---------------------------------------------------------------------
// run() — orquestração ponta a ponta, tudo stubado (Ollama e API).
// ---------------------------------------------------------------------

describe('run', () => {
  function fetchStub({
    numbers = fakeNumbers(),
    ollamaTexto = 'Resumo do mês.',
    onOllama,
    onPost,
  } = {}) {
    return async (url, init) => {
      if (url.includes('/api/insights/numbers')) {
        return jsonResponse(200, envelope(numbers))
      }
      if (url.includes('/api/insights')) {
        if (onPost) onPost(JSON.parse(init.body))
        return jsonResponse(201, envelope({ id: 'i1' }))
      }
      if (onOllama) onOllama(JSON.parse(init.body))
      return jsonResponse(200, { response: ollamaTexto })
    }
  }

  test('caminho feliz: busca números, gera texto, publica, devolve 0 e loga o texto final', async () => {
    const logs = []
    const errs = []
    let corpoPublicado = null

    const codigo = await run(['--competencia', '2026-07'], {
      env: { INGEST_TOKEN: 'tok-valido' },
      fetchImpl: fetchStub({ onPost: (c) => (corpoPublicado = c) }),
      log: (m) => logs.push(m),
      logError: (m) => errs.push(m),
    })

    expect(codigo).toBe(0)
    expect(errs).toEqual([])
    expect(corpoPublicado).toEqual({
      texto: 'Resumo do mês.',
      modelo: DEFAULT_MODEL,
      periodo: '2026-07',
    })
    expect(logs.some((l) => l.includes('Resumo do mês.'))).toBe(true)
    expect(logs.some((l) => l.includes('publicado com sucesso'))).toBe(true)
  })

  test('usa a competência corrente (Teresina) quando --competencia não é passado', async () => {
    let periodoUsado = null
    const codigo = await run([], {
      env: { INGEST_TOKEN: 'tok' },
      now: () => new Date('2026-07-15T12:00:00Z'),
      fetchImpl: fetchStub({ onPost: (c) => (periodoUsado = c.periodo) }),
      log: () => {},
      logError: () => {},
    })
    expect(codigo).toBe(0)
    expect(periodoUsado).toBe('2026-07')
  })

  test('INGEST_TOKEN ausente do ambiente: erro claro, diz como definir, nunca chama rede', async () => {
    const errs = []
    let chamouFetch = false
    const codigo = await run([], {
      env: {},
      fetchImpl: async () => {
        chamouFetch = true
        throw new Error('não deveria ter chamado')
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).toBe(1)
    expect(chamouFetch).toBe(false)
    expect(errs.some((m) => m.includes('INGEST_TOKEN'))).toBe(true)
  })

  test('--competencia malformada: erro de uso (código 2), nunca chama rede', async () => {
    const errs = []
    let chamouFetch = false
    const codigo = await run(['--competencia', '2026-13'], {
      env: { INGEST_TOKEN: 'tok' },
      fetchImpl: async () => {
        chamouFetch = true
        throw new Error('não deveria ter chamado')
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).toBe(2)
    expect(chamouFetch).toBe(false)
    expect(errs.some((m) => m.includes('competência inválida'))).toBe(true)
  })

  test('opção desconhecida: código 2, mostra o uso', async () => {
    const logs = []
    const codigo = await run(['--bagunca'], {
      env: { INGEST_TOKEN: 'tok' },
      log: (m) => logs.push(m),
      logError: () => {},
    })
    expect(codigo).toBe(2)
    expect(logs.some((l) => l.includes('Uso:'))).toBe(true)
  })

  test('--help: código 0, mostra o uso, não toca em INGEST_TOKEN nem rede', async () => {
    const logs = []
    const codigo = await run(['--help'], {
      env: {},
      fetchImpl: async () => {
        throw new Error('não deveria ter chamado')
      },
      log: (m) => logs.push(m),
      logError: () => {},
    })
    expect(codigo).toBe(0)
    expect(logs.some((l) => l.includes('Uso:'))).toBe(true)
  })

  test('Ollama desligado: erro de rede/API distinto — mensagem de "ollama serve", código 1', async () => {
    const errs = []
    const codigo = await run(['--competencia', '2026-07'], {
      env: { INGEST_TOKEN: 'tok' },
      fetchImpl: async (url) => {
        if (url.includes('/api/insights/numbers')) {
          return jsonResponse(200, envelope(fakeNumbers()))
        }
        const err = new Error('fetch failed')
        err.cause = { code: 'ECONNREFUSED' }
        throw err
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).toBe(1)
    expect(errs.some((m) => m.includes('ollama serve'))).toBe(true)
  })

  test('modelo devolve texto vazio: falha alto, saída bruta no log, NADA é publicado', async () => {
    const errs = []
    let chamouPost = false
    const codigo = await run(['--competencia', '2026-07'], {
      env: { INGEST_TOKEN: 'tok' },
      fetchImpl: fetchStub({
        ollamaTexto: '   ',
        onPost: () => {
          chamouPost = true
        },
      }),
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).toBe(1)
    expect(chamouPost).toBe(false)
    expect(errs.some((m) => m.includes('texto vazio'))).toBe(true)
    expect(errs.some((m) => m.includes('saída bruta'))).toBe(true)
  })

  test('API recusa a leitura de números (401): erro claro, nunca chega a chamar o Ollama', async () => {
    const errs = []
    let chamouOllama = false
    const codigo = await run(['--competencia', '2026-07'], {
      env: { INGEST_TOKEN: 'tok-errado-no-servidor' },
      fetchImpl: async (url) => {
        if (url.includes('/api/insights/numbers')) {
          return textResponse(
            401,
            JSON.stringify(envelopeErro('token inválido')),
          )
        }
        chamouOllama = true
        return jsonResponse(200, { response: 'não deveria chegar aqui' })
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).toBe(1)
    expect(chamouOllama).toBe(false)
    expect(errs.some((m) => m.includes('INGEST_TOKEN'))).toBe(true)
  })

  test('API inalcançável (rede fora) ao buscar números: mensagem distinta de "recusou"', async () => {
    const errs = []
    const codigo = await run(['--competencia', '2026-07'], {
      env: { INGEST_TOKEN: 'tok' },
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).toBe(1)
    expect(errs.some((m) => m.includes('não consegui alcançar a API'))).toBe(
      true,
    )
  })

  test('publicação falha depois do texto gerado: o texto gerado aparece no log, não é perdido', async () => {
    const errs = []
    const codigo = await run(['--competencia', '2026-07'], {
      env: { INGEST_TOKEN: 'tok' },
      fetchImpl: async (url) => {
        if (url.includes('/api/insights/numbers')) {
          return jsonResponse(200, envelope(fakeNumbers()))
        }
        if (url.includes('/api/insights')) {
          return textResponse(500, 'erro interno')
        }
        return jsonResponse(200, { response: 'Texto que seria publicado.' })
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).toBe(1)
    expect(errs.some((m) => m.includes('Texto que seria publicado.'))).toBe(
      true,
    )
  })
})
