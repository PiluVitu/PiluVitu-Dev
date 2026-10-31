import {
  ClaudeDesligado,
  ClaudeIndisponivel,
  ClaudeRecusou,
  TetoAtingido,
} from '@piluvitu/ia/erros'
import { describe, expect, it } from 'vitest'
import type { Envelope } from './envelope'
import { respostaDeErroIa, TETOS_FINANCAS } from './ia'

async function envelope(res: Response): Promise<Envelope<never>> {
  return (await res.json()) as Envelope<never>
}

describe('respostaDeErroIa', () => {
  const casos: Array<[string, Error, number, string]> = [
    ['sem chave', new ClaudeDesligado(), 503, 'claude_desligado'],
    ['rede/5xx/429', new ClaudeIndisponivel(429), 503, 'claude_indisponivel'],
    [
      'chave inválida',
      new ClaudeRecusou('chave_invalida', 401),
      502,
      'claude_recusou',
    ],
    ['formato', new ClaudeRecusou('formato'), 502, 'claude_recusou'],
    [
      'teto',
      new TetoAtingido('insight', '2026-10', 2_000_000, 1_999_500),
      429,
      'teto_atingido',
    ],
  ]

  it.each(casos)('%s vira o envelope de erro', async (_, err, status, code) => {
    const res = respostaDeErroIa(err)
    expect(res.status).toBe(status)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await envelope(res)).toEqual({
      ok: false,
      data: null,
      notifications: [{ type: 'error', code, message: err.message }],
    })
  })

  it('a mensagem do teto diz o teto, o gasto e o mês', async () => {
    const res = respostaDeErroIa(
      new TetoAtingido('insight', '2026-10', 2_000_000, 1_999_500),
    )
    const [n] = (await envelope(res)).notifications
    expect(n?.message).toContain('US$ 2,00')
    expect(n?.message).toContain('2026-10')
  })

  it('relança o erro que não é da IA, sem engolir', () => {
    const desconhecido = new Error('D1 caiu')
    expect(() => respostaDeErroIa(desconhecido)).toThrow(desconhecido)
  })
})

describe('TETOS_FINANCAS', () => {
  it('tem o teto do insight, em micro-dólar inteiro', () => {
    expect(TETOS_FINANCAS).toEqual({ insight: 2_000_000 })
  })
})
