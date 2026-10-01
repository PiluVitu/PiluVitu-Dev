import { type Rng, rngPadrao, escolher } from './aleatorio'
import type { UF } from './uf'

export interface Numeracao {
  min: number
  max: number
  lado: 'par' | 'impar' | 'ambos'
}

export interface LogradouroReal {
  cep: string
  logradouro: string
  bairro: string
  cidade: string
  uf: UF
  ddd: string
  numeracao: Numeracao
}

// Conferidos um a um em viacep.com.br/ws/<cep>/json/ em 2026-10-01; a faixa de
// numeração vem do campo "complemento" do ViaCEP (o CEP só vale para ela).
export const LOGRADOUROS: readonly LogradouroReal[] = [
  {
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    uf: 'SP',
    ddd: '11',
    numeracao: { min: 612, max: 1510, lado: 'par' },
  },
  {
    cep: '01452-001',
    logradouro: 'Avenida Brigadeiro Faria Lima',
    bairro: 'Jardim Paulistano',
    cidade: 'São Paulo',
    uf: 'SP',
    ddd: '11',
    numeracao: { min: 1503, max: 2127, lado: 'impar' },
  },
  {
    cep: '01426-002',
    logradouro: 'Rua Oscar Freire',
    bairro: 'Cerqueira César',
    cidade: 'São Paulo',
    uf: 'SP',
    ddd: '11',
    numeracao: { min: 610, max: 1290, lado: 'par' },
  },
  {
    cep: '01304-001',
    logradouro: 'Rua Augusta',
    bairro: 'Consolação',
    cidade: 'São Paulo',
    uf: 'SP',
    ddd: '11',
    numeracao: { min: 700, max: 1680, lado: 'par' },
  },
  {
    cep: '13012-000',
    logradouro: 'Avenida Francisco Glicério',
    bairro: 'Centro',
    cidade: 'Campinas',
    uf: 'SP',
    ddd: '19',
    numeracao: { min: 327, max: 1809, lado: 'impar' },
  },
  {
    cep: '11060-001',
    logradouro: 'Avenida Ana Costa',
    bairro: 'Gonzaga',
    cidade: 'Santos',
    uf: 'SP',
    ddd: '13',
    numeracao: { min: 1, max: 341, lado: 'impar' },
  },
  {
    cep: '22021-001',
    logradouro: 'Avenida Atlântica',
    bairro: 'Copacabana',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    ddd: '21',
    numeracao: { min: 1662, max: 2172, lado: 'par' },
  },
  {
    cep: '22410-000',
    logradouro: 'Rua Visconde de Pirajá',
    bairro: 'Ipanema',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    ddd: '21',
    numeracao: { min: 2, max: 338, lado: 'par' },
  },
  {
    cep: '30130-005',
    logradouro: 'Avenida Afonso Pena',
    bairro: 'Boa Viagem',
    cidade: 'Belo Horizonte',
    uf: 'MG',
    ddd: '31',
    numeracao: { min: 1352, max: 1800, lado: 'par' },
  },
  {
    cep: '30160-015',
    logradouro: 'Rua da Bahia',
    bairro: 'Centro',
    cidade: 'Belo Horizonte',
    uf: 'MG',
    ddd: '31',
    numeracao: { min: 391, max: 800, lado: 'ambos' },
  },
  {
    cep: '90020-007',
    logradouro: 'Rua dos Andradas',
    bairro: 'Centro Histórico',
    cidade: 'Porto Alegre',
    uf: 'RS',
    ddd: '51',
    numeracao: { min: 1000, max: 1190, lado: 'par' },
  },
  {
    cep: '80060-000',
    logradouro: 'Rua XV de Novembro',
    bairro: 'Centro',
    cidade: 'Curitiba',
    uf: 'PR',
    ddd: '41',
    numeracao: { min: 896, max: 1599, lado: 'ambos' },
  },
  {
    cep: '88010-001',
    logradouro: 'Rua Felipe Schmidt',
    bairro: 'Centro',
    cidade: 'Florianópolis',
    uf: 'SC',
    ddd: '48',
    numeracao: { min: 350, max: 980, lado: 'ambos' },
  },
  {
    cep: '40170-010',
    logradouro: 'Avenida Oceânica',
    bairro: 'Ondina',
    cidade: 'Salvador',
    uf: 'BA',
    ddd: '71',
    numeracao: { min: 1, max: 999, lado: 'ambos' },
  },
  {
    cep: '51111-000',
    logradouro: 'Avenida Boa Viagem',
    bairro: 'Boa Viagem',
    cidade: 'Recife',
    uf: 'PE',
    ddd: '81',
    numeracao: { min: 1382, max: 2174, lado: 'ambos' },
  },
  {
    cep: '60165-120',
    logradouro: 'Avenida Beira Mar',
    bairro: 'Meireles',
    cidade: 'Fortaleza',
    uf: 'CE',
    ddd: '85',
    numeracao: { min: 941, max: 3499, lado: 'ambos' },
  },
  {
    cep: '71936-250',
    logradouro: 'Avenida das Araucárias',
    bairro: 'Sul (Águas Claras)',
    cidade: 'Brasília',
    uf: 'DF',
    ddd: '61',
    numeracao: { min: 1, max: 999, lado: 'ambos' },
  },
  {
    cep: '74020-200',
    logradouro: 'Avenida Goiás',
    bairro: 'Setor Central',
    cidade: 'Goiânia',
    uf: 'GO',
    ddd: '62',
    numeracao: { min: 550, max: 1118, lado: 'par' },
  },
  {
    cep: '69010-000',
    logradouro: 'Avenida Eduardo Ribeiro',
    bairro: 'Centro',
    cidade: 'Manaus',
    uf: 'AM',
    ddd: '92',
    numeracao: { min: 301, max: 631, lado: 'ambos' },
  },
  {
    cep: '66010-000',
    logradouro: 'Avenida Presidente Vargas',
    bairro: 'Campina',
    cidade: 'Belém',
    uf: 'PA',
    ddd: '91',
    numeracao: { min: 1, max: 380, lado: 'ambos' },
  },
  {
    cep: '65071-377',
    logradouro: 'Avenida Litorânea',
    bairro: 'Calhau',
    cidade: 'São Luís',
    uf: 'MA',
    ddd: '98',
    numeracao: { min: 1, max: 999, lado: 'ambos' },
  },
  {
    cep: '64000-020',
    logradouro: 'Avenida Frei Serafim',
    bairro: 'Centro',
    cidade: 'Teresina',
    uf: 'PI',
    ddd: '86',
    numeracao: { min: 1, max: 999, lado: 'impar' },
  },
  {
    cep: '59090-000',
    logradouro: 'Avenida Engenheiro Roberto Freire',
    bairro: 'Ponta Negra',
    cidade: 'Natal',
    uf: 'RN',
    ddd: '84',
    numeracao: { min: 3206, max: 3766, lado: 'par' },
  },
  {
    cep: '58045-010',
    logradouro: 'Avenida Cabo Branco',
    bairro: 'Cabo Branco',
    cidade: 'João Pessoa',
    uf: 'PB',
    ddd: '83',
    numeracao: { min: 1, max: 999, lado: 'ambos' },
  },
  {
    cep: '57030-170',
    logradouro: 'Avenida Doutor Antônio Gouveia',
    bairro: 'Pajuçara',
    cidade: 'Maceió',
    uf: 'AL',
    ddd: '82',
    numeracao: { min: 1, max: 999, lado: 'ambos' },
  },
  {
    cep: '49037-475',
    logradouro: 'Avenida Santos Dumont',
    bairro: 'Atalaia',
    cidade: 'Aracaju',
    uf: 'SE',
    ddd: '79',
    numeracao: { min: 1, max: 1089, lado: 'ambos' },
  },
  {
    cep: '29055-130',
    logradouro: 'Avenida Nossa Senhora da Penha',
    bairro: 'Praia do Canto',
    cidade: 'Vitória',
    uf: 'ES',
    ddd: '27',
    numeracao: { min: 710, max: 1212, lado: 'par' },
  },
  {
    cep: '78005-370',
    logradouro: 'Avenida Presidente Getúlio Vargas',
    bairro: 'Centro-Norte',
    cidade: 'Cuiabá',
    uf: 'MT',
    ddd: '65',
    numeracao: { min: 1, max: 999, lado: 'ambos' },
  },
  {
    cep: '79002-073',
    logradouro: 'Avenida Afonso Pena',
    bairro: 'Centro',
    cidade: 'Campo Grande',
    uf: 'MS',
    ddd: '67',
    numeracao: { min: 2001, max: 2551, lado: 'impar' },
  },
  {
    cep: '77020-012',
    logradouro: 'Quadra ACSE 1 Avenida Juscelino Kubitschek',
    bairro: 'Plano Diretor Sul',
    cidade: 'Palmas',
    uf: 'TO',
    ddd: '63',
    numeracao: { min: 1, max: 999, lado: 'ambos' },
  },
  {
    cep: '76801-097',
    logradouro: 'Avenida Sete de Setembro',
    bairro: 'Centro',
    cidade: 'Porto Velho',
    uf: 'RO',
    ddd: '69',
    numeracao: { min: 945, max: 1355, lado: 'impar' },
  },
  {
    cep: '69905-062',
    logradouro: 'Avenida Ceará',
    bairro: 'Cerâmica',
    cidade: 'Rio Branco',
    uf: 'AC',
    ddd: '68',
    numeracao: { min: 534, max: 954, lado: 'par' },
  },
  {
    cep: '68900-073',
    logradouro: 'Avenida FAB',
    bairro: 'Central',
    cidade: 'Macapá',
    uf: 'AP',
    ddd: '96',
    numeracao: { min: 1, max: 2270, lado: 'ambos' },
  },
  {
    cep: '69301-000',
    logradouro: 'Avenida Ville Roy',
    bairro: 'Centro',
    cidade: 'Boa Vista',
    uf: 'RR',
    ddd: '95',
    numeracao: { min: 5373, max: 6278, lado: 'ambos' },
  },
]

export interface Endereco extends Omit<LogradouroReal, 'numeracao'> {
  numero: string
  complemento: string
}

export function sortearNumero(rng: Rng, { min, max, lado }: Numeracao): number {
  if (lado === 'ambos') return min + rng.int(max - min + 1)
  const quer = lado === 'par' ? 0 : 1
  const primeiro = min % 2 === quer ? min : min + 1
  const ultimo = max % 2 === quer ? max : max - 1
  return primeiro + 2 * rng.int((ultimo - primeiro) / 2 + 1)
}

export function gerarEndereco(rng: Rng = rngPadrao, uf?: UF): Endereco {
  const candidatos = uf ? LOGRADOUROS.filter((l) => l.uf === uf) : LOGRADOUROS
  if (candidatos.length === 0)
    throw new Error(`gerarEndereco: nenhum logradouro para ${uf}`)
  const { numeracao, ...resto } = escolher(rng, candidatos)
  const andar = 1 + rng.int(20)
  const final = 1 + rng.int(4)
  return {
    ...resto,
    numero: String(sortearNumero(rng, numeracao)),
    complemento: `Apto ${andar}${final}`,
  }
}
