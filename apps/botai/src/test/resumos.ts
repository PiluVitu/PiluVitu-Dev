import type { LinhaCampo, ResumoPreenchimento } from '../lib/resultado'

export const LINHAS_DO_DESIGN: LinhaCampo[] = [
  {
    documentId: 'doc-0',
    idx: 13,
    rotulo: 'Código de indicação',
    seletor: 'input[name="ref_code"]',
  },
  {
    documentId: 'doc-0',
    idx: 14,
    rotulo: 'Como nos conheceu?',
    seletor: 'select#origem',
  },
]

export function resumoDe(
  x: number,
  naoReconhecidos: LinhaCampo[] = [],
): ResumoPreenchimento {
  const k = naoReconhecidos.length
  return {
    x,
    y: x + k,
    k,
    naoReconhecidos,
    contentType: 'text/html',
    iframesDeFora: 0,
  }
}

export const RESUMO_DO_DESIGN = resumoDe(12, LINHAS_DO_DESIGN)
