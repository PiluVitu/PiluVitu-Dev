import { type Rng, rngPadrao, escolher } from './aleatorio'
import { gerarCNPJ } from './cnpj'

export const RAMOS = [
  'Tecnologia',
  'Comércio',
  'Serviços Digitais',
  'Soluções',
  'Consultoria',
  'Logística',
  'Engenharia',
] as const
export const SUFIXOS_FANTASIA = [
  'Dev',
  'Labs',
  'Store',
  'Digital',
  'Tech',
  'Hub',
] as const

export interface Empresa {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
}

export function gerarEmpresa(
  rng: Rng = rngPadrao,
  [s1, s2]: readonly [string, string] = ['Souza', 'Ribeiro'],
): Empresa {
  return {
    razaoSocial: `${s1} & ${s2} ${escolher(rng, RAMOS)} Ltda`,
    nomeFantasia: `${s2} ${escolher(rng, SUFIXOS_FANTASIA)}`,
    cnpj: gerarCNPJ(rng),
  }
}
