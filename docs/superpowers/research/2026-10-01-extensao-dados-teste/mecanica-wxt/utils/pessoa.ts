import { storage } from '#imports'

export type Pessoa = {
  nome: string
  cpf: string
  cep: string
  email: string
  user: string
}

export const pessoaItem = storage.defineItem<Pessoa | null>('local:pessoa', {
  fallback: null,
  version: 1,
})

export type ResultadoPreencher = {
  preenchidos: number
  total: number
  naoReconhecidos: { rotulo: string; seletor: string }[]
}

export const TIPOS_INSERIR = ['cpf', 'cep', 'email', 'nome'] as const
export type TipoInserir = (typeof TIPOS_INSERIR)[number]

export function tituloMenu(tipo: TipoInserir, p: Pessoa | null): string {
  const base = {
    cpf: 'CPF',
    cep: 'CEP',
    email: 'E-mail',
    nome: 'Nome completo',
  }[tipo]
  if (!p || (tipo !== 'cpf' && tipo !== 'cep')) return base
  return `${base} · ${p[tipo]}`
}
