import { type FieldDescriptor } from './campos'
import { caber, escolherOpcao, valorPara } from './campos-formatar'
import type { Pessoa } from './pessoa'

// A pessoa dourada (gerarPessoa(sfc32(1,2,3,4), '2026-10-01')) escrita por extenso:
// os testes de formatação não dependem dos geradores.
const P: Pessoa = {
  nome: {
    sexo: 'M',
    prenome: 'Vinícius',
    sobrenomes: ['Oliveira', 'Costa'],
    completo: 'Vinícius Oliveira Costa',
    noCartao: 'VINICIUS O COSTA',
  },
  nascimento: { iso: '1993-05-29', br: '29/05/1993', idade: 33 },
  cpf: '647.692.234-39',
  rg: { numero: '25.547.934-7', orgaoEmissor: 'SSP', uf: 'SP' },
  pis: '161.51127.87-1',
  tituloEleitor: '6080 6730 1600',
  celular: {
    ddd: '84',
    numero: '99114-8037',
    formatado: '(84) 99114-8037',
    digitos: '84991148037',
    e164: '+5584991148037',
  },
  email: {
    usuario: 'vinicius-costa-6607',
    endereco: 'vinicius-costa-6607@tuamaeaquelaursa.com',
    caixaUrl: 'https://tuamaeaquelaursa.com/vinicius-costa-6607',
  },
  senha: 's7YZgw&$iLak',
  endereco: {
    cep: '59090-000',
    logradouro: 'Avenida Engenheiro Roberto Freire',
    bairro: 'Ponta Negra',
    cidade: 'Natal',
    uf: 'RN',
    ddd: '84',
    numero: '3360',
    complemento: 'Apto 74',
  },
  empresa: {
    razaoSocial: 'Oliveira & Costa Logística Ltda',
    nomeFantasia: 'Costa Digital',
    cnpj: '35.728.569/0001-52',
  },
  cartao: {
    bandeira: 'mastercard',
    numero: '5555555555554444',
    numeroFormatado: '5555 5555 5555 4444',
    titular: 'VINICIUS O COSTA',
    validade: '08/28',
    mes: '08',
    ano: '28',
    cvv: '430',
  },
}

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
const V = (
  kind: Parameters<typeof valorPara>[0],
  d: Partial<FieldDescriptor>,
  dicas = {},
  pessoa: Pessoa = P,
) => valorPara(kind, pessoa, f(d), dicas)
const sel = (options: { value: string; text: string }[]) => ({
  tag: 'select' as const,
  type: 'select-one',
  options,
})

describe('valorPara: formato por maxLength, pattern e type', () => {
  test('cpf', () => {
    expect(V('cpf', {})).toBe('647.692.234-39')
    expect(V('cpf', { maxLength: 14 })).toBe('647.692.234-39')
    expect(V('cpf', { maxLength: 11 })).toBe('64769223439')
    expect(V('cpf', { pattern: '\\d{11}' })).toBe('64769223439')
    expect(V('cpf', { type: 'number' })).toBe('64769223439')
  })

  test('cnpj, cep e cartão', () => {
    expect(V('cnpj', { maxLength: 14 })).toBe('35728569000152')
    expect(V('cnpj', { maxLength: 18 })).toBe('35.728.569/0001-52')
    expect(V('cep', { maxLength: 8 })).toBe('59090000')
    expect(V('cep', { type: 'number' })).toBe('59090000')
    expect(V('cartaoNumero', { maxLength: 16 })).toBe('5555555555554444')
    expect(V('cartaoNumero', { maxLength: 19 })).toBe('5555 5555 5555 4444')
  })

  test('celular e DDD', () => {
    expect(V('celular', {})).toBe('(84) 99114-8037')
    expect(V('celular', { maxLength: 14 })).toBe('(84)99114-8037')
    expect(V('celular', { maxLength: 11 })).toBe('84991148037')
    expect(V('celular', { maxLength: 10 }, { semDdd: true })).toBe('99114-8037')
    expect(V('celular', { maxLength: 9 }, { semDdd: true })).toBe('991148037')
    expect(V('ddd', { maxLength: 2 })).toBe('84')
  })

  test('datas', () => {
    expect(V('nascimento', { type: 'date' })).toBe('1993-05-29')
    expect(V('nascimento', { maxLength: 10 })).toBe('29/05/1993')
    expect(V('nascimento', { maxLength: 8 })).toBe('29051993')
    expect(V('cartaoValidade', {})).toBe('08/28')
    expect(V('cartaoValidade', { placeholder: 'MM/AAAA' })).toBe('08/2028')
    expect(V('cartaoValidade', { type: 'month' })).toBe('2028-08')
    expect(V('cartaoValidade', { maxLength: 4 })).toBe('0828')
    expect(V('cartaoValidadeAno', { maxLength: 2 })).toBe('28')
  })

  test('endereço', () => {
    expect(V('logradouro', {}, { incluirNumero: true })).toBe(
      'Avenida Engenheiro Roberto Freire, 3360',
    )
    expect(V('logradouro', {})).toBe('Avenida Engenheiro Roberto Freire')
    expect(V('uf', { maxLength: 2 })).toBe('RN')
    expect(V('pais', { maxLength: 2 })).toBe('BR')
    expect(V('pais', {})).toBe('Brasil')
  })

  test('kinds automáticos com o valor do contrato', () => {
    expect(V('primeiroNome', {})).toBe('Vinícius')
    expect(V('sobrenome', {})).toBe('Oliveira Costa')
    expect(V('usuario', {})).toBe('vinicius-costa-6607')
    expect(V('enderecoCompleto', {})).toBe(
      'Avenida Engenheiro Roberto Freire, 3360, Apto 74 - Ponta Negra, Natal - RN, 59090-000',
    )
    expect(V('cidadeUf', {})).toBe('Natal / RN')
    expect(V('sexo', {})).toBe('M')
    expect(V('emailConfirmacao', {})).toBe(
      'vinicius-costa-6607@tuamaeaquelaursa.com',
    )
    expect(V('senhaConfirmacao', {})).toBe('s7YZgw&$iLak')
  })

  test('documentos e empresa', () => {
    expect(V('rg', {})).toBe('25.547.934-7')
    expect(V('rg', { maxLength: 9 })).toBe('255479347')
    expect(V('pis', { maxLength: 11 })).toBe('16151127871')
    expect(V('tituloEleitor', {})).toBe('6080 6730 1600')
    expect(V('tituloEleitor', { maxLength: 12 })).toBe('608067301600')
    expect(V('razaoSocial', {})).toBe('Oliveira & Costa Logística Ltda')
    expect(V('nomeFantasia', {})).toBe('Costa Digital')
    expect(V('cartaoNome', {})).toBe('VINICIUS O COSTA')
    expect(V('cartaoCvv', {})).toBe('430')
  })

  test('senha maior que maxLength vai inteira: o campo recusa, nunca truncamos', () => {
    expect(V('senha', { type: 'password', maxLength: 8 })).toBe('s7YZgw&$iLak')
  })
})

describe('valorPara em <select>', () => {
  test('UF por valor, por nome e por token do texto', () => {
    expect(
      V(
        'uf',
        sel(
          opts(
            ['', 'Selecione'],
            ['rn', 'Rio Grande do Norte'],
            ['rj', 'Rio de Janeiro'],
          ),
        ),
      ),
    ).toBe('rn')
    expect(
      V(
        'uf',
        sel(
          opts(
            ['', 'Selecione'],
            ['20', 'Rio Grande do Norte'],
            ['19', 'Rio de Janeiro'],
          ),
        ),
      ),
    ).toBe('20')
    expect(
      V(
        'uf',
        sel(
          opts(['1', 'RJ - Rio de Janeiro'], ['2', 'RN - Rio Grande do Norte']),
        ),
      ),
    ).toBe('2')
  })

  test('país', () => {
    expect(V('pais', sel(opts(['ARG', 'Argentina'], ['BRA', 'Brasil'])))).toBe(
      'BRA',
    )
    expect(V('pais', sel(opts(['32', 'Argentina'], ['076', 'Brazil'])))).toBe(
      '076',
    )
  })

  test('partes da data e da validade', () => {
    expect(
      V(
        'nascimentoMes',
        sel(opts(['', 'Mês'], ['1', 'Janeiro'], ['4', 'Abril'], ['5', 'Maio'])),
      ),
    ).toBe('5')
    expect(
      V(
        'nascimentoMes',
        sel(opts(['abr', 'Abr'], ['mai', 'Mai'], ['jun', 'Jun'])),
      ),
    ).toBe('mai')
    expect(V('nascimentoDia', sel(opts(...range(1, 31))))).toBe('29')
    expect(V('nascimentoAno', sel(opts(...range(2026, 1926))))).toBe('1993')
    expect(V('cartaoValidadeMes', sel(opts(...range(1, 12))))).toBe('8')
    expect(V('cartaoValidadeAno', sel(opts(...range(26, 36))))).toBe('28')
    expect(V('cartaoValidadeAno', sel(opts(...range(2026, 2036))))).toBe('2028')
  })

  test('sexo tenta a sigla, o nome em português e em inglês', () => {
    const feminina: Pessoa = { ...P, nome: { ...P.nome, sexo: 'F' } }
    const s1 = sel(opts(['', '--'], ['1', 'Masculino'], ['2', 'Feminino']))
    expect(V('sexo', s1)).toBe('1')
    expect(V('sexo', s1, {}, feminina)).toBe('2')
    const s2 = sel(opts(['h', 'Homem'], ['m', 'Mulher']))
    expect(V('sexo', s2)).toBe('h')
    expect(V('sexo', s2, {}, feminina)).toBe('m')
    const s3 = sel(opts(['male', 'Male'], ['female', 'Female']))
    expect(V('sexo', s3)).toBe('male')
    expect(V('sexo', s3, {}, feminina)).toBe('female')
  })

  test('sem a opção da pessoa devolve null, nunca uma opção errada', () => {
    expect(
      V(
        'uf',
        sel(
          opts(
            ['', 'Selecione'],
            ['SP', 'São Paulo'],
            ['RJ', 'Rio de Janeiro'],
          ),
        ),
      ),
    ).toBeNull()
    expect(
      V('pais', sel(opts(['AR', 'Argentina'], ['PT', 'Portugal']))),
    ).toBeNull()
    expect(
      V(
        'cidade',
        sel(opts(['', 'Selecione'], ['1', 'Mossoró'], ['2', 'Parnamirim'])),
      ),
    ).toBeNull()
    expect(escolherOpcao(opts('Google', 'Instagram'), ['SP'])).toBeNull()
  })

  test('kind que não cabe em select devolve null', () => {
    expect(V('cpf', sel(opts('1', '2')))).toBeNull()
  })
})

describe('caber', () => {
  test('sem candidato que caiba, devolve o mais curto', () => {
    expect(
      caber(['529.982.247-25', '52998224725'], {
        maxLength: 9,
        pattern: undefined,
        type: 'text',
      }),
    ).toBe('52998224725')
  })

  test('pattern que não compila é ignorado', () => {
    expect(
      caber(['529.982.247-25', '52998224725'], {
        maxLength: null,
        pattern: '[',
        type: 'text',
      }),
    ).toBe('529.982.247-25')
  })
})
