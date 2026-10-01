export interface LinhaCampo {
  documentId: string
  idx: number
  rotulo: string
  seletor: string
}

export interface ResultadoFrame {
  preenchidos: Omit<LinhaCampo, 'documentId'>[]
  naoReconhecidos: Omit<LinhaCampo, 'documentId'>[]
  recusados: Omit<LinhaCampo, 'documentId'>[]
  contentType: string
  iframesDeFora: number
}

export interface ResumoPreenchimento {
  x: number
  y: number
  k: number
  naoReconhecidos: LinhaCampo[]
  contentType: string
  iframesDeFora: number
}

interface ResultadoDoFrame {
  documentId: string
  frameId: number
  result: ResultadoFrame | null | undefined
}

const SUFIXO_RECUSADO = ' (recusou o valor)'

export function somarFrames(
  resultados: ResultadoDoFrame[],
): ResumoPreenchimento {
  const validos = resultados.filter(
    (r): r is ResultadoDoFrame & { result: ResultadoFrame } => r.result != null,
  )
  const topoPrimeiro = [...validos].sort(
    (a, b) => Number(a.frameId !== 0) - Number(b.frameId !== 0),
  )
  let x = 0
  const naoReconhecidos: LinhaCampo[] = []
  for (const { documentId, result } of topoPrimeiro) {
    x += result.preenchidos.length
    const doFrame = [
      ...result.naoReconhecidos.map((l) => ({ ...l, documentId })),
      ...result.recusados.map((l) => ({
        ...l,
        documentId,
        rotulo: `${l.rotulo}${SUFIXO_RECUSADO}`,
      })),
    ].sort((a, b) => a.idx - b.idx)
    naoReconhecidos.push(...doFrame)
  }
  const topo = validos.find((r) => r.frameId === 0)?.result
  const k = naoReconhecidos.length
  return {
    x,
    y: x + k,
    k,
    naoReconhecidos,
    contentType: topo?.contentType ?? '',
    iframesDeFora: topo?.iframesDeFora ?? 0,
  }
}

export function primeiroNaoReconhecido(r: ResultadoFrame): number | undefined {
  const idxs = [...r.naoReconhecidos, ...r.recusados].map((l) => l.idx)
  return idxs.length > 0 ? Math.min(...idxs) : undefined
}
