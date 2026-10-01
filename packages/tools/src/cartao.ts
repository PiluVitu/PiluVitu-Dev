import { type Rng, rngPadrao, escolher } from './aleatorio'
import { lerDataISO } from './nascimento'

export type Bandeira = 'visa' | 'mastercard'

// Números de docs.stripe.com/testing: só eles aprovam em sandbox, e um número
// aleatório que passa no Luhn pode ser o de um cartão real.
export const CARTOES_TESTE: readonly { bandeira: Bandeira; numero: string }[] =
  [
    { bandeira: 'visa', numero: '4242424242424242' },
    { bandeira: 'mastercard', numero: '5555555555554444' },
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
  return numero.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export interface Cartao {
  bandeira: Bandeira
  numero: string
  numeroFormatado: string
  titular: string
  validade: string
  mes: string
  ano: string
  cvv: string
}

export function gerarCartao(
  rng: Rng = rngPadrao,
  hojeISO: string,
  titular: string,
): Cartao {
  const c = escolher(rng, CARTOES_TESTE)
  const hoje = lerDataISO(hojeISO)
  const meses = hoje.ano * 12 + (hoje.mes - 1) + 12 + rng.int(48)
  const mes = String((meses % 12) + 1).padStart(2, '0')
  const ano = String(Math.floor(meses / 12) % 100).padStart(2, '0')
  return {
    bandeira: c.bandeira,
    numero: c.numero,
    numeroFormatado: formatarNumeroCartao(c.numero),
    titular,
    validade: `${mes}/${ano}`,
    mes,
    ano,
    cvv: String(100 + rng.int(900)),
  }
}
