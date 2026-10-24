import { describe, expect, it } from 'vitest'
import {
  ClaudeDesligado,
  ClaudeIndisponivel,
  ClaudeRecusou,
  TetoAtingido,
  codigoDoErro,
} from './erros'

describe('codigoDoErro', () => {
  it('ClaudeDesligado → 503 claude_desligado', () => {
    const r = codigoDoErro(new ClaudeDesligado())
    expect(r).toMatchObject({ status: 503, code: 'claude_desligado' })
    expect(r?.message).toContain('ANTHROPIC_API_KEY')
  })

  it('ClaudeIndisponivel → 503 claude_indisponivel', () => {
    expect(codigoDoErro(new ClaudeIndisponivel(529))).toMatchObject({
      status: 503,
      code: 'claude_indisponivel',
    })
    expect(codigoDoErro(new ClaudeIndisponivel())).toMatchObject({
      status: 503,
      code: 'claude_indisponivel',
    })
  })

  it.each([
    ['chave_invalida', 401],
    ['requisicao_invalida', 400],
    ['recusa', undefined],
    ['formato', undefined],
  ] as const)('ClaudeRecusou(%s) → 502 claude_recusou', (motivo, status) => {
    expect(codigoDoErro(new ClaudeRecusou(motivo, status))).toMatchObject({
      status: 502,
      code: 'claude_recusou',
    })
  })

  it('TetoAtingido → 429 teto_atingido', () => {
    expect(
      codigoDoErro(
        new TetoAtingido('insight', '2026-10', 2_000_000, 1_990_000),
      ),
    ).toMatchObject({ status: 429, code: 'teto_atingido' })
  })

  it('erro desconhecido devolve null', () => {
    expect(codigoDoErro(new Error('qualquer'))).toBeNull()
    expect(codigoDoErro(new TypeError('fetch failed'))).toBeNull()
    expect(codigoDoErro('texto solto')).toBeNull()
    expect(codigoDoErro(undefined)).toBeNull()
  })

  it('a mensagem do envelope é a do próprio erro', () => {
    const err = new TetoAtingido('revisao', '2026-10', 10_000_000, 9_500_000)
    expect(codigoDoErro(err)?.message).toBe(err.message)
  })
})

describe('ClaudeRecusou', () => {
  it('guarda motivo e status', () => {
    const err = new ClaudeRecusou('chave_invalida', 401)
    expect(err.motivo).toBe('chave_invalida')
    expect(err.status).toBe(401)
    expect(err).toBeInstanceOf(Error)
  })

  it('a chave inválida manda conferir o wrangler secret', () => {
    expect(new ClaudeRecusou('chave_invalida', 401).message).toContain(
      'chave inválida, confira o `wrangler secret`',
    )
  })

  it('cada motivo tem mensagem própria', () => {
    const mensagens = new Set(
      (
        ['chave_invalida', 'requisicao_invalida', 'recusa', 'formato'] as const
      ).map((m) => new ClaudeRecusou(m).message),
    )
    expect(mensagens.size).toBe(4)
  })
})

describe('ClaudeIndisponivel', () => {
  it('guarda o status quando houver', () => {
    expect(new ClaudeIndisponivel(429).status).toBe(429)
    expect(new ClaudeIndisponivel().status).toBeUndefined()
  })
})

describe('TetoAtingido', () => {
  it('guarda feature, mês, teto e gasto', () => {
    const err = new TetoAtingido('insight', '2026-10', 2_000_000, 1_234_567)
    expect(err).toMatchObject({
      feature: 'insight',
      mes: '2026-10',
      tetoMicro: 2_000_000,
      gastoMicro: 1_234_567,
    })
  })

  it('a mensagem diz o teto, o gasto e o mês', () => {
    const msg = new TetoAtingido('insight', '2026-10', 2_000_000, 1_234_567)
      .message
    expect(msg).toContain('US$ 2,00')
    expect(msg).toContain('US$ 1,23')
    expect(msg).toContain('2026-10')
    expect(msg).toContain('insight')
  })

  it('formata teto de dois dígitos e gasto zero', () => {
    const msg = new TetoAtingido('revisao', '2026-11', 10_000_000, 0).message
    expect(msg).toContain('US$ 10,00')
    expect(msg).toContain('US$ 0,00')
  })
})
