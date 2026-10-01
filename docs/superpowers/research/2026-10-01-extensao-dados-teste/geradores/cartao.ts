import { type Rng, rngPadrao, escolher } from './aleatorio'
import { lerDataISO } from './nascimento'

export type Bandeira = 'visa' | 'mastercard' | 'amex' | 'elo' | 'hipercard'
export type Gateway = 'stripe' | 'adyen' | 'mercadopago' | 'pagarme' | 'pagbank'
export type Resultado = 'aprovado' | 'recusado'

export interface CartaoTeste {
  gateway: Gateway
  bandeira: Bandeira
  numero: string
  resultado: Resultado
  validade?: string
  cvv?: string
  titular?: string
}

// Números copiados das páginas oficiais de teste de cada gateway (consultadas em 2026-10-01).
// Quando o gateway exige validade/CVV/titular fixos, eles vêm junto.
export const CARTOES_TESTE: readonly CartaoTeste[] = [
  {
    gateway: 'stripe',
    bandeira: 'visa',
    numero: '4242424242424242',
    resultado: 'aprovado',
  },
  {
    gateway: 'stripe',
    bandeira: 'visa',
    numero: '4000000760000002',
    resultado: 'aprovado',
  },
  {
    gateway: 'stripe',
    bandeira: 'mastercard',
    numero: '5555555555554444',
    resultado: 'aprovado',
  },
  {
    gateway: 'stripe',
    bandeira: 'mastercard',
    numero: '2223003122003222',
    resultado: 'aprovado',
  },
  {
    gateway: 'stripe',
    bandeira: 'amex',
    numero: '378282246310005',
    resultado: 'aprovado',
  },
  {
    gateway: 'stripe',
    bandeira: 'visa',
    numero: '4000000000000002',
    resultado: 'recusado',
  },
  {
    gateway: 'adyen',
    bandeira: 'visa',
    numero: '4111111111111111',
    resultado: 'aprovado',
    validade: '03/30',
    cvv: '737',
  },
  {
    gateway: 'adyen',
    bandeira: 'mastercard',
    numero: '5555555555554444',
    resultado: 'aprovado',
    validade: '03/30',
    cvv: '737',
  },
  {
    gateway: 'adyen',
    bandeira: 'amex',
    numero: '370000000000002',
    resultado: 'aprovado',
    validade: '03/30',
    cvv: '7373',
  },
  {
    gateway: 'adyen',
    bandeira: 'elo',
    numero: '5066991111111118',
    resultado: 'aprovado',
    validade: '03/30',
    cvv: '737',
  },
  {
    gateway: 'adyen',
    bandeira: 'hipercard',
    numero: '6062828888666688',
    resultado: 'aprovado',
    validade: '03/30',
    cvv: '737',
  },
  {
    gateway: 'mercadopago',
    bandeira: 'mastercard',
    numero: '5480832801033311',
    resultado: 'aprovado',
    validade: '11/30',
    cvv: '123',
    titular: 'APRO',
  },
  {
    gateway: 'mercadopago',
    bandeira: 'visa',
    numero: '4235647728025682',
    resultado: 'aprovado',
    validade: '11/30',
    cvv: '123',
    titular: 'APRO',
  },
  {
    gateway: 'mercadopago',
    bandeira: 'amex',
    numero: '375365153556885',
    resultado: 'aprovado',
    validade: '11/30',
    cvv: '1234',
    titular: 'APRO',
  },
  {
    gateway: 'mercadopago',
    bandeira: 'visa',
    numero: '4235647728025682',
    resultado: 'recusado',
    validade: '11/30',
    cvv: '123',
    titular: 'OTHE',
  },
  {
    gateway: 'pagarme',
    bandeira: 'visa',
    numero: '4000000000000010',
    resultado: 'aprovado',
  },
  {
    gateway: 'pagarme',
    bandeira: 'visa',
    numero: '4000000000000028',
    resultado: 'recusado',
  },
  {
    gateway: 'pagbank',
    bandeira: 'visa',
    numero: '4539620659922097',
    resultado: 'aprovado',
    validade: '12/26',
    cvv: '123',
  },
  {
    gateway: 'pagbank',
    bandeira: 'mastercard',
    numero: '5240082975622454',
    resultado: 'aprovado',
    validade: '12/26',
    cvv: '123',
  },
  {
    gateway: 'pagbank',
    bandeira: 'amex',
    numero: '345817690311361',
    resultado: 'aprovado',
    validade: '12/26',
    cvv: '1234',
  },
  {
    gateway: 'pagbank',
    bandeira: 'elo',
    numero: '4514161122113757',
    resultado: 'aprovado',
    validade: '12/26',
    cvv: '123',
  },
  {
    gateway: 'pagbank',
    bandeira: 'hipercard',
    numero: '6062828598919021',
    resultado: 'aprovado',
    validade: '12/26',
    cvv: '123',
  },
  {
    gateway: 'pagbank',
    bandeira: 'visa',
    numero: '4929291898380766',
    resultado: 'recusado',
    validade: '12/26',
    cvv: '123',
  },
]

export function luhnValido(numero: string): boolean {
  const s = numero.replace(/\D/g, '')
  if (s.length < 12) return false
  let soma = 0
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    soma += d
  }
  return soma % 10 === 0
}

export function formatarNumeroCartao(numero: string): string {
  return numero.length === 15
    ? `${numero.slice(0, 4)} ${numero.slice(4, 10)} ${numero.slice(10)}`
    : numero.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export interface Cartao {
  gateway: Gateway
  bandeira: Bandeira
  numero: string
  numeroFormatado: string
  titular: string
  validade: string
  mes: string
  ano: string
  cvv: string
  resultadoEsperado: Resultado
}

export interface OpcoesCartao {
  gateway?: Gateway
  resultado?: Resultado
  bandeiras?: readonly Bandeira[]
}

export function gerarCartao(
  rng: Rng = rngPadrao,
  hojeISO: string,
  titular: string,
  {
    gateway = 'stripe',
    resultado = 'aprovado',
    bandeiras = ['visa', 'mastercard'],
  }: OpcoesCartao = {},
): Cartao {
  const candidatos = CARTOES_TESTE.filter(
    (c) =>
      c.gateway === gateway &&
      c.resultado === resultado &&
      bandeiras.includes(c.bandeira),
  )
  if (candidatos.length === 0)
    throw new Error(
      `gerarCartao: nada para ${gateway}/${resultado}/${bandeiras}`,
    )
  const c = escolher(rng, candidatos)
  const hoje = lerDataISO(hojeISO)
  const meses = hoje.ano * 12 + (hoje.mes - 1) + 12 + rng.int(48)
  const validade =
    c.validade ??
    `${String((meses % 12) + 1).padStart(2, '0')}/${String(Math.floor(meses / 12) % 100).padStart(2, '0')}`
  const tamanhoCvv = c.bandeira === 'amex' ? 4 : 3
  const cvv =
    c.cvv ??
    String(10 ** (tamanhoCvv - 1) + rng.int(9 * 10 ** (tamanhoCvv - 1)))
  const [mes, ano] = validade.split('/')
  return {
    gateway: c.gateway,
    bandeira: c.bandeira,
    numero: c.numero,
    numeroFormatado: formatarNumeroCartao(c.numero),
    titular: c.titular ?? titular,
    validade,
    mes,
    ano,
    cvv,
    resultadoEsperado: c.resultado,
  }
}
