import { validarCPF } from '@piluvitu/tools/cpf'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import {
  gerarPessoaNova,
  obterOuGerarPessoa,
  pessoaItem,
} from './armazenamento'
import { idadeEm } from './hoje'

describe('armazenamento da pessoa', () => {
  // Só o Date é falso: o fakeBrowser.storage trabalha com promises, não com timers.
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-10-01T15:00:00Z'),
    }),
  )
  afterEach(() => vi.useRealTimers())

  it('começa vazio', async () => {
    expect(await pessoaItem.getValue()).toBeNull()
  })

  it('guarda a pessoa inteira em local:botai_pessoa, não a semente', async () => {
    await pessoaItem.setValue(PESSOA_DOURADA)
    expect(await fakeBrowser.storage.local.get('botai_pessoa')).toEqual({
      botai_pessoa: PESSOA_DOURADA,
    })
  })

  it('ignora a pessoa guardada na chave provisória local:pessoa', async () => {
    await fakeBrowser.storage.local.set({ pessoa: PESSOA_DOURADA })
    expect(await pessoaItem.getValue()).toBeNull()
  })

  it('obterOuGerarPessoa gera uma pessoa válida, guarda e devolve', async () => {
    const pessoa = await obterOuGerarPessoa()
    expect(validarCPF(pessoa.cpf)).toBe(true)
    expect(await pessoaItem.getValue()).toEqual(pessoa)
  })

  it('obterOuGerarPessoa devolve a guardada sem gerar outra', async () => {
    await pessoaItem.setValue(PESSOA_DOURADA)
    expect(await obterOuGerarPessoa()).toEqual(PESSOA_DOURADA)
  })

  it('gerarPessoaNova troca a pessoa guardada', async () => {
    await pessoaItem.setValue(PESSOA_DOURADA)
    const nova = await gerarPessoaNova()
    expect(nova).not.toEqual(PESSOA_DOURADA)
    expect(await pessoaItem.getValue()).toEqual(nova)
  })

  it('gera com a data de hoje em São Paulo', async () => {
    const pessoa = await gerarPessoaNova()
    expect(pessoa.nascimento.idade).toBe(
      idadeEm(pessoa.nascimento.iso, '2026-10-01'),
    )
    expect(pessoa.nascimento.idade).toBeGreaterThanOrEqual(18)
    expect(pessoa.nascimento.idade).toBeLessThanOrEqual(65)
  })

  it('watch avisa quem escuta quando outra parte da extensão grava', async () => {
    const ouvinte = vi.fn()
    const pararDeOuvir = pessoaItem.watch(ouvinte)
    await pessoaItem.setValue(PESSOA_DOURADA)
    expect(ouvinte).toHaveBeenCalledWith(PESSOA_DOURADA, null)
    pararDeOuvir()
  })
})
