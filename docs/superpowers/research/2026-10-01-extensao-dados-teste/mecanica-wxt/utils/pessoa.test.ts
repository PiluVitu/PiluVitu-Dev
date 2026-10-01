import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem, tituloMenu } from './pessoa'

const P = {
  nome: 'Maria Eduarda Souza',
  cpf: '384.529.176-19',
  cep: '01310-100',
  email: 'm@tuamaeaquelaursa.com',
  user: 'm',
}

describe('pessoaItem', () => {
  beforeEach(() => fakeBrowser.reset())

  it('começa vazio (fallback null) e persiste em local:pessoa', async () => {
    expect(await pessoaItem.getValue()).toBeNull()
    await pessoaItem.setValue(P)
    expect(await fakeBrowser.storage.local.get('pessoa')).toEqual({ pessoa: P })
  })

  it('watch dispara quando outra parte da extensão grava', async () => {
    const cb = vi.fn()
    const unwatch = pessoaItem.watch(cb)
    await fakeBrowser.storage.local.set({ pessoa: P })
    expect(cb).toHaveBeenCalledWith(P, null)
    unwatch()
  })

  it('título do menu mostra valor só para CPF e CEP', () => {
    expect(tituloMenu('cpf', P)).toBe('CPF · 384.529.176-19')
    expect(tituloMenu('email', P)).toBe('E-mail')
    expect(tituloMenu('cpf', null)).toBe('CPF')
  })
})
