/**
 * `gerarInsight`: números agregados → Claude (com reserva de orçamento) →
 * insight gravado. O `fetch` é sempre falso: nenhum teste alcança a API.
 */
import { env } from 'cloudflare:test'
import { ClaudeDesligado, TetoAtingido } from '@piluvitu/ia/erros'
import { mesFortaleza } from '@piluvitu/ia/uso'
import { describe, expect, it } from 'vitest'
import { TETOS_FINANCAS } from '../lib/ia'
import { createAccount } from './accounts'
import { gerarInsight, MODELO_INSIGHT } from './insight-gerar'
import { montarPromptInsight } from './insight-prompt'
import { insightNumbers } from './insights'
import { createPayee } from './payees'
import { createTransaction } from './transactions'

const db = env.DB
const CHAVE = 'sk-ant-chave-falsa-de-teste'
const DESCRICAO_SENTINELA = 'DESCRICAO-SENTINELA-9f3c-padaria-do-ze'
const FAVORECIDO_SENTINELA = 'FAVORECIDO-SENTINELA-77ab-joao-da-silva'

type Chamada = { url: string; init: RequestInit }

function respostaClaude(texto: string): Response {
  return Response.json({
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: MODELO_INSIGHT,
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

function fetchFalso(responder: () => Response) {
  const chamadas: Chamada[] = []
  const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} })
    return responder()
  }) as typeof globalThis.fetch
  return { fetch, chamadas }
}

async function lancamentoSentinela(purchase_date: string) {
  const conta = await createAccount(db, {
    name: 'Conta corrente',
    scope: 'PF',
    kind: 'checking',
  })
  const favorecido = await createPayee(db, {
    name: FAVORECIDO_SENTINELA,
    kind: 'merchant',
  })
  await createTransaction(db, {
    account_id: conta.id,
    amount_cents: -12345,
    purchase_date,
    description: DESCRICAO_SENTINELA,
    payee_id: favorecido.id,
    settled_at: purchase_date,
  })
}

describe('gerarInsight', () => {
  it('manda o Sonnet com o prompt dos agregados e grava o insight', async () => {
    await lancamentoSentinela('2026-09-10')
    const { fetch, chamadas } = fetchFalso(() =>
      respostaClaude('  Setembro custou R$ 123,45, tudo sem categoria.  '),
    )

    const insight = await gerarInsight(
      { DB: db, ANTHROPIC_API_KEY: CHAVE },
      '2026-09',
      { fetch },
    )

    expect(chamadas).toHaveLength(1)
    expect(new URL(chamadas[0].url).host).toBe('api.anthropic.com')
    const corpo = JSON.parse(String(chamadas[0].init.body)) as {
      model: string
      max_tokens: number
      messages: Array<{ role: string; content: string }>
    }
    expect(corpo.model).toBe('claude-sonnet-5-5')
    expect(corpo.max_tokens).toBe(600)
    expect(corpo).not.toHaveProperty('temperature')
    expect(corpo).not.toHaveProperty('thinking')

    const esperado = montarPromptInsight(
      await insightNumbers(db, { competence: '2026-09' }),
    )
    expect(corpo.messages).toEqual([{ role: 'user', content: esperado }])

    expect(insight).toMatchObject({
      texto: 'Setembro custou R$ 123,45, tudo sem categoria.',
      modelo: 'claude-sonnet-5-5',
      periodo: '2026-09',
    })
    const gravado = await db
      .prepare('SELECT texto, modelo, periodo FROM insights WHERE id = ?')
      .bind(insight.id)
      .first()
    expect(gravado).toEqual({
      texto: insight.texto,
      modelo: 'claude-sonnet-5-5',
      periodo: '2026-09',
    })
  })

  it('o corpo enviado à Claude não leva descrição nem favorecido de lançamento', async () => {
    await lancamentoSentinela('2026-09-10')
    await lancamentoSentinela('2026-08-05')
    const { fetch, chamadas } = fetchFalso(() => respostaClaude('Leitura.'))

    await gerarInsight({ DB: db, ANTHROPIC_API_KEY: CHAVE }, '2026-09', {
      fetch,
    })

    const corpoCru = String(chamadas[0].init.body)
    expect(corpoCru).not.toContain('SENTINELA')
    expect(corpoCru).not.toContain(DESCRICAO_SENTINELA)
    expect(corpoCru).not.toContain(FAVORECIDO_SENTINELA)
    expect(corpoCru).toContain('R$ 123,45')
  })

  it('registra o uso em uso_ia como concluido, com o custo real', async () => {
    const { fetch } = fetchFalso(() => respostaClaude('Leitura.'))

    await gerarInsight({ DB: db, ANTHROPIC_API_KEY: CHAVE }, '2026-09', {
      fetch,
    })

    const linhas = await db
      .prepare(
        'SELECT feature, mes, modelo, estado, custo_micro, tokens_entrada, tokens_saida FROM uso_ia',
      )
      .all()
    expect(linhas.results).toEqual([
      {
        feature: 'insight',
        mes: mesFortaleza(),
        modelo: 'claude-sonnet-5-5',
        estado: 'concluido',
        // 800 × 2 + 150 × 10 = 3100 micro-dólares.
        custo_micro: 3100,
        tokens_entrada: 800,
        tokens_saida: 150,
      },
    ])
  })

  it('sem a chave lança ClaudeDesligado, sem chamar a API e sem gravar nada', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaClaude('x'))

    await expect(
      gerarInsight({ DB: db }, '2026-09', { fetch }),
    ).rejects.toBeInstanceOf(ClaudeDesligado)

    expect(chamadas).toHaveLength(0)
    const n = await db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM insights) + (SELECT COUNT(*) FROM uso_ia) AS n',
      )
      .first<{ n: number }>()
    expect(n?.n).toBe(0)
  })

  it('com o teto do mês gasto lança TetoAtingido, sem chamar a API', async () => {
    await db
      .prepare(
        `INSERT INTO uso_ia (id, feature, mes, modelo, estado, reservado_micro, custo_micro, criado_em)
         VALUES ('gasto', 'insight', ?, 'claude-sonnet-5-5', 'concluido', 0, ?, '2026-10-01T00:00:00Z')`,
      )
      .bind(mesFortaleza(), TETOS_FINANCAS.insight)
      .run()
    const { fetch, chamadas } = fetchFalso(() => respostaClaude('x'))

    await expect(
      gerarInsight({ DB: db, ANTHROPIC_API_KEY: CHAVE }, '2026-09', { fetch }),
    ).rejects.toBeInstanceOf(TetoAtingido)

    expect(chamadas).toHaveLength(0)
    const insights = await db
      .prepare('SELECT COUNT(*) AS n FROM insights')
      .first<{ n: number }>()
    expect(insights?.n).toBe(0)
  })

  it('competência malformada lança RangeError antes de qualquer reserva', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaClaude('x'))

    await expect(
      gerarInsight({ DB: db, ANTHROPIC_API_KEY: CHAVE }, '2026-13', { fetch }),
    ).rejects.toBeInstanceOf(RangeError)

    expect(chamadas).toHaveLength(0)
    const usos = await db
      .prepare('SELECT COUNT(*) AS n FROM uso_ia')
      .first<{ n: number }>()
    expect(usos?.n).toBe(0)
  })
})
