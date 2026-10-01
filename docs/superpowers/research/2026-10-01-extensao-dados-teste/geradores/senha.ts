import { type Rng, rngPadrao, escolher, embaralhar } from './aleatorio'

export const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz'
export const DIGITOS = '23456789'
// Subconjunto de !@#$%^&*: sem ^ ~ ` ´ (teclas mortas no ABNT2), aspas, barra invertida, < > e espaço.
export const SIMBOLOS = '!@#$%&*'

const TODOS = MAIUSCULAS + MINUSCULAS + DIGITOS + SIMBOLOS

export function senhaAtendeRegrasComuns(s: string): boolean {
  return (
    s.length >= 12 &&
    s.length <= 16 &&
    /[A-Z]/.test(s) &&
    /[a-z]/.test(s) &&
    /\d/.test(s) &&
    /[!@#$%^&*]/.test(s) &&
    /^[A-Za-z]/.test(s) &&
    !/(.)\1\1/.test(s) &&
    [...s].every((c) => TODOS.includes(c))
  )
}

export function gerarSenha(rng: Rng = rngPadrao, tamanho = 14): string {
  if (tamanho < 12 || tamanho > 16)
    throw new Error('gerarSenha: tamanho fora de 12..16')
  for (;;) {
    const obrigatorios = [MAIUSCULAS, MINUSCULAS, DIGITOS, SIMBOLOS].map((c) =>
      escolher(rng, [...c]),
    )
    const resto = Array.from({ length: tamanho - 5 }, () =>
      escolher(rng, [...TODOS]),
    )
    const primeira = escolher(rng, [...MAIUSCULAS, ...MINUSCULAS])
    const s = primeira + embaralhar(rng, [...obrigatorios, ...resto]).join('')
    if (senhaAtendeRegrasComuns(s)) return s
  }
}
