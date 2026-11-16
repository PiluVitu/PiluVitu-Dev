export const TETO_TOTAL_EM_BYTES = 100_000_000

export const NOME_PADRAO_DO_PDF_FINAL = 'mesclado.pdf'

export type MotivoDoErroDePdf =
  | 'nao_e_pdf'
  | 'protegido'
  | 'corrompido'
  | 'sem_paginas'

const PESO_DA_LEITURA = 0.9

export function fracaoDaMesclagem(
  tamanhos: readonly number[],
  concluidos: number,
  salvando = false,
): number {
  if (salvando) return PESO_DA_LEITURA
  const total = tamanhos.reduce((soma, t) => soma + t, 0)
  if (total === 0) return 0
  const feito = tamanhos
    .slice(0, Math.max(0, concluidos))
    .reduce((soma, t) => soma + t, 0)
  return (PESO_DA_LEITURA * feito) / total
}

export function cabemNoTeto(
  jaUsados: number,
  novos: readonly number[],
  teto = TETO_TOTAL_EM_BYTES,
): boolean[] {
  let usados = jaUsados
  return novos.map((tamanho) => {
    if (usados + tamanho > teto) return false
    usados += tamanho
    return true
  })
}

const PROIBIDOS_NO_NOME = /[\u0000-\u001f\u007f<>:"/\\|?*]/g
const LIMITE_DO_NOME = 120

export function nomeDoPdfFinal(entrada: string): string {
  const base = entrada
    .replace(PROIBIDOS_NO_NOME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, LIMITE_DO_NOME)
    .trim()
  return base ? `${base}.pdf` : NOME_PADRAO_DO_PDF_FINAL
}
