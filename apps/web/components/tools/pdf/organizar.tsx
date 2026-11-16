'use client'

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as EventoDeTeclado,
  type PointerEvent as EventoDePonteiro,
  type RefObject,
} from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type PointerSensorOptions,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  faArrowLeft,
  faArrowRight,
  faArrowRotateLeft,
  faCheckDouble,
  faCircleExclamation,
  faDownload,
  faFileExport,
  faFilePdf,
  faRotateLeft,
  faRotateRight,
  faTrashCan,
  faXmark,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import {
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  apagar,
  extrair,
  girar,
  moverSelecionadas,
  nomeDoPdfDerivado,
  planoInicial,
  type LadoDoMovimento,
  type MotivoDoErroDePdf,
  type PaginaDoPlano,
  type SentidoDoGiro,
} from '@piluvitu/tools/pdf-regras'
import { useReduzirMovimento } from '@/hooks/use-reduzir-movimento'
import { useDocumentoPdf } from './documento-pdf'
import {
  criarMotorComWorker,
  ehFalhaDaOperacao,
  type MotorDePdf,
} from './motor'
import { novoWorkerDePdf } from './novo-worker'
import {
  criarRenderizadorComPdfjs,
  ehFalhaDaAbertura,
  type DocumentoAberto,
  type RenderizadorDePdf,
} from './renderizador'
import { TEXTOS, formatarTamanho, paginas as textoDePaginas } from './textos'
import { useMiniaturas } from './use-miniaturas'
import { AvisoDePrivacidade, ZonaDeArquivos } from './zona-de-arquivos'

const T = TEXTOS.organizar

type Leitura = { arquivo: File } & (
  | { ok: true; documento: DocumentoAberto }
  | { ok: false; mensagem: string }
)

type Passo = {
  plano: readonly PaginaDoPlano[]
  selecionadas: ReadonlySet<number>
}

type Edicao = Passo & {
  documento: DocumentoAberto | null
  passado: readonly Passo[]
}

type TipoDoResultado = 'organizado' | 'extraido'

type Resultado =
  | { estado: 'parado' }
  | { estado: 'montando'; tipo: TipoDoResultado }
  | {
      estado: 'pronto'
      tipo: TipoDoResultado
      url: string
      nome: string
      paginas: number
      bytes: number
    }
  | { estado: 'falhou'; tipo: TipoDoResultado; mensagem: string }

type ChaveDaBarra =
  | 'girarEsquerda'
  | 'girarDireita'
  | 'moverAntes'
  | 'moverDepois'
  | 'apagar'
  | 'extrair'
  | 'selecionarTodas'
  | 'limparSelecao'
  | 'desfazer'

type MotivoDesabilitado = keyof typeof T.dicas

type BotaoDaBarra = {
  chave: ChaveDaBarra
  motivo: MotivoDesabilitado | null
}

const ORDEM_DA_BARRA: readonly ChaveDaBarra[] = [
  'girarEsquerda',
  'girarDireita',
  'moverAntes',
  'moverDepois',
  'apagar',
  'extrair',
  'selecionarTodas',
  'limparSelecao',
  'desfazer',
]

const ICONES: Record<ChaveDaBarra, IconDefinition> = {
  girarEsquerda: faRotateLeft,
  girarDireita: faRotateRight,
  moverAntes: faArrowLeft,
  moverDepois: faArrowRight,
  apagar: faTrashCan,
  extrair: faFileExport,
  selecionarTodas: faCheckDouble,
  limparSelecao: faXmark,
  desfazer: faArrowRotateLeft,
}

type AcaoDaPagina =
  | { tipo: 'selecionar'; indice: number; marcada: boolean }
  | { tipo: 'girar'; indice: number }
  | { tipo: 'apagar'; indice: number }

type Foco = () => HTMLElement | null | undefined

const SEM_EDICAO: Edicao = {
  documento: null,
  plano: [],
  selecionadas: new Set(),
  passado: [],
}

const LIMITE_DO_DESFAZER = 100

const SUFIXOS: Record<TipoDoResultado, string> = {
  organizado: 'organizado',
  extraido: 'paginas',
}

const idDaPagina = (indice: number) => `p${indice}`

const TIPOS_SEM_TEXTO = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

function podeTerFoco(
  elemento: Element | null | undefined,
): elemento is HTMLElement {
  return (
    elemento instanceof HTMLElement &&
    elemento.isConnected &&
    !(elemento as HTMLButtonElement).disabled
  )
}

function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  if (alvo.isContentEditable || alvo instanceof HTMLTextAreaElement) {
    return true
  }
  return alvo instanceof HTMLInputElement && !TIPOS_SEM_TEXTO.has(alvo.type)
}

// Só mouse e caneta: o toque fica com o TouchSensor, que espera 250 ms para arrastar não brigar com a rolagem.
class SensorDeMouse extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        { nativeEvent: evento }: EventoDePonteiro,
        { onActivation }: PointerSensorOptions,
      ) => {
        if (
          !evento.isPrimary ||
          evento.button !== 0 ||
          evento.pointerType === 'touch'
        ) {
          return false
        }
        onActivation?.({ event: evento })
        return true
      },
    },
  ]
}

type Props = {
  /** Injetável para story e teste; sem ele, o pdf.js é baixado quando o primeiro PDF chega. */
  renderizador?: RenderizadorDePdf
  /** Injetável para story e teste; sem ele, o motor usa um Web Worker com o pdf-lib. */
  motor?: MotorDePdf
}

export function OrganizarPdf({
  renderizador: renderizadorInjetado,
  motor: motorInjetado,
}: Props) {
  const ids = useId()
  const { arquivo, guardar } = useDocumentoPdf()
  const renderizadorRef = useRef<RenderizadorDePdf | null>(
    renderizadorInjetado ?? null,
  )
  const motorRef = useRef<MotorDePdf | null>(motorInjetado ?? null)
  const escolherRef = useRef<HTMLButtonElement>(null)
  const gerarRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const baixarRef = useRef<HTMLAnchorElement>(null)
  const caixas = useRef(new Map<number, HTMLInputElement>())
  const botoesDaBarra = useRef(new Map<ChaveDaBarra, HTMLButtonElement>())
  const focoPendente = useRef<Foco | null>(null)

  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [edicao, setEdicao] = useState<Edicao>(SEM_EDICAO)
  const [resultado, setResultado] = useState<Resultado>({ estado: 'parado' })
  const [anuncio, setAnuncio] = useState({ texto: '', vez: 0 })

  const grandeDemais =
    arquivo !== null && arquivo.size > TETO_DE_BYTES_COM_MINIATURAS
  const atual = arquivo && leitura?.arquivo === arquivo ? leitura : null
  const documento = atual?.ok ? atual.documento : null
  const atualDaEdicao =
    documento && edicao.documento === documento ? edicao : SEM_EDICAO
  const { plano, selecionadas, passado } = atualDaEdicao
  const miniaturas = useMiniaturas(documento)

  const montando = resultado.estado === 'montando'
  const urlDoResultado = resultado.estado === 'pronto' ? resultado.url : null
  const posicoes = plano.flatMap((pagina, posicao) =>
    selecionadas.has(pagina.indice) ? [posicao] : [],
  )
  const qtd = posicoes.length
  const todasSelecionadas = qtd > 0 && qtd === plano.length
  const noComeco = posicoes.every((posicao, i) => posicao === i)
  const noFim = posicoes.every(
    (posicao, i) => posicao === plano.length - qtd + i,
  )

  useEffect(() => {
    if (!arquivo || arquivo.size > TETO_DE_BYTES_COM_MINIATURAS) return
    motorRef.current ??= criarMotorComWorker(novoWorkerDePdf)
    renderizadorRef.current ??= criarRenderizadorComPdfjs()
    const motor = motorRef.current
    const renderizador = renderizadorRef.current
    let ativo = true
    let aberto: DocumentoAberto | null = null

    function recusar(mensagem: string) {
      if (!ativo || !arquivo) return
      setLeitura({ arquivo, ok: false, mensagem })
      setAnuncio(({ vez }) => ({ texto: '', vez: vez + 1 }))
    }

    void (async () => {
      const analise = await motor.analisar(arquivo)
      if (!ativo) return
      if (!analise.ok) {
        return recusar(T.recusado(arquivo.name, analise.motivo))
      }
      if (analise.paginas > TETO_DE_PAGINAS) {
        return recusar(
          T.paginasDemais(arquivo.name, analise.paginas, TETO_DE_PAGINAS),
        )
      }
      try {
        const doPdfjs = await renderizador.abrir(arquivo)
        if (!ativo) return doPdfjs.fechar()
        // A tela mostra as páginas do pdf.js e o PDF sai com as do pdf-lib: se contam diferente (árvore
        // de páginas com /Count errado), o arquivo gerado teria outras páginas no lugar das que a pessoa viu.
        if (doPdfjs.paginas !== analise.paginas) {
          doPdfjs.fechar()
          return recusar(T.recusado(arquivo.name, 'corrompido'))
        }
        aberto = doPdfjs
        setLeitura({ arquivo, ok: true, documento: doPdfjs })
        setEdicao({
          documento: doPdfjs,
          plano: planoInicial(doPdfjs.paginas),
          selecionadas: new Set(),
          passado: [],
        })
        setResultado({ estado: 'parado' })
        setAnuncio(({ vez }) => ({
          texto: T.aberto(arquivo.name, doPdfjs.paginas),
          vez: vez + 1,
        }))
      } catch (erro) {
        recusar(
          T.recusado(
            arquivo.name,
            ehFalhaDaAbertura(erro) ? erro.motivo : 'falha_do_navegador',
          ),
        )
      }
    })()

    return () => {
      ativo = false
      aberto?.fechar()
    }
  }, [arquivo])

  useEffect(() => () => motorRef.current?.encerrar(), [])

  useEffect(() => {
    if (!urlDoResultado) return
    return () => URL.revokeObjectURL(urlDoResultado)
  }, [urlDoResultado])

  useEffect(() => {
    const alvo = focoPendente.current?.()
    if (alvo) {
      alvo.focus()
      focoPendente.current = null
    }
  })

  function motor() {
    motorRef.current ??= criarMotorComWorker(novoWorkerDePdf)
    return motorRef.current
  }

  function anunciar(texto: string) {
    setAnuncio(({ vez }) => ({ texto, vez: vez + 1 }))
  }

  function focar(alvo: Foco) {
    focoPendente.current = alvo
  }

  const caixaDa = (pagina: PaginaDoPlano | undefined) =>
    pagina ? caixas.current.get(pagina.indice) : escolherRef.current

  const primeiroBotaoDaBarra = () =>
    [...botoesDaBarra.current.values()].find((botao) => !botao.disabled)

  function descartarResultado(soDoTipo?: TipoDoResultado) {
    if (resultado.estado !== 'pronto' && resultado.estado !== 'falhou') return
    if (soDoTipo && resultado.tipo !== soDoTipo) return
    setResultado({ estado: 'parado' })
  }

  function mudar(novo: Passo, texto: string, alvo?: Foco) {
    if (!documento) return
    setEdicao({
      documento,
      ...novo,
      passado: [...passado, { plano, selecionadas }].slice(-LIMITE_DO_DESFAZER),
    })
    descartarResultado()
    anunciar(texto)
    if (alvo) focar(alvo)
  }

  function selecionar(novas: ReadonlySet<number>) {
    if (!documento) return
    setEdicao({ ...atualDaEdicao, selecionadas: novas })
    descartarResultado('extraido')
  }

  function agirNaPagina(acao: AcaoDaPagina) {
    if (montando) return
    const posicao = plano.findIndex((p) => p.indice === acao.indice)
    if (posicao < 0) return
    const numero = acao.indice + 1
    if (acao.tipo === 'selecionar') {
      const novas = new Set(selecionadas)
      if (acao.marcada) novas.add(acao.indice)
      else novas.delete(acao.indice)
      selecionar(novas)
      return
    }
    if (acao.tipo === 'girar') {
      const novo = girar(plano, [posicao], 'direita')
      mudar(
        { plano: novo, selecionadas },
        T.anuncios.girada(numero, novo[posicao].giro),
      )
      return
    }
    if (plano.length === 1) return
    const novo = apagar(plano, [posicao])
    const novas = new Set(selecionadas)
    novas.delete(acao.indice)
    const vizinha = novo[posicao] ?? novo[posicao - 1]
    mudar(
      { plano: novo, selecionadas: novas },
      T.anuncios.apagada(numero),
      () => caixaDa(vizinha),
    )
  }

  function girarSelecionadas(sentido: SentidoDoGiro) {
    const novo = girar(plano, posicoes, sentido)
    mudar(
      { plano: novo, selecionadas },
      qtd === 1
        ? T.anuncios.girada(
            plano[posicoes[0]].indice + 1,
            novo[posicoes[0]].giro,
          )
        : T.anuncios.giradas(qtd, sentido),
    )
  }

  function mover(lado: LadoDoMovimento) {
    const novo = moverSelecionadas(plano, posicoes, lado)
    const novasPosicoes = novo.flatMap((pagina, posicao) =>
      selecionadas.has(pagina.indice) ? [posicao] : [],
    )
    const naPonta =
      lado === 'antes'
        ? novasPosicoes.every((posicao, i) => posicao === i)
        : novasPosicoes.every((posicao, i) => posicao === novo.length - qtd + i)
    const mesmo: ChaveDaBarra = lado === 'antes' ? 'moverAntes' : 'moverDepois'
    const outro: ChaveDaBarra = lado === 'antes' ? 'moverDepois' : 'moverAntes'
    mudar(
      { plano: novo, selecionadas },
      qtd === 1
        ? T.anuncios.movida(
            plano[posicoes[0]].indice + 1,
            novasPosicoes[0] + 1,
            novo.length,
          )
        : T.anuncios.movidas(qtd, lado),
      () => botoesDaBarra.current.get(naPonta ? outro : mesmo),
    )
  }

  function apagarSelecionadas() {
    const novo = apagar(plano, posicoes)
    const vizinha = novo[posicoes[0]] ?? novo.at(-1)
    mudar(
      { plano: novo, selecionadas: new Set() },
      qtd === 1
        ? T.anuncios.apagada(plano[posicoes[0]].indice + 1)
        : T.anuncios.apagadas(qtd),
      () => caixaDa(vizinha),
    )
  }

  function selecionarTodas() {
    selecionar(new Set(plano.map((pagina) => pagina.indice)))
    anunciar(T.anuncios.todasSelecionadas(plano.length))
    focar(() => botoesDaBarra.current.get('limparSelecao'))
  }

  function limparSelecao() {
    selecionar(new Set())
    anunciar(T.anuncios.selecaoLimpa)
    focar(() => botoesDaBarra.current.get('selecionarTodas'))
  }

  function desfazer() {
    const anterior = passado.at(-1)
    if (montando || !documento || !anterior) return
    const focadoAntes = document.activeElement
    setEdicao({ documento, ...anterior, passado: passado.slice(0, -1) })
    descartarResultado()
    anunciar(T.anuncios.desfeito)
    focar(() => {
      if (podeTerFoco(focadoAntes)) return focadoAntes
      const botaoDesfazer = botoesDaBarra.current.get('desfazer')
      return podeTerFoco(botaoDesfazer) ? botaoDesfazer : primeiroBotaoDaBarra()
    })
  }

  async function gerar(tipo: TipoDoResultado, planoDoPdf: PaginaDoPlano[]) {
    if (!atual?.ok) return
    const origem = atual.arquivo
    const voltar: Foco = () =>
      tipo === 'organizado'
        ? gerarRef.current
        : botoesDaBarra.current.get('extrair')
    setResultado({ estado: 'montando', tipo })
    anunciar(T.anuncios.montando)
    focar(() => cancelarRef.current)
    try {
      const pdf = await motor().organizar(origem, planoDoPdf)
      setResultado({
        estado: 'pronto',
        tipo,
        url: URL.createObjectURL(pdf),
        nome: nomeDoPdfDerivado(origem.name, SUFIXOS[tipo]),
        paginas: planoDoPdf.length,
        bytes: pdf.size,
      })
      anunciar(T.anuncios.pronto(planoDoPdf.length, pdf.size))
      focar(() => baixarRef.current)
    } catch (erro) {
      const falha = ehFalhaDaOperacao(erro) ? erro : { motivo: 'inesperado' }
      if (falha.motivo === 'cancelado') {
        setResultado({ estado: 'parado' })
        anunciar(T.anuncios.cancelado)
      } else {
        setResultado({
          estado: 'falhou',
          tipo,
          mensagem:
            falha.motivo === 'inesperado'
              ? T.falha.inesperada
              : T.falha.arquivo(falha.motivo as MotivoDoErroDePdf),
        })
      }
      focar(voltar)
    }
  }

  const agirRef = useRef(agirNaPagina)
  const desfazerRef = useRef(desfazer)
  useLayoutEffect(() => {
    agirRef.current = agirNaPagina
    desfazerRef.current = desfazer
  })
  const aoAgir = useCallback((acao: AcaoDaPagina) => agirRef.current(acao), [])
  const registrarCaixa = useCallback(
    (indice: number, caixa: HTMLInputElement | null) => {
      if (caixa) caixas.current.set(indice, caixa)
      else caixas.current.delete(indice)
    },
    [],
  )

  useEffect(() => {
    if (!documento) return
    function aoTeclar(evento: KeyboardEvent) {
      if (
        evento.key.toLowerCase() !== 'z' ||
        !(evento.ctrlKey || evento.metaKey) ||
        evento.shiftKey ||
        evento.altKey ||
        ehCampoDeTexto(evento.target)
      ) {
        return
      }
      evento.preventDefault()
      desfazerRef.current()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [documento])

  function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || montando) return
    const de = plano.findIndex((p) => idDaPagina(p.indice) === active.id)
    const para = plano.findIndex((p) => idDaPagina(p.indice) === over.id)
    if (de < 0 || para < 0) return
    mudar(
      { plano: arrayMove([...plano], de, para), selecionadas },
      T.anuncios.movida(plano[de].indice + 1, para + 1, plano.length),
    )
  }

  const numeroPorId = (id: UniqueIdentifier) => Number(String(id).slice(1)) + 1
  const posicaoDe = (id: UniqueIdentifier) =>
    plano.findIndex((p) => idDaPagina(p.indice) === id) + 1
  const anunciosDoArraste: Announcements = {
    onDragStart: ({ active }) => T.arrastar.pegou(numeroPorId(active.id)),
    onDragOver: ({ active, over }) =>
      over
        ? T.arrastar.sobre(numeroPorId(active.id), posicaoDe(over.id))
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? T.arrastar.soltou(numeroPorId(active.id), posicaoDe(over.id))
        : T.arrastar.cancelou(numeroPorId(active.id)),
    onDragCancel: ({ active }) => T.arrastar.cancelou(numeroPorId(active.id)),
  }
  const sensores = useSensors(
    useSensor(SensorDeMouse, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  )

  function usarBotao(chave: ChaveDaBarra) {
    const acoes: Record<ChaveDaBarra, () => void> = {
      girarEsquerda: () => girarSelecionadas('esquerda'),
      girarDireita: () => girarSelecionadas('direita'),
      moverAntes: () => mover('antes'),
      moverDepois: () => mover('depois'),
      apagar: apagarSelecionadas,
      extrair: () => void gerar('extraido', extrair(plano, posicoes)),
      selecionarTodas,
      limparSelecao,
      desfazer,
    }
    acoes[chave]()
  }

  const motivoDoLote = (
    extra: MotivoDesabilitado | null = null,
  ): MotivoDesabilitado | null =>
    montando ? 'montando' : qtd === 0 ? 'semSelecao' : extra
  const soMontando: MotivoDesabilitado | null = montando ? 'montando' : null
  const motivoDe: Record<ChaveDaBarra, MotivoDesabilitado | null> = {
    girarEsquerda: motivoDoLote(),
    girarDireita: motivoDoLote(),
    moverAntes: motivoDoLote(noComeco ? 'noComeco' : null),
    moverDepois: motivoDoLote(noFim ? 'noFim' : null),
    apagar: motivoDoLote(todasSelecionadas ? 'todasSelecionadas' : null),
    extrair: motivoDoLote(),
    selecionarTodas: soMontando,
    limparSelecao: soMontando,
    desfazer: soMontando ?? (passado.length ? null : 'nadaParaDesfazer'),
  }
  const botoes: BotaoDaBarra[] = ORDEM_DA_BARRA.filter(
    (chave) =>
      (chave !== 'selecionarTodas' || !todasSelecionadas) &&
      (chave !== 'limparSelecao' || qtd > 0),
  ).map((chave) => ({ chave, motivo: motivoDe[chave] }))
  const unica = plano.length === 1
  const motivos = new Set(
    botoes.flatMap(({ motivo }) => (motivo ? [motivo] : [])),
  )
  if (unica) motivos.add('ultimaPagina')
  const idDaDica = (motivo: MotivoDesabilitado) => `${ids}-dica-${motivo}`
  const idDoTitulo = `${ids}-paginas`
  const erro =
    arquivo && grandeDemais
      ? T.grandeDemais(arquivo.name, arquivo.size, TETO_DE_BYTES_COM_MINIATURAS)
      : atual && !atual.ok
        ? atual.mensagem
        : null
  const textoDoAnuncio =
    !arquivo || grandeDemais
      ? ''
      : !atual
        ? T.abrindo(arquivo.name)
        : anuncio.texto

  return (
    <div className="space-y-8" data-testid="organizar-pdf">
      <AvisoDePrivacidade />

      <section aria-label={T.rotulo} className="space-y-3">
        <ZonaDeArquivos
          multiplos={false}
          desabilitada={montando}
          botaoRef={escolherRef}
          aoEscolher={(lista) => {
            if (lista[0]) guardar(lista[0])
          }}
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          {T.limites(TETO_DE_BYTES_COM_MINIATURAS, TETO_DE_PAGINAS)}
        </p>
        {erro && (
          <div
            role="alert"
            data-testid="organizar-pdf-erro"
            className="bg-card border-destructive flex gap-2 rounded-md border px-3 py-3 text-sm"
          >
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <p className="[overflow-wrap:anywhere]">{erro}</p>
          </div>
        )}
      </section>

      {atual?.ok && (
        <section aria-labelledby={idDoTitulo} className="space-y-4">
          <div>
            <h2 id={idDoTitulo} className="font-semibold">
              {T.titulo}
            </h2>
            <p
              className="text-muted-foreground text-sm [overflow-wrap:anywhere]"
              data-testid="organizar-pdf-documento"
            >
              {T.aberto(atual.arquivo.name, atual.documento.paginas)}
            </p>
          </div>

          <div className="space-y-2">
            <p
              className="text-sm font-medium"
              data-testid="organizar-pdf-selecionadas"
            >
              {T.selecionadas(qtd)}
            </p>
            <BarraDeAcoes
              botoes={botoes}
              botoesRef={botoesDaBarra}
              idDaDica={idDaDica}
              aoUsar={usarBotao}
            />
            <ul
              className="text-muted-foreground space-y-0.5 text-xs"
              data-testid="organizar-pdf-dicas"
            >
              {[...motivos].map((motivo) => (
                <li key={motivo} id={idDaDica(motivo)}>
                  {T.dicas[motivo]}
                </li>
              ))}
              <li>{T.atalho}</li>
            </ul>
          </div>

          <div className="space-y-4">
            <p
              className="text-muted-foreground text-xs leading-relaxed"
              data-testid="organizar-pdf-alcance"
            >
              {TEXTOS.alcance}
            </p>
            <p
              className="text-muted-foreground text-xs leading-relaxed"
              data-testid="organizar-pdf-miniaturas-sem-imagem"
            >
              {T.miniaturasSemImagem}
            </p>

            {montando ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">{T.montando}</p>
                <Button
                  ref={cancelarRef}
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => motor().cancelar()}
                  data-testid="organizar-pdf-cancelar"
                >
                  {T.acoes.cancelar}
                </Button>
              </div>
            ) : (
              <Button
                ref={gerarRef}
                type="button"
                className="h-11 gap-2 px-6"
                onClick={() => void gerar('organizado', [...plano])}
                data-testid="organizar-pdf-gerar"
              >
                <FontAwesomeIcon
                  icon={faFilePdf}
                  className="size-4"
                  aria-hidden
                />
                {T.acoes.gerar}
              </Button>
            )}

            {resultado.estado === 'falhou' && (
              <div
                role="alert"
                data-testid="organizar-pdf-falha"
                className="bg-card border-destructive flex gap-2 rounded-md border px-3 py-3 text-sm"
              >
                <FontAwesomeIcon
                  icon={faCircleExclamation}
                  className="text-destructive mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <p>{resultado.mensagem}</p>
              </div>
            )}

            {resultado.estado === 'pronto' && (
              <div
                data-testid="organizar-pdf-resultado"
                className="bg-card border-border motion-safe:animate-in motion-safe:fade-in-0 flex flex-wrap items-center gap-4 rounded-lg border p-4 motion-safe:duration-200"
              >
                <div className="min-w-0 flex-1 basis-48 space-y-0.5">
                  <p className="font-semibold">{T.resultado[resultado.tipo]}</p>
                  <p className="text-muted-foreground text-sm">
                    {`${textoDePaginas(resultado.paginas)} · ${formatarTamanho(resultado.bytes)}`}
                  </p>
                </div>
                <Button asChild className="h-11 gap-2 px-5">
                  <a
                    ref={baixarRef}
                    href={resultado.url}
                    download={resultado.nome}
                    data-testid="organizar-pdf-baixar"
                  >
                    <FontAwesomeIcon
                      icon={faDownload}
                      className="size-4"
                      aria-hidden
                    />
                    <span className="[overflow-wrap:anywhere] whitespace-normal">
                      {T.acoes.baixar(resultado.nome)}
                    </span>
                  </a>
                </Button>
              </div>
            )}
          </div>

          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            onDragEnd={aoSoltar}
            accessibility={{
              announcements: anunciosDoArraste,
              screenReaderInstructions: { draggable: T.arrastar.instrucoes },
            }}
          >
            <SortableContext
              items={plano.map((pagina) => idDaPagina(pagina.indice))}
              strategy={rectSortingStrategy}
            >
              <ol
                aria-labelledby={idDoTitulo}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
                data-testid="organizar-pdf-paginas"
              >
                {plano.map((pagina) => (
                  <CartaoDaPagina
                    key={pagina.indice}
                    pagina={pagina}
                    selecionada={selecionadas.has(pagina.indice)}
                    url={miniaturas.urls.get(pagina.indice)}
                    falhou={miniaturas.falhas.has(pagina.indice)}
                    bloqueado={montando}
                    unica={unica}
                    idDaDicaUnica={idDaDica('ultimaPagina')}
                    aoAgir={aoAgir}
                    registrarCaixa={registrarCaixa}
                    observar={miniaturas.observar}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </section>
      )}

      <p role="status" className="sr-only" data-testid="organizar-pdf-anuncio">
        {textoDoAnuncio}
        {anuncio.vez % 2 ? ' ' : ''}
      </p>
    </div>
  )
}

function BarraDeAcoes({
  botoes,
  botoesRef,
  idDaDica,
  aoUsar,
}: {
  botoes: BotaoDaBarra[]
  botoesRef: RefObject<Map<ChaveDaBarra, HTMLButtonElement>>
  idDaDica: (motivo: MotivoDesabilitado) => string
  aoUsar: (chave: ChaveDaBarra) => void
}) {
  const [ativo, setAtivo] = useState<ChaveDaBarra | null>(null)
  const habilitados = botoes.filter((botao) => !botao.motivo)
  const noTab = habilitados.some((botao) => botao.chave === ativo)
    ? ativo
    : habilitados[0]?.chave

  function aoTeclar(evento: EventoDeTeclado<HTMLDivElement>) {
    const total = habilitados.length
    if (!total) return
    const agora = habilitados.findIndex(
      (botao) => botoesRef.current.get(botao.chave) === document.activeElement,
    )
    const destinos: Record<string, number> = {
      ArrowRight: (agora + 1) % total,
      ArrowLeft: (agora - 1 + total) % total,
      Home: 0,
      End: total - 1,
    }
    const proximo = destinos[evento.key]
    if (proximo === undefined) return
    evento.preventDefault()
    botoesRef.current.get(habilitados[proximo].chave)?.focus()
  }

  return (
    <div
      role="toolbar"
      aria-label={T.barra}
      onKeyDown={aoTeclar}
      className="flex flex-wrap gap-1.5"
      data-testid="organizar-pdf-barra"
    >
      {botoes.map(({ chave, motivo }) => (
        <Button
          key={chave}
          ref={(no) => {
            if (no) botoesRef.current.set(chave, no)
            else botoesRef.current.delete(chave)
          }}
          type="button"
          variant="outline"
          className="h-11 gap-2 px-3"
          tabIndex={chave === noTab ? 0 : -1}
          disabled={motivo !== null}
          aria-describedby={motivo ? idDaDica(motivo) : undefined}
          aria-keyshortcuts={
            chave === 'desfazer' ? 'Control+Z Meta+Z' : undefined
          }
          onFocus={() => setAtivo(chave)}
          onClick={() => aoUsar(chave)}
          data-testid={`organizar-pdf-${chave}`}
        >
          <FontAwesomeIcon
            icon={ICONES[chave]}
            className="size-4"
            aria-hidden
          />
          {T.acoes[chave]}
        </Button>
      ))}
    </div>
  )
}

const CartaoDaPagina = memo(function CartaoDaPagina({
  pagina,
  selecionada,
  url,
  falhou,
  bloqueado,
  unica,
  idDaDicaUnica,
  aoAgir,
  registrarCaixa,
  observar,
}: {
  pagina: PaginaDoPlano
  selecionada: boolean
  url: string | undefined
  falhou: boolean
  bloqueado: boolean
  unica: boolean
  idDaDicaUnica: string
  aoAgir: (acao: AcaoDaPagina) => void
  registrarCaixa: (indice: number, caixa: HTMLInputElement | null) => void
  observar: (elemento: Element, indice: number) => () => void
}) {
  const reduzir = useReduzirMovimento()
  const { indice, giro } = pagina
  const numero = indice + 1
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: idDaPagina(indice),
    disabled: bloqueado,
    transition: reduzir
      ? null
      : { duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  })
  const refDoItem = useCallback(
    (no: HTMLLIElement | null) => {
      setNodeRef(no)
      if (!no) return
      const parar = observar(no, indice)
      return () => {
        parar()
        setNodeRef(null)
      }
    },
    [setNodeRef, observar, indice],
  )
  const refDaCaixa = useCallback(
    (caixa: HTMLInputElement | null) => registrarCaixa(indice, caixa),
    [registrarCaixa, indice],
  )

  return (
    <li
      ref={refDoItem}
      data-testid="organizar-pdf-pagina"
      data-indice={indice}
      data-selecionada={selecionada || undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
      }}
      className={cn(
        'bg-card flex min-w-0 flex-col gap-1 rounded-lg border p-1.5',
        selecionada ? 'border-primary ring-primary ring-2' : 'border-border',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <div className="flex min-w-0 items-center gap-1">
        <label
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center"
          data-testid="organizar-pdf-selecao"
        >
          <input
            ref={refDaCaixa}
            type="checkbox"
            className="accent-primary size-5 cursor-pointer"
            aria-label={T.selecionar(numero)}
            checked={selecionada}
            disabled={bloqueado}
            onChange={(evento) =>
              aoAgir({
                tipo: 'selecionar',
                indice,
                marcada: evento.target.checked,
              })
            }
          />
        </label>
        <div className="min-w-0">
          <p className="text-sm font-medium" data-testid="organizar-pdf-rotulo">
            {T.pagina(numero)}
          </p>
          {giro !== 0 && (
            <p className="text-muted-foreground text-xs">{T.girada(giro)}</p>
          )}
        </div>
      </div>

      <div
        ref={setActivatorNodeRef}
        {...listeners}
        aria-hidden
        onContextMenu={(evento) => evento.preventDefault()}
        className={cn(
          'bg-muted flex aspect-square touch-manipulation items-center justify-center overflow-hidden rounded-md select-none [-webkit-touch-callout:none]',
          !bloqueado && 'cursor-grab active:cursor-grabbing',
        )}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura num Blob gerado no aparelho, sem otimizador
          <img
            src={url}
            alt=""
            draggable={false}
            data-testid="organizar-pdf-miniatura"
            className="max-h-full max-w-full shadow-sm motion-safe:transition-transform motion-safe:duration-200"
            style={{ transform: `rotate(${giro}deg)` }}
          />
        ) : falhou ? (
          <span className="text-foreground px-2 text-center text-xs">
            {T.semMiniatura}
          </span>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={T.girarPagina(numero)}
          disabled={bloqueado}
          onClick={() => aoAgir({ tipo: 'girar', indice })}
          data-testid="organizar-pdf-girar-pagina"
        >
          <FontAwesomeIcon
            icon={faRotateRight}
            className="size-4"
            aria-hidden
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label={T.apagarPagina(numero)}
          aria-describedby={unica ? idDaDicaUnica : undefined}
          disabled={bloqueado || unica}
          onClick={() => aoAgir({ tipo: 'apagar', indice })}
          data-testid="organizar-pdf-apagar-pagina"
        >
          <FontAwesomeIcon icon={faTrashCan} className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  )
})
