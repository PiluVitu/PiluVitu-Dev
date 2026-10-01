import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classificarCampo,
  classificarFormulario,
  normalizar,
  campoAutocomplete,
  type FieldDescriptor,
} from './campos.ts'
import { valorPara, escolherOpcao, caber, type Pessoa } from './formatar.ts'

const f = (p: Partial<FieldDescriptor>): FieldDescriptor => ({
  tag: 'input',
  type: 'text',
  name: '',
  id: '',
  autocomplete: '',
  placeholder: '',
  label: '',
  ariaLabel: '',
  maxLength: null,
  ...p,
})
const opts = (...xs: Array<string | [string, string]>) =>
  xs.map((x) =>
    typeof x === 'string' ? { value: x, text: x } : { value: x[0], text: x[1] },
  )
const range = (a: number, b: number) =>
  Array.from({ length: Math.abs(b - a) + 1 }, (_, i) =>
    String(a < b ? a + i : a - i),
  )
const UFS = opts(
  ['', 'Selecione'],
  ['AC', 'Acre'],
  ['RJ', 'Rio de Janeiro'],
  ['SP', 'São Paulo'],
)

// [id, descriptor, expected kind | null]
const CASOS: Array<[string, FieldDescriptor, string | null]> = [
  [
    '01 ac given-name',
    f({ autocomplete: 'given-name', name: 'fn' }),
    'primeiroNome',
  ],
  [
    '02 ac shipping postal-code',
    f({ autocomplete: 'shipping postal-code', name: 'x1' }),
    'cep',
  ],
  [
    '03 ac section+billing address-level2',
    f({ autocomplete: 'section-blue billing address-level2' }),
    'cidade',
  ],
  [
    '04 ac off is ignored, name decides',
    f({ autocomplete: 'off', name: 'cpf' }),
    'cpf',
  ],
  [
    '05 ac new-password on text field (anti-autofill hack)',
    f({ autocomplete: 'new-password', name: 'cidade', label: 'Cidade' }),
    'cidade',
  ],
  [
    '06 ac cc-csc on password',
    f({ type: 'password', autocomplete: 'cc-csc', name: 'sc' }),
    'cartaoCvv',
  ],
  [
    '07 ac bday on date',
    f({ type: 'date', autocomplete: 'bday' }),
    'nascimento',
  ],
  [
    '08 ac tel-national on tel',
    f({ type: 'tel', autocomplete: 'tel-national' }),
    'celular',
  ],
  [
    '09 ac one-time-code',
    f({ autocomplete: 'one-time-code', name: 'code' }),
    'ignorar',
  ],
  ['10 name cpf', f({ name: 'cpf', maxLength: 14 }), 'cpf'],
  ['11 label CPF/CNPJ alone', f({ label: 'CPF/CNPJ' }), 'cpf'],
  ['12 label CNPJ da empresa', f({ label: 'CNPJ da empresa' }), 'cnpj'],
  [
    '13 id camelCase txtRazaoSocial',
    f({ id: 'txtRazaoSocial' }),
    'razaoSocial',
  ],
  ['14 name nome_fantasia', f({ name: 'nome_fantasia' }), 'nomeFantasia'],
  ['15 label Nome completo *', f({ label: 'Nome completo *' }), 'nomeCompleto'],
  ['16 label Nome (alone)', f({ label: 'Nome' }), 'nomeCompleto'],
  ['17 label Nome da mãe', f({ label: 'Nome da mãe' }), null],
  ['18 label Nome social', f({ label: 'Nome social' }), null],
  ['19 label Nome de usuário', f({ label: 'Nome de usuário' }), 'usuario'],
  ['20 label Endereço de e-mail', f({ label: 'Endereço de e-mail' }), 'email'],
  [
    '21 label Confirme seu e-mail',
    f({ label: 'Confirme seu e-mail' }),
    'emailConfirmacao',
  ],
  [
    '22 name password_confirmation',
    f({ type: 'password', name: 'password_confirmation' }),
    'senhaConfirmacao',
  ],
  ['23 bare password', f({ type: 'password' }), 'senha'],
  [
    '24 Senha atual (login with persona)',
    f({ type: 'password', label: 'Senha atual' }),
    'senha',
  ],
  ['25 bare email type', f({ type: 'email' }), 'email'],
  [
    '26 Celular (com DDD) on tel',
    f({ type: 'tel', label: 'Celular (com DDD)' }),
    'celular',
  ],
  ['27 DDD maxlength 2', f({ label: 'DDD', maxLength: 2 }), 'ddd'],
  [
    '28 placeholder phone mask',
    f({ name: 'telefone', placeholder: '(00) 00000-0000' }),
    'celular',
  ],
  [
    '29 type=tel used for CPF keypad',
    f({ type: 'tel', name: 'documento', label: 'CPF' }),
    'cpf',
  ],
  [
    '30 CEP on tel with inputmode',
    f({ type: 'tel', label: 'CEP', inputMode: 'numeric' }),
    'cep',
  ],
  ['31 placeholder 00000-000 only', f({ placeholder: '00000-000' }), 'cep'],
  [
    '32 placeholder ___.___.___-__ only',
    f({ placeholder: '___.___.___-__' }),
    'cpf',
  ],
  ['33 label Rua', f({ label: 'Rua' }), 'logradouro'],
  ['34 label Endereço', f({ label: 'Endereço' }), 'logradouro'],
  ['35 label Número, no context', f({ label: 'Número', maxLength: 10 }), null],
  [
    '36 label Nº maxlength 6',
    f({ label: 'Nº', maxLength: 6 }),
    'numeroEndereco',
  ],
  ['37 label Complemento', f({ label: 'Complemento' }), 'complemento'],
  ['38 label Bairro', f({ label: 'Bairro' }), 'bairro'],
  ['39 label Cidade', f({ label: 'Cidade' }), 'cidade'],
  [
    '40 select Estado with UFs',
    f({ tag: 'select', type: 'select-one', label: 'Estado', options: UFS }),
    'uf',
  ],
  [
    '41 select Estado civil',
    f({
      tag: 'select',
      type: 'select-one',
      label: 'Estado civil',
      options: opts('Solteiro(a)', 'Casado(a)'),
    }),
    null,
  ],
  ['42 UF maxlength 2', f({ label: 'UF', maxLength: 2 }), 'uf'],
  [
    '43 select País',
    f({
      tag: 'select',
      type: 'select-one',
      label: 'País',
      options: opts(['BR', 'Brasil'], ['PT', 'Portugal']),
    }),
    'pais',
  ],
  ['44 Número do cartão', f({ label: 'Número do cartão' }), 'cartaoNumero'],
  [
    '45 Nome impresso no cartão',
    f({ label: 'Nome impresso no cartão' }),
    'cartaoNome',
  ],
  ['46 Validade (MM/AA)', f({ label: 'Validade (MM/AA)' }), 'cartaoValidade'],
  ['47 CVV', f({ label: 'CVV', maxLength: 4 }), 'cartaoCvv'],
  ['48 Código de segurança', f({ label: 'Código de segurança' }), 'cartaoCvv'],
  [
    '49 Data de nascimento text',
    f({ label: 'Data de nascimento', maxLength: 10 }),
    'nascimento',
  ],
  [
    '50 Data de entrega type=date',
    f({ type: 'date', label: 'Data de entrega' }),
    null,
  ],
  [
    '51 bare date type labelled Data',
    f({ type: 'date', label: 'Data' }),
    'nascimento',
  ],
  [
    '52 Melhor dia de vencimento select',
    f({
      tag: 'select',
      type: 'select-one',
      label: 'Melhor dia de vencimento',
      options: opts(...range(1, 31)),
    }),
    null,
  ],
  ['53 label RG', f({ label: 'RG' }), 'rg'],
  ['54 Órgão emissor do RG', f({ label: 'Órgão emissor do RG' }), null],
  [
    '55 Data de expedição do RG type=date',
    f({ type: 'date', label: 'Data de expedição do RG' }),
    null,
  ],
  ['56 PIS/PASEP', f({ label: 'PIS/PASEP' }), 'pis'],
  ['57 Título de eleitor', f({ label: 'Título de eleitor' }), 'tituloEleitor'],
  ['58 Título (job title)', f({ label: 'Título' }), null],
  ['59 type=search', f({ type: 'search', label: 'Buscar' }), 'ignorar'],
  [
    '60 recaptcha textarea',
    f({ tag: 'textarea', type: 'textarea', name: 'g-recaptcha-response' }),
    'ignorar',
  ],
  [
    '61 Código de indicação (design 1c)',
    f({ name: 'ref_code', label: 'Código de indicação' }),
    null,
  ],
  [
    '62 Como nos conheceu? (design 1c)',
    f({
      tag: 'select',
      type: 'select-one',
      id: 'origem',
      label: 'Como nos conheceu?',
      options: opts('Google', 'Instagram'),
    }),
    null,
  ],
  [
    '63 select Sexo',
    f({
      tag: 'select',
      type: 'select-one',
      label: 'Sexo',
      options: opts(['F', 'Feminino'], ['M', 'Masculino']),
    }),
    'sexo',
  ],
  [
    '64 select Gênero',
    f({
      tag: 'select',
      type: 'select-one',
      label: 'Gênero',
      options: opts('Feminino', 'Masculino', 'Prefiro não dizer'),
    }),
    'sexo',
  ],
  ['65 type=number CEP', f({ type: 'number', label: 'CEP' }), 'cep'],
  [
    '66 type=number Nome (incompatible)',
    f({ type: 'number', label: 'Nome' }),
    null,
  ],
  ['67 Telefone fixo', f({ label: 'Telefone fixo' }), 'celular'],
  [
    '68 bracketed name street_number',
    f({ name: 'customer[address][street_number]' }),
    'numeroEndereco',
  ],
  ['69 billingAddressLine2', f({ name: 'billingAddressLine2' }), 'complemento'],
  ['70 phone_number', f({ name: 'phone_number' }), 'celular'],
  ['71 Número do documento', f({ label: 'Número do documento' }), 'cpf'],
  ['72 Login', f({ label: 'Login' }), 'usuario'],
  [
    '73 email placeholder example',
    f({ label: 'Seu melhor contato', placeholder: 'nome@exemplo.com.br' }),
    'email',
  ],
  [
    '74 Angular Material id + label',
    f({ id: 'mat-input-3', label: 'CPF' }),
    'cpf',
  ],
  ['75 nothing at all', f({ name: 'field_7' }), null],
  ['76 aria-label only', f({ ariaLabel: 'Bairro' }), 'bairro'],
  ['77 Cidade/UF combined label', f({ label: 'Cidade / UF' }), 'cidade'],
  [
    '78 Data de validade do documento',
    f({ label: 'Data de validade do documento' }),
    null,
  ],
  ['79 Inscrição estadual', f({ label: 'Inscrição estadual' }), null],
  [
    '80 E-mail corporativo',
    f({ label: 'E-mail corporativo', type: 'email' }),
    'email',
  ],
]

for (const [nome, d, esperado] of CASOS) {
  test(`campo ${nome}`, () => {
    const r = classificarCampo(d)
    assert.equal(r ? r.kind : null, esperado, JSON.stringify(r))
  })
}

const kindsOf = (ds: FieldDescriptor[]) =>
  classificarFormulario(ds).map((r) => (r ? r.kind : null))

test('form F1 Nome + Sobrenome → primeiroNome/sobrenome', () => {
  assert.deepEqual(kindsOf([f({ label: 'Nome' }), f({ label: 'Sobrenome' })]), [
    'primeiroNome',
    'sobrenome',
  ])
})
test('form F2 address block resolves bare Número to numeroEndereco', () => {
  assert.deepEqual(
    kindsOf([
      f({ label: 'CEP' }),
      f({ label: 'Rua' }),
      f({ label: 'Número' }),
      f({ label: 'Complemento' }),
    ]),
    ['cep', 'logradouro', 'numeroEndereco', 'complemento'],
  )
})
test('form F3 card block: Número/Nome/Validade/CVV', () => {
  assert.deepEqual(
    kindsOf([
      f({ label: 'Número', maxLength: 19, section: 'Pagamento' }),
      f({ label: 'Nome', section: 'Pagamento' }),
      f({ label: 'Validade' }),
      f({ label: 'CVV' }),
    ]),
    ['cartaoNumero', 'cartaoNome', 'cartaoValidade', 'cartaoCvv'],
  )
})
test('form F4 two plain e-mail fields → second is confirmation', () => {
  assert.deepEqual(
    kindsOf([
      f({ type: 'email', label: 'E-mail' }),
      f({ type: 'email', label: 'E-mail' }),
    ]),
    ['email', 'emailConfirmacao'],
  )
})
test('form F5 two bare passwords → senha + confirmação', () => {
  assert.deepEqual(
    kindsOf([f({ type: 'password' }), f({ type: 'password' })]),
    ['senha', 'senhaConfirmacao'],
  )
})
test('form F6 split birth date selects (label only on the first)', () => {
  const ds = [
    f({
      tag: 'select',
      type: 'select-one',
      label: 'Data de nascimento',
      name: 'dia',
      options: opts(['', 'Dia'], ...range(1, 31)),
    }),
    f({
      tag: 'select',
      type: 'select-one',
      name: 'mes',
      options: opts(
        ['', 'Mês'],
        ['1', 'Janeiro'],
        ['2', 'Fevereiro'],
        ['3', 'Março'],
      ),
    }),
    f({
      tag: 'select',
      type: 'select-one',
      name: 'ano',
      options: opts(['', 'Ano'], ...range(2026, 1926)),
    }),
  ]
  assert.deepEqual(kindsOf(ds), [
    'nascimentoDia',
    'nascimentoMes',
    'nascimentoAno',
  ])
})
test('form F7 card expiry selects named mes/ano inside card section', () => {
  const ds = [
    f({ label: 'Número do cartão' }),
    f({
      tag: 'select',
      type: 'select-one',
      name: 'mes',
      section: 'Cartão de crédito',
      options: opts(...range(1, 12)),
    }),
    f({
      tag: 'select',
      type: 'select-one',
      name: 'ano',
      section: 'Cartão de crédito',
      options: opts(...range(2026, 2036)),
    }),
    f({ label: 'CVV' }),
  ]
  assert.deepEqual(kindsOf(ds), [
    'cartaoNumero',
    'cartaoValidadeMes',
    'cartaoValidadeAno',
    'cartaoCvv',
  ])
})
test('form F8 exp_month / exp_year names', () => {
  const ds = [
    f({
      tag: 'select',
      type: 'select-one',
      name: 'exp_month',
      options: opts(...range(1, 12)),
    }),
    f({
      tag: 'select',
      type: 'select-one',
      name: 'exp_year',
      options: opts(...range(2026, 2036)),
    }),
  ]
  assert.deepEqual(kindsOf(ds), ['cartaoValidadeMes', 'cartaoValidadeAno'])
})
test('form F9 DDD + Telefone → celular gets semDdd hint', () => {
  const r = classificarFormulario([
    f({ label: 'DDD', maxLength: 2 }),
    f({ label: 'Telefone', maxLength: 10 }),
  ])
  assert.deepEqual(
    r.map((x) => x?.kind),
    ['ddd', 'celular'],
  )
  assert.deepEqual(r[1]?.dicas, { semDdd: true })
})
test('form F10 PJ section: Nome → razaoSocial', () => {
  assert.deepEqual(
    kindsOf([
      f({ label: 'Nome', section: 'Dados da empresa' }),
      f({ label: 'CNPJ', section: 'Dados da empresa' }),
    ]),
    ['razaoSocial', 'cnpj'],
  )
})
test('form F11 CPF ou CNPJ in a company-only form → cnpj', () => {
  assert.deepEqual(
    kindsOf([
      f({ label: 'Razão social' }),
      f({ label: 'CPF ou CNPJ', maxLength: 18 }),
    ]),
    ['razaoSocial', 'cnpj'],
  )
})
test('form F12 Endereço without número field → incluirNumero hint', () => {
  const r = classificarFormulario([
    f({ label: 'CEP' }),
    f({ label: 'Endereço' }),
    f({ label: 'Cidade' }),
  ])
  assert.deepEqual(r[1]?.dicas, { incluirNumero: true })
})
test('form F13 card holder CPF stays cpf, name next to it stays person', () => {
  assert.deepEqual(
    kindsOf([
      f({ label: 'Número do cartão' }),
      f({ label: 'CPF do titular' }),
      f({ label: 'Nome' }),
    ]),
    ['cartaoNumero', 'cpf', 'nomeCompleto'],
  )
})
test('form F14 "Número" between Telefone and nothing else stays null', () => {
  assert.deepEqual(
    kindsOf([f({ label: 'E-mail' }), f({ label: 'Número', maxLength: 12 })]),
    ['email', null],
  )
})

// ---------------- helpers
test('normalizar', () => {
  assert.equal(normalizar('txtRazaoSocial'), 'txt razao social')
  assert.equal(normalizar('E-mail*:'), 'e mail')
  assert.equal(
    normalizar('customer[address][line1]'),
    'customer address line 1',
  )
  assert.equal(normalizar('Nº'), 'n')
  assert.equal(normalizar('Número da residência'), 'numero da residencia')
})
test('campoAutocomplete grammar', () => {
  assert.equal(
    campoAutocomplete('section-x shipping street-address'),
    'street-address',
  )
  assert.equal(campoAutocomplete('billing mobile tel'), 'tel')
  assert.equal(campoAutocomplete('email webauthn'), 'email')
  assert.equal(campoAutocomplete('off'), 'off')
  assert.equal(campoAutocomplete(''), null)
})

// ---------------- formatting
const P: Pessoa = {
  nome: 'Maria Eduarda Souza',
  primeiroNome: 'Maria Eduarda',
  sobrenome: 'Souza',
  nasc: '14/03/1991',
  sexo: 'F',
  cpf: '529.982.247-25',
  rg: '38.452.917-8',
  cel: '(11) 98734-2156',
  senha: 'Ur$a-7kQ!pm2Lx',
  user: 'maria.souza.4821',
  email: 'maria.souza.4821@tuamaeaquelaursa.com',
  cep: '01310-100',
  rua: 'Avenida Paulista',
  num: '402',
  compl: 'Apto 81',
  bairro: 'Bela Vista',
  cidade: 'São Paulo',
  uf: 'SP',
  razao: 'Souza & Ribeiro Tecnologia Ltda',
  fantasia: 'Ribeiro Dev',
  cnpj: '11.222.333/0001-81',
  cartao: '4000 0000 0000 3188',
  nomeCartao: 'MARIA E SOUZA',
  validade: '08/29',
  cvv: '731',
  pis: '127.48391.05-7',
  titulo: '1047 3826 0108',
}
const V = (
  kind: Parameters<typeof valorPara>[0],
  d: Partial<FieldDescriptor>,
  dicas = {},
) => valorPara(kind, P, f(d), dicas)
test('format cpf by maxLength/pattern', () => {
  assert.equal(V('cpf', {}), '529.982.247-25')
  assert.equal(V('cpf', { maxLength: 14 }), '529.982.247-25')
  assert.equal(V('cpf', { maxLength: 11 }), '52998224725')
  assert.equal(V('cpf', { pattern: '\\d{11}' }), '52998224725')
  assert.equal(V('cpf', { type: 'number' }), '52998224725')
})
test('format cnpj/cep/cartao', () => {
  assert.equal(V('cnpj', { maxLength: 14 }), '11222333000181')
  assert.equal(V('cnpj', { maxLength: 18 }), '11.222.333/0001-81')
  assert.equal(V('cep', { maxLength: 8 }), '01310100')
  assert.equal(V('cep', { type: 'number' }), '01310100')
  assert.equal(V('cartaoNumero', { maxLength: 16 }), '4000000000003188')
  assert.equal(V('cartaoNumero', { maxLength: 19 }), '4000 0000 0000 3188')
})
test('format celular', () => {
  assert.equal(V('celular', {}), '(11) 98734-2156')
  assert.equal(V('celular', { maxLength: 14 }), '(11)98734-2156')
  assert.equal(V('celular', { maxLength: 11 }), '11987342156')
  assert.equal(V('celular', { maxLength: 10 }, { semDdd: true }), '98734-2156')
  assert.equal(V('celular', { maxLength: 9 }, { semDdd: true }), '987342156')
  assert.equal(V('ddd', { maxLength: 2 }), '11')
})
test('format dates', () => {
  assert.equal(V('nascimento', { type: 'date' }), '1991-03-14')
  assert.equal(V('nascimento', { maxLength: 10 }), '14/03/1991')
  assert.equal(V('nascimento', { maxLength: 8 }), '14031991')
  assert.equal(V('cartaoValidade', {}), '08/29')
  assert.equal(V('cartaoValidade', { placeholder: 'MM/AAAA' }), '08/2029')
  assert.equal(V('cartaoValidade', { type: 'month' }), '2029-08')
  assert.equal(V('cartaoValidade', { maxLength: 4 }), '0829')
  assert.equal(V('cartaoValidadeAno', { maxLength: 2 }), '29')
})
test('format address bits', () => {
  assert.equal(
    V('logradouro', {}, { incluirNumero: true }),
    'Avenida Paulista, 402',
  )
  assert.equal(V('uf', { maxLength: 2 }), 'SP')
  assert.equal(V('pais', { maxLength: 2 }), 'BR')
})
test('select matching', () => {
  const sel = (options: { value: string; text: string }[]) => ({
    tag: 'select' as const,
    type: 'select-one',
    options,
  })
  assert.equal(
    V(
      'uf',
      sel(
        opts(['', 'Selecione'], ['sp', 'São Paulo'], ['rj', 'Rio de Janeiro']),
      ),
    ),
    'sp',
  )
  assert.equal(
    V(
      'uf',
      sel(
        opts(['', 'Selecione'], ['25', 'São Paulo'], ['19', 'Rio de Janeiro']),
      ),
    ),
    '25',
  )
  assert.equal(
    V('uf', sel(opts(['RJ', 'RJ - Rio de Janeiro'], ['SP', 'SP - São Paulo']))),
    'SP',
  )
  assert.equal(
    V('uf', sel(opts(['1', 'RJ - Rio de Janeiro'], ['2', 'SP - São Paulo']))),
    '2',
  )
  assert.equal(
    V('pais', sel(opts(['ARG', 'Argentina'], ['BRA', 'Brasil']))),
    'BRA',
  )
  assert.equal(
    V(
      'nascimentoMes',
      sel(
        opts(['', 'Mês'], ['1', 'Janeiro'], ['2', 'Fevereiro'], ['3', 'Março']),
      ),
    ),
    '3',
  )
  assert.equal(
    V(
      'nascimentoMes',
      sel(opts(['jan', 'Jan'], ['fev', 'Fev'], ['mar', 'Mar'])),
    ),
    'mar',
  )
  assert.equal(V('nascimentoDia', sel(opts(...range(1, 31)))), '14')
  assert.equal(V('cartaoValidadeAno', sel(opts(...range(26, 36)))), '29')
  assert.equal(V('cartaoValidadeAno', sel(opts(...range(2026, 2036)))), '2029')
  assert.equal(
    V('sexo', sel(opts(['', '--'], ['1', 'Masculino'], ['2', 'Feminino']))),
    '2',
  )
  assert.equal(escolherOpcao(opts('Google', 'Instagram'), ['SP']), null)
})
test('caber falls back to shortest when nothing fits', () => {
  assert.equal(
    caber(['529.982.247-25', '52998224725'], {
      maxLength: 9,
      pattern: undefined,
      type: 'text',
    }),
    '52998224725',
  )
})
