import {
  normalizar,
  type Dicas,
  type FieldDescriptor,
  type FieldKind,
} from './campos'
import type { Pessoa } from './pessoa'
import { UF_NOME } from './uf'

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

// Tenta a flag v (a que o navegador usa) e depois u; pattern que não compila
// em nenhuma é ignorado, como o navegador faz.
function patternOk(pattern: string | undefined, v: string): boolean {
  if (!pattern) return true
  for (const flags of ['v', 'u']) {
    try {
      return new RegExp(`^(?:${pattern})$`, flags).test(v)
    } catch {
      continue
    }
  }
  return true
}

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
  const [dd, mm, aaaa] = p.nascimento.br.split('/')
  const { mes: vm, ano: va } = p.cartao
  const cel = p.celular.digitos
  const e = p.endereco
  const sel = (c: string[]) => escolherOpcao(d.options || [], c)
  if (d.tag === 'select') {
    switch (kind) {
      case 'uf':
        return sel([e.uf, UF_NOME[e.uf]])
      case 'cidade':
        return sel([e.cidade])
      case 'bairro':
        return sel([e.bairro])
      case 'pais':
        return sel(['BR', 'BRA', '076', 'Brasil', 'Brazil'])
      case 'sexo':
        // A sigla vai por último: num select H/M, o "m" é Mulher.
        return sel(
          p.nome.sexo === 'F'
            ? ['Feminino', 'Mulher', 'Female', 'F']
            : ['Masculino', 'Homem', 'Male', 'M'],
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
        return sel([p.celular.ddd])
      default:
        return null
    }
  }
  switch (kind) {
    case 'nomeCompleto':
      return p.nome.completo
    case 'primeiroNome':
      return p.nome.prenome
    case 'sobrenome':
      return p.nome.sobrenomes.join(' ')
    case 'nascimento':
      return d.type === 'date'
        ? p.nascimento.iso
        : caber([p.nascimento.br, `${dd}${mm}${aaaa}`], d)
    case 'nascimentoDia':
      return dd
    case 'nascimentoMes':
      return mm
    case 'nascimentoAno':
      return caber([aaaa, aaaa.slice(2)], d)
    case 'cpf':
      return caber([p.cpf, so(p.cpf)], d)
    case 'cnpj':
      return caber([p.empresa.cnpj, so(p.empresa.cnpj)], d)
    case 'rg':
      return caber([p.rg.numero, p.rg.numero.replace(/[.-]/g, '')], d)
    case 'pis':
      return caber([p.pis, so(p.pis)], d)
    case 'tituloEleitor':
      return caber([p.tituloEleitor, so(p.tituloEleitor)], d)
    case 'cep':
      return caber([e.cep, so(e.cep)], d)
    case 'ddd':
      return p.celular.ddd
    case 'celular': {
      const local = cel.slice(2)
      if (dicas.semDdd) return caber([p.celular.numero, local], d)
      return caber(
        [
          p.celular.formatado,
          `(${p.celular.ddd})${p.celular.numero}`,
          `${p.celular.ddd} ${p.celular.numero}`,
          cel,
        ],
        d,
      )
    }
    case 'email':
    case 'emailConfirmacao':
      return p.email.endereco
    case 'senha':
    case 'senhaConfirmacao':
      return p.senha
    case 'usuario':
      return p.email.usuario
    case 'logradouro':
      return dicas.incluirNumero ? `${e.logradouro}, ${e.numero}` : e.logradouro
    case 'numeroEndereco':
      return e.numero
    case 'complemento':
      return e.complemento
    case 'bairro':
      return e.bairro
    case 'cidade':
      return e.cidade
    case 'uf':
      return e.uf
    case 'cidadeUf':
      return `${e.cidade} / ${e.uf}`
    case 'pais':
      return d.maxLength !== null && d.maxLength <= 3 ? 'BR' : 'Brasil'
    case 'enderecoCompleto':
      return `${e.logradouro}, ${e.numero}, ${e.complemento} - ${e.bairro}, ${e.cidade} - ${e.uf}, ${e.cep}`
    case 'razaoSocial':
      return p.empresa.razaoSocial
    case 'nomeFantasia':
      return p.empresa.nomeFantasia
    case 'cartaoNumero':
      return caber([p.cartao.numeroFormatado, p.cartao.numero], d)
    case 'cartaoNome':
      return p.cartao.titular
    case 'cartaoValidade':
      if (d.type === 'month') return `20${va}-${vm}`
      return /a{4}|y{4}/i.test(d.placeholder)
        ? `${vm}/20${va}`
        : caber([p.cartao.validade, `${vm}${va}`, `${vm}/20${va}`], d)
    case 'cartaoValidadeMes':
      return vm
    case 'cartaoValidadeAno':
      return caber(['20' + va, va], d)
    case 'cartaoCvv':
      return p.cartao.cvv
    case 'sexo':
      return p.nome.sexo
  }
  return null
}
