import { applyD1Migrations, env, reset } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type { RespostaClaude } from './claude'
import { ClaudeRecusou, TetoAtingido } from './erros'
import {
  comOrcamento,
  concluir,
  liberar,
  mesFortaleza,
  reservar,
  type Reserva,
} from './uso'

const DB = env.DB
const MES = '2026-10'
const SONNET = 'claude-sonnet-5-5'

beforeEach(async () => {
  await reset()
  await applyD1Migrations(
    env.DB as unknown as Parameters<typeof applyD1Migrations>[0],
    env.TEST_MIGRATIONS,
  )
})

function reserva(parcial: Partial<Reserva> = {}): Reserva {
  return {
    feature: 'insight',
    mes: MES,
    modelo: SONNET,
    estimativaMicro: 600_000,
    tetoMicro: 1_000_000,
    ...parcial,
  }
}

type Linha = {
  estado: string
  reservado_micro: number
  custo_micro: number | null
  tokens_entrada: number | null
  tokens_saida: number | null
  concluido_em: string | null
  mes: string
  modelo: string
}

async function linha(id: string): Promise<Linha> {
  const row = await DB.prepare('SELECT * FROM uso_ia WHERE id = ?')
    .bind(id)
    .first<Linha>()
  if (!row) throw new Error(`linha ${id} não existe`)
  return row
}

async function contar(): Promise<number> {
  const row = await DB.prepare('SELECT COUNT(*) AS n FROM uso_ia').first<{
    n: number
  }>()
  return row?.n ?? 0
}

function resposta(custoMicro: number): RespostaClaude {
  return {
    texto: 'ok',
    custoMicro,
    uso: {
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 0,
    } as RespostaClaude['uso'],
  }
}

function respostaHttp(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json', 'retry-after-ms': '1' },
  })
}

function mensagemOk(stopReason = 'end_turn', texto = 'olá'): unknown {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: SONNET,
    content: [{ type: 'text', text: texto }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

describe('reservar', () => {
  it('reserva dentro do teto passa e grava a linha como reservado', async () => {
    const id = await reservar(DB, reserva())

    const row = await linha(id)
    expect(row.estado).toBe('reservado')
    expect(row.reservado_micro).toBe(600_000)
    expect(row.custo_micro).toBeNull()
    expect(row.mes).toBe(MES)
    expect(row.modelo).toBe(SONNET)
  })

  it('aceita a reserva que fecha o teto exatamente', async () => {
    await reservar(DB, reserva({ estimativaMicro: 400_000 }))
    await expect(
      reservar(DB, reserva({ estimativaMicro: 600_000 })),
    ).resolves.toEqual(expect.any(String))
  })

  it('a que estoura lança TetoAtingido com o gasto do mês e não grava nada', async () => {
    await reservar(DB, reserva({ estimativaMicro: 700_000 }))

    const erro = await reservar(DB, reserva({ estimativaMicro: 400_000 })).then(
      () => null,
      (e: unknown) => e,
    )

    expect(erro).toBeInstanceOf(TetoAtingido)
    const teto = erro as TetoAtingido
    expect(teto.gastoMicro).toBe(700_000)
    expect(teto.tetoMicro).toBe(1_000_000)
    expect(teto.feature).toBe('insight')
    expect(teto.mes).toBe(MES)
    expect(await contar()).toBe(1)
  })

  it('o teto é por feature e por mês', async () => {
    await reservar(DB, reserva({ estimativaMicro: 1_000_000 }))

    await expect(
      reservar(DB, reserva({ feature: 'hooks', estimativaMicro: 1_000_000 })),
    ).resolves.toEqual(expect.any(String))
    await expect(
      reservar(DB, reserva({ mes: '2026-11', estimativaMicro: 1_000_000 })),
    ).resolves.toEqual(expect.any(String))
  })

  it('concluir troca a estimativa pelo custo real, e uma nova reserva cabe', async () => {
    const id = await reservar(DB, reserva({ estimativaMicro: 900_000 }))
    await expect(
      reservar(DB, reserva({ estimativaMicro: 500_000 })),
    ).rejects.toBeInstanceOf(TetoAtingido)

    await concluir(DB, id, resposta(120_000))

    const row = await linha(id)
    expect(row.estado).toBe('concluido')
    expect(row.custo_micro).toBe(120_000)
    expect(row.tokens_entrada).toBe(1250)
    expect(row.tokens_saida).toBe(300)
    expect(row.concluido_em).not.toBeNull()
    await expect(
      reservar(DB, reserva({ estimativaMicro: 500_000 })),
    ).resolves.toEqual(expect.any(String))
  })

  it('o gasto do TetoAtingido soma custo dos concluídos e reserva dos reservados', async () => {
    const concluida = await reservar(DB, reserva({ estimativaMicro: 500_000 }))
    await concluir(DB, concluida, resposta(100_000))
    await reservar(DB, reserva({ estimativaMicro: 300_000 }))
    const liberada = await reservar(DB, reserva({ estimativaMicro: 200_000 }))
    await liberar(DB, liberada)

    const erro = await reservar(DB, reserva({ estimativaMicro: 700_000 })).catch(
      (e: unknown) => e,
    )

    expect((erro as TetoAtingido).gastoMicro).toBe(400_000)
  })

  it('liberar marca falhou e a reserva deixa de contar', async () => {
    const id = await reservar(DB, reserva({ estimativaMicro: 1_000_000 }))

    await liberar(DB, id)

    const row = await linha(id)
    expect(row.estado).toBe('falhou')
    expect(row.concluido_em).not.toBeNull()
    await expect(
      reservar(DB, reserva({ estimativaMicro: 1_000_000 })),
    ).resolves.toEqual(expect.any(String))
  })

  it('liberar não desfaz uma linha já concluída', async () => {
    const id = await reservar(DB, reserva())
    await concluir(DB, id, resposta(80_000))

    await liberar(DB, id)

    expect((await linha(id)).estado).toBe('concluido')
  })

  // Review Focus 1: o Worker morreu entre a reserva e a conclusão.
  it('reserva órfã (sem concluir nem liberar) continua contando contra o teto', async () => {
    await reservar(DB, reserva({ estimativaMicro: 800_000 }))

    await expect(
      reservar(DB, reserva({ estimativaMicro: 300_000 })),
    ).rejects.toBeInstanceOf(TetoAtingido)
  })

  // Review Focus 2: a reserva é um único INSERT … SELECT … WHERE.
  it('duas reservas concorrentes com espaço para uma: exatamente uma lança', async () => {
    const resultados = await Promise.allSettled([
      reservar(DB, reserva({ estimativaMicro: 600_000 })),
      reservar(DB, reserva({ estimativaMicro: 600_000 })),
    ])

    const ok = resultados.filter((r) => r.status === 'fulfilled')
    const falhas = resultados.filter((r) => r.status === 'rejected')
    expect(ok).toHaveLength(1)
    expect(falhas).toHaveLength(1)
    expect((falhas[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      TetoAtingido,
    )
    expect(await contar()).toBe(1)
  })
})

describe('mesFortaleza', () => {
  it('2026-11-01T02:00Z ainda é outubro em Fortaleza (UTC-3)', () => {
    expect(mesFortaleza(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10')
  })

  it('2026-11-01T03:00Z já é novembro', () => {
    expect(mesFortaleza(new Date('2026-11-01T03:00:00Z'))).toBe('2026-11')
  })

  it('a virada do ano também segue Fortaleza', () => {
    expect(mesFortaleza(new Date('2027-01-01T01:59:59Z'))).toBe('2026-12')
  })
})

describe('comOrcamento', () => {
  const pedido = {
    modelo: SONNET,
    system: 'sistema',
    user: 'pergunta',
    maxTokens: 100,
  } as const

  async function unicaLinha(): Promise<Linha> {
    const row = await DB.prepare('SELECT * FROM uso_ia').first<Linha>()
    if (!row) throw new Error('nenhuma linha')
    return row
  }

  it('reserva, chama e conclui com o custo real', async () => {
    const fetchOk = (async () => respostaHttp(mensagemOk())) as typeof fetch

    const r = await comOrcamento(
      DB,
      { feature: 'insight', tetoMicro: 2_000_000, apiKey: 'k', fetch: fetchOk },
      pedido,
    )

    expect(r.texto).toBe('olá')
    const row = await unicaLinha()
    expect(row.estado).toBe('concluido')
    expect(row.custo_micro).toBe(r.custoMicro)
    expect(row.reservado_micro).toBeGreaterThanOrEqual(r.custoMicro)
    expect(row.tokens_entrada).toBe(10)
    expect(row.tokens_saida).toBe(5)
  })

  it('com o fetch falhando, relança e deixa a linha falhou', async () => {
    const fetchQuebrado = (async () => {
      throw new TypeError('rede caiu')
    }) as typeof fetch

    await expect(
      comOrcamento(
        DB,
        {
          feature: 'insight',
          tetoMicro: 2_000_000,
          apiKey: 'k',
          fetch: fetchQuebrado,
        },
        pedido,
      ),
    ).rejects.toThrow()

    expect((await unicaLinha()).estado).toBe('falhou')
  })

  it('sem chave lança ClaudeDesligado sem gravar reserva', async () => {
    await expect(
      comOrcamento(DB, { feature: 'insight', tetoMicro: 2_000_000 }, pedido),
    ).rejects.toMatchObject({ name: 'ClaudeDesligado' })
    expect(await contar()).toBe(0)
  })

  it('com o teto cheio lança TetoAtingido sem chamar a Claude', async () => {
    let chamadas = 0
    const fetchContado = (async () => {
      chamadas++
      return respostaHttp(mensagemOk())
    }) as typeof fetch

    await expect(
      comOrcamento(
        DB,
        { feature: 'insight', tetoMicro: 1, apiKey: 'k', fetch: fetchContado },
        pedido,
      ),
    ).rejects.toBeInstanceOf(TetoAtingido)
    expect(chamadas).toBe(0)
  })

  it('resposta cobrada mas fora do formato conta a estimativa inteira', async () => {
    const fetchCortado = (async () =>
      respostaHttp(mensagemOk('max_tokens'))) as typeof fetch

    await expect(
      comOrcamento(
        DB,
        {
          feature: 'insight',
          tetoMicro: 2_000_000,
          apiKey: 'k',
          fetch: fetchCortado,
        },
        pedido,
      ),
    ).rejects.toBeInstanceOf(ClaudeRecusou)

    const row = await unicaLinha()
    expect(row.estado).toBe('concluido')
    expect(row.custo_micro).toBe(row.reservado_micro)
  })

  it('401 (nada cobrado) deixa a linha falhou', async () => {
    const fetch401 = (async () =>
      respostaHttp(
        { type: 'error', error: { type: 'authentication_error', message: 'x' } },
        401,
      )) as typeof fetch

    await expect(
      comOrcamento(
        DB,
        { feature: 'insight', tetoMicro: 2_000_000, apiKey: 'k', fetch: fetch401 },
        pedido,
      ),
    ).rejects.toBeInstanceOf(ClaudeRecusou)

    expect((await unicaLinha()).estado).toBe('falhou')
  })
})
