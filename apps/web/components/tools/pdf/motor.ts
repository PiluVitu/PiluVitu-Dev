import type { MotivoDoErroDePdf } from '@piluvitu/tools/pdf-regras'

export type PedidoAoWorker =
  | { tipo: 'analisar'; id: number; arquivo: Blob }
  | { tipo: 'mesclar'; arquivos: Blob[] }

export type RespostaDoWorker =
  | { tipo: 'analisado'; id: number; paginas: number }
  | { tipo: 'recusado'; id: number; motivo: MotivoDoErroDePdf }
  | { tipo: 'andamento'; fracao: number; arquivo: number | null }
  | { tipo: 'mesclado'; bytes: ArrayBuffer }
  | {
      tipo: 'falhou'
      motivo: MotivoDoErroDePdf | 'inesperado'
      indice?: number
    }

export type ResultadoDaAnalise =
  | { ok: true; paginas: number }
  | { ok: false; motivo: MotivoDoErroDePdf }

export type AndamentoDaMesclagem = { fracao: number; arquivo: number | null }

export type FalhaDaMesclagem = {
  motivo: MotivoDoErroDePdf | 'inesperado' | 'cancelado'
  indice?: number
}

export interface MotorDePdf {
  analisar(arquivo: Blob): Promise<ResultadoDaAnalise>
  /** Rejeita com {@link FalhaDaMesclagem}. */
  mesclar(
    arquivos: Blob[],
    aoAndar: (andamento: AndamentoDaMesclagem) => void,
  ): Promise<Blob>
  cancelar(): void
  encerrar(): void
}

export function ehFalhaDaMesclagem(erro: unknown): erro is FalhaDaMesclagem {
  return typeof erro === 'object' && erro !== null && 'motivo' in erro
}

type MesclagemPendente = {
  resolver: (pdf: Blob) => void
  rejeitar: (falha: FalhaDaMesclagem) => void
  aoAndar: (andamento: AndamentoDaMesclagem) => void
}

// O pdf-lib só é baixado quando o Worker nasce, na primeira análise: o resto do site não paga por ele.
export function criarMotorComWorker(novoWorker: () => Worker): MotorDePdf {
  let worker: Worker | null = null
  let proximoId = 0
  const analises = new Map<
    number,
    { arquivo: Blob; resolver: (r: ResultadoDaAnalise) => void }
  >()
  let mesclagem: MesclagemPendente | null = null

  function aoResponder({ data }: MessageEvent<RespostaDoWorker>) {
    switch (data.tipo) {
      case 'analisado':
      case 'recusado': {
        const analise = analises.get(data.id)
        analises.delete(data.id)
        analise?.resolver(
          data.tipo === 'analisado'
            ? { ok: true, paginas: data.paginas }
            : { ok: false, motivo: data.motivo },
        )
        return
      }
      case 'andamento':
        mesclagem?.aoAndar({ fracao: data.fracao, arquivo: data.arquivo })
        return
      case 'mesclado':
        mesclagem?.resolver(new Blob([data.bytes], { type: 'application/pdf' }))
        mesclagem = null
        return
      case 'falhou':
        mesclagem?.rejeitar({ motivo: data.motivo, indice: data.indice })
        mesclagem = null
    }
  }

  function derrubar() {
    worker?.terminate()
    worker = null
  }

  function aoQuebrar() {
    derrubar()
    for (const { resolver } of analises.values()) {
      resolver({ ok: false, motivo: 'corrompido' })
    }
    analises.clear()
    mesclagem?.rejeitar({ motivo: 'inesperado' })
    mesclagem = null
  }

  function enviar(pedido: PedidoAoWorker) {
    if (!worker) {
      worker = novoWorker()
      worker.addEventListener('message', aoResponder)
      worker.addEventListener('error', aoQuebrar)
    }
    worker.postMessage(pedido)
  }

  return {
    analisar(arquivo) {
      return new Promise((resolver) => {
        const id = proximoId++
        analises.set(id, { arquivo, resolver })
        enviar({ tipo: 'analisar', id, arquivo })
      })
    },
    mesclar(arquivos, aoAndar) {
      return new Promise((resolver, rejeitar) => {
        mesclagem?.rejeitar({ motivo: 'cancelado' })
        mesclagem = { resolver, rejeitar, aoAndar }
        enviar({ tipo: 'mesclar', arquivos })
      })
    },
    cancelar() {
      if (!mesclagem) return
      derrubar()
      mesclagem.rejeitar({ motivo: 'cancelado' })
      mesclagem = null
      for (const [id, { arquivo }] of analises) {
        enviar({ tipo: 'analisar', id, arquivo })
      }
    },
    encerrar() {
      derrubar()
      analises.clear()
      mesclagem = null
    },
  }
}
