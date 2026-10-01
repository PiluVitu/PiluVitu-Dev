import { gerarCPF } from '@piluvitu/tools/cpf'
import { storage } from 'wxt/utils/storage'

export interface Pessoa {
  cpf: string
}

export const pessoaItem = storage.defineItem<Pessoa | null>('local:pessoa', {
  fallback: null,
})

export async function obterOuGerarPessoa(): Promise<Pessoa> {
  const atual = await pessoaItem.getValue()
  if (atual) return atual
  const nova = { cpf: gerarCPF() }
  await pessoaItem.setValue(nova)
  return nova
}
