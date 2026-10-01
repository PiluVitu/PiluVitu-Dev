import { sfc32 } from './prng'
import type { Rng } from './aleatorio'
import { gerarPessoa } from './pessoa'
import { validarCPF } from './cpf'
import { validarCNPJ } from './cnpj'
import { validarRG } from './rg'
import { validarPIS } from './pis'
import { validarTituloEleitor } from './titulo-eleitor'
import { CODIGO_UF_TITULO, REGIAO_FISCAL_CPF, UFS } from './uf'
import { gerarNascimento, calcularIdade, lerDataISO } from './nascimento'
import { gerarSenha, senhaAtendeRegrasComuns } from './senha'
import { gerarCelular } from './celular'
import { LOGRADOUROS, sortearNumero } from './endereco'
import { CARTOES_TESTE, gerarCartao, luhnValido } from './cartao'
import { nomeNoCartao, removerAcentos, slugNome } from './nome'

const seeds = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    sfc32(i, i * 31, i * 17 + 3, 0x9e3779b9 ^ i),
  )
const minimo: Rng = { int: () => 0 }
const maximo: Rng = { int: (n) => n - 1 }

describe('gerarPessoa', () => {
  test('pessoa dourada: semente (1,2,3,4) em 2026-10-01', () => {
    const p = gerarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')
    expect(p.nome.completo).toBe('Vinícius Oliveira Costa')
    expect(p.nascimento).toEqual({
      iso: '1993-05-29',
      br: '29/05/1993',
      idade: 33,
    })
    expect(p.cpf).toBe('647.692.234-39')
    expect(p.rg.numero).toBe('25.547.934-7')
    expect(p.pis).toBe('161.51127.87-1')
    expect(p.tituloEleitor).toBe('6080 6730 1600')
    expect(p.celular.formatado).toBe('(84) 99114-8037')
    expect(p.email.endereco).toBe('vinicius.costa.6607@tuamaeaquelaursa.com')
    expect(p.senha).toBe('qYk7cZwagiS&$L')
    expect(p.endereco).toMatchObject({
      cep: '59090-000',
      numero: '3360',
      cidade: 'Natal',
      uf: 'RN',
    })
    expect(p.empresa).toEqual({
      razaoSocial: 'Oliveira & Costa Engenharia Ltda',
      nomeFantasia: 'Costa Tech',
      cnpj: '85.697.406/0001-28',
    })
    expect(p.cartao).toMatchObject({
      numero: '4242424242424242',
      titular: 'VINICIUS O COSTA',
      validade: '07/30',
      cvv: '345',
    })
  })

  test('mesma semente ⇒ mesma pessoa', () => {
    expect(gerarPessoa(sfc32(9, 8, 7, 6), '2026-10-01')).toEqual(
      gerarPessoa(sfc32(9, 8, 7, 6), '2026-10-01'),
    )
  })

  test('1000 sementes: todo documento válido e todo campo coerente', () => {
    for (const r of seeds(1000)) {
      const p = gerarPessoa(r, '2026-10-01')
      expect(validarCPF(p.cpf)).toBe(true)
      expect(validarRG(p.rg.numero)).toBe(true)
      expect(validarPIS(p.pis)).toBe(true)
      expect(validarCNPJ(p.empresa.cnpj)).toBe(true)
      expect(validarTituloEleitor(p.tituloEleitor, 'sem-excecao')).toBe(true)
      expect(validarTituloEleitor(p.tituloEleitor, 'com-excecao-sp-mg')).toBe(
        true,
      )
      expect(luhnValido(p.cartao.numero)).toBe(true)

      expect(Number(p.cpf[10])).toBe(REGIAO_FISCAL_CPF[p.endereco.uf])
      expect(p.tituloEleitor.replace(/\s/g, '').slice(8, 10)).toBe(
        CODIGO_UF_TITULO[p.endereco.uf],
      )
      expect(p.celular.ddd).toBe(p.endereco.ddd)
      const faixa = LOGRADOUROS.find((l) => l.cep === p.endereco.cep)!.numeracao
      const numero = Number(p.endereco.numero)
      expect(numero >= faixa.min && numero <= faixa.max).toBe(true)
      if (faixa.lado !== 'ambos')
        expect(numero % 2).toBe(faixa.lado === 'par' ? 0 : 1)
      expect(p.email.usuario).toBe(
        `${slugNome(p.nome.prenome.split(' ')[0])}.${slugNome(p.nome.sobrenomes[1])}.${p.email.usuario.slice(-4)}`,
      )
      expect(p.email.usuario).toMatch(/^[a-z]+\.[a-z]+\.\d{4}$/)
      expect(p.email.caixaUrl).toBe(
        `https://tuamaeaquelaursa.com/${p.email.usuario}`,
      )
      expect(p.empresa.razaoSocial).toBe(
        `${p.nome.sobrenomes[0]} & ${p.nome.sobrenomes[1]} ${p.empresa.razaoSocial.split(' ').slice(3, -1).join(' ')} Ltda`,
      )
      expect(p.cartao.titular).toBe(p.nome.noCartao)
      expect(p.nascimento.idade).toBeGreaterThanOrEqual(18)
    }
  })
})

describe('nascimento', () => {
  test('limites em 2026-10-01: mais novo faz 18 hoje, mais velho tem 65', () => {
    expect(gerarNascimento(maximo, '2026-10-01')).toEqual({
      iso: '2008-10-01',
      br: '01/10/2008',
      idade: 18,
    })
    expect(gerarNascimento(minimo, '2026-10-01')).toEqual({
      iso: '1960-10-02',
      br: '02/10/1960',
      idade: 65,
    })
  })

  test('hoje em 29/02: limites caem em 28/02 e 01/03', () => {
    expect(gerarNascimento(maximo, '2028-02-29').iso).toBe('2010-02-28')
    expect(gerarNascimento(minimo, '2028-02-29').iso).toBe('1962-03-01')
  })

  test('nascido em 29/02 só faz aniversário em 01/03 nos anos não bissextos', () => {
    expect(
      calcularIdade(lerDataISO('2008-02-29'), lerDataISO('2026-02-28')),
    ).toBe(17)
    expect(
      calcularIdade(lerDataISO('2008-02-29'), lerDataISO('2026-03-01')),
    ).toBe(18)
  })

  test('idade em [18, 65] para todo dia de 2024 a 2032', () => {
    const rs = seeds(3)
    for (
      let t = Date.UTC(2024, 0, 1);
      t <= Date.UTC(2032, 11, 31);
      t += 86_400_000
    ) {
      const hoje = new Date(t).toISOString().slice(0, 10)
      for (const r of [minimo, maximo, ...rs]) {
        const n = gerarNascimento(r, hoje)
        expect(n.idade).toBeGreaterThanOrEqual(18)
        expect(n.idade).toBeLessThanOrEqual(65)
        expect(n.iso < hoje).toBe(true)
      }
    }
  })

  test('rejeita data inexistente', () => {
    expect(() => gerarNascimento(minimo, '2026-02-30')).toThrow()
  })
})

describe('senha', () => {
  test('1000 sementes atendem maiúscula, minúscula, dígito, símbolo, 12-16, começa com letra', () => {
    for (const r of seeds(1000)) {
      const s = gerarSenha(r)
      expect(s).toHaveLength(14)
      expect(senhaAtendeRegrasComuns(s)).toBe(true)
      expect(s).not.toMatch(/[0O1lI]/)
    }
  })

  test('respeita os tamanhos 12 e 16 e recusa fora disso', () => {
    expect(gerarSenha(sfc32(1, 1, 1, 1), 12)).toHaveLength(12)
    expect(gerarSenha(sfc32(1, 1, 1, 1), 16)).toHaveLength(16)
    expect(() => gerarSenha(sfc32(1, 1, 1, 1), 8)).toThrow()
  })
})

describe('celular', () => {
  test('formato (DD) 9XXXX-XXXX, E.164 e DDD preservado', () => {
    for (const r of seeds(200)) {
      const c = gerarCelular(r, '84')
      expect(c.formatado).toMatch(/^\(84\) 9[6-9]\d{3}-\d{4}$/)
      expect(c.e164).toMatch(/^\+55849[6-9]\d{7}$/)
    }
  })

  test('DDD inválido lança', () => {
    expect(() => gerarCelular(minimo, '10')).toThrow()
  })
})

describe('catálogo de logradouros', () => {
  test('cobre as 27 UFs, CEPs únicos, formatos corretos', () => {
    expect(new Set(LOGRADOUROS.map((l) => l.uf))).toEqual(new Set(UFS))
    expect(new Set(LOGRADOUROS.map((l) => l.cep)).size).toBe(LOGRADOUROS.length)
    for (const l of LOGRADOUROS) {
      expect(l.cep).toMatch(/^\d{5}-\d{3}$/)
      expect(l.ddd).toMatch(/^[1-9][1-9]$/)
      expect(l.numeracao.min).toBeLessThanOrEqual(l.numeracao.max)
    }
  })

  test.each(LOGRADOUROS.map((l) => [l.cep, l.numeracao] as const))(
    'número dentro da faixa do CEP %s',
    (_, faixa) => {
      for (const r of [minimo, maximo, ...seeds(50)]) {
        const n = sortearNumero(r, faixa)
        expect(n).toBeGreaterThanOrEqual(faixa.min)
        expect(n).toBeLessThanOrEqual(faixa.max)
        if (faixa.lado === 'par') expect(n % 2).toBe(0)
        if (faixa.lado === 'impar') expect(n % 2).toBe(1)
      }
    },
  )
})

describe('cartão de teste', () => {
  test.each(
    CARTOES_TESTE.map((c) => [c.gateway, c.bandeira, c.numero] as const),
  )('%s %s %s passa no Luhn', (_, __, numero) => {
    expect(luhnValido(numero)).toBe(true)
  })

  test('validade sempre futura em relação a hoje, CVV com 3 dígitos (4 na Amex)', () => {
    for (const r of seeds(300)) {
      const c = gerarCartao(r, '2026-10-01', 'MARIA E SOUZA', {
        bandeiras: ['visa', 'mastercard', 'amex'],
      })
      const [mm, aa] = c.validade.split('/').map(Number)
      expect(2000 + aa > 2026 || (2000 + aa === 2026 && mm >= 10)).toBe(true)
      expect(c.cvv).toMatch(c.bandeira === 'amex' ? /^\d{4}$/ : /^\d{3}$/)
    }
  })

  test('gateway com dados fixos impõe validade, CVV e titular', () => {
    const c = gerarCartao(minimo, '2026-10-01', 'MARIA E SOUZA', {
      gateway: 'mercadopago',
    })
    expect(c).toMatchObject({ validade: '11/30', cvv: '123', titular: 'APRO' })
  })

  test('sem candidato lança', () => {
    expect(() =>
      gerarCartao(minimo, '2026-10-01', 'X', {
        gateway: 'pagarme',
        bandeiras: ['elo'],
      }),
    ).toThrow()
  })
})

describe('nome', () => {
  test('remove acentos e cedilha', () => {
    expect(removerAcentos('Conceição Araújo Tânia Júlia')).toBe(
      'Conceicao Araujo Tania Julia',
    )
    expect(slugNome('Luíza')).toBe('luiza')
  })

  test('nome impresso: primeiro nome, iniciais do meio, último sobrenome', () => {
    expect(nomeNoCartao('Maria Eduarda', ['Souza', 'Ribeiro'])).toBe(
      'MARIA E S RIBEIRO',
    )
    expect(nomeNoCartao('Beatriz', ['Araújo', 'Conceição'])).toBe(
      'BEATRIZ A CONCEICAO',
    )
  })
})
