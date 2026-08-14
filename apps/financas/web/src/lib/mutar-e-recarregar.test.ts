import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { MENSAGEM_RECARGA_FALHOU, mutarERecarregar } from './mutar-e-recarregar'

describe('mutarERecarregar', () => {
  it('caminho feliz: muta, recarrega e devolve ok', async () => {
    const ordem: string[] = []
    const mutar = vi.fn(async () => {
      ordem.push('mutar')
    })
    const recarregar = vi.fn(async () => {
      ordem.push('recarregar')
    })

    expect(await mutarERecarregar(mutar, recarregar)).toEqual({ ok: true })
    // A ordem é a regra: recarregar SÓ DEPOIS da mutação.
    expect(ordem).toEqual(['mutar', 'recarregar'])
  })

  it('mutação falha: devolve fase "mutacao" com a mensagem do SERVIDOR e NÃO recarrega', async () => {
    const recarregar = vi.fn(async () => {})

    const r = await mutarERecarregar(async () => {
      throw new ApiError(404, 'not_found', 'conta a1 ja arquivada')
    }, recarregar)

    expect(r).toEqual({
      ok: false,
      fase: 'mutacao',
      mensagem: 'conta a1 ja arquivada',
    })
    expect(recarregar).not.toHaveBeenCalled()
  })

  it('erro que não é ApiError na mutação vira String(err)', async () => {
    const r = await mutarERecarregar(
      async () => {
        throw new Error('boom')
      },
      async () => {},
    )

    expect(r).toEqual({
      ok: false,
      fase: 'mutacao',
      mensagem: 'Error: boom',
    })
  })

  // O defeito inteiro deste módulo: a mutação DEU CERTO, só o GET falhou.
  it('mutação ok + recarga falha: fase "recarga", e a mensagem do GET NUNCA vaza', async () => {
    const mutar = vi.fn(async () => {})

    const r = await mutarERecarregar(mutar, async () => {
      throw new ApiError(503, 'sem_conexao', 'sem conexão com o servidor')
    })

    expect(mutar).toHaveBeenCalledTimes(1)
    expect(r).toEqual({
      ok: false,
      fase: 'recarga',
      mensagem: MENSAGEM_RECARGA_FALHOU,
    })
    // A mensagem do GET descreveria a ação como falha — é o que o dono
    // lia antes deste fix.
    expect(r.ok === false && r.mensagem).not.toContain('sem conexão')
  })

  it('a mensagem padrão de recarga diz que a ação foi concluída, nunca que falhou', () => {
    expect(MENSAGEM_RECARGA_FALHOU).toMatch(/concluída/i)
    expect(MENSAGEM_RECARGA_FALHOU).not.toMatch(/falh/i)
  })

  it('mensagem de recarga é customizável pra nomear o que a tela fez', async () => {
    const r = await mutarERecarregar(
      async () => {},
      async () => {
        throw new Error('rede fora')
      },
      'A conta foi arquivada, mas não consegui recarregar a lista.',
    )

    expect(r).toEqual({
      ok: false,
      fase: 'recarga',
      mensagem: 'A conta foi arquivada, mas não consegui recarregar a lista.',
    })
  })
})
