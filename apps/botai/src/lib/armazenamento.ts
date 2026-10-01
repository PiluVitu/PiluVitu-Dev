import { cryptoRandomBytes } from '@piluvitu/tools/entropy'
import { gerarPessoa, type Pessoa } from '@piluvitu/tools/pessoa'
import { seedFromBytes } from '@piluvitu/tools/prng'
import { storage } from 'wxt/utils/storage'
import { hojeISO } from './hoje'

export const pessoaItem = storage.defineItem<Pessoa | null>(
  'local:botai_pessoa',
  {
    fallback: null,
    version: 1,
  },
)

export async function gerarPessoaNova(): Promise<Pessoa> {
  const pessoa = gerarPessoa(seedFromBytes(cryptoRandomBytes(16)), hojeISO())
  await pessoaItem.setValue(pessoa)
  return pessoa
}

export async function obterOuGerarPessoa(): Promise<Pessoa> {
  return (await pessoaItem.getValue()) ?? gerarPessoaNova()
}
