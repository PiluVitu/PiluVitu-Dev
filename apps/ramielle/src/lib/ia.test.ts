import {
  ClaudeDesligado,
  ClaudeIndisponivel,
  ClaudeRecusou,
  TetoAtingido,
} from '@piluvitu/ia/erros'
import { describe, expect, it } from 'vitest'
import type { Envelope } from './envelope'
import { respostaDeErroIa, TETOS_RAMIELLE } from './ia'

async function envelope(res: Response): Promise<Envelope<never>> {
  return (await res.json()) as Envelope<never>
}

describe('respostaDeErroIa', () => {
  const casos: Array<[string, Error, number, string]> = [
    ['sem chave', new ClaudeDesligado(), 503, 'claude_desligado'],
    ['rede/5xx/429', new ClaudeIndisponivel(529), 503, 'claude_indisponivel'],
    [
      'chave inválida',
      new ClaudeRecusou('chave_invalida', 401),
      502,
      'claude_recusou',
    ],
    ['recusa', new ClaudeRecusou('recusa'), 502, 'claude_recusou'],
    [
      'teto',
      new TetoAtingido('revisao', '2026-10', 10_000_000, 9_999_000),
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

  it('a mensagem do 401 é a nossa, apontando o wrangler secret', async () => {
    const res = respostaDeErroIa(new ClaudeRecusou('chave_invalida', 401))
    const [n] = (await envelope(res)).notifications
    expect(n?.message).toContain('chave inválida, confira o `wrangler secret`')
  })

  it('relança o erro que não é da IA, sem engolir', () => {
    const desconhecido = new Error('D1 caiu')
    expect(() => respostaDeErroIa(desconhecido)).toThrow(desconhecido)
  })
})

describe('TETOS_RAMIELLE', () => {
  it('tem os tetos do plano, em micro-dólar inteiro', () => {
    expect(TETOS_RAMIELLE).toEqual({
      revisao: 10_000_000,
      hooks: 2_000_000,
      resumo: 2_000_000,
    })
  })
})
