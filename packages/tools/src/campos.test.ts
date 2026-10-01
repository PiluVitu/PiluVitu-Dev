import {
  campoAutocomplete,
  classificarCampo,
  classificarFormulario,
  normalizar,
  type FieldDescriptor,
} from './campos'

const HOJE = '2026-10-01'

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

// [id, descriptor, kind esperado | null]
// prettier-ignore
const CASOS: Array<[string, FieldDescriptor, string | null]> = [
  ['01 ac given-name', f({ autocomplete: 'given-name', name: 'fn' }), 'primeiroNome'],
  ['02 ac shipping postal-code', f({ autocomplete: 'shipping postal-code', name: 'x1' }), 'cep'],
  ['03 ac section+billing address-level2', f({ autocomplete: 'section-blue billing address-level2' }), 'cidade'],
  ['04 ac off is ignored, name decides', f({ autocomplete: 'off', name: 'cpf' }), 'cpf'],
  ['05 ac new-password on text field (anti-autofill hack)', f({ autocomplete: 'new-password', name: 'cidade', label: 'Cidade' }), 'cidade'],
  ['06 ac cc-csc on password', f({ type: 'password', autocomplete: 'cc-csc', name: 'sc' }), 'cartaoCvv'],
  ['07 ac bday on date', f({ type: 'date', autocomplete: 'bday' }), 'nascimento'],
  ['08 ac tel-national on tel', f({ type: 'tel', autocomplete: 'tel-national' }), 'celular'],
  ['09 ac one-time-code', f({ autocomplete: 'one-time-code', name: 'code' }), 'ignorar'],
  ['10 name cpf', f({ name: 'cpf', maxLength: 14 }), 'cpf'],
  ['11 label CPF/CNPJ alone', f({ label: 'CPF/CNPJ' }), 'cpf'],
  ['12 label CNPJ da empresa', f({ label: 'CNPJ da empresa' }), 'cnpj'],
  ['13 id camelCase txtRazaoSocial', f({ id: 'txtRazaoSocial' }), 'razaoSocial'],
  ['14 name nome_fantasia', f({ name: 'nome_fantasia' }), 'nomeFantasia'],
  ['15 label Nome completo *', f({ label: 'Nome completo *' }), 'nomeCompleto'],
  ['16 label Nome (alone)', f({ label: 'Nome' }), 'nomeCompleto'],
  ['17 label Nome da mãe', f({ label: 'Nome da mãe' }), null],
  ['18 label Nome social', f({ label: 'Nome social' }), null],
  ['19 label Nome de usuário', f({ label: 'Nome de usuário' }), 'usuario'],
  ['20 label Endereço de e-mail', f({ label: 'Endereço de e-mail' }), 'email'],
  ['21 label Confirme seu e-mail', f({ label: 'Confirme seu e-mail' }), 'emailConfirmacao'],
  ['22 name password_confirmation', f({ type: 'password', name: 'password_confirmation' }), 'senhaConfirmacao'],
  ['23 bare password', f({ type: 'password' }), 'senha'],
  ['24 Senha atual (login with persona)', f({ type: 'password', label: 'Senha atual' }), 'senha'],
  ['25 bare email type', f({ type: 'email' }), 'email'],
  ['26 Celular (com DDD) on tel', f({ type: 'tel', label: 'Celular (com DDD)' }), 'celular'],
  ['27 DDD maxlength 2', f({ label: 'DDD', maxLength: 2 }), 'ddd'],
  ['28 placeholder phone mask', f({ name: 'telefone', placeholder: '(00) 00000-0000' }), 'celular'],
  ['29 type=tel used for CPF keypad', f({ type: 'tel', name: 'documento', label: 'CPF' }), 'cpf'],
  ['30 CEP on tel with inputmode', f({ type: 'tel', label: 'CEP', inputMode: 'numeric' }), 'cep'],
  ['31 placeholder 00000-000 only', f({ placeholder: '00000-000' }), 'cep'],
  ['32 placeholder ___.___.___-__ only', f({ placeholder: '___.___.___-__' }), 'cpf'],
  ['33 label Rua', f({ label: 'Rua' }), 'logradouro'],
  ['34 label Endereço', f({ label: 'Endereço' }), 'logradouro'],
  ['35 label Número, no context', f({ label: 'Número', maxLength: 10 }), null],
  ['36 label Nº maxlength 6', f({ label: 'Nº', maxLength: 6 }), 'numeroEndereco'],
  ['37 label Complemento', f({ label: 'Complemento' }), 'complemento'],
  ['38 label Bairro', f({ label: 'Bairro' }), 'bairro'],
  ['39 label Cidade', f({ label: 'Cidade' }), 'cidade'],
  ['40 select Estado with UFs', f({ tag: 'select', type: 'select-one', label: 'Estado', options: UFS }), 'uf'],
  ['41 select Estado civil', f({ tag: 'select', type: 'select-one', label: 'Estado civil', options: opts('Solteiro(a)', 'Casado(a)') }), null],
  ['42 UF maxlength 2', f({ label: 'UF', maxLength: 2 }), 'uf'],
  ['43 select País', f({ tag: 'select', type: 'select-one', label: 'País', options: opts(['BR', 'Brasil'], ['PT', 'Portugal']) }), 'pais'],
  ['44 Número do cartão', f({ label: 'Número do cartão' }), 'cartaoNumero'],
  ['45 Nome impresso no cartão', f({ label: 'Nome impresso no cartão' }), 'cartaoNome'],
  ['46 Validade (MM/AA)', f({ label: 'Validade (MM/AA)' }), 'cartaoValidade'],
  ['47 CVV', f({ label: 'CVV', maxLength: 4 }), 'cartaoCvv'],
  ['48 Código de segurança', f({ label: 'Código de segurança' }), 'cartaoCvv'],
  ['49 Data de nascimento text', f({ label: 'Data de nascimento', maxLength: 10 }), 'nascimento'],
  ['50 Data de entrega type=date', f({ type: 'date', label: 'Data de entrega' }), null],
  ['51 bare date type labelled Data', f({ type: 'date', label: 'Data' }), 'nascimento'],
  ['52 Melhor dia de vencimento select', f({ tag: 'select', type: 'select-one', label: 'Melhor dia de vencimento', options: opts(...range(1, 31)) }), null],
  ['53 label RG', f({ label: 'RG' }), 'rg'],
  ['54 Órgão emissor do RG', f({ label: 'Órgão emissor do RG' }), null],
  ['55 Data de expedição do RG type=date', f({ type: 'date', label: 'Data de expedição do RG' }), null],
  ['56 PIS/PASEP', f({ label: 'PIS/PASEP' }), 'pis'],
  ['57 Título de eleitor', f({ label: 'Título de eleitor' }), 'tituloEleitor'],
  ['58 Título (job title)', f({ label: 'Título' }), null],
  ['59 type=search', f({ type: 'search', label: 'Buscar' }), 'ignorar'],
  ['60 recaptcha textarea', f({ tag: 'textarea', type: 'textarea', name: 'g-recaptcha-response' }), 'ignorar'],
  ['61 Código de indicação (design 1c)', f({ name: 'ref_code', label: 'Código de indicação' }), null],
  ['62 Como nos conheceu? (design 1c)', f({ tag: 'select', type: 'select-one', id: 'origem', label: 'Como nos conheceu?', options: opts('Google', 'Instagram') }), null],
  ['63 select Sexo', f({ tag: 'select', type: 'select-one', label: 'Sexo', options: opts(['F', 'Feminino'], ['M', 'Masculino']) }), 'sexo'],
  ['64 select Gênero', f({ tag: 'select', type: 'select-one', label: 'Gênero', options: opts('Feminino', 'Masculino', 'Prefiro não dizer') }), 'sexo'],
  ['65 type=number CEP', f({ type: 'number', label: 'CEP' }), 'cep'],
  ['66 type=number Nome (incompatible)', f({ type: 'number', label: 'Nome' }), null],
  ['67 Telefone fixo', f({ label: 'Telefone fixo' }), null],
  ['68 bracketed name street_number', f({ name: 'customer[address][street_number]' }), 'numeroEndereco'],
  ['69 billingAddressLine2', f({ name: 'billingAddressLine2' }), 'complemento'],
  ['70 phone_number', f({ name: 'phone_number' }), 'celular'],
  ['71 Número do documento', f({ label: 'Número do documento' }), 'cpf'],
  ['72 Login', f({ label: 'Login' }), 'usuario'],
  ['73 email placeholder example', f({ label: 'Seu melhor contato', placeholder: 'nome@exemplo.com.br' }), 'email'],
  ['74 Angular Material id + label', f({ id: 'mat-input-3', label: 'CPF' }), 'cpf'],
  ['75 nothing at all', f({ name: 'field_7' }), null],
  ['76 aria-label only', f({ ariaLabel: 'Bairro' }), 'bairro'],
  ['77 Cidade/UF combined label', f({ label: 'Cidade / UF' }), 'cidadeUf'],
  ['78 Data de validade do documento', f({ label: 'Data de validade do documento' }), null],
  ['79 Inscrição estadual', f({ label: 'Inscrição estadual' }), null],
  ['80 E-mail corporativo', f({ label: 'E-mail corporativo', type: 'email' }), 'email'],
]

describe('classificarCampo', () => {
  test.each(CASOS)('campo %s', (_, d, esperado) => {
    const r = classificarCampo(d)
    expect(r ? r.kind : null).toBe(esperado)
  })
})

const kindsOf = (ds: FieldDescriptor[]) =>
  classificarFormulario(ds, HOJE).map((r) => (r ? r.kind : null))

describe('classificarFormulario', () => {
  test('form F1 Nome + Sobrenome → primeiroNome/sobrenome', () => {
    expect(kindsOf([f({ label: 'Nome' }), f({ label: 'Sobrenome' })])).toEqual([
      'primeiroNome',
      'sobrenome',
    ])
  })

  test('form F2 address block resolves bare Número to numeroEndereco, sem dica incluirNumero', () => {
    const r = classificarFormulario(
      [
        f({ label: 'CEP' }),
        f({ label: 'Rua' }),
        f({ label: 'Número' }),
        f({ label: 'Complemento' }),
      ],
      HOJE,
    )
    expect(r.map((x) => x?.kind)).toEqual([
      'cep',
      'logradouro',
      'numeroEndereco',
      'complemento',
    ])
    expect(r[1]?.dicas).toBeUndefined()
  })

  test('form F3 card block: Número/Nome/Validade/CVV', () => {
    expect(
      kindsOf([
        f({ label: 'Número', maxLength: 19, section: 'Pagamento' }),
        f({ label: 'Nome', section: 'Pagamento' }),
        f({ label: 'Validade' }),
        f({ label: 'CVV' }),
      ]),
    ).toEqual(['cartaoNumero', 'cartaoNome', 'cartaoValidade', 'cartaoCvv'])
  })

  test('form F4 two plain e-mail fields → second is confirmation', () => {
    expect(
      kindsOf([
        f({ type: 'email', label: 'E-mail' }),
        f({ type: 'email', label: 'E-mail' }),
      ]),
    ).toEqual(['email', 'emailConfirmacao'])
  })

  test('form F5 two bare passwords → senha + confirmação', () => {
    expect(kindsOf([f({ type: 'password' }), f({ type: 'password' })])).toEqual(
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
    expect(kindsOf(ds)).toEqual([
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
    expect(kindsOf(ds)).toEqual([
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
    expect(kindsOf(ds)).toEqual(['cartaoValidadeMes', 'cartaoValidadeAno'])
  })

  test('form F9 DDD + Telefone → celular gets semDdd hint', () => {
    const r = classificarFormulario(
      [
        f({ label: 'DDD', maxLength: 2 }),
        f({ label: 'Telefone', maxLength: 10 }),
      ],
      HOJE,
    )
    expect(r.map((x) => x?.kind)).toEqual(['ddd', 'celular'])
    expect(r[0]?.dicas).toBeUndefined()
    expect(r[1]?.dicas).toEqual({ semDdd: true })
  })

  test('form F10 PJ section: Nome → razaoSocial', () => {
    expect(
      kindsOf([
        f({ label: 'Nome', section: 'Dados da empresa' }),
        f({ label: 'CNPJ', section: 'Dados da empresa' }),
      ]),
    ).toEqual(['razaoSocial', 'cnpj'])
  })

  test('form F11 CPF ou CNPJ in a company-only form → cnpj', () => {
    expect(
      kindsOf([
        f({ label: 'Razão social' }),
        f({ label: 'CPF ou CNPJ', maxLength: 18 }),
      ]),
    ).toEqual(['razaoSocial', 'cnpj'])
  })

  test('form F12 Endereço without número field → incluirNumero hint', () => {
    const r = classificarFormulario(
      [f({ label: 'CEP' }), f({ label: 'Endereço' }), f({ label: 'Cidade' })],
      HOJE,
    )
    expect(r.map((x) => x?.kind)).toEqual(['cep', 'logradouro', 'cidade'])
    expect(r[1]?.dicas).toEqual({ incluirNumero: true })
    expect(r[0]?.dicas).toBeUndefined()
    expect(r[2]?.dicas).toBeUndefined()
  })

  test('form F13 card holder CPF stays cpf, name next to it stays person', () => {
    expect(
      kindsOf([
        f({ label: 'Número do cartão' }),
        f({ label: 'CPF do titular' }),
        f({ label: 'Nome' }),
      ]),
    ).toEqual(['cartaoNumero', 'cpf', 'nomeCompleto'])
  })

  test('form F14 "Número" between Telefone and nothing else stays null', () => {
    expect(
      kindsOf([f({ label: 'E-mail' }), f({ label: 'Número', maxLength: 12 })]),
    ).toEqual(['email', null])
  })
})

describe('auxiliares', () => {
  test('normalizar', () => {
    expect(normalizar('txtRazaoSocial')).toBe('txt razao social')
    expect(normalizar('E-mail*:')).toBe('e mail')
    expect(normalizar('customer[address][line1]')).toBe(
      'customer address line 1',
    )
    expect(normalizar('Nº')).toBe('n')
    expect(normalizar('Número da residência')).toBe('numero da residencia')
  })

  test('campoAutocomplete grammar', () => {
    expect(campoAutocomplete('section-x shipping street-address')).toBe(
      'street-address',
    )
    expect(campoAutocomplete('billing mobile tel')).toBe('tel')
    expect(campoAutocomplete('email webauthn')).toBe('email')
    expect(campoAutocomplete('off')).toBe('off')
    expect(campoAutocomplete('')).toBeNull()
  })
})

describe('confiança e via', () => {
  test('autocomplete vale 1 e diz a via', () => {
    expect(classificarCampo(f({ autocomplete: 'postal-code' }))).toEqual({
      kind: 'cep',
      confianca: 1,
      via: 'autocomplete',
    })
  })

  test('resolvido pelo contexto fica entre 0,75 e 0,85', () => {
    const [nome] = classificarFormulario([f({ label: 'Nome' })], HOJE)
    expect(nome).toEqual({
      kind: 'nomeCompleto',
      confianca: 0.8,
      via: 'contexto',
    })
  })

  test('duas fontes que concordam ganham bônus, com teto 0,99', () => {
    const r = classificarCampo(f({ label: 'CEP', name: 'cep', id: 'cep' }))
    expect(r?.confianca).toBe(0.99)
    expect(r?.via).toBe('label')
  })
})

describe('telefone fixo nunca recebe o celular', () => {
  test.each([
    [
      'label Telefone fixo em type=tel',
      f({ type: 'tel', label: 'Telefone fixo' }),
    ],
    [
      'label Telefone residencial em type=tel',
      f({ type: 'tel', label: 'Telefone residencial' }),
    ],
    ['name tel_comercial', f({ name: 'tel_comercial' })],
    [
      'autocomplete tel com label fixo',
      f({ autocomplete: 'tel', label: 'Telefone fixo' }),
    ],
    ['autocomplete home tel', f({ type: 'tel', autocomplete: 'home tel' })],
    [
      'autocomplete work tel-national',
      f({ type: 'tel', autocomplete: 'work tel-national' }),
    ],
    [
      'placeholder de telefone com label fixo',
      f({ label: 'Fixo', placeholder: '(00) 0000-0000' }),
    ],
  ])('%s → não reconhecido', (_, d) => {
    expect(classificarCampo(d)).toBeNull()
  })

  test('celular e o DDD do fixo continuam reconhecidos', () => {
    expect(
      classificarCampo(f({ type: 'tel', autocomplete: 'mobile tel' }))?.kind,
    ).toBe('celular')
    expect(
      classificarCampo(f({ autocomplete: 'home tel-area-code' }))?.kind,
    ).toBe('ddd')
    expect(classificarCampo(f({ label: 'Endereço comercial' }))?.kind).toBe(
      'logradouro',
    )
  })
})

describe('UF e número do RG nunca recebem o endereço', () => {
  test.each([
    ['UF do RG', f({ label: 'UF do RG', maxLength: 2 })],
    ['UF de expedição', f({ label: 'UF de expedição' })],
    [
      'UF emissora (select)',
      f({
        tag: 'select',
        type: 'select-one',
        label: 'UF emissora',
        options: UFS,
      }),
    ],
    ['Estado emissor', f({ label: 'Estado emissor' })],
  ])('%s → não reconhecido', (_, d) => {
    expect(classificarCampo(d)).toBeNull()
  })

  test('UF e Número soltos dentro de um fieldset RG ficam não reconhecidos', () => {
    const ds = [
      f({ label: 'CEP' }),
      f({ label: 'UF', maxLength: 2 }),
      f({ label: 'RG', section: 'Documento de identidade (RG)' }),
      f({ label: 'Número', section: 'RG' }),
      f({ label: 'Órgão emissor', section: 'RG' }),
      f({
        tag: 'select',
        type: 'select-one',
        label: 'UF',
        section: 'RG',
        options: UFS,
      }),
    ]
    expect(kindsOf(ds)).toEqual(['cep', 'uf', 'rg', null, null, null])
  })
})

describe('sem ano fixo: o ano vem de hojeISO', () => {
  const validade = f({
    tag: 'select',
    type: 'select-one',
    name: 'ano',
    options: opts(...range(2031, 2041)),
  })
  const nascimento = f({
    tag: 'select',
    type: 'select-one',
    name: 'ano',
    options: opts(...range(2013, 1931)),
  })

  test('em janeiro de 2031, anos 2031..2041 são validade e 1931..2013 são nascimento', () => {
    expect(kindsOf2031([validade])).toEqual(['cartaoValidadeAno'])
    expect(kindsOf2031([nascimento])).toEqual(['nascimentoAno'])
  })

  test('anos 2025..2035 são validade em 2026 e deixam de ser em 2031', () => {
    const d = f({
      tag: 'select',
      type: 'select-one',
      name: 'ano',
      options: opts(...range(2025, 2035)),
    })
    expect(kindsOf([d])).toEqual(['cartaoValidadeAno'])
    expect(kindsOf2031([d])).toEqual([null])
  })

  test('hojeISO inválido lança', () => {
    expect(() =>
      classificarFormulario([f({ label: 'CPF' })], '01/10/2026'),
    ).toThrow()
  })

  function kindsOf2031(ds: FieldDescriptor[]) {
    return classificarFormulario(ds, '2031-01-15').map((r) =>
      r ? r.kind : null,
    )
  }
})
