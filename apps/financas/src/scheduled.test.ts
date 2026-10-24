/**
 * Cron do dia 1 (`"0 12 1 * *"`, 09:00 em Teresina): gera o insight do mês
 * que acabou de fechar. O `fetch` global é trocado: nenhum teste alcança a
 * API de verdade.
 */
import {
  createExecutionContext,
  createScheduledController,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import wranglerJsonc from '../wrangler.jsonc?raw'
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

async function rodarCron(scheduledTime: number, chave: string | undefined) {
  const controller = createScheduledController({
    scheduledTime,
    cron: '0 12 1 * *',
  })
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
})

describe('cron do insight mensal', () => {
  it('está registrado no wrangler.jsonc para o dia 1 às 12:00 UTC', () => {
    expect(wranglerJsonc).toMatch(
      /"triggers":\s*\{\s*"crons":\s*\[\s*"0 12 1 \* \*"\s*\]\s*\}/,
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

  it('um insight gerado à mão para o mês já basta: o cron não gera outro', async () => {
    await env.DB.prepare(
      `INSERT INTO insights (id, texto, modelo, periodo, generated_at)
       VALUES ('manual', 'Gerado pelo botão.', 'claude-sonnet-5-5', '2026-10', '2026-10-31T20:00:00Z')`,
    ).run()
    apiResponde(() => respostaClaude('Outro.'))

    await rodarCron(PRIMEIRO_DE_NOVEMBRO, CHAVE)

    expect(urlsChamadas).toHaveLength(0)
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM insights').first<{
      n: number
    }>()
    expect(n?.n).toBe(1)
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
