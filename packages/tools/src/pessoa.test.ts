import { sfc32 } from './prng'
import { gerarPessoa } from './pessoa'
import { validarCPF } from './cpf'
import { validarCNPJ } from './cnpj'
import { validarRG } from './rg'
import { validarPIS } from './pis'
import { validarTituloEleitor } from './titulo-eleitor'
import { CODIGO_UF_TITULO, REGIAO_FISCAL_CPF } from './uf'
import { senhaAtendeRegrasComuns } from './senha'
import { LOGRADOUROS } from './endereco'
import { luhnValido } from './cartao'
import { slugNome } from './nome'
import { sementes } from './rng-teste'

describe('gerarPessoa', () => {
  // Snapshot de propósito: muda quando um gerador muda, e a mudança tem que ser revista aqui.
  test('pessoa dourada: semente (1,2,3,4) em 2026-10-01', () => {
    expect(gerarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')).toEqual({
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
        usuario: 'vinicius.costa.6607',
        endereco: 'vinicius.costa.6607@tuamaeaquelaursa.com',
        caixaUrl: 'https://tuamaeaquelaursa.com/vinicius.costa.6607',
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
    })
  })

  test('mesma semente ⇒ mesma pessoa', () => {
    expect(gerarPessoa(sfc32(9, 8, 7, 6), '2026-10-01')).toEqual(
      gerarPessoa(sfc32(9, 8, 7, 6), '2026-10-01'),
    )
  })

  test('1000 sementes: todo documento válido e todo campo coerente', () => {
    for (const r of sementes(1000)) {
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
      expect(senhaAtendeRegrasComuns(p.senha)).toBe(true)
      expect(p.senha).toHaveLength(12)

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
      expect(p.nascimento.idade).toBeLessThanOrEqual(65)
    }
  })
})
