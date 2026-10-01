import type { Rng } from './aleatorio'
import { type Celular, gerarCelular } from './celular'
import { type Cartao, gerarCartao } from './cartao'
import { gerarCPF } from './cpf'
import { type Empresa, gerarEmpresa } from './empresa'
import { type Endereco, gerarEndereco } from './endereco'
import { type Nascimento, gerarNascimento } from './nascimento'
import { type Email, type Nome, gerarEmail, gerarNome } from './nome'
import { gerarPIS } from './pis'
import { gerarRG } from './rg'
import { gerarSenha } from './senha'
import { gerarTituloEleitor } from './titulo-eleitor'

export interface Pessoa {
  nome: Nome
  nascimento: Nascimento
  cpf: string
  rg: { numero: string; orgaoEmissor: 'SSP'; uf: 'SP' }
  pis: string
  tituloEleitor: string
  celular: Celular
  email: Email
  senha: string
  endereco: Endereco
  empresa: Empresa
  cartao: Cartao
}

// A ordem das chamadas a rng é parte do contrato: mudar a ordem muda a pessoa de uma semente.
export function gerarPessoa(rng: Rng, hojeISO: string): Pessoa {
  const nome = gerarNome(rng)
  const endereco = gerarEndereco(rng)
  const nascimento = gerarNascimento(rng, hojeISO)
  return {
    nome,
    nascimento,
    cpf: gerarCPF(rng, endereco.uf),
    rg: { numero: gerarRG(rng), orgaoEmissor: 'SSP', uf: 'SP' },
    pis: gerarPIS(rng),
    tituloEleitor: gerarTituloEleitor(rng, endereco.uf),
    celular: gerarCelular(rng, endereco.ddd),
    email: gerarEmail(rng, nome),
    senha: gerarSenha(rng),
    endereco,
    empresa: gerarEmpresa(rng, nome.sobrenomes),
    cartao: gerarCartao(rng, hojeISO, nome.noCartao),
  }
}
