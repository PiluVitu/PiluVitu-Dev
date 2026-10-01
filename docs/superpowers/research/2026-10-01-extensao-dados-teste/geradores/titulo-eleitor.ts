import { type Rng, rngPadrao, digitosAleatorios } from './aleatorio'
import { type UF, CODIGO_UF_TITULO } from './uf'

export type RegraTitulo = 'com-excecao-sp-mg' | 'sem-excecao'

function dv(resto: number, codigoUf: string, regra: RegraTitulo): number {
  if (resto === 10) return 0
  if (
    resto === 0 &&
    regra === 'com-excecao-sp-mg' &&
    (codigoUf === '01' || codigoUf === '02')
  )
    return 1
  return resto
}

export function dvsTitulo(
  sequencial: number[],
  codigoUf: string,
  regra: RegraTitulo,
): [number, number] {
  const r1 = sequencial.reduce((acc, d, i) => acc + d * (i + 2), 0) % 11
  const dv1 = dv(r1, codigoUf, regra)
  const [u1, u2] = codigoUf.split('').map(Number)
  const r2 = (u1 * 7 + u2 * 8 + dv1 * 9) % 11
  return [dv1, dv(r2, codigoUf, regra)]
}

// Gera só números válidos nas DUAS leituras da regra (com e sem a exceção SP/MG),
// porque validadores populares divergem nesse ponto.
export function gerarTituloEleitor(
  rng: Rng = rngPadrao,
  uf: UF | 'ZZ' = 'SP',
): string {
  const codigo = CODIGO_UF_TITULO[uf]
  for (;;) {
    const seq = digitosAleatorios(rng, 8)
    if (seq.every((d) => d === 0)) continue
    const a = dvsTitulo(seq, codigo, 'com-excecao-sp-mg')
    const b = dvsTitulo(seq, codigo, 'sem-excecao')
    if (a[0] !== b[0] || a[1] !== b[1]) continue
    const s = `${seq.join('')}${codigo}${a.join('')}`
    return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8)}`
  }
}

export function validarTituloEleitor(
  valor: string,
  regra: RegraTitulo = 'com-excecao-sp-mg',
): boolean {
  const s = valor.replace(/\D/g, '')
  if (s.length !== 12) return false
  const codigo = s.slice(8, 10)
  const n = Number(codigo)
  if (n < 1 || n > 28) return false
  const seq = s.slice(0, 8).split('').map(Number)
  const [d1, d2] = dvsTitulo(seq, codigo, regra)
  return Number(s[10]) === d1 && Number(s[11]) === d2
}
