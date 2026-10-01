// Prototype: value formatting per field constraints + <select> option matching. PURE.
import { normalizar, type FieldDescriptor, type FieldKind } from './campos.ts'

export interface Pessoa {
  nome: string
  primeiroNome: string
  sobrenome: string
  nasc: string /* dd/mm/aaaa */
  sexo: 'F' | 'M'
  cpf: string
  rg: string
  cel: string
  senha: string
  user: string
  email: string
  cep: string
  rua: string
  num: string
  compl: string
  bairro: string
  cidade: string
  uf: string
  razao: string
  fantasia: string
  cnpj: string
  cartao: string
  nomeCartao: string
  validade: string /* MM/AA */
  cvv: string
  pis: string
  titulo: string
}

export interface Dicas {
  semDdd?: boolean
  incluirNumero?: boolean
}

export const UF_NOME: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
}
const MESES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const so = (s: string) => s.replace(/\D/g, '')

function patternOk(pattern: string | undefined, v: string): boolean {
  if (!pattern) return true
  for (const flags of ['v', 'u']) {
    try {
      return new RegExp(`^(?:${pattern})$`, flags).test(v)
    } catch {
      /* try next */
    }
  }
  return true
}

/** First candidate that fits maxLength and pattern; falls back to the shortest. */
export function caber(
  cands: string[],
  d: Pick<FieldDescriptor, 'maxLength' | 'pattern' | 'type'>,
): string {
  const uniq = [...new Set(cands)]
  const pool = d.type === 'number' ? uniq.filter((c) => /^\d+$/.test(c)) : uniq
  const ok = pool.find(
    (c) =>
      (d.maxLength === null || c.length <= d.maxLength) &&
      patternOk(d.pattern, c),
  )
  if (ok !== undefined) return ok
  return [...pool].sort((a, b) => a.length - b.length)[0] ?? ''
}

export function escolherOpcao(
  options: { value: string; text: string }[],
  cands: string[],
): string | null {
  const reais = options.filter(
    (o) =>
      !(
        o.value === '' ||
        /^(selecione|escolha|select|choose|--)/.test(normalizar(o.text))
      ),
  )
  const nc = cands.map(normalizar).filter(Boolean)
  for (const c of nc) {
    const hit = reais.find(
      (o) => normalizar(o.value) === c || normalizar(o.text) === c,
    )
    if (hit) return hit.value
  }
  for (const c of nc) {
    if (!/^\d+$/.test(c)) continue
    const hit = reais.find(
      (o) =>
        Number(so(o.value) || NaN) === Number(c) ||
        Number(so(o.text) || NaN) === Number(c),
    )
    if (hit) return hit.value
  }
  for (const c of nc) {
    const hit = reais.find(
      (o) =>
        normalizar(o.text).split(' ').includes(c) ||
        normalizar(o.text).startsWith(c + ' '),
    )
    if (hit) return hit.value
  }
  return null
}

export function valorPara(
  kind: FieldKind,
  p: Pessoa,
  d: FieldDescriptor,
  dicas: Dicas = {},
): string | null {
  const [dd, mm, aaaa] = p.nasc.split('/')
  const [vm, va] = p.validade.split('/')
  const cel = so(p.cel)
  const sel = (c: string[]) => escolherOpcao(d.options || [], c)
  if (d.tag === 'select') {
    switch (kind) {
      case 'uf':
        return sel([p.uf, UF_NOME[p.uf]])
      case 'cidade':
        return sel([p.cidade])
      case 'bairro':
        return sel([p.bairro])
      case 'pais':
        return sel(['BR', 'BRA', '076', 'Brasil', 'Brazil'])
      case 'sexo':
        return sel(
          p.sexo === 'F'
            ? ['F', 'Feminino', 'Female', 'Mulher', 'fem']
            : ['M', 'Masculino', 'Male', 'Homem', 'masc'],
        )
      case 'nascimentoDia':
        return sel([dd])
      case 'nascimentoMes':
        return sel([
          mm,
          MESES[Number(mm) - 1],
          MESES[Number(mm) - 1].slice(0, 3),
        ])
      case 'nascimentoAno':
        return sel([aaaa])
      case 'cartaoValidadeMes':
        return sel([
          vm,
          MESES[Number(vm) - 1],
          MESES[Number(vm) - 1].slice(0, 3),
        ])
      case 'cartaoValidadeAno':
        return sel(['20' + va, va])
      case 'ddd':
        return sel([cel.slice(0, 2)])
      default:
        return null
    }
  }
  switch (kind) {
    case 'nomeCompleto':
      return p.nome
    case 'primeiroNome':
      return p.primeiroNome
    case 'sobrenome':
      return p.sobrenome
    case 'nascimento':
      return d.type === 'date'
        ? `${aaaa}-${mm}-${dd}`
        : caber([p.nasc, `${dd}${mm}${aaaa}`], d)
    case 'nascimentoDia':
      return dd
    case 'nascimentoMes':
      return mm
    case 'nascimentoAno':
      return caber([aaaa, aaaa.slice(2)], d)
    case 'cpf':
      return caber([p.cpf, so(p.cpf)], d)
    case 'cnpj':
      return caber([p.cnpj, so(p.cnpj)], d)
    case 'rg':
      return caber([p.rg, p.rg.replace(/[.-]/g, '')], d)
    case 'pis':
      return caber([p.pis, so(p.pis)], d)
    case 'tituloEleitor':
      return caber([p.titulo, so(p.titulo)], d)
    case 'cep':
      return caber([p.cep, so(p.cep)], d)
    case 'ddd':
      return cel.slice(0, 2)
    case 'celular': {
      const local = cel.slice(2)
      if (dicas.semDdd)
        return caber([`${local.slice(0, 5)}-${local.slice(5)}`, local], d)
      return caber(
        [
          p.cel,
          `(${cel.slice(0, 2)})${local.slice(0, 5)}-${local.slice(5)}`,
          `${cel.slice(0, 2)} ${local.slice(0, 5)}-${local.slice(5)}`,
          cel,
        ],
        d,
      )
    }
    case 'email':
    case 'emailConfirmacao':
      return p.email
    case 'senha':
    case 'senhaConfirmacao':
      return p.senha
    case 'usuario':
      return p.user
    case 'logradouro':
      return dicas.incluirNumero ? `${p.rua}, ${p.num}` : p.rua
    case 'numeroEndereco':
      return p.num
    case 'complemento':
      return p.compl
    case 'bairro':
      return p.bairro
    case 'cidade':
      return p.cidade
    case 'uf':
      return d.maxLength !== null && d.maxLength < 3 ? p.uf : caber([p.uf], d)
    case 'pais':
      return d.maxLength !== null && d.maxLength <= 3 ? 'BR' : 'Brasil'
    case 'enderecoCompleto':
      return `${p.rua}, ${p.num}, ${p.compl} - ${p.bairro}, ${p.cidade} - ${p.uf}, ${p.cep}`
    case 'razaoSocial':
      return p.razao
    case 'nomeFantasia':
      return p.fantasia
    case 'cartaoNumero':
      return caber([p.cartao, so(p.cartao)], d)
    case 'cartaoNome':
      return p.nomeCartao
    case 'cartaoValidade':
      if (d.type === 'month') return `20${va}-${vm}`
      return /a{4}|y{4}/i.test(d.placeholder)
        ? `${vm}/20${va}`
        : caber([`${vm}/${va}`, `${vm}${va}`, `${vm}/20${va}`], d)
    case 'cartaoValidadeMes':
      return vm
    case 'cartaoValidadeAno':
      return caber(['20' + va, va], d)
    case 'cartaoCvv':
      return p.cvv
    case 'sexo':
      return p.sexo
  }
  return null
}
