/**
 * Dois Crons no mesmo handler, despachados por `controller.cron`:
 *  - `"0 12 1 * *"` (dia 1, 09:00 em Teresina): o insight do mês que fechou;
 *  - `"0 9 * * *"` (todo dia, 06:00 em Teresina): a recorrência que lança
 *    sozinha (migration 0019).
 * O `fetch` global é trocado: nenhum teste alcança a API de verdade.
 */
import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import wranglerJsonc from '../wrangler.jsonc?raw'
import { nowIsoUtc } from './lib/dates'
import { newId } from './lib/ids'
import worker from './index'
import { scheduled } from './scheduled'

const SENTINELA = 'SENTINELA-cron-financas-4e2a'
const CHAVE = `sk-ant-${SENTINELA}`
const PRIMEIRO_DE_NOVEMBRO = Date.parse('2026-11-01T12:00:00Z')

let urlsChamadas: string[]
let saidasDoConsole: unknown[][]

function respostaClaude(texto: string): Response {
  return Response.json({
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: texto }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 800,
      output_tokens: 150,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
  })
}

function apiResponde(responder: () => Response) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    urlsChamadas.push(new Request(input, init).url)
    return responder()
  })
}

const CRON_INSIGHT = '0 12 1 * *'
const CRON_RECORRENCIA = '0 9 * * *'

async function rodarCron(
  scheduledTime: number,
  chave: string | undefined,
  cron: string = CRON_INSIGHT,
) {
  // O relógio acompanha o disparo: o `generated_at` gravado é o do Cron.
  vi.setSystemTime(scheduledTime)
  const controller = createScheduledController({ scheduledTime, cron })
  const ctx = createExecutionContext()
  await scheduled(controller, { ...env, ANTHROPIC_API_KEY: chave }, ctx)
  await waitOnExecutionContext(ctx)
}

function comoTexto(valor: unknown): string {
  if (valor instanceof Error) {
    return `${valor.name} ${valor.message} ${valor.stack ?? ''}`
  }
  try {
    return JSON.stringify(valor) ?? String(valor)
  } catch {
    return String(valor)
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  urlsChamadas = []
  saidasDoConsole = []
  for (const metodo of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      saidasDoConsole.push(args)
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('cron do insight mensal', () => {
  // Desde a 0019 a lista tem também o diário da recorrência.
  it('o wrangler.jsonc registra o do dia 1 às 12:00 UTC e o diário das 09:00 UTC', () => {
    expect(wranglerJsonc).toMatch(
      /"triggers":\s*\{\s*"crons":\s*\[\s*"0 12 1 \* \*",\s*"0 9 \* \* \*"\s*\]\s*\}/,
    )
  })

  it('o Worker exporta o handler scheduled junto com o fetch', () => {
    expect(worker.scheduled).toBe(scheduled)
    expect(typeof worker.fetch).toBe('function')
  })

  it('em 2026-11-01 gera o insight de 2026-10, o mês que fechou', async () => {
    apiResponde(() => respostaClaude('Outubro fechou sem surpresas.'))

    await rodarCron(PRIMEIRO_DE_NOVEMBRO, CHAVE)

    const linhas = await env.DB.prepare(
      'SELECT texto, modelo, periodo FROM insights',
    ).all()
    expect(linhas.results).toEqual([
      {
        texto: 'Outubro fechou sem surpresas.',
        modelo: 'claude-sonnet-5-5',
        periodo: '2026-10',
      },
    ])
    expect(urlsChamadas).toHaveLength(1)
    expect(new URL(urlsChamadas[0]).host).toBe('api.anthropic.com')
  })

  it('o mês é o de Fortaleza: 00:30 UTC do dia 1 ainda é o último dia do mês anterior lá', async () => {
    apiResponde(() => respostaClaude('Leitura.'))

    await rodarCron(Date.parse('2026-11-01T00:30:00Z'), CHAVE)

    const linha = await env.DB.prepare('SELECT periodo FROM insights').first<{
      periodo: string
    }>()
    expect(linha?.periodo).toBe('2026-09')
  })

  it('em janeiro gera dezembro do ano anterior', async () => {
    apiResponde(() => respostaClaude('Leitura.'))

    await rodarCron(Date.parse('2027-01-01T12:00:00Z'), CHAVE)

    const linha = await env.DB.prepare('SELECT periodo FROM insights').first<{
      periodo: string
    }>()
    expect(linha?.periodo).toBe('2026-12')
  })

  it('rodar duas vezes grava um insight só e chama a API uma vez', async () => {
    apiResponde(() => respostaClaude('Leitura.'))

    await rodarCron(PRIMEIRO_DE_NOVEMBRO, CHAVE)
    await rodarCron(PRIMEIRO_DE_NOVEMBRO, CHAVE)

    const n = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM insights WHERE periodo = '2026-10'",
    ).first<{ n: number }>()
    expect(n?.n).toBe(1)
    expect(urlsChamadas).toHaveLength(1)
    const usos = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM uso_ia',
    ).first<{ n: number }>()
    expect(usos?.n).toBe(1)
  })

  it('um insight gerado depois do mês fechar já basta: o cron não gera outro', async () => {
    // 02:00 de 01/11 em Fortaleza: outubro já tinha fechado.
    await env.DB.prepare(
      `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
       VALUES ('manual', 'Gerado pelo botão.', 'claude-sonnet-5-5', '2026-10', '2026-11-01T05:00:00Z')`,
    ).run()
    apiResponde(() => respostaClaude('Outro.'))

    await rodarCron(PRIMEIRO_DE_NOVEMBRO, CHAVE)

    expect(urlsChamadas).toHaveLength(0)
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM insights').first<{
      n: number
    }>()
    expect(n?.n).toBe(1)
  })

  it.each([
    ['no meio do mês', '2026-10-10T15:00:00Z'],
    ['às 23:59 de 31/10 em Fortaleza', '2026-11-01T02:59:59Z'],
  ])(
    'um insight do mês gerado antes de ele fechar (%s) não bloqueia: o cron gera o do mês fechado',
    async (_quando, generatedAt) => {
      await env.DB.prepare(
        `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
         VALUES ('parcial', 'Leitura parcial.', 'claude-sonnet-5-5', '2026-10', ?)`,
      )
        .bind(generatedAt)
        .run()
      apiResponde(() => respostaClaude('Outubro fechado.'))

      await rodarCron(PRIMEIRO_DE_NOVEMBRO, CHAVE)

      expect(urlsChamadas).toHaveLength(1)
      const maisRecente = await env.DB.prepare(
        'SELECT texto, periodo FROM insights ORDER BY generated_at DESC LIMIT 1',
      ).first()
      expect(maisRecente).toEqual({
        texto: 'Outubro fechado.',
        periodo: '2026-10',
      })
    },
  )

  it('falha do D1 ao consultar os insights não lança: só console.error', async () => {
    const dbQueFalha = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.includes('FROM insights')) {
              throw new Error('D1_ERROR: no such table: insights')
            }
            return alvo.prepare(sql)
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })
    apiResponde(() => respostaClaude('x'))
    const controller = createScheduledController({
      scheduledTime: PRIMEIRO_DE_NOVEMBRO,
      cron: '0 12 1 * *',
    })
    const ctx = createExecutionContext()

    await expect(
      scheduled(
        controller,
        { ...env, DB: dbQueFalha, ANTHROPIC_API_KEY: CHAVE },
        ctx,
      ),
    ).resolves.toBeUndefined()
    await waitOnExecutionContext(ctx)

    expect(urlsChamadas).toHaveLength(0)
    const tudo = saidasDoConsole.map((args) => args.map(comoTexto).join(' '))
    expect(tudo.some((linha) => linha.includes('cron do insight falhou'))).toBe(
      true,
    )
  })

  it('falha da Claude não lança: console.error sem a chave, e uso_ia fica falhou', async () => {
    apiResponde(
      () =>
        new Response(
          JSON.stringify({
            type: 'error',
            error: { type: 'api_error', message: `erro interno ${CHAVE}` },
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
    )

    await expect(
      rodarCron(PRIMEIRO_DE_NOVEMBRO, CHAVE),
    ).resolves.toBeUndefined()

    const usos = await env.DB.prepare('SELECT estado FROM uso_ia').all()
    expect(usos.results).toEqual([{ estado: 'falhou' }])
    const insights = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM insights',
    ).first<{ n: number }>()
    expect(insights?.n).toBe(0)

    expect(saidasDoConsole.length).toBeGreaterThan(0)
    const tudo = saidasDoConsole.map((args) => args.map(comoTexto).join(' '))
    expect(tudo.some((linha) => linha.includes('2026-10'))).toBe(true)
    for (const linha of tudo) {
      expect(linha).not.toContain(SENTINELA)
    }
  })

  it('sem a chave não lança nem chama a API, e avisa no console', async () => {
    apiResponde(() => respostaClaude('x'))

    await expect(
      rodarCron(PRIMEIRO_DE_NOVEMBRO, undefined),
    ).resolves.toBeUndefined()

    expect(urlsChamadas).toHaveLength(0)
    expect(
      saidasDoConsole.some((args) =>
        args.map(comoTexto).join(' ').includes('claude_desligado'),
      ),
    ).toBe(true)
  })
})

// Recorrência que lança sozinha (migration 0019): o diário cria o pendente
// de cada ocorrência vencida; a regra mora em domain/recurring-auto.ts.
describe('cron diário da recorrência automática', () => {
  async function recorrenteQueLancaSozinha(dayOfMonth: number) {
    const conta = newId()
    const recorrente = newId()
    const now = nowIsoUtc()
    await env.DB.prepare(
      `INSERT INTO accounts
         (id, name, scope, kind, currency, opening_balance_cents, created_at, updated_at)
       VALUES (?, 'Conta de teste', 'PF', 'checking', 'BRL', 0, ?, ?)`,
    )
      .bind(conta, now, now)
      .run()
    await env.DB.prepare(
      `INSERT INTO recurring_expenses
         (id, description, account_id, scope, frequency, day_of_month,
          amount_min_cents, amount_max_cents, starts_on, active,
          generate_since, created_at, updated_at)
       VALUES (?, 'Internet fibra', ?, 'PF', 'monthly', ?, 9990, 12990,
               '2026-01-01', 1, '2026-08-01', ?, ?)`,
    )
      .bind(recorrente, conta, dayOfMonth, now, now)
      .run()
    return recorrente
  }

  async function gerados(recorrente: string) {
    const res = await env.DB.prepare(
      `SELECT purchase_date, amount_cents, settled_at FROM transactions
        WHERE recurring_expense_id = ?`,
    )
      .bind(recorrente)
      .all()
    return res.results
  }

  it('"0 9 * * *" gera o pendente do dia, sem chamar a Claude nem gerar insight', async () => {
    const r = await recorrenteQueLancaSozinha(10)
    apiResponde(() => respostaClaude('x'))

    await rodarCron(Date.parse('2026-08-10T09:00:00Z'), CHAVE, CRON_RECORRENCIA)

    expect(await gerados(r)).toEqual([
      { purchase_date: '2026-08-10', amount_cents: -12990, settled_at: null },
    ])
    expect(urlsChamadas).toHaveLength(0)
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM insights').first<{
      n: number
    }>()
    expect(n?.n).toBe(0)
  })

  it('o dia é o de Fortaleza: 02:00 UTC de 11/08 ainda é 10/08 lá', async () => {
    const r = await recorrenteQueLancaSozinha(11)

    await rodarCron(Date.parse('2026-08-11T02:00:00Z'), CHAVE, CRON_RECORRENCIA)

    expect(await gerados(r)).toEqual([])
  })

  it('duas rodadas no mesmo dia geram um lançamento só', async () => {
    const r = await recorrenteQueLancaSozinha(10)
    const quando = Date.parse('2026-08-10T09:00:00Z')

    await rodarCron(quando, CHAVE, CRON_RECORRENCIA)
    await rodarCron(quando, CHAVE, CRON_RECORRENCIA)

    expect(await gerados(r)).toHaveLength(1)
  })

  it('o cron do dia 1 não roda a geração', async () => {
    const r = await recorrenteQueLancaSozinha(1)
    apiResponde(() => respostaClaude('Leitura.'))

    await rodarCron(Date.parse('2026-09-01T12:00:00Z'), CHAVE, CRON_INSIGHT)

    expect(await gerados(r)).toEqual([])
    expect(urlsChamadas).toHaveLength(1)
  })

  it('D1 falhando não lança: console.error só com o código, sem descrição nem valor', async () => {
    await recorrenteQueLancaSozinha(10)
    const dbQueFalha = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.includes('FROM recurring_expenses')) {
              throw new Error(
                'D1_ERROR: no such table: recurring_expenses: SQLITE_ERROR',
              )
            }
            return alvo.prepare(sql)
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })
    const controller = createScheduledController({
      scheduledTime: Date.parse('2026-08-10T09:00:00Z'),
      cron: CRON_RECORRENCIA,
    })
    const ctx = createExecutionContext()

    await expect(
      scheduled(controller, { ...env, DB: dbQueFalha }, ctx),
    ).resolves.toBeUndefined()
    await waitOnExecutionContext(ctx)

    const tudo = saidasDoConsole.map((args) => args.map(comoTexto).join(' '))
    const falha = tudo.find((linha) =>
      linha.includes('cron da recorrência falhou'),
    )
    expect(falha).toContain('SQLITE_ERROR')
    expect(falha).not.toMatch(/no such table/)
    for (const linha of tudo) {
      expect(linha).not.toMatch(/Internet fibra|12990/)
    }
  })

  it('cron desconhecido: console.error e não faz nada', async () => {
    const r = await recorrenteQueLancaSozinha(10)
    apiResponde(() => respostaClaude('x'))

    await expect(
      rodarCron(Date.parse('2026-08-10T09:00:00Z'), CHAVE, '*/5 * * * *'),
    ).resolves.toBeUndefined()

    expect(await gerados(r)).toEqual([])
    expect(urlsChamadas).toHaveLength(0)
    const tudo = saidasDoConsole.map((args) => args.map(comoTexto).join(' '))
    expect(tudo.some((linha) => linha.includes('cron desconhecido'))).toBe(true)
  })
})
