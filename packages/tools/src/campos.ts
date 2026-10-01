import { lerDataISO } from './nascimento'

export type FieldKind =
  | 'nomeCompleto'
  | 'primeiroNome'
  | 'sobrenome'
  | 'nascimento'
  | 'nascimentoDia'
  | 'nascimentoMes'
  | 'nascimentoAno'
  | 'cpf'
  | 'rg'
  | 'sexo'
  | 'celular'
  | 'ddd'
  | 'email'
  | 'emailConfirmacao'
  | 'senha'
  | 'senhaConfirmacao'
  | 'usuario'
  | 'cep'
  | 'logradouro'
  | 'numeroEndereco'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'cidadeUf'
  | 'pais'
  | 'enderecoCompleto'
  | 'razaoSocial'
  | 'nomeFantasia'
  | 'cnpj'
  | 'cartaoNumero'
  | 'cartaoNome'
  | 'cartaoValidade'
  | 'cartaoValidadeMes'
  | 'cartaoValidadeAno'
  | 'cartaoCvv'
  | 'pis'
  | 'tituloEleitor'

type Generic = '_nome' | '_numero' | '_dia' | '_mes' | '_ano' | '_documento'
type Kind = FieldKind | Generic | 'ignorar'

export interface FieldDescriptor {
  tag: 'input' | 'select' | 'textarea'
  type: string
  name: string
  id: string
  autocomplete: string
  placeholder: string
  label: string
  ariaLabel: string
  // el.maxLength vale -1 sem o atributo; quem monta o descriptor converte para null.
  maxLength: number | null
  inputMode?: string
  pattern?: string
  options?: { value: string; text: string }[]
  section?: string
}

export type Via =
  | 'autocomplete'
  | 'label'
  | 'ariaLabel'
  | 'name'
  | 'id'
  | 'placeholder'
  | 'formato'
  | 'tipo'
  | 'opcoes'
  | 'contexto'

export interface Dicas {
  semDdd?: boolean
  incluirNumero?: boolean
}

export interface Classificacao {
  kind: FieldKind | 'ignorar'
  confianca: number
  via: Via
  dicas?: Dicas
}

export const LIMIAR = 0.5

export function normalizar(s: string): string {
  return (s || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const AC: Record<string, FieldKind | 'ignorar'> = {
  name: 'nomeCompleto',
  'given-name': 'primeiroNome',
  'family-name': 'sobrenome',
  nickname: 'usuario',
  username: 'usuario',
  email: 'email',
  'new-password': 'senha',
  'current-password': 'senha',
  'one-time-code': 'ignorar',
  organization: 'razaoSocial',
  'street-address': 'enderecoCompleto',
  'address-line1': 'logradouro',
  'address-line2': 'complemento',
  'address-level1': 'uf',
  'address-level2': 'cidade',
  'address-level3': 'bairro',
  country: 'pais',
  'country-name': 'pais',
  'postal-code': 'cep',
  'cc-name': 'cartaoNome',
  'cc-number': 'cartaoNumero',
  'cc-exp': 'cartaoValidade',
  'cc-exp-month': 'cartaoValidadeMes',
  'cc-exp-year': 'cartaoValidadeAno',
  'cc-csc': 'cartaoCvv',
  bday: 'nascimento',
  'bday-day': 'nascimentoDia',
  'bday-month': 'nascimentoMes',
  'bday-year': 'nascimentoAno',
  sex: 'sexo',
  tel: 'celular',
  'tel-national': 'celular',
  'tel-local': 'celular',
  'tel-area-code': 'ddd',
}
const AC_PREFIX = /^(section-.*|shipping|billing|home|work|mobile|fax|pager)$/

export function campoAutocomplete(raw: string): string | null {
  const toks = (raw || '').toLowerCase().trim().split(/\s+/).filter(Boolean)
  const rest = toks.filter((t) => !AC_PREFIX.test(t) && t !== 'webauthn')
  return rest.length === 1 ? rest[0] : null
}

interface Rule {
  kind: Kind
  re: RegExp
  not?: RegExp
  score: number
  soCampoCurto?: boolean
}
const DDD = /^ddd\b|\bddd$/
const COM_DDD = /\b(com|c|incluindo|mais)( o)? ddd\b/
const CONFIRM =
  /\b(confirm\w*|conf|repet\w*|redigit\w*|novamente|again|verif\w*|re ?type|re ?enter|repeat)\b/

const RULES: Rule[] = [
  {
    kind: 'ignorar',
    re: /\b(captcha|recaptcha|hcaptcha|turnstile|search|busca\w*|pesquis\w*|otp|one time code|codigo (de )?verificacao|token)\b|^q$/,
    score: 0.95,
  },

  { kind: 'cnpj', re: /\bcnpj\b|pessoa juridica/, not: /\bcpf\b/, score: 0.97 },
  { kind: 'cpf', re: /\bcpf\b|pessoa fisica/, not: /\bcnpj\b/, score: 0.97 },
  {
    kind: '_documento',
    re: /\bcpf\b.*\bcnpj\b|\bcnpj\b.*\bcpf\b|^(n(umero)? )?(do )?doc(umento)?$/,
    score: 0.85,
  },
  {
    kind: 'rg',
    re: /\brg\b|registro geral|\bidentidade\b|\brne\b/,
    not: /orgao|emissor|expedi|emissao|\buf\b|estado|data|genero|digital/,
    score: 0.93,
  },
  { kind: 'pis', re: /\b(pis|pasep|nis|nit)\b/, score: 0.93 },
  {
    kind: 'tituloEleitor',
    re: /titulo (de )?eleit|titulo eleitoral|\beleitor\b/,
    not: /zona|secao/,
    score: 0.93,
  },

  {
    kind: 'razaoSocial',
    re: /razao social|nome empresarial|nome da empresa|company ?name|\bempresa\b|\bcompany\b|\borganization\b|\borganizacao\b/,
    not: /fantasia|\bcnpj\b|cargo|\bsite\b/,
    score: 0.9,
  },
  { kind: 'nomeFantasia', re: /\bfantasia\b|trade ?name|\bdba\b/, score: 0.95 },

  {
    kind: 'cartaoNome',
    re: /(nome|name).*(impresso|cartao|card)|\btitular\b|card ?holder|cc ?name|holder ?name|name on card/,
    not: /\bcpf\b|nascimento|\bmae\b/,
    score: 0.95,
  },
  {
    kind: 'cartaoNumero',
    re: /(numero|num|n) (do )?cartao|cartao (de credito )?numero|card ?number|cc ?(number|num)|\bpan\b|credit ?card$|^cartao( de credito)?$/,
    not: /nome|validade|cvv|cvc|seguranca|bandeira|parcela/,
    score: 0.95,
  },
  {
    kind: 'cartaoCvv',
    re: /\b(cvv|cvv 2|cvc|csc|cvn|cid)\b|codigo (de )?seguranca|cod seguranca|security ?code|card ?code|codigo verificador/,
    score: 0.96,
  },
  {
    kind: 'cartaoValidadeMes',
    re: /(validade|vencimento|expir\w*|exp|expiry).*(mes|month|mm)\b|(mes|month).*(validade|vencimento|expir\w*|exp)\b|cc ?exp ?month|exp ?month/,
    not: /\bdia\b|fatura|boleto|melhor|\b(aa|yy|ano|year|aaaa|yyyy)\b/,
    score: 0.95,
  },
  {
    kind: 'cartaoValidadeAno',
    re: /(validade|vencimento|expir\w*|exp|expiry).*(ano|year|aa|yy)\b|(ano|year).*(validade|vencimento|expir\w*|exp)\b|cc ?exp ?year|exp ?year/,
    not: /\bdia\b|fatura|boleto|melhor|\b(mm|mes|month)\b/,
    score: 0.95,
  },
  {
    kind: 'cartaoValidade',
    re: /\bvalidade\b|\bvencimento\b|expira\w*|\bexpiry\b|exp ?date|cc ?exp|valid (thru|until)|\bmm ?(aa|yy)\b/,
    not: /\bdia\b|fatura|boleto|melhor|documento|\brg\b|cnh|passaporte/,
    score: 0.9,
  },

  // As duas *Confirmacao só valem quando CONFIRM casa a mesma fonte (ver pontuar).
  {
    kind: 'emailConfirmacao',
    re: /\be ?mail\b|correio eletronico/,
    score: 0.96,
  },
  { kind: 'email', re: /\be ?mail\b|correio eletronico/, score: 0.95 },
  {
    kind: 'senhaConfirmacao',
    re: /\bsenha\b|\bpass ?word\b|\bpasswd\b|\bpwd\b/,
    score: 0.96,
  },
  {
    kind: 'senha',
    re: /\bsenha\b|\bpass ?word\b|\bpasswd\b|\bpwd\b/,
    score: 0.95,
  },
  {
    kind: 'usuario',
    re: /\busuario\b|user ?name|\buser\b|\blogin\b|\bapelido\b|nick ?name|\bnick\b/,
    score: 0.9,
  },

  {
    kind: 'ddd',
    re: /^ddd\b|\bddd$|area code|codigo de area/,
    not: /\b(com|c|incluindo|mais)( o)? ddd\b|\b(cel\w*|tel\w*|fone|phone|whats\w*|numero)\b/,
    score: 0.95,
  },
  { kind: 'ddd', re: DDD, not: COM_DDD, score: 0.95, soCampoCurto: true },
  {
    kind: 'celular',
    re: /\b(cel|celular|mobile|whats ?app|whats|zap|telefone|tel|fone|phone)\b|telemovel/,
    not: /\bfax\b|\bramal\b|\bddi\b|e ?mail|nome/,
    score: 0.92,
  },
  {
    kind: 'celular',
    re: /\bcontato\b/,
    not: /e ?mail|nome|emergencia/,
    score: 0.6,
  },

  {
    kind: 'cep',
    re: /\bcep\b|codigo postal|\bzip\b|zip ?code|postal ?code|\bpostcode\b/,
    score: 0.97,
  },
  {
    kind: 'numeroEndereco',
    re: /^(n|no|nro|nr)$|numero (da |do )?(casa|residencia|endereco|imovel)\b|(house|street|address) ?(number|no)|^end(ereco)? (numero|num|n)$/,
    score: 0.93,
  },
  {
    kind: 'complemento',
    re: /\bcomplemento\b|\bcompl\b|\bapto?\b|\bapartamento\b|address ?line ?2|\baddr ?2\b|address ?2\b|\bsuite\b|\bunit\b|\bbloco\b/,
    score: 0.92,
  },
  {
    kind: 'bairro',
    re: /\bbairro\b|neighbou?rhood|\bdistrito\b|\bdistrict\b/,
    score: 0.95,
  },
  {
    kind: 'cidadeUf',
    re: /\b(cidade|municipio)\b.*\b(uf|estado)\b|\b(uf|estado)\b.*\b(cidade|municipio)\b/,
    not: /\bnatal\b|naturalidade/,
    score: 0.96,
  },
  {
    kind: 'cidade',
    re: /\bcidade\b|\bmunicipio\b|\bcity\b|\btown\b|\blocalidade\b/,
    not: /\bnatal\b|naturalidade/,
    score: 0.93,
  },
  {
    kind: 'uf',
    re: /\buf\b|\bestado\b|\bstate\b|\bprovince\b|\bregion\b/,
    not: /\bcivil\b|emissor|expedi|\bexp\b|emissao|orgao|identidade|\brg\b|document\w*|status|inscricao/,
    score: 0.9,
  },
  {
    kind: 'pais',
    re: /\bpais\b|\bcountry\b/,
    not: /codigo|code|\bddi\b/,
    score: 0.92,
  },
  {
    kind: 'logradouro',
    re: /\blogradouro\b|\brua\b|\bavenida\b|\bendereco\b|\baddress\b|\bstreet\b|address ?line ?1|\baddr ?1\b|address ?1\b|\bend\b/,
    not: /e ?mail|\bip\b|\bsite\b|\bweb\b|\bnumero\b|\bnum\b|\bnumber\b|complemento|bairro|cidade|\bcep\b|line ?2|\b2\b/,
    score: 0.9,
  },

  {
    kind: 'sobrenome',
    re: /\bsobrenome\b|last ?name|\blname\b|\bsurname\b|family ?name|ultimo nome/,
    score: 0.95,
  },
  {
    kind: 'primeiroNome',
    re: /primeiro nome|first ?name|\bfname\b|given ?name/,
    score: 0.95,
  },
  {
    kind: 'nomeCompleto',
    re: /nome completo|full ?name|seu nome|your name|nome e sobrenome|customer ?name|nome do (cliente|comprador|usuario|responsavel)/,
    score: 0.96,
  },
  {
    kind: '_nome',
    re: /^(o )?(seu )?(nome|name)$|^nome\b|\bnome$/,
    not: /\bmae\b|\bpai\b|genitor|filiacao|social|usuario|\buser\b|fantasia|empresa|cartao|impresso|contato|emergencia|\bpet\b|\bloja\b|\bfile\b|\barquivo\b|\bdominio\b|\bcampo\b|\bmeio\b/,
    score: 0.75,
  },

  {
    kind: 'nascimento',
    re: /nascimento|\bnasc\b|data nasc|\bdt nasc|\bdn\b|birth ?(date|day)?|\bdob\b|\bbday\b|aniversario/,
    score: 0.95,
  },
  { kind: 'sexo', re: /\bsexo\b|\bgenero\b|\bgender\b|\bsex\b/, score: 0.9 },

  {
    kind: '_numero',
    re: /\b(numero|num|number|nro|n)\b/,
    not: /(cartao|card|tel\w*|cel\w*|fone|phone|whats|document\w*|\brg\b|cpf|cnpj|pis|titulo|pedido|protocolo|parcela|serie|nota|conta|agencia|matricula|inscricao|registro|crm|oab)/,
    score: 0.7,
  },
  {
    kind: '_dia',
    re: /\b(dia|day|dd)\b/,
    not: /vencimento|fatura|boleto|melhor|semana|entrega/,
    score: 0.7,
  },
  {
    kind: '_mes',
    re: /\b(mes|month|mm)\b/,
    not: /fatura|referencia|competencia/,
    score: 0.7,
  },
  {
    kind: '_ano',
    re: /\b(ano|year|yyyy|aaaa|yy|aa)\b/,
    not: /letivo|fabricacao|modelo|referencia|formatura|conclusao/,
    score: 0.7,
  },
]

const PESO: Record<
  'label' | 'ariaLabel' | 'name' | 'id' | 'placeholder',
  number
> = {
  label: 1,
  ariaLabel: 1,
  name: 0.95,
  id: 0.9,
  placeholder: 0.8,
}

function shape(p: string): string {
  return p.trim().replace(/[0-9_#xX9]/g, '0')
}
const FORMATOS: Array<[RegExp, Kind, number]> = [
  [/^000\.000\.000-00$/, 'cpf', 0.92],
  [/^00\.000\.000\/0000-00$/, 'cnpj', 0.92],
  [/^00000-000$/, 'cep', 0.92],
  [/^\(00\) ?0{4,5}-0000$/, 'celular', 0.9],
  [/^0000 ?0000 ?0000 ?0000$/, 'cartaoNumero', 0.9],
  [/^0{3,5}\.0{5}\.0{2}-0$/, 'pis', 0.9],
]
function formatoPlaceholder(raw: string): [Kind, number] | null {
  const s = shape(raw)
  for (const [re, kind, sc] of FORMATOS) if (re.test(s)) return [kind, sc]
  const n = normalizar(raw)
  if (/^dd mm (aaaa|yyyy)$/.test(n)) return ['nascimento', 0.6]
  if (/^mm (aa|yy|aaaa|yyyy)$/.test(n)) return ['cartaoValidade', 0.9]
  if (/^[^\s@]+@[^\s@]+\.[a-z.]+$/i.test(raw.trim())) return ['email', 0.97]
  return null
}

const SELECTABLE = new Set<Kind>([
  'uf',
  'cidade',
  'pais',
  'sexo',
  'nascimentoDia',
  'nascimentoMes',
  'nascimentoAno',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'ddd',
  'bairro',
  '_dia',
  '_mes',
  '_ano',
  'ignorar',
])
const NUMERIC = new Set<Kind>([
  'cpf',
  'cnpj',
  'cep',
  'numeroEndereco',
  'celular',
  'ddd',
  'cartaoNumero',
  'cartaoCvv',
  'nascimentoDia',
  'nascimentoMes',
  'nascimentoAno',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'rg',
  'pis',
  'tituloEleitor',
  '_numero',
  '_dia',
  '_mes',
  '_ano',
  '_documento',
  'ignorar',
])
const TEXTAREA = new Set<Kind>([
  'enderecoCompleto',
  'logradouro',
  'complemento',
  'ignorar',
])

function compativel(kind: Kind, d: FieldDescriptor): boolean {
  if (d.tag === 'select') return SELECTABLE.has(kind)
  if (d.tag === 'textarea') return TEXTAREA.has(kind)
  switch (d.type) {
    case 'number':
      return NUMERIC.has(kind)
    case 'password':
      return (
        kind === 'senha' ||
        kind === 'senhaConfirmacao' ||
        kind === 'cartaoCvv' ||
        kind === 'cartaoNumero'
      )
    case 'email':
      return (
        kind === 'email' || kind === 'emailConfirmacao' || kind === 'usuario'
      )
    case 'date':
      return kind === 'nascimento'
    case 'month':
      return kind === 'cartaoValidade'
    case 'tel':
      return NUMERIC.has(kind)
    default:
      return true
  }
}

const NAO_PREENCHE = new Set([
  'hidden',
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color',
])

const DATA_NAO_NASC =
  /entrega|agend|inicio|fim|termino|evento|reserva|check|\bida\b|volta|partida|chegada|admiss|validade|vencimento|emissao|expedi|pagamento|consulta/
const TELEFONE_FIXO = /\b(fixo|residencial|comercial|res|resid)\b/
// "com" no fim da fonte é comercial abreviado ("Tel. Com.", ddd_com); no meio é "com DDD".
const COMERCIAL_ABREVIADO = /\bcom$/
const AC_TELEFONE_FIXO = new Set(['home', 'work', 'fax', 'pager'])
const DDD_MAIS = /ddd\s*\+|\+\s*ddd/i

function textoDeDdd(d: FieldDescriptor, noInicio = false): boolean {
  return [d.label, d.ariaLabel, d.name, d.id].some((s) => {
    const n = normalizar(s)
    return (
      (noInicio ? /^ddd\b/ : DDD).test(n) &&
      !COM_DDD.test(n) &&
      !DDD_MAIS.test(s)
    )
  })
}

function mencionaDdd(d: FieldDescriptor): boolean {
  return [d.label, d.ariaLabel, d.name, d.id].some((s) =>
    /\bddd\b/.test(normalizar(s)),
  )
}

function ehTelefoneFixo(d: FieldDescriptor): boolean {
  const tokens = (d.autocomplete || '').toLowerCase().split(/\s+/)
  const fontes = [d.label, d.ariaLabel, d.name, d.id, d.placeholder].map(
    normalizar,
  )
  return (
    tokens.some((t) => AC_TELEFONE_FIXO.has(t)) ||
    TELEFONE_FIXO.test(fontes.join(' ')) ||
    fontes.some((s) => COMERCIAL_ABREVIADO.test(s))
  )
}

interface Scored {
  kind: Kind
  score: number
  via: Via
  fontes: number
}

const PRECEDENCIA: Kind[] = [
  'ignorar',
  'cnpj',
  'cpf',
  'rg',
  'pis',
  'tituloEleitor',
  'cartaoCvv',
  'cartaoNumero',
  'cartaoNome',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'cartaoValidade',
  'emailConfirmacao',
  'email',
  'senhaConfirmacao',
  'senha',
  'cep',
  'nomeFantasia',
  'razaoSocial',
  'nascimento',
  'sobrenome',
  'primeiroNome',
  'nomeCompleto',
  'numeroEndereco',
  'complemento',
  'bairro',
  'cidadeUf',
  'cidade',
  'uf',
  'pais',
  'ddd',
  'celular',
  'usuario',
  'logradouro',
  'sexo',
  '_documento',
  '_nome',
  '_numero',
  '_dia',
  '_mes',
  '_ano',
]
const ordem = (k: Kind) => {
  const i = PRECEDENCIA.indexOf(k)
  return i === -1 ? 999 : i
}

function pontuar(d: FieldDescriptor): Scored[] {
  if (d.tag === 'input' && NAO_PREENCHE.has(d.type)) return []
  if (d.type === 'search')
    return [{ kind: 'ignorar', score: 1, via: 'tipo', fontes: 1 }]

  const fixo = ehTelefoneFixo(d)
  const curto = d.tag === 'select' || (d.maxLength !== null && d.maxLength <= 4)
  const ac = campoAutocomplete(d.autocomplete)
  if (ac && AC[ac]) {
    const k = AC[ac]
    if (k === 'celular' && fixo) return []
    // autocomplete="new-password" fora de type=password é truque contra o autofill do Chrome.
    const acOk = !(ac.endsWith('password') && d.type !== 'password')
    if (acOk && compativel(k, d))
      return [{ kind: k, score: 1, via: 'autocomplete', fontes: 1 }]
  }

  const fontes: Array<[keyof typeof PESO, string]> = [
    ['label', normalizar(d.label)],
    ['ariaLabel', normalizar(d.ariaLabel)],
    ['name', normalizar(d.name)],
    ['id', normalizar(d.id)],
    ['placeholder', normalizar(d.placeholder)],
  ]
  const best = new Map<Kind, Scored>()
  const add = (kind: Kind, score: number, via: Via) => {
    if (!compativel(kind, d) || (kind === 'celular' && fixo)) return
    const cur = best.get(kind)
    if (!cur) best.set(kind, { kind, score, via, fontes: 1 })
    else {
      cur.fontes += 1
      if (score > cur.score) {
        cur.score = score
        cur.via = via
      }
    }
  }
  for (const [src, txt] of fontes) {
    if (!txt) continue
    const confirm = CONFIRM.test(txt)
    const matchedHere = new Set<Kind>()
    for (const r of RULES) {
      if (matchedHere.has(r.kind) || (r.soCampoCurto && !curto)) continue
      if (!r.re.test(txt) || (r.not && r.not.test(txt))) continue
      if (
        (r.kind === 'emailConfirmacao' || r.kind === 'senhaConfirmacao') !==
          confirm &&
        (r.kind.startsWith('email') || r.kind.startsWith('senha'))
      )
        continue
      matchedHere.add(r.kind)
      add(r.kind, r.score * PESO[src], src)
    }
  }
  const fmt = d.placeholder ? formatoPlaceholder(d.placeholder) : null
  if (fmt) add(fmt[0], fmt[1], 'formato')

  if (best.size === 0) {
    const ctxTxt = normalizar(`${d.label} ${d.ariaLabel} ${d.name} ${d.id}`)
    if (d.type === 'date' && DATA_NAO_NASC.test(ctxTxt)) return []
    if (d.type === 'email') add('email', 0.9, 'tipo')
    else if (d.type === 'password') add('senha', 0.85, 'tipo')
    else if (d.type === 'date') add('nascimento', 0.55, 'tipo')
    else if (d.type === 'month') add('cartaoValidade', 0.55, 'tipo')
    else if (d.type === 'tel') add('celular', 0.55, 'tipo')
  }
  const out = [...best.values()].map((s) => ({
    ...s,
    score: Math.min(0.99, s.score + 0.03 * (s.fontes - 1)),
  }))
  out.sort((a, b) => b.score - a.score || ordem(a.kind) - ordem(b.kind))
  return out
}

function topo(d: FieldDescriptor): Scored | null {
  const s = pontuar(d)
  return s.length ? s[0] : null
}

const CARTAO = new Set<Kind>([
  'cartaoNumero',
  'cartaoNome',
  'cartaoValidade',
  'cartaoValidadeMes',
  'cartaoValidadeAno',
  'cartaoCvv',
])
const ENDERECO = new Set<Kind>([
  'cep',
  'logradouro',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'numeroEndereco',
])
const EMPRESA = new Set<Kind>(['cnpj', 'razaoSocial', 'nomeFantasia'])

function anosDasOpcoes(d: FieldDescriptor): number[] {
  return (d.options || [])
    .map((o) => Number(o.value || o.text))
    .filter((n) => Number.isInteger(n) && n >= 1900 && n <= 2100)
}

function parteDeData(
  d: FieldDescriptor,
): 'nascimentoDia' | 'nascimentoMes' | 'nascimentoAno' | null {
  const n = normalizar(`${d.name} ${d.id}`)
  if (/\b(dia|day|dd)\b/.test(n)) return 'nascimentoDia'
  if (/\b(mes|month|mm)\b/.test(n)) return 'nascimentoMes'
  if (/\b(ano|year|yyyy|aaaa)\b/.test(n)) return 'nascimentoAno'
  const nums = (d.options || [])
    .map((o) => Number(o.value))
    .filter((x) => Number.isInteger(x))
  if (anosDasOpcoes(d).length >= 10) return 'nascimentoAno'
  const txt = (d.options || []).map((o) => normalizar(o.text)).join(' ')
  if (
    /janeiro|fevereiro|\bjan\b|\bfev\b/.test(txt) ||
    (nums.length >= 12 && nums.length <= 13 && Math.max(...nums) === 12)
  )
    return 'nascimentoMes'
  if (nums.length >= 28 && Math.max(...nums) === 31) return 'nascimentoDia'
  return null
}

export function classificarCampo(d: FieldDescriptor): Classificacao | null {
  return resolver([d], null)[0]
}

export function classificarFormulario(
  ds: FieldDescriptor[],
  hojeISO: string,
): (Classificacao | null)[] {
  return resolver(ds, lerDataISO(hojeISO).ano)
}

function resolver(
  ds: FieldDescriptor[],
  anoAtual: number | null,
): (Classificacao | null)[] {
  const tops = ds.map(topo)
  const kinds = tops.map((t) => t?.kind)
  const has = (set: Set<Kind>) => kinds.some((k) => k && set.has(k))
  const hasCartao = has(CARTAO),
    hasEndereco = has(ENDERECO),
    hasEmpresa = has(EMPRESA)
  const hasSobrenome = kinds.includes('sobrenome'),
    hasCpf = kinds.includes('cpf')
  const secao = (i: number) => normalizar(ds[i].section || '')
  const vizinho = (i: number, set: Set<Kind>, dist = 2) => {
    for (let k = 1; k <= dist; k++) {
      for (const j of [i - k, i + k]) {
        const kk = kinds[j]
        if (kk && set.has(kk)) return true
      }
    }
    return false
  }
  const ctxCartaoRaw = (i: number) =>
    /cartao|card|pagamento|payment|validade|expir/.test(secao(i))
  const ctxCartao = (i: number) =>
    /cartao|card|pagamento|payment/.test(secao(i)) || vizinho(i, CARTAO)
  const ctxNasc = (i: number) =>
    /nascimento|birth|aniversario/.test(secao(i)) ||
    /nascimento|birth|nasc\b/.test(
      normalizar(ds[i].label + ' ' + ds[i].name),
    ) ||
    [i - 1, i - 2, i + 1, i + 2].some(
      (j) =>
        [
          '_dia',
          '_mes',
          '_ano',
          'nascimento',
          'nascimentoDia',
          'nascimentoMes',
          'nascimentoAno',
        ].includes(kinds[j] as string) && !ctxCartaoRaw(j),
    )
  const ctxRG = (i: number) => /\b(rg|identidade)\b/.test(secao(i))
  const ctxTelefone = (i: number) =>
    /\b(tel\w*|fone|cel|celular|whats\w*|phone|mobile)\b/.test(secao(i))
  const ehDdd = (j: number) =>
    kinds[j] === 'ddd' ||
    (kinds[j] === 'celular' &&
      (ds[j].maxLength ?? 0) <= 4 &&
      formatoPlaceholder(ds[j].placeholder)?.[0] !== 'celular' &&
      ((kinds[j + 1] === '_numero' && textoDeDdd(ds[j])) ||
        (kinds[j + 1] === 'celular' &&
          textoDeDdd(ds[j], true) &&
          !mencionaDdd(ds[j + 1]))))
  const hasCpfNear = (i: number) =>
    [i - 1, i + 1].some((j) => kinds[j] === 'cpf' || kinds[j] === 'nascimento')

  let emails = 0,
    senhas = 0
  return tops.map((t, i) => {
    if (!t || t.score < LIMIAR) return null
    const d = ds[i]
    let kind = t.kind,
      conf = t.score,
      via: Via = t.via
    const ctx = (k: Kind, c: number) => {
      kind = k
      conf = c
      via = 'contexto'
    }

    switch (t.kind) {
      case '_nome':
        if (ctxCartao(i) && !hasCpfNear(i)) ctx('cartaoNome', 0.75)
        else if (/empresa|juridica|\bpj\b|company/.test(secao(i)))
          ctx('razaoSocial', 0.75)
        else if (hasSobrenome) ctx('primeiroNome', 0.8)
        else ctx('nomeCompleto', 0.8)
        break
      case '_numero':
        if (ctxRG(i)) return null
        if (ehDdd(i - 1)) {
          if (
            TELEFONE_FIXO.test(secao(i)) ||
            ehTelefoneFixo(d) ||
            ehTelefoneFixo(ds[i - 1])
          )
            return null
          ctx('celular', 0.75)
          break
        }
        if (ctxTelefone(i)) return null
        if ((d.maxLength ?? 0) >= 16 || ctxCartao(i)) ctx('cartaoNumero', 0.75)
        else if (
          vizinho(i, ENDERECO) ||
          (hasEndereco && !hasCartao) ||
          (d.maxLength !== null && d.maxLength <= 6)
        )
          ctx('numeroEndereco', 0.75)
        else return null
        break
      case '_documento':
        if ((d.maxLength ?? 0) >= 18 || (hasEmpresa && !hasCpf))
          ctx('cnpj', 0.8)
        else ctx('cpf', 0.8)
        break
      case '_dia':
      case '_mes':
      case '_ano': {
        const anos = anosDasOpcoes(d)
        const menor = anos.length > 0 ? Math.min(...anos) : null
        const futuro =
          menor !== null && anoAtual !== null && menor >= anoAtual - 1
        const passado =
          menor !== null && anoAtual !== null && menor <= anoAtual - 18
        const cartao =
          ctxCartaoRaw(i) || futuro || (vizinho(i, CARTAO) && !ctxNasc(i))
        if (t.kind === '_ano' && passado) ctx('nascimentoAno', 0.8)
        else if (cartao && t.kind !== '_dia')
          ctx(
            t.kind === '_mes' ? 'cartaoValidadeMes' : 'cartaoValidadeAno',
            0.75,
          )
        else if (ctxNasc(i))
          ctx(
            t.kind === '_dia'
              ? 'nascimentoDia'
              : t.kind === '_mes'
                ? 'nascimentoMes'
                : 'nascimentoAno',
            0.75,
          )
        else return null
        break
      }
      case 'celular':
        if (ehDdd(i)) ctx('ddd', 0.75)
        else if (
          (TELEFONE_FIXO.test(secao(i)) && (ctxTelefone(i) || ehDdd(i - 1))) ||
          (ehDdd(i - 1) && ehTelefoneFixo(ds[i - 1]))
        )
          return null
        break
      case 'uf':
        if (ctxRG(i)) return null
        break
      case 'email':
        if (emails++ > 0) ctx('emailConfirmacao', 0.85)
        break
      case 'emailConfirmacao':
        emails++
        break
      case 'senha':
        if (senhas++ > 0) ctx('senhaConfirmacao', 0.85)
        break
      case 'senhaConfirmacao':
        senhas++
        break
      case 'nascimento':
        if (d.tag === 'select' || (d.maxLength !== null && d.maxLength <= 4)) {
          const parte = parteDeData(d)
          if (parte) ctx(parte, 0.85)
          else return null
        }
        break
    }
    if (!compativel(kind, d)) return null
    const out = {
      kind,
      confianca: Math.round(conf * 100) / 100,
      via,
    } as Classificacao
    if (kind === 'celular' && ehDdd(i - 1)) out.dicas = { semDdd: true }
    if (
      kind === 'logradouro' &&
      !kinds.includes('_numero') &&
      !kinds.includes('numeroEndereco')
    )
      out.dicas = { incluirNumero: true }
    return out
  })
}
