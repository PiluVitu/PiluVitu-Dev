import type {
  MotivoDoErroDePdf,
  PaginaDoPlano,
} from '@piluvitu/tools/pdf-regras'

export type PedidoAoWorker =
  | { tipo: 'analisar'; id: number; arquivo: Blob }
  | { tipo: 'mesclar'; id: number; arquivos: Blob[] }
  | {
      tipo: 'organizar'
      id: number
      arquivo: Blob
      plano: readonly PaginaDoPlano[]
    }

export type RespostaDoWorker =
  | { tipo: 'analisado'; id: number; paginas: number }
  | { tipo: 'recusado'; id: number; motivo: MotivoDoErroDePdf }
  | { tipo: 'andamento'; id: number; fracao: number; arquivo: number | null }
  | { tipo: 'pronto'; id: number; bytes: ArrayBuffer }
  | {
      tipo: 'falhou'
      id: number
      motivo: MotivoDoErroDePdf | 'inesperado'
      indice?: number
    }

/** `falha_do_navegador`: o Worker caiu duas vezes lendo o arquivo (memória, script); não diz nada do PDF. */
export type MotivoDaRecusa = MotivoDoErroDePdf | 'falha_do_navegador'

export type ResultadoDaAnalise =
  | { ok: true; paginas: number }
  | { ok: false; motivo: MotivoDaRecusa }

export type AndamentoDaMesclagem = { fracao: number; arquivo: number | null }

/** Como `mesclar` e `organizar` rejeitam. `indice` é o arquivo culpado, só na mesclagem. */
export type FalhaDaOperacao = {
  motivo: MotivoDoErroDePdf | 'inesperado' | 'cancelado'
  indice?: number
}

export interface MotorDePdf {
  analisar(arquivo: Blob): Promise<ResultadoDaAnalise>
  /** Rejeita com {@link FalhaDaOperacao}. */
  mesclar(
    arquivos: Blob[],
    aoAndar: (andamento: AndamentoDaMesclagem) => void,
  ): Promise<Blob>
  /** Rejeita com {@link FalhaDaOperacao}. */
  organizar(arquivo: Blob, plano: readonly PaginaDoPlano[]): Promise<Blob>
  cancelar(): void
  encerrar(): void
}

export function ehFalhaDaOperacao(erro: unknown): erro is FalhaDaOperacao {
  return typeof erro === 'object' && erro !== null && 'motivo' in erro
}

type OperacaoPendente = {
  id: number
  resolver: (pdf: Blob) => void
  rejeitar: (falha: FalhaDaOperacao) => void
  aoAndar?: (andamento: AndamentoDaMesclagem) => void
}

// O pdf-lib só é baixado quando o Worker nasce, na primeira análise: o resto do site não paga por ele.
export function criarMotorComWorker(novoWorker: () => Worker): MotorDePdf {
  let worker: Worker | null = null
  let proximoId = 0
  const analises = new Map<
    number,
    {
      arquivo: Blob
      quedas: number
      resolver: (r: ResultadoDaAnalise) => void
    }
  >()
  let operacao: OperacaoPendente | null = null

  function aoResponder({ data }: MessageEvent<RespostaDoWorker>) {
    if (data.tipo !== 'analisado' && data.tipo !== 'recusado') {
      if (data.id !== operacao?.id) return
    }
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
        operacao?.aoAndar?.({ fracao: data.fracao, arquivo: data.arquivo })
        return
      case 'pronto':
        operacao?.resolver(new Blob([data.bytes], { type: 'application/pdf' }))
        operacao = null
        return
      case 'falhou':
        operacao?.rejeitar({ motivo: data.motivo, indice: data.indice })
        operacao = null
    }
  }

  function derrubar() {
    worker?.terminate()
    worker = null
  }

  function reenviarLeituras() {
    for (const [id, { arquivo }] of analises) {
      enviar({ tipo: 'analisar', id, arquivo })
    }
  }

  function abandonarOperacao(motivo: 'cancelado' | 'inesperado') {
    operacao?.rejeitar({ motivo })
    operacao = null
  }

  // O Worker lê na ordem de chegada: a leitura mais antiga é a que estava em curso quando ele caiu.
  function aoQuebrar() {
    derrubar()
    abandonarOperacao('inesperado')
    const [emCurso] = analises
    if (emCurso) {
      const [id, analise] = emCurso
      analise.quedas += 1
      if (analise.quedas > 1) {
        analises.delete(id)
        analise.resolver({ ok: false, motivo: 'falha_do_navegador' })
      }
    }
    reenviarLeituras()
  }

  // A fila do Worker não larga um pedido no meio: parar uma operação é derrubar o Worker.
  function cancelar() {
    if (!operacao) return
    derrubar()
    abandonarOperacao('cancelado')
    reenviarLeituras()
  }

  function enviar(pedido: PedidoAoWorker) {
    if (!worker) {
      worker = novoWorker()
      worker.addEventListener('message', aoResponder)
      worker.addEventListener('error', aoQuebrar)
    }
    worker.postMessage(pedido)
  }

  function comecar(
    pedido: (id: number) => PedidoAoWorker,
    aoAndar?: (andamento: AndamentoDaMesclagem) => void,
  ): Promise<Blob> {
    return new Promise((resolver, rejeitar) => {
      cancelar()
      const id = proximoId++
      operacao = { id, resolver, rejeitar, aoAndar }
      enviar(pedido(id))
    })
  }

  return {
    analisar(arquivo) {
      return new Promise((resolver) => {
        const id = proximoId++
        analises.set(id, { arquivo, quedas: 0, resolver })
        enviar({ tipo: 'analisar', id, arquivo })
      })
    },
    mesclar(arquivos, aoAndar) {
      return comecar((id) => ({ tipo: 'mesclar', id, arquivos }), aoAndar)
    },
    organizar(arquivo, plano) {
      return comecar((id) => ({ tipo: 'organizar', id, arquivo, plano }))
    },
    cancelar,
    encerrar() {
      derrubar()
      analises.clear()
      operacao = null
    },
  }
}
