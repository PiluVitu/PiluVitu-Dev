import { type Rng, rngPadrao, digitosAleatorios, escolher } from './aleatorio'

export interface Celular {
  ddd: string
  numero: string
  formatado: string
  digitos: string
  e164: string
}

export function gerarCelular(rng: Rng = rngPadrao, ddd = '11'): Celular {
  if (!/^[1-9][1-9]$/.test(ddd))
    throw new Error(`gerarCelular: DDD inválido "${ddd}"`)
  const assinante = `9${escolher(rng, [6, 7, 8, 9])}${digitosAleatorios(rng, 7).join('')}`
  const numero = `${assinante.slice(0, 5)}-${assinante.slice(5)}`
  return {
    ddd,
    numero,
    formatado: `(${ddd}) ${numero}`,
    digitos: `${ddd}${assinante}`,
    e164: `+55${ddd}${assinante}`,
  }
}
