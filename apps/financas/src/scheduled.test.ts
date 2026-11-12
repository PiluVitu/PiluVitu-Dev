/**
 * Dois Crons no mesmo handler, despachados por `controller.cron`:
 *  - `"0 12 1 * *"` (dia 1, 09:00 em Teresina): o insight do mês que fechou;
 *  - `"0 9 * * *"` (todo dia, 06:00 em Teresina): a recorrência que lança
 *    sozinha (migration 0019) e, depois dela, os alertas por e-mail (0021).
 * O `fetch` global é trocado: nenhum teste alcança a API de verdade. O
 * binding EMAIL é sempre um falso que grava as mensagens, e o destinatário é
 * um endereço fictício: nenhum teste chega perto de envio real.
 */
import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import wranglerJsonc from '../wrangler.jsonc?raw'
import { createAccount } from './domain/accounts'
import type { MensagemDeAlerta } from './domain/alertas'
import { setBudget } from './domain/budgets'
import { createCategory } from './domain/categories'
import { setAlertasLigados } from './domain/settings'
import { createTransaction } from './domain/transactions'
import { nowIsoUtc } from './lib/dates'
import { newId } from './lib/ids'
import worker from './index'
import { scheduled } from './scheduled'

const SENTINELA = 'SENTINELA-cron-financas-4e2a'
const CHAVE = `sk-ant-${SENTINELA}`
const PRIMEIRO_DE_NOVEMBRO = Date.parse('2026-11-01T12:00:00Z')

let urlsChamadas: string[]
let saidasDoConsole: unknown[][]
let emails: MensagemDeAlerta[]

const PARA = 'dono@exemplo.test'
const REMETENTE = 'alertas@exemplo.test'
const APP = 'https://financas.exemplo.test'

function emailFalso(falha?: unknown): SendEmail {
  const falso = {
    async send(msg: MensagemDeAlerta) {
      if (falha !== undefined) throw falha
      emails.push(msg)
      return { messageId: `msg-${emails.length}` }
    },
  }
  return falso as unknown as SendEmail
}

function envDeAlertas() {
  return {
    EMAIL: emailFalso(),
    ALLOWED_EMAIL: PARA,
    ALERTAS_REMETENTE: REMETENTE,
    BETTER_AUTH_URL: APP,
  }
}

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
  extra: Record<string, unknown> = {},
) {
  // O relógio acompanha o disparo: o `generated_at` gravado é o do Cron.
  vi.setSystemTime(scheduledTime)
  const controller = createScheduledController({ scheduledTime, cron })
  const ctx = createExecutionContext()
  await scheduled(
    controller,
    { ...env, ...envDeAlertas(), ANTHROPIC_API_KEY: chave, ...extra },
    ctx,
  )
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
  emails = []
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
      scheduled(controller, { ...env, ...envDeAlertas(), DB: dbQueFalha }, ctx),
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

// Alertas por e-mail (migration 0021) no mesmo Cron diário, DEPOIS da
// geração: o pendente gerado hoje já entra no gasto do orçamento. Cada um tem
// o próprio try/catch. A regra dos alertas mora em domain/alertas.ts.
describe('cron diário: alertas por e-mail', () => {
  const DIA_10_DE_AGOSTO = Date.parse('2026-08-10T09:00:00Z')

  async function categoriaComOrcamento(nome: string, orcamento: number) {
    const cat = await createCategory(env.DB, { name: nome, kind: 'expense' })
    await setBudget(env.DB, '2026-08', cat.id, orcamento)
    return cat
  }

  async function gastoAvulso(categoryId: string, cents: number, dia: string) {
    const conta = await createAccount(env.DB, {
      name: 'Conta Teste',
      scope: 'PF',
      kind: 'checking',
    })
    await createTransaction(env.DB, {
      account_id: conta.id,
      category_id: categoryId,
      amount_cents: -cents,
      purchase_date: dia,
      description: 'Compra de teste',
    })
  }

  async function recorrenteNaCategoria(categoryId: string | null) {
    const conta = newId()
    const recorrente = newId()
    const now = nowIsoUtc()
    await env.DB.prepare(
      `INSERT INTO accounts
         (id, name, scope, kind, currency, opening_balance_cents, created_at, updated_at)
       VALUES (?, 'Conta Teste', 'PF', 'checking', 'BRL', 0, ?, ?)`,
    )
      .bind(conta, now, now)
      .run()
    await env.DB.prepare(
      `INSERT INTO recurring_expenses
         (id, description, category_id, account_id, scope, frequency, day_of_month,
          amount_min_cents, amount_max_cents, starts_on, active,
          generate_since, created_at, updated_at)
       VALUES (?, 'Assinatura', ?, ?, 'PF', 'monthly', 10, 8000, 9000,
               '2026-01-01', 1, '2026-08-01', ?, ?)`,
    )
      .bind(recorrente, categoryId, conta, now, now)
      .run()
    return recorrente
  }

  function dbQueFalhaEm(trecho: string) {
    return new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop === 'prepare') {
          return (sql: string) => {
            if (sql.includes(trecho)) {
              throw new Error(
                `D1_ERROR: no such table: ${trecho}: SQLITE_ERROR`,
              )
            }
            return alvo.prepare(sql)
          }
        }
        const valor = Reflect.get(alvo, prop)
        return typeof valor === 'function' ? valor.bind(alvo) : valor
      },
    })
  }

  function linhasDoConsole() {
    return saidasDoConsole.map((args) => args.map(comoTexto).join(' '))
  }

  function linhaDosAlertas() {
    return saidasDoConsole.find((args) => args[0] === 'alertas por e-mail')
  }

  function semDadoSensivelNoConsole() {
    for (const linha of linhasDoConsole()) {
      expect(linha).not.toContain(PARA)
      expect(linha).not.toMatch(/Mercado|Assinatura|90,00|100,00/)
    }
  }

  it('a geração roda antes: o pendente gerado hoje entra no orçamento e dispara o alerta', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await recorrenteNaCategoria(cat.id)

    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA)

    expect(emails).toHaveLength(1)
    expect(emails[0].to).toBe(PARA)
    expect(emails[0].from).toEqual({ name: 'Finanças', email: REMETENTE })
    expect(emails[0].text).toContain(
      '- Mercado: R$ 90,00 de R$ 100,00 (90%). Perto do limite.',
    )
    expect(emails[0].text).toContain(`${APP}/#/orcamento`)
    expect(urlsChamadas).toHaveLength(0)
  })

  it('sucesso loga só status e contagem, sem e-mail, nome nem valor', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')

    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA)

    expect(linhaDosAlertas()).toEqual([
      'alertas por e-mail',
      '2026-08-10',
      'status=enviado enviados=1',
    ])
    semDadoSensivelNoConsole()
  })

  it('duas rodadas no mesmo dia: um e-mail só', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')

    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA)
    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA)

    expect(emails).toHaveLength(1)
  })

  it('o dia é o de Teresina: 02:00 UTC de 01/09 ainda é 31/08 lá', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')

    await rodarCron(Date.parse('2026-09-01T02:00:00Z'), CHAVE, CRON_RECORRENCIA)

    expect(emails).toHaveLength(1)
    expect(emails[0].text).toContain('Orçamento de agosto de 2026')
  })

  it('geração falhando não impede os alertas', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')
    await recorrenteNaCategoria(null)

    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA, {
      DB: dbQueFalhaEm('FROM recurring_expenses'),
    })

    expect(
      linhasDoConsole().some((l) => l.includes('cron da recorrência falhou')),
    ).toBe(true)
    expect(emails).toHaveLength(1)
  })

  it('alertas falhando não lançam nem desfazem a geração; o log leva só o código', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')
    const r = await recorrenteNaCategoria(null)
    const controller = createScheduledController({
      scheduledTime: DIA_10_DE_AGOSTO,
      cron: CRON_RECORRENCIA,
    })
    const ctx = createExecutionContext()

    await expect(
      scheduled(
        controller,
        { ...env, ...envDeAlertas(), DB: dbQueFalhaEm('alert_log') },
        ctx,
      ),
    ).resolves.toBeUndefined()
    await waitOnExecutionContext(ctx)

    const gerado = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE recurring_expense_id = ?',
    )
      .bind(r)
      .first<{ n: number }>()
    expect(gerado?.n).toBe(1)
    expect(emails).toHaveLength(0)
    const falha = linhasDoConsole().find((l) =>
      l.includes('cron dos alertas falhou'),
    )
    expect(falha).toContain('SQLITE_ERROR')
    expect(falha).not.toMatch(/no such table/)
    semDadoSensivelNoConsole()
  })

  // Sem conseguir ler o liga/desliga, o Cron não pode presumir "ligado": o
  // dono pode ter desligado, e o e-mail sairia contra a escolha dele.
  it('leitura do liga/desliga falhando: nenhum e-mail, nada reivindicado e log só com o código', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')

    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA, {
      DB: dbQueFalhaEm('FROM settings'),
    })

    expect(emails).toHaveLength(0)
    const log = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM alert_log',
    ).first<{ n: number }>()
    expect(log?.n).toBe(0)
    const falha = linhasDoConsole().find((l) =>
      l.includes('cron dos alertas falhou'),
    )
    expect(falha).toContain('SQLITE_ERROR')
    expect(falha).not.toMatch(/no such table/)
    semDadoSensivelNoConsole()
  })

  it('envio recusado: log com status e o code do Email Service, e nada fica reivindicado', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')
    const erro = Object.assign(new Error(`remetente recusado para ${PARA}`), {
      code: 'E_SENDER_NOT_VERIFIED',
    })

    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA, {
      EMAIL: emailFalso(erro),
    })

    expect(linhaDosAlertas()).toEqual([
      'alertas por e-mail',
      '2026-08-10',
      'status=falhou enviados=0 codigo=E_SENDER_NOT_VERIFIED',
    ])
    semDadoSensivelNoConsole()
    const log = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM alert_log',
    ).first<{ n: number }>()
    expect(log?.n).toBe(0)
  })

  it('desligado nas Configurações: não envia', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 9_000, '2026-08-02')
    await setAlertasLigados(env.DB, false)

    await rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA)

    expect(emails).toHaveLength(0)
    expect(
      linhasDoConsole().some((l) => l.includes('status=desligado enviados=0')),
    ).toBe(true)
  })

  it.each([
    ['EMAIL', 'alertas_sem_binding'],
    ['ALLOWED_EMAIL', 'alertas_sem_destinatario'],
    ['ALERTAS_REMETENTE', 'alertas_sem_remetente'],
  ])(
    'sem %s: não lança, avisa %s e a geração roda',
    async (binding, codigo) => {
      const cat = await categoriaComOrcamento('Mercado', 10_000)
      await gastoAvulso(cat.id, 9_000, '2026-08-02')
      const r = await recorrenteNaCategoria(null)

      await expect(
        rodarCron(DIA_10_DE_AGOSTO, CHAVE, CRON_RECORRENCIA, {
          [binding]: undefined,
        }),
      ).resolves.toBeUndefined()

      expect(emails).toHaveLength(0)
      expect(linhasDoConsole().some((l) => l.includes(codigo))).toBe(true)
      const gerado = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM transactions WHERE recurring_expense_id = ?',
      )
        .bind(r)
        .first<{ n: number }>()
      expect(gerado?.n).toBe(1)
    },
  )

  it('o cron mensal do insight não envia alertas', async () => {
    const cat = await categoriaComOrcamento('Mercado', 10_000)
    await gastoAvulso(cat.id, 12_000, '2026-08-02')
    apiResponde(() => respostaClaude('Leitura.'))

    await rodarCron(Date.parse('2026-09-01T12:00:00Z'), CHAVE, CRON_INSIGHT)

    expect(emails).toHaveLength(0)
    const log = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM alert_log',
    ).first<{ n: number }>()
    expect(log?.n).toBe(0)
  })

  // Binding de envio: o remetente é o da var, e o destinatário NÃO fica
  // preso no binding (seria uma segunda cópia do e-mail do dono no repo; o
  // código sempre usa env.ALLOWED_EMAIL). Sem `remote: true`: `wrangler dev`
  // simula o envio em vez de mandar de verdade.
  it('o wrangler.jsonc declara o EMAIL com o remetente da var, sem destinatário fixo nem envio remoto', () => {
    const bloco = /"send_email":\s*\[([\s\S]*?)\n {2}\],/.exec(
      wranglerJsonc,
    )?.[1]
    expect(bloco).toBeDefined()
    expect(bloco).toMatch(/"name":\s*"EMAIL"/)
    const permitidos = /"allowed_sender_addresses":\s*\[([^\]]*)\]/.exec(
      bloco ?? '',
    )?.[1]
    const remetente = /"ALERTAS_REMETENTE":\s*"([^"]+)"/.exec(
      wranglerJsonc,
    )?.[1]
    expect(remetente).toBe('alertas@piluvitu.com.br')
    expect(permitidos?.trim()).toBe(`"${remetente}"`)
    expect(wranglerJsonc).not.toMatch(/destination_address/)
    expect(wranglerJsonc).not.toMatch(/"remote":\s*true/)
  })
})
