import { env } from 'cloudflare:test'
import { ClaudeDesligado, TetoAtingido } from '@piluvitu/ia/erros'
import { mesFortaleza } from '@piluvitu/ia/uso'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mockarAnthropic,
  respostaClaude,
} from '../../test-support/anthropic-mock'
import { TETOS_RAMIELLE } from '../../lib/ia'
import { chatComOrcamento } from './chat-claude'

const CHAVE = 'sk-ant-teste-chat-claude'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chatComOrcamento', () => {
  it('chama a Claude com o pedido, devolve o texto e registra o uso na feature', async () => {
    const pedidos = mockarAnthropic(() => respostaClaude('  resposta  '))
    const chat = chatComOrcamento(
      { DB: env.DB, ANTHROPIC_API_KEY: CHAVE },
      'hooks',
    )

    const texto = await chat({
      modelo: 'claude-haiku-5-5',
      system: 'S',
      user: 'U',
      maxTokens: 1024,
    })

    expect(texto).toBe('resposta')
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 1024,
      system: 'S',
      messages: [{ role: 'user', content: 'U' }],
    })
    expect(pedidos[0]).not.toHaveProperty('temperature')
    expect(pedidos[0]).not.toHaveProperty('thinking')

    const linha = await env.DB.prepare(
      'SELECT feature, estado FROM uso_ia',
    ).first<{ feature: string; estado: string }>()
    expect(linha).toEqual({ feature: 'hooks', estado: 'concluido' })
  })

  it('passa o formatoJson adiante como output_config json_schema', async () => {
    const schema = {
      type: 'object',
      properties: { blocos: { type: 'array', items: { type: 'string' } } },
      required: ['blocos'],
      additionalProperties: false,
    }
    const pedidos = mockarAnthropic(() => respostaClaude('{"blocos":["a"]}'))
    const chat = chatComOrcamento(
      { DB: env.DB, ANTHROPIC_API_KEY: CHAVE },
      'revisao',
    )

    await chat({
      modelo: 'claude-sonnet-5-5',
      system: 'S',
      user: 'U',
      maxTokens: 4096,
      formatoJson: schema,
    })

    expect(pedidos[0]?.output_config).toEqual({
      format: { type: 'json_schema', schema },
    })
  })

  it('sem formatoJson não manda output_config', async () => {
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    await chatComOrcamento(
      { DB: env.DB, ANTHROPIC_API_KEY: CHAVE },
      'hooks',
    )({ modelo: 'claude-haiku-5-5', system: 'S', user: 'U', maxTokens: 10 })
    expect(pedidos[0]).not.toHaveProperty('output_config')
  })

  it('sem chave lança ClaudeDesligado sem chamar a API', async () => {
    const pedidos = mockarAnthropic(() => respostaClaude('x'))
    const chat = chatComOrcamento({ DB: env.DB }, 'revisao')
    await expect(
      chat({
        modelo: 'claude-sonnet-5-5',
        system: 'S',
        user: 'U',
        maxTokens: 10,
      }),
    ).rejects.toBeInstanceOf(ClaudeDesligado)
    expect(pedidos).toHaveLength(0)
  })

  it('usa o teto da feature: revisao no teto bloqueia, hooks não', async () => {
    await env.DB.prepare(
      `INSERT INTO uso_ia (id, feature, mes, modelo, estado, reservado_micro, custo_micro, criado_em)
       VALUES ('cheio', 'revisao', ?, 'claude-sonnet-5-5', 'concluido', 0, ?, '2026-10-01T00:00:00Z')`,
    )
      .bind(mesFortaleza(), TETOS_RAMIELLE.revisao)
      .run()
    const pedidos = mockarAnthropic(() => respostaClaude('ok'))
    const ambiente = { DB: env.DB, ANTHROPIC_API_KEY: CHAVE }

    await expect(
      chatComOrcamento(
        ambiente,
        'revisao',
      )({
        modelo: 'claude-sonnet-5-5',
        system: 'S',
        user: 'U',
        maxTokens: 10,
      }),
    ).rejects.toBeInstanceOf(TetoAtingido)
    expect(pedidos).toHaveLength(0)

    await expect(
      chatComOrcamento(
        ambiente,
        'hooks',
      )({
        modelo: 'claude-haiku-5-5',
        system: 'S',
        user: 'U',
        maxTokens: 10,
      }),
    ).resolves.toBe('ok')
  })
})
