import { validarCPF } from '@piluvitu/tools/cpf'
import { describe, expect, it } from 'vitest'
import { obterOuGerarPessoa, pessoaItem } from './pessoa'

describe('obterOuGerarPessoa', () => {
  it('gera uma pessoa valida e persiste no storage', async () => {
    const p = await obterOuGerarPessoa()
    expect(validarCPF(p.cpf)).toBe(true)
    expect(await pessoaItem.getValue()).toEqual(p)
  })

  it('devolve a mesma pessoa ate pedirem outra', async () => {
    const a = await obterOuGerarPessoa()
    const b = await obterOuGerarPessoa()
    expect(b).toEqual(a)
  })

  it('fakeBrowser.reset limpa entre testes', async () => {
    expect(await pessoaItem.getValue()).toBeNull()
  })
})
