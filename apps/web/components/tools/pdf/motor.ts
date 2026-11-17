import type {
  Formulario,
  MotivoDoErroDePdf,
  MotivoDoErroNaEdicao,
  MotivoDoErroNoCampo,
  ObjetoDaPagina,
  ObjetoImagem,
  PaginaDoPlano,
  PreenchimentoDoFormulario,
} from '@piluvitu/tools/pdf-regras'

/** A imagem aponta pelo id para o arquivo em `imagens`, para o histórico do desfazer não copiar os bytes. */
export type ObjetoImagemNaTela = Omit<ObjetoImagem, 'bytes'> & {
  readonly imagem: string
}

export type ObjetoNaTela =
  | Exclude<ObjetoDaPagina, ObjetoImagem>
  | ObjetoImagemNaTela

export type PedidoDeEdicao = {
  objetosPorPagina: ReadonlyMap<number, readonly ObjetoNaTela[]>
  imagens: ReadonlyMap<string, Blob>
  /** Apagar de verdade: o JPEG de cada página, com os retângulos de cobrir já pintados nele. */
  paginasRasterizadas: ReadonlyMap<number, Blob>
  formulario?: PreenchimentoDoFormulario
}

export type OpcoesDaAnalise = { formulario?: boolean }

export type PedidoAoWorker =
  | { tipo: 'analisar'; id: number; arquivo: Blob; formulario?: true }
  | { tipo: 'mesclar'; id: number; arquivos: Blob[] }
  | {
      tipo: 'organizar'
      id: number
      arquivo: Blob
      plano: readonly PaginaDoPlano[]
    }
  | ({ tipo: 'editar'; id: number; arquivo: Blob } & PedidoDeEdicao)

export type RespostaDoWorker =
  | {
      tipo: 'analisado'
      id: number
      paginas: number
      formulario?: Formulario
    }
  | { tipo: 'recusado'; id: number; motivo: MotivoDoErroDePdf }
  | { tipo: 'andamento'; id: number; fracao: number; arquivo: number | null }
  | { tipo: 'pronto'; id: number; bytes: ArrayBuffer }
  | ({ tipo: 'falhou'; id: number } & Omit<FalhaDaOperacao, 'motivo'> & {
        motivo: Exclude<FalhaDaOperacao['motivo'], 'cancelado'>
      })

/** `falha_do_navegador`: o Worker caiu duas vezes lendo o arquivo (memória, script); não diz nada do PDF. */
export type MotivoDaRecusa = MotivoDoErroDePdf | 'falha_do_navegador'

/** `formulario` vem só quando a análise pediu ({@link OpcoesDaAnalise}). */
export type ResultadoDaAnalise =
  | { ok: true; paginas: number; formulario?: Formulario }
  | { ok: false; motivo: MotivoDaRecusa }

export type AndamentoDaMesclagem = { fracao: number; arquivo: number | null }

/**
 * Como as operações rejeitam. `indice` é o arquivo culpado, só na mesclagem; `pagina` (índice), `objeto`
 * (o id), `campo` (o id do campo do formulário) e `caracteres` vêm só da edição.
 */
export type FalhaDaOperacao = {
  motivo:
    | MotivoDoErroDePdf
    | MotivoDoErroNaEdicao
    | MotivoDoErroNoCampo
    | 'inesperado'
    | 'cancelado'
  indice?: number
  pagina?: number
  objeto?: string
  campo?: number
  caracteres?: readonly string[]
}

export interface MotorDePdf {
  analisar(arquivo: Blob, opcoes?: OpcoesDaAnalise): Promise<ResultadoDaAnalise>
  /** Rejeita com {@link FalhaDaOperacao}. */
  mesclar(
    arquivos: Blob[],
    aoAndar: (andamento: AndamentoDaMesclagem) => void,
  ): Promise<Blob>
  /** Rejeita com {@link FalhaDaOperacao}. */
  organizar(arquivo: Blob, plano: readonly PaginaDoPlano[]): Promise<Blob>
  /** Rejeita com {@link FalhaDaOperacao}. */
  editar(arquivo: Blob, pedido: PedidoDeEdicao): Promise<Blob>
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
      formulario: boolean
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
          data.tipo === 'recusado'
            ? { ok: false, motivo: data.motivo }
            : data.formulario
              ? { ok: true, paginas: data.paginas, formulario: data.formulario }
              : { ok: true, paginas: data.paginas },
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
      case 'falhou': {
        const { motivo, indice, pagina, objeto, campo, caracteres } = data
        operacao?.rejeitar({
          motivo,
          indice,
          pagina,
          objeto,
          campo,
          caracteres,
        })
        operacao = null
      }
    }
  }

  function derrubar() {
    worker?.terminate()
    worker = null
  }

  function pedirAnalise(id: number, arquivo: Blob, formulario: boolean) {
    enviar({
      tipo: 'analisar',
      id,
      arquivo,
      ...(formulario ? { formulario: true } : {}),
    })
  }

  function reenviarLeituras() {
    for (const [id, { arquivo, formulario }] of analises) {
      pedirAnalise(id, arquivo, formulario)
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
    analisar(arquivo, opcoes) {
      const formulario = opcoes?.formulario === true
      return new Promise((resolver) => {
        const id = proximoId++
        analises.set(id, { arquivo, formulario, quedas: 0, resolver })
        pedirAnalise(id, arquivo, formulario)
      })
    },
    mesclar(arquivos, aoAndar) {
      return comecar((id) => ({ tipo: 'mesclar', id, arquivos }), aoAndar)
    },
    organizar(arquivo, plano) {
      return comecar((id) => ({ tipo: 'organizar', id, arquivo, plano }))
    },
    editar(arquivo, pedido) {
      return comecar((id) => ({ ...pedido, tipo: 'editar', id, arquivo }))
    },
    cancelar,
    encerrar() {
      derrubar()
      analises.clear()
      operacao = null
    },
  }
}
