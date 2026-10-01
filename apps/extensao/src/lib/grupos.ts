import type { Pessoa } from '@piluvitu/tools/pessoa'

export type IdGrupo =
  | 'pessoais'
  | 'email'
  | 'endereco'
  | 'empresa'
  | 'cartao'
  | 'docs'

export interface LinhaDado {
  rotulo: string
  valor: string
}

export interface GrupoDados {
  id: IdGrupo
  rotulo: string
  linhas: LinhaDado[]
}

const BANDEIRA = { visa: 'Visa', mastercard: 'Mastercard' } as const

export const CHIPS: readonly { id: 'tudo' | IdGrupo; rotulo: string }[] = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'pessoais', rotulo: 'Pessoais' },
  { id: 'email', rotulo: 'E-mail' },
  { id: 'endereco', rotulo: 'Endereço' },
  { id: 'empresa', rotulo: 'Empresa' },
  { id: 'cartao', rotulo: 'Cartão' },
  { id: 'docs', rotulo: 'Documentos' },
]

export function gruposDaPessoa(p: Pessoa): GrupoDados[] {
  return [
    {
      id: 'pessoais',
      rotulo: 'Pessoais',
      linhas: [
        { rotulo: 'Nome', valor: p.nome.completo },
        { rotulo: 'Nascimento', valor: p.nascimento.br },
        { rotulo: 'CPF', valor: p.cpf },
        { rotulo: 'RG', valor: p.rg.numero },
        { rotulo: 'Celular', valor: p.celular.formatado },
        { rotulo: 'Senha', valor: p.senha },
      ],
    },
    {
      id: 'email',
      rotulo: 'E-mail',
      linhas: [{ rotulo: 'E-mail', valor: p.email.endereco }],
    },
    {
      id: 'endereco',
      rotulo: 'Endereço',
      linhas: [
        { rotulo: 'CEP', valor: p.endereco.cep },
        { rotulo: 'Rua', valor: p.endereco.logradouro },
        { rotulo: 'Número', valor: p.endereco.numero },
        { rotulo: 'Complemento', valor: p.endereco.complemento },
        { rotulo: 'Bairro', valor: p.endereco.bairro },
        { rotulo: 'Cidade', valor: p.endereco.cidade },
        { rotulo: 'UF', valor: p.endereco.uf },
      ],
    },
    {
      id: 'empresa',
      rotulo: 'Empresa',
      linhas: [
        { rotulo: 'Razão social', valor: p.empresa.razaoSocial },
        { rotulo: 'Fantasia', valor: p.empresa.nomeFantasia },
        { rotulo: 'CNPJ', valor: p.empresa.cnpj },
      ],
    },
    {
      id: 'cartao',
      rotulo: 'Cartão',
      linhas: [
        { rotulo: 'Bandeira', valor: BANDEIRA[p.cartao.bandeira] },
        { rotulo: 'Número', valor: p.cartao.numeroFormatado },
        { rotulo: 'Nome impresso', valor: p.cartao.titular },
        { rotulo: 'Validade', valor: p.cartao.validade },
        { rotulo: 'CVV', valor: p.cartao.cvv },
      ],
    },
    {
      id: 'docs',
      rotulo: 'Documentos',
      linhas: [
        { rotulo: 'PIS/NIS', valor: p.pis },
        { rotulo: 'Título', valor: p.tituloEleitor },
      ],
    },
  ]
}
