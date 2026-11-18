'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import {
  faArrowRotateLeft,
  faArrowRotateRight,
  faCircleExclamation,
  faCircleInfo,
  faCrosshairs,
  faDownload,
  faFilePdf,
  faImage,
  faLayerGroup,
  faRotate,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@piluvitu/ui/sheet'
import {
  TETO_DAS_IMAGENS_EM_BYTES,
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  desfazer as desfazerNoHistorico,
  extrair,
  girar,
  giroNormalizado,
  historicoInicial,
  moverSelecionadas,
  nomeDoPdfDerivado,
  podeDesfazer,
  podeRefazer,
  refazer as refazerNoHistorico,
  registrarNoHistorico,
  saiPorCopia,
  type Giro,
  type Historico,
  type LadoDoMovimento,
  type Ponto,
  type PontoDoTraco,
  type SentidoDoGiro,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import {
  AreaDaPagina,
  ControlesDaPagina,
  FaixaDePaginas,
  ZOOMS,
  ZOOM_INICIAL,
  usePaginaDesenhada,
  type PaginaDaFaixa,
} from './area-da-pagina'
import {
  apagarPaginas,
  desfazerPaginas,
  marcar,
  marcarTodas,
  montagemDaBancada,
  mudarPaginas,
  mudouDoInicio,
  paginasIniciais,
  posicoesMarcadas,
  semMarcadas,
  type PaginaDaBancada,
  type Paginas,
  type PaginasComDesfazer,
} from './bancada'
import { useBancadaLarga } from './bancada-larga'
import { BarraDeFerramentas } from './barra-de-ferramentas'
import { CabecalhoDoDocumento } from './cabecalho-do-documento'
import { useDocumentoPdf } from './documento-pdf'
import { ehCampoDeTexto, podeTerFoco } from './foco'
import { ehFalhaDaImagem, prepararImagem } from './imagem-inserida'
import {
  BarraDaSelecao,
  ListaDaBancada,
  type AcaoNaBancada,
  type BotaoDaBarra,
  type ChaveDaBarra,
  type MotivoDesabilitado,
} from './lista-de-paginas'
import { idDaPagina } from './montagem'
import {
  criarMotorComWorker,
  ehFalhaDaOperacao,
  type MotorDePdf,
  type ObjetoNaTela,
} from './motor'
import { novoWorkerDePdf } from './novo-worker'
import {
  CENA_VAZIA,
  CORES,
  ESPESSURA_MAXIMA,
  ESPESSURA_MINIMA,
  cenaDasPaginas,
  comApagarDeVerdade,
  comMudanca,
  corDoNome,
  cobrirDa,
  criarObjeto,
  criarTraco,
  imagensDa,
  incluirObjeto,
  lembrarEstilo,
  molduraDa,
  nomeDaCor,
  objetosDa,
  paginasMudadas,
  paginasParaApagar,
  temCobrir,
  tirarObjeto,
  totalDeObjetos,
  trocarObjeto,
  ESTILOS_PADRAO,
  type Cena,
  type Estilos,
  type Ferramenta,
  type Lugar,
  type Mudanca,
  type NomeDaCor,
} from './objetos'
import { PainelDoObjeto } from './painel-do-objeto'
import { QuadroDeObjetos, type OrigemDaMudanca } from './quadro-de-objetos'
import {
  criarRenderizadorComPdfjs,
  type DocumentoAberto,
  type RenderizadorDePdf,
} from './renderizador'
import { TEXTOS } from './textos'
import { useAbrirPdf, type RecusaDaAbertura } from './use-abrir-pdf'
import { useMiniaturas } from './use-miniaturas'
import {
  AvisoDePrivacidade,
  ZonaDeArquivos,
  useProtegerAJanela,
} from './zona-de-arquivos'

const T = TEXTOS.editar
const O = TEXTOS.organizar
const P = TEXTOS.editar.paginasDoDocumento

// A imagem da miniatura na faixa: 4,5rem do botão menos o respiro.
const LARGURA_DA_MINIATURA_NA_FAIXA = 64

// Seta segurada ou campo digitado: os passos de um mesmo objeto, um logo depois do outro, viram um desfazer só.
const JANELA_DA_JUNCAO_MS = 1_000

// A posição só é falada quando a pessoa para de mexer, e não a cada passo.
const PAUSA_DO_ANUNCIO_MS = 500

type Vista = {
  documento: DocumentoAberto | null
  /** O id da página aberta; `null` só antes de abrir. */
  aberta: string | null
  zoom: number
}

const SEM_VISTA: Vista = { documento: null, aberta: null, zoom: ZOOM_INICIAL }

type PaginasDoDocumento = {
  documento: DocumentoAberto | null
  paginas: PaginasComDesfazer
}

const SEM_PAGINAS: PaginasDoDocumento = {
  documento: null,
  paginas: paginasIniciais(0),
}

const SO_ICONE: readonly ChaveDaBarra[] = [
  'girarEsquerda',
  'girarDireita',
  'moverAntes',
  'moverDepois',
  'apagar',
  'desfazer',
]

const ORDEM_DA_BARRA_DA_BANCADA: readonly ChaveDaBarra[] = [
  ...SO_ICONE,
  'extrair',
  'selecionarTodas',
  'limparSelecao',
]

type Edicao = {
  documento: DocumentoAberto | null
  historico: Historico<Cena>
}

const SEM_EDICAO: Edicao = {
  documento: null,
  historico: historicoInicial(CENA_VAZIA),
}

type ImagemGuardada = {
  blob: Blob
  url: string
  nome: string
  /** Em pixels. */
  largura: number
  altura: number
}

type EstadoDaImagem =
  | { tipo: 'preparando' | 'pronta'; texto: string }
  | { tipo: 'aviso'; texto: string }

type TipoDoResultado = 'editado' | 'extraido'

const SUFIXOS: Record<TipoDoResultado, string> = {
  editado: 'editado',
  extraido: 'paginas',
}

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
  | {
      estado: 'falhou'
      tipo: TipoDoResultado
      mensagem: string
      objeto?: { pagina: number; id: string }
    }

type Foco = () => HTMLElement | null | undefined

type SentidoDoHistorico = 'desfazer' | 'refazer'

function mensagemDaRecusa(nome: string, recusa: RecusaDaAbertura): string {
  return 'paginasDemais' in recusa
    ? T.paginasDemais(nome, recusa.paginasDemais, TETO_DE_PAGINAS)
    : T.recusado(nome, recusa.motivo)
}

// As imagens que algum passo do histórico usa: só essas ficam guardadas e contam no teto.
function imagensDoHistorico(historico: Historico<Cena>): Set<string> {
  const usadas = new Set<string>()
  for (const cena of [
    ...historico.passado,
    historico.presente,
    ...historico.futuro,
  ]) {
    for (const id of imagensDa(cena)) usadas.add(id)
  }
  return usadas
}

type Props = {
  /** Injetável para story e teste; sem ele, o pdf.js é baixado quando o primeiro PDF chega. */
  renderizador?: RenderizadorDePdf
  /** Injetável para story e teste; sem ele, o motor usa um Web Worker com o pdf-lib. */
  motor?: MotorDePdf
}

export function EditarPdf({
  renderizador: renderizadorInjetado,
  motor: motorInjetado,
}: Props) {
  const ids = useId()
  const { arquivo, guardar } = useDocumentoPdf()
  const renderizadorRef = useRef<RenderizadorDePdf | null>(
    renderizadorInjetado ?? null,
  )
  const motorRef = useRef<MotorDePdf | null>(motorInjetado ?? null)
  const areaRef = useRef<HTMLDivElement>(null)
  const folhaRef = useRef<HTMLDivElement>(null)
  const quadroRef = useRef<HTMLDivElement>(null)
  const barraRef = useRef<HTMLDivElement>(null)
  const anteriorRef = useRef<HTMLButtonElement>(null)
  const proximaRef = useRef<HTMLButtonElement>(null)
  const diminuirRef = useRef<HTMLButtonElement>(null)
  const aumentarRef = useRef<HTMLButtonElement>(null)
  const desfazerRef = useRef<HTMLButtonElement>(null)
  const refazerRef = useRef<HTMLButtonElement>(null)
  const inputDaImagemRef = useRef<HTMLInputElement>(null)
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const confirmarApagarRef = useRef<HTMLButtonElement>(null)
  const apagarDeVerdadeRef = useRef<HTMLButtonElement>(null)
  const desligarApagarRef = useRef<HTMLButtonElement>(null)
  const gerarRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const baixarRef = useRef<HTMLAnchorElement>(null)
  const botaoDasPaginasRef = useRef<HTMLButtonElement>(null)
  // A coluna (larga) ou a folha (estreita): o Ctrl/⌘+Z dentro dela desfaz as páginas.
  const regiaoDasPaginasRef = useRef<HTMLElement | null>(null)
  const focoAoFechar = useRef<Foco | null>(null)
  const elementosDosObjetos = useRef(new Map<string, HTMLElement>())
  const caixas = useRef(new Map<string, HTMLInputElement>())
  const botoesDaBarra = useRef(new Map<ChaveDaBarra, HTMLButtonElement>())
  const focoPendente = useRef<Foco | null>(null)
  const juncao = useRef<{ chave: string; quando: number } | null>(null)
  const anuncioAdiado = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const vezDaImagem = useRef(0)
  const vezDoClique = useRef(0)
  const vezDaGeracao = useRef(0)

  const [vista, setVista] = useState<Vista>(SEM_VISTA)
  const [anuncio, setAnuncio] = useState({ texto: '', vez: 0 })
  const [edicao, setEdicao] = useState<Edicao>(SEM_EDICAO)
  const [paginasDoDoc, setPaginasDoDoc] =
    useState<PaginasDoDocumento>(SEM_PAGINAS)
  const [ferramenta, setFerramenta] = useState<Ferramenta>('selecionar')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [estilos, setEstilos] = useState<Estilos>(ESTILOS_PADRAO)
  const [imagens, setImagens] = useState<ReadonlyMap<string, ImagemGuardada>>(
    () => new Map(),
  )
  const [imagemPendente, setImagemPendente] = useState<string | null>(null)
  const [estadoDaImagem, setEstadoDaImagem] = useState<EstadoDaImagem | null>(
    null,
  )
  const [dicaDoTexto, setDicaDoTexto] = useState<{
    documento: DocumentoAberto
    pagina: string
  } | null>(null)
  const [confirmandoApagar, setConfirmandoApagar] = useState<string | null>(
    null,
  )
  const [resultado, setResultado] = useState<Resultado>({ estado: 'parado' })
  const [folhaAberta, setFolhaAberta] = useState(false)
  const larga = useBancadaLarga()
  if (larga && folhaAberta) setFolhaAberta(false)
  useProtegerAJanela()

  const { atual, documento, grandeDemais, avisos } = useAbrirPdf(arquivo, {
    motor,
    renderizador: () =>
      (renderizadorRef.current ??= criarRenderizadorComPdfjs()),
    aoAbrir(aberto, doArquivo, avisosDoArquivo) {
      setVista({ ...SEM_VISTA, documento: aberto, aberta: idDaPagina(0, 0) })
      setEdicao({ documento: aberto, historico: historicoInicial(CENA_VAZIA) })
      setPaginasDoDoc({
        documento: aberto,
        paginas: paginasIniciais(aberto.paginas),
      })
      setFerramenta('selecionar')
      setSelecionado(null)
      setImagemPendente(null)
      setEstadoDaImagem(null)
      setDicaDoTexto(null)
      setConfirmandoApagar(null)
      setResultado({ estado: 'parado' })
      setFolhaAberta(false)
      soltarImagens(new Set())
      juncao.current = null
      anunciar(
        T.anuncios.aberto(doArquivo.name, aberto.paginas, avisosDoArquivo),
      )
    },
    aoRecusar: () => anunciar(''),
  })
  const miniaturasDaFaixa = useMiniaturas(
    documento,
    LARGURA_DA_MINIATURA_NA_FAIXA,
  )
  const miniaturasDaLista = useMiniaturas(documento)

  const { zoom, aberta: abertaNaVista } =
    documento && vista.documento === documento ? vista : SEM_VISTA
  const { paginas: estadoDasPaginas } =
    documento && paginasDoDoc.documento === documento
      ? paginasDoDoc
      : SEM_PAGINAS
  const lista = estadoDasPaginas.lista
  const total = lista.length
  const ordem = useMemo(() => lista.map(({ id }) => id), [lista])
  const pagina = Math.max(0, ordem.indexOf(abertaNaVista ?? ''))
  const paginaAberta: PaginaDaBancada | undefined = lista[pagina]
  const aberta = paginaAberta?.id ?? idDaPagina(0, 0)

  const { historico } =
    documento && edicao.documento === documento ? edicao : SEM_EDICAO
  const cena = historico.presente
  const moldura = molduraDa(cena, aberta, paginaAberta?.giro ?? 0)
  const {
    larguraCss,
    desenhando,
    falhou: naoDesenhou,
    proporcao,
    tamanhoDaPagina,
    tentarDeNovo,
  } = usePaginaDesenhada({
    documento,
    pagina: paginaAberta?.origem.indice ?? 0,
    giro: moldura,
    zoom,
    areaRef,
    folhaRef,
  })
  const objetosDaPagina = objetosDa(cena, aberta)
  const objetoEscolhido =
    (selecionado && objetosDaPagina.find((o) => o.id === selecionado)) || null
  const montando = resultado.estado === 'montando'
  const marcadas = estadoDasPaginas.marcadas
  const posicoes = posicoesMarcadas(estadoDasPaginas)
  const qtd = posicoes.length
  const urlDoResultado = resultado.estado === 'pronto' ? resultado.url : null
  const imagemParaPor = imagemPendente ? imagens.get(imagemPendente) : undefined

  useEffect(() => () => motorRef.current?.encerrar(), [])

  useEffect(() => () => clearTimeout(anuncioAdiado.current), [])

  useEffect(() => {
    if (!urlDoResultado) return
    return () => URL.revokeObjectURL(urlDoResultado)
  }, [urlDoResultado])

  const imagensRef = useRef(imagens)
  useLayoutEffect(() => {
    imagensRef.current = imagens
  })
  useEffect(
    () => () => {
      for (const { url } of imagensRef.current.values()) {
        URL.revokeObjectURL(url)
      }
    },
    [],
  )

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
    clearTimeout(anuncioAdiado.current)
    setAnuncio(({ vez }) => ({ texto, vez: vez + 1 }))
  }

  function anunciarDepois(texto: string) {
    clearTimeout(anuncioAdiado.current)
    anuncioAdiado.current = setTimeout(
      () => setAnuncio(({ vez }) => ({ texto, vez: vez + 1 })),
      PAUSA_DO_ANUNCIO_MS,
    )
  }

  function focar(alvo: Foco) {
    focoPendente.current = alvo
  }

  // Solta (e revoga a URL de) toda imagem que nenhum passo do histórico usa e que não espera para entrar.
  function soltarImagens(ficam: ReadonlySet<string>) {
    const sobram = new Map<string, ImagemGuardada>()
    for (const [id, imagem] of imagens) {
      if (ficam.has(id)) sobram.set(id, imagem)
      else URL.revokeObjectURL(imagem.url)
    }
    if (sobram.size !== imagens.size) setImagens(sobram)
  }

  function guardarHistorico(novo: Historico<Cena>, pendente = imagemPendente) {
    if (!documento) return
    setEdicao({ documento, historico: novo })
    const ficam = imagensDoHistorico(novo)
    if (pendente) ficam.add(pendente)
    soltarImagens(ficam)
    if (resultado.estado === 'pronto' || resultado.estado === 'falhou') {
      setResultado({ estado: 'parado' })
    }
  }

  function mudarCena(
    nova: Cena,
    chaveDaJuncao?: string,
    pendente = imagemPendente,
  ) {
    if (!documento || nova === cena) return
    const agora = Date.now()
    const anterior = juncao.current
    const junta =
      chaveDaJuncao !== undefined &&
      anterior?.chave === chaveDaJuncao &&
      agora - anterior.quando < JANELA_DA_JUNCAO_MS &&
      podeDesfazer(historico)
    juncao.current = chaveDaJuncao
      ? { chave: chaveDaJuncao, quando: agora }
      : null
    guardarHistorico(
      junta
        ? { ...historico, presente: nova, futuro: [] }
        : registrarNoHistorico(historico, nova),
      pendente,
    )
  }

  function irPara(indice: number) {
    if (!documento || indice === pagina || indice < 0 || indice >= total) {
      return
    }
    setVista({ documento, aberta: ordem[indice], zoom })
    setSelecionado(null)
    setDicaDoTexto(null)
    setConfirmandoApagar(null)
    anunciar(T.anuncios.pagina(indice + 1, total))
  }

  function passar(sentido: -1 | 1) {
    const destino = pagina + sentido
    irPara(destino)
    const naPonta = sentido < 0 ? destino === 0 : destino === total - 1
    if (naPonta) {
      focar(() => (sentido < 0 ? proximaRef : anteriorRef).current)
    }
  }

  function mudarZoom(passo: -1 | 1) {
    const novo = zoom + passo
    if (!documento || novo < 0 || novo >= ZOOMS.length) return
    setVista({ documento, aberta, zoom: novo })
    anunciar(T.anuncios.zoom(ZOOMS[novo]))
    if (novo === 0 || novo === ZOOMS.length - 1) {
      focar(() => (passo < 0 ? aumentarRef : diminuirRef).current)
    }
  }

  function escolherFerramenta(nova: Ferramenta) {
    setFerramenta(nova)
    setDicaDoTexto(null)
    if (nova === 'imagem' && !imagemParaPor) inputDaImagemRef.current?.click()
  }

  // O centro da parte da página que aparece na tela (com zoom, a página pode passar da área).
  function centroVisivel(paginaToda: Tamanho): Ponto {
    const meio = { x: paginaToda.largura / 2, y: paginaToda.altura / 2 }
    const quadro = quadroRef.current?.getBoundingClientRect()
    const area = areaRef.current?.getBoundingClientRect()
    if (!quadro || !area || quadro.width <= 0 || quadro.height <= 0) return meio
    const esquerda = Math.max(quadro.left, area.left, 0)
    const direita = Math.min(quadro.right, area.right, window.innerWidth)
    const topo = Math.max(quadro.top, area.top, 0)
    const baixo = Math.min(quadro.bottom, area.bottom, window.innerHeight)
    if (direita <= esquerda || baixo <= topo) return meio
    return {
      x:
        (((esquerda + direita) / 2 - quadro.left) / quadro.width) *
        paginaToda.largura,
      y:
        (((topo + baixo) / 2 - quadro.top) / quadro.height) * paginaToda.altura,
    }
  }

  function inserir(lugar: Lugar) {
    if (
      !tamanhoDaPagina ||
      ferramenta === 'selecionar' ||
      ferramenta === 'desenho'
    ) {
      return
    }
    if (ferramenta === 'imagem' && !imagemParaPor) {
      setEstadoDaImagem({ tipo: 'aviso', texto: T.ferramentas.semImagem })
      return
    }
    const objeto = criarObjeto(ferramenta, lugar, tamanhoDaPagina, estilos, {
      conteudo: T.objetos.textoInicial,
      imagem:
        imagemPendente && imagemParaPor
          ? {
              id: imagemPendente,
              largura: imagemParaPor.largura,
              altura: imagemParaPor.altura,
            }
          : undefined,
    })
    mudarCena(
      incluirObjeto(cena, aberta, objeto, moldura),
      undefined,
      ferramenta === 'imagem' ? null : imagemPendente,
    )
    setSelecionado(objeto.id)
    setFerramenta('selecionar')
    if (ferramenta === 'imagem') {
      setImagemPendente(null)
      setEstadoDaImagem(null)
    }
    anunciar(
      T.anuncios.inserido(
        objeto,
        objeto.tipo === 'imagem' ? imagens.get(objeto.imagem)?.nome : undefined,
      ),
    )
    focar(() => {
      if (objeto.tipo !== 'texto') {
        return elementosDosObjetos.current.get(objeto.id)
      }
      const campo = textoRef.current
      campo?.focus()
      campo?.select()
      return campo
    })
  }

  function desenhar(pontos: PontoDoTraco[]) {
    if (!pontos.length) return
    const objeto = criarTraco(pontos, estilos.traco)
    mudarCena(incluirObjeto(cena, aberta, objeto, moldura))
    anunciar(T.anuncios.inserido(objeto))
  }

  function mudarPeloQuadro(novo: ObjetoNaTela, origem: OrigemDaMudanca) {
    mudarCena(
      trocarObjeto(cena, aberta, novo),
      origem === 'ponteiro' ? undefined : `${origem}:${novo.id}`,
    )
    anunciarDepois(T.anuncios.posicao(novo))
  }

  function mudarPeloPainel(mudanca: Mudanca) {
    if (!objetoEscolhido || !tamanhoDaPagina) return
    const novo = comMudanca(objetoEscolhido, mudanca, tamanhoDaPagina)
    mudarCena(
      trocarObjeto(cena, aberta, novo),
      `painel:${mudanca.campo}:${novo.id}`,
    )
    setEstilos((atuais) => lembrarEstilo(atuais, novo))
  }

  function apagarObjeto(id: string) {
    const posicao = objetosDaPagina.findIndex((o) => o.id === id)
    if (posicao < 0) return
    const vizinho =
      objetosDaPagina[posicao + 1] ?? objetosDaPagina[posicao - 1] ?? null
    mudarCena(tirarObjeto(cena, aberta, id))
    setSelecionado(vizinho?.id ?? null)
    anunciar(T.anuncios.apagado(objetosDaPagina[posicao].tipo))
    focar(() =>
      vizinho ? elementosDosObjetos.current.get(vizinho.id) : quadroRef.current,
    )
  }

  function soltarObjeto() {
    setSelecionado(null)
    anunciar(T.anuncios.solto)
    focar(() => quadroRef.current)
  }

  async function clicarNaPagina(ponto: Ponto) {
    setSelecionado(null)
    if (!documento || !paginaAberta) return
    const vez = ++vezDoClique.current
    const temTexto = await documento
      .textoNoPonto(paginaAberta.origem.indice, ponto, moldura)
      .catch(() => false)
    if (vez !== vezDoClique.current) return
    setDicaDoTexto(temTexto ? { documento, pagina: aberta } : null)
    if (temTexto) anunciar(T.textoExistente)
  }

  function voltarNoHistorico(sentido: SentidoDoHistorico) {
    if (!documento || montando) return
    const novo =
      sentido === 'desfazer'
        ? desfazerNoHistorico(historico)
        : refazerNoHistorico(historico)
    if (novo === historico) return
    juncao.current = null
    const focadoAntes = document.activeElement
    guardarHistorico(novo)
    const mudadas = paginasMudadas(historico.presente, novo.presente, ordem)
    const noDocumento = mudadas.filter((id) => ordem.includes(id))
    const outra =
      noDocumento.length > 0 && !noDocumento.includes(aberta)
        ? ordem.indexOf(noDocumento[0])
        : null
    if (outra !== null) {
      setVista({ documento, aberta: ordem[outra], zoom })
      setSelecionado(null)
    }
    const desfazendo = sentido === 'desfazer'
    anunciar(
      mudadas.length > 0 && noDocumento.length === 0
        ? T.anuncios[desfazendo ? 'desfeitoNaApagada' : 'refeitoNaApagada']
        : outra === null
          ? T.anuncios[desfazendo ? 'desfeito' : 'refeito']
          : T.anuncios[desfazendo ? 'desfeitoNaPagina' : 'refeitoNaPagina'](
              outra + 1,
            ),
    )
    const mesmo = sentido === 'desfazer' ? desfazerRef : refazerRef
    const outro = sentido === 'desfazer' ? refazerRef : desfazerRef
    focar(
      () =>
        [
          focadoAntes !== document.body ? focadoAntes : null,
          mesmo.current,
          outro.current,
          barraRef.current?.querySelector<HTMLElement>('[tabindex="0"]'),
        ].find(podeTerFoco) ?? null,
    )
  }

  async function escolherImagem(escolhida: File) {
    const vez = ++vezDaImagem.current
    setEstadoDaImagem({
      tipo: 'preparando',
      texto: T.imagem.preparando(escolhida.name),
    })
    anunciar(T.imagem.preparando(escolhida.name))
    let estado: EstadoDaImagem
    try {
      const pronta = await prepararImagem(escolhida)
      if (vez !== vezDaImagem.current) return
      const ficam = imagensDoHistorico(historico)
      let usados = 0
      for (const [id, { blob }] of imagens) {
        if (ficam.has(id)) usados += blob.size
      }
      if (usados + pronta.blob.size > TETO_DAS_IMAGENS_EM_BYTES) {
        estado = {
          tipo: 'aviso',
          texto: T.imagem.teto(
            escolhida.name,
            pronta.blob.size,
            TETO_DAS_IMAGENS_EM_BYTES,
          ),
        }
      } else {
        const id = `imagem-${vez}`
        const novas = new Map<string, ImagemGuardada>()
        for (const [outro, imagem] of imagens) {
          if (ficam.has(outro)) novas.set(outro, imagem)
          else URL.revokeObjectURL(imagem.url)
        }
        novas.set(id, {
          blob: pronta.blob,
          url: URL.createObjectURL(pronta.blob),
          nome: escolhida.name,
          largura: pronta.largura,
          altura: pronta.altura,
        })
        setImagens(novas)
        setImagemPendente(id)
        setFerramenta('imagem')
        estado = {
          tipo: 'pronta',
          texto: (pronta.reduzida ? T.imagem.reduzida : T.imagem.pronta)(
            escolhida.name,
            pronta.largura,
            pronta.altura,
          ),
        }
      }
    } catch (erro) {
      if (vez !== vezDaImagem.current) return
      const motivo = ehFalhaDaImagem(erro) ? erro.motivo : 'falha_do_navegador'
      estado = {
        tipo: 'aviso',
        texto: {
          nao_aceita: T.imagem.naoAceita,
          corrompida: T.imagem.corrompida,
          falha_do_navegador: T.imagem.falhaDoNavegador,
        }[motivo](escolhida.name),
      }
    }
    setEstadoDaImagem(estado)
    if (estado.tipo === 'pronta') anunciar(estado.texto)
    else anunciar('')
  }

  function mudarApagarDeVerdade(ligado: boolean) {
    mudarCena(comApagarDeVerdade(cena, aberta, ligado))
    setConfirmandoApagar(null)
    anunciar(
      T.anuncios[ligado ? 'apagarLigado' : 'apagarDesligado'](pagina + 1),
    )
    focar(() =>
      ligado ? desligarApagarRef.current : apagarDeVerdadeRef.current,
    )
  }

  async function gerar(
    tipo: TipoDoResultado,
    paginasDoPdf: readonly PaginaDaBancada[],
  ) {
    if (!atual?.ok || !documento || !paginasDoPdf.length) return
    const origem = atual.arquivo
    const idsDoPdf = paginasDoPdf.map(({ id }) => id)
    // O Worker é estrito: objeto, fundo ou moldura de página fora do pedido é erro.
    const cenaDoPdf = cenaDasPaginas(cena, new Set(idsDoPdf))
    const montagem = montagemDaBancada(paginasDoPdf, cenaDoPdf)
    const vez = ++vezDaGeracao.current
    const voltar: Foco = () =>
      tipo === 'editado' ? gerarRef.current : botaoDoExtrair()
    setResultado({ estado: 'montando', tipo })
    anunciar(T.anuncios.montando)
    focar(() => cancelarRef.current)
    try {
      const rasterizadas = new Map<string, Blob>()
      for (const id of paginasParaApagar(cenaDoPdf, idsDoPdf)) {
        const posicao = idsDoPdf.indexOf(id)
        rasterizadas.set(
          id,
          await documento.fundo(
            paginasDoPdf[posicao].origem.indice,
            cobrirDa(cenaDoPdf, id),
            montagem[posicao].moldura,
          ),
        )
        if (vez !== vezDaGeracao.current) return
      }
      const blobs = new Map<string, Blob>()
      for (const id of imagensDa(cenaDoPdf)) {
        const imagem = imagens.get(id)
        if (imagem) blobs.set(id, imagem.blob)
      }
      const pdf = await motor().montar([origem], {
        paginas: montagem,
        objetosPorPagina: cenaDoPdf.objetos,
        imagens: blobs,
        paginasRasterizadas: rasterizadas,
        ...(tipo === 'extraido' && { porCopia: true }),
      })
      if (vez !== vezDaGeracao.current) return
      setResultado({
        estado: 'pronto',
        tipo,
        url: URL.createObjectURL(pdf),
        nome: nomeDoPdfDerivado(origem.name, SUFIXOS[tipo]),
        paginas: paginasDoPdf.length,
        bytes: pdf.size,
      })
      anunciar(
        (tipo === 'editado' ? T.anuncios.pronto : O.anuncios.pronto)(
          paginasDoPdf.length,
          pdf.size,
        ),
      )
      focar(() => baixarRef.current)
    } catch (erro) {
      if (vez !== vezDaGeracao.current) return
      const falha = ehFalhaDaOperacao(erro)
        ? erro
        : { motivo: 'inesperado' as const }
      const indice =
        typeof falha.pagina === 'string' ? ordem.indexOf(falha.pagina) : -1
      setResultado({
        estado: 'falhou',
        tipo,
        mensagem: T.falhaAoSalvar({
          ...falha,
          pagina: indice < 0 ? undefined : indice,
        }),
        objeto:
          indice >= 0 && falha.objeto !== undefined
            ? { pagina: indice, id: falha.objeto }
            : undefined,
      })
      anunciar('')
      focar(voltar)
    }
  }

  function cancelarGeracao() {
    if (resultado.estado !== 'montando') return
    const { tipo } = resultado
    vezDaGeracao.current += 1
    motor().cancelar()
    setResultado({ estado: 'parado' })
    anunciar(T.anuncios.cancelado)
    focar(() => (tipo === 'editado' ? gerarRef.current : botaoDoExtrair()))
  }

  // Com a folha fechada, o Extrair não está na tela: o foco volta ao botão que a abre.
  function botaoDoExtrair() {
    return botoesDaBarra.current.get('extrair') ?? botaoDasPaginasRef.current
  }

  function fecharAFolha(alvo: Foco) {
    focoAoFechar.current = alvo
    setFolhaAberta(false)
  }

  function pularParaAPagina() {
    if (folhaAberta) fecharAFolha(() => areaRef.current)
    else areaRef.current?.focus()
  }

  function mostrarObjeto({
    pagina: destino,
    id,
  }: {
    pagina: number
    id: string
  }) {
    irPara(destino)
    setSelecionado(id)
    focar(() => elementosDosObjetos.current.get(id))
  }

  function descartarResultado(soDoTipo?: TipoDoResultado) {
    if (resultado.estado !== 'pronto' && resultado.estado !== 'falhou') return
    if (soDoTipo && resultado.tipo !== soDoTipo) return
    setResultado({ estado: 'parado' })
  }

  // A página grande fica na moldura: girar uma página com objetos diz como ela sai no PDF.
  function comNotaDoGiro(texto: string, id: string, giro: Giro): string {
    const naMoldura = cena.molduras.get(id)
    const diferenca =
      naMoldura === undefined ? 0 : giroNormalizado(giro - naMoldura)
    return diferenca ? `${texto} ${T.notaDoGiro(diferenca)}` : texto
  }

  function abertaDepois(novaLista: readonly PaginaDaBancada[]): string {
    const ficam = new Set(novaLista.map(({ id }) => id))
    if (ficam.has(aberta)) return aberta
    const vizinha =
      lista.slice(pagina).find(({ id }) => ficam.has(id)) ??
      lista
        .slice(0, pagina)
        .reverse()
        .find(({ id }) => ficam.has(id))
    return vizinha?.id ?? aberta
  }

  function mudarAsPaginas(
    novo: Paginas,
    texto: string,
    alvo?: Foco,
    novaAberta = aberta,
  ) {
    if (!documento) return
    setPaginasDoDoc({
      documento,
      paginas: mudarPaginas(estadoDasPaginas, novo),
    })
    if (novaAberta !== aberta) {
      setVista({ documento, aberta: novaAberta, zoom })
      setSelecionado(null)
      setDicaDoTexto(null)
      setConfirmandoApagar(null)
    }
    descartarResultado()
    anunciar(texto)
    if (alvo) focar(alvo)
  }

  function trocarMarcadas(novas: PaginasComDesfazer) {
    if (!documento) return
    setPaginasDoDoc({ documento, paginas: novas })
    descartarResultado('extraido')
  }

  const caixaDa = (alvo: PaginaDaBancada | undefined) =>
    alvo ? caixas.current.get(alvo.id) : null

  const primeiroBotaoDaBarra = () =>
    [...botoesDaBarra.current.values()].find((botao) => !botao.disabled)

  function agirNaPagina(acao: AcaoNaBancada) {
    if (montando) return
    if (acao.tipo === 'selecionar') {
      trocarMarcadas(marcar(estadoDasPaginas, acao.id, acao.marcada))
      return
    }
    const posicao = ordem.indexOf(acao.id)
    if (posicao < 0) return
    if (acao.tipo === 'abrir') {
      irPara(posicao)
      if (folhaAberta) fecharAFolha(() => areaRef.current)
      return
    }
    if (acao.tipo === 'girar') {
      const novaLista = girar(lista, [posicao], 'direita')
      const { giro } = novaLista[posicao]
      mudarAsPaginas(
        { lista: novaLista, marcadas },
        comNotaDoGiro(O.anuncios.girada(posicao + 1, giro), acao.id, giro),
      )
      return
    }
    if (total === 1) return
    const novo = apagarPaginas(estadoDasPaginas, [posicao])
    const vizinha = novo.lista[posicao] ?? novo.lista[posicao - 1]
    mudarAsPaginas(
      novo,
      O.anuncios.apagada(posicao + 1),
      () => caixaDa(vizinha),
      abertaDepois(novo.lista),
    )
  }

  function girarSelecionadas(sentido: SentidoDoGiro) {
    const novaLista = girar(lista, posicoes, sentido)
    const [primeira] = posicoes
    mudarAsPaginas(
      { lista: novaLista, marcadas },
      qtd === 1
        ? comNotaDoGiro(
            O.anuncios.girada(primeira + 1, novaLista[primeira].giro),
            novaLista[primeira].id,
            novaLista[primeira].giro,
          )
        : O.anuncios.giradas(qtd, sentido),
    )
  }

  function moverAsSelecionadas(lado: LadoDoMovimento) {
    const novaLista = moverSelecionadas(lista, posicoes, lado)
    const marcada = new Set(marcadas)
    const novasPosicoes = novaLista.flatMap(({ id }, posicao) =>
      marcada.has(id) ? [posicao] : [],
    )
    const naPonta =
      lado === 'antes'
        ? novasPosicoes.every((posicao, i) => posicao === i)
        : novasPosicoes.every(
            (posicao, i) => posicao === novaLista.length - qtd + i,
          )
    const mesmo: ChaveDaBarra = lado === 'antes' ? 'moverAntes' : 'moverDepois'
    const outro: ChaveDaBarra = lado === 'antes' ? 'moverDepois' : 'moverAntes'
    mudarAsPaginas(
      { lista: novaLista, marcadas },
      qtd === 1
        ? O.anuncios.movida(posicoes[0] + 1, novasPosicoes[0] + 1, total)
        : O.anuncios.movidas(qtd, lado),
      () => botoesDaBarra.current.get(naPonta ? outro : mesmo),
    )
  }

  function apagarSelecionadas() {
    const novo = apagarPaginas(estadoDasPaginas, posicoes)
    const vizinha = novo.lista[posicoes[0]] ?? novo.lista.at(-1)
    mudarAsPaginas(
      novo,
      qtd === 1
        ? O.anuncios.apagada(posicoes[0] + 1)
        : O.anuncios.apagadas(qtd),
      () => caixaDa(vizinha),
      abertaDepois(novo.lista),
    )
  }

  function selecionarTodas() {
    trocarMarcadas(marcarTodas(estadoDasPaginas))
    anunciar(O.anuncios.todasSelecionadas(total))
    focar(() => botoesDaBarra.current.get('limparSelecao'))
  }

  function limparSelecao() {
    trocarMarcadas(semMarcadas(estadoDasPaginas))
    anunciar(O.anuncios.selecaoLimpa)
    focar(() => botoesDaBarra.current.get('selecionarTodas'))
  }

  function desfazerAsPaginas() {
    if (montando || !documento || !estadoDasPaginas.passado.length) return
    const focadoAntes = document.activeElement
    setPaginasDoDoc({ documento, paginas: desfazerPaginas(estadoDasPaginas) })
    descartarResultado()
    anunciar(P.desfeito)
    focar(() => {
      if (podeTerFoco(focadoAntes)) return focadoAntes
      const botao = botoesDaBarra.current.get('desfazer')
      return podeTerFoco(botao) ? botao : primeiroBotaoDaBarra()
    })
  }

  function moverArrastando(de: number, para: number) {
    mudarAsPaginas(
      { lista: arrayMove([...lista], de, para), marcadas },
      O.anuncios.movida(de + 1, para + 1, total),
    )
  }

  function usarBotao(chave: ChaveDaBarra) {
    const acoes: Record<ChaveDaBarra, () => void> = {
      girarEsquerda: () => girarSelecionadas('esquerda'),
      girarDireita: () => girarSelecionadas('direita'),
      moverAntes: () => moverAsSelecionadas('antes'),
      moverDepois: () => moverAsSelecionadas('depois'),
      apagar: apagarSelecionadas,
      extrair: () => {
        if (folhaAberta) {
          fecharAFolha(
            () => baixarRef.current ?? cancelarRef.current ?? gerarRef.current,
          )
        }
        void gerar('extraido', extrair(lista, posicoes))
      },
      selecionarTodas,
      limparSelecao,
      desfazer: desfazerAsPaginas,
    }
    acoes[chave]()
  }

  function atalhoNasPaginas(sentido: SentidoDoHistorico) {
    if (sentido === 'refazer') anunciar(P.semRefazer)
    else if (!estadoDasPaginas.passado.length)
      anunciar(O.dicas.nadaParaDesfazer)
    else desfazerAsPaginas()
  }

  const irParaRef = useRef(irPara)
  const voltarRef = useRef(voltarNoHistorico)
  const atalhoNasPaginasRef = useRef(atalhoNasPaginas)
  const agirRef = useRef(agirNaPagina)
  const usarRef = useRef(usarBotao)
  useLayoutEffect(() => {
    irParaRef.current = irPara
    voltarRef.current = voltarNoHistorico
    atalhoNasPaginasRef.current = atalhoNasPaginas
    agirRef.current = agirNaPagina
    usarRef.current = usarBotao
  })
  const aoEscolherPagina = useCallback(
    (indice: number) => irParaRef.current(indice),
    [],
  )
  const aoAgirNaPagina = useCallback(
    (acao: AcaoNaBancada) => agirRef.current(acao),
    [],
  )
  const aoUsarNaBarra = useCallback(
    (chave: ChaveDaBarra) => usarRef.current(chave),
    [],
  )
  const registrarRegiao = useCallback((no: HTMLElement | null) => {
    regiaoDasPaginasRef.current = no
  }, [])
  const registrarCaixa = useCallback(
    (id: string, caixa: HTMLInputElement | null) => {
      if (caixa) caixas.current.set(id, caixa)
      else caixas.current.delete(id)
    },
    [],
  )
  const registrarObjeto = useCallback(
    (id: string, elemento: HTMLElement | null) => {
      if (elemento) elementosDosObjetos.current.set(id, elemento)
      else elementosDosObjetos.current.delete(id)
    },
    [],
  )

  useEffect(() => {
    if (!documento) return
    const nasPaginas = (alvo: EventTarget | null) =>
      alvo instanceof Node &&
      Boolean(regiaoDasPaginasRef.current?.contains(alvo))
    // Pelo último gesto, não só pelo foco: desenhar com o mouse não tira o foco da coluna.
    let gestoNasPaginas: boolean | null = null
    const lembrarGesto = (evento: Event) => {
      gestoNasPaginas = nasPaginas(evento.target)
    }
    function aoTeclar(evento: KeyboardEvent) {
      if (
        !(evento.ctrlKey || evento.metaKey) ||
        evento.altKey ||
        ehCampoDeTexto(evento.target)
      ) {
        return
      }
      const tecla = evento.key.toLowerCase()
      const sentido: SentidoDoHistorico | null =
        tecla === 'z'
          ? evento.shiftKey
            ? 'refazer'
            : 'desfazer'
          : tecla === 'y' && evento.ctrlKey && !evento.shiftKey
            ? 'refazer'
            : null
      if (!sentido) return
      evento.preventDefault()
      if (gestoNasPaginas ?? nasPaginas(evento.target)) {
        atalhoNasPaginasRef.current(sentido)
      } else {
        voltarRef.current(sentido)
      }
    }
    window.addEventListener('pointerdown', lembrarGesto, true)
    window.addEventListener('focusin', lembrarGesto, true)
    window.addEventListener('keydown', aoTeclar)
    return () => {
      window.removeEventListener('pointerdown', lembrarGesto, true)
      window.removeEventListener('focusin', lembrarGesto, true)
      window.removeEventListener('keydown', aoTeclar)
    }
  }, [documento])

  const idDoDocumento = `${ids}-documento`
  const idDoTitulo = `${ids}-paginas`
  const idDasInstrucoes = `${ids}-instrucoes`
  const idSemImagem = `${ids}-sem-imagem`
  const idSemDesfazer = `${ids}-sem-desfazer`
  const idSemRefazer = `${ids}-sem-refazer`
  const idSemMudancas = `${ids}-sem-mudancas`
  const idDoAlcance = `${ids}-alcance`
  const idDoAlcanceDoExtrair = `${ids}-alcance-do-extrair`
  const idDoAvisoDoCobrir = `${ids}-aviso-cobrir`
  const idDasConsequencias = `${ids}-consequencias`
  const idDaDica = (motivo: MotivoDesabilitado) => `${ids}-dica-${motivo}`
  const erro =
    arquivo && grandeDemais
      ? T.grandeDemais(arquivo.name, arquivo.size, TETO_DE_BYTES_COM_MINIATURAS)
      : atual && !atual.ok
        ? mensagemDaRecusa(atual.arquivo.name, atual.recusa)
        : null
  const textoDoAnuncio =
    !arquivo || grandeDemais
      ? ''
      : !atual
        ? T.abrindo(arquivo.name)
        : anuncio.texto
  const urlsDasImagens = new Map(
    [...imagens].map(([id, { url }]) => [id, url] as const),
  )
  const nomesDasImagens = new Map(
    [...imagens].map(([id, { nome }]) => [id, nome] as const),
  )
  const podeVoltar = podeDesfazer(historico)
  const podeAvancar = podeRefazer(historico)
  // A página apagada guarda os objetos para o desfazer das páginas, mas não conta no PDF.
  const cenaNoDocumento = cenaDasPaginas(cena, new Set(ordem))
  const quantosObjetos = totalDeObjetos(cenaNoDocumento)
  const paginasComApagar = paginasParaApagar(cenaNoDocumento, ordem)
  const mudou =
    quantosObjetos > 0 ||
    (documento !== null && mudouDoInicio(lista, documento.paginas))
  const porCopia =
    documento !== null && total > 0 && saiPorCopia(lista, documento.paginas)
  const descricaoDoGerar =
    [mudou ? null : idSemMudancas, porCopia ? idDoAlcance : null]
      .filter(Boolean)
      .join(' ') || undefined
  const cobrirAqui = temCobrir(cena, aberta)
  const apagarAqui = cena.apagar.has(aberta)
  const mostrarDicaDoTexto =
    dicaDoTexto?.documento === documento && dicaDoTexto?.pagina === aberta
  const giroDaAberta = paginaAberta?.giro ?? 0
  const diferencaDoGiro = cena.molduras.has(aberta)
    ? giroNormalizado(giroDaAberta - moldura)
    : 0
  const corDoDesenho = nomeDaCor(estilos.traco.cor)
  const criaPorClique = ferramenta !== 'selecionar' && ferramenta !== 'desenho'
  const dicaDaFerramenta =
    ferramenta === 'selecionar' ||
    ferramenta === 'texto' ||
    ferramenta === 'imagem' ||
    ferramenta === 'desenho'
      ? T.ferramentas.dicas[ferramenta]
      : T.ferramentas.dicas.forma
  const paginasDaFaixa: PaginaDaFaixa[] = lista.map(({ id, origem, giro }) => ({
    chave: id,
    miniatura: origem.indice,
    giro,
  }))

  const todasSelecionadas = qtd > 0 && qtd === total
  const noComeco = posicoes.every((posicao, i) => posicao === i)
  const noFim = posicoes.every((posicao, i) => posicao === total - qtd + i)
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
    desfazer:
      soMontando ??
      (estadoDasPaginas.passado.length ? null : 'nadaParaDesfazer'),
  }
  const botoesDaSelecao: BotaoDaBarra[] = ORDEM_DA_BARRA_DA_BANCADA.filter(
    (chave) =>
      (chave !== 'selecionarTodas' || !todasSelecionadas) &&
      (chave !== 'limparSelecao' || qtd > 0),
  ).map((chave) => ({ chave, motivo: motivoDe[chave] }))
  const motivosDaSelecao = new Set(
    botoesDaSelecao.flatMap(({ motivo }) => (motivo ? [motivo] : [])),
  )
  if (total === 1) motivosDaSelecao.add('ultimaPagina')
  const tipoDoResultado = resultado.estado === 'parado' ? null : resultado.tipo

  const idDaArea = `${ids}-area`
  const acoesDasPaginas = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase">
          {P.naSelecao}
        </p>
        <p
          className="text-sm font-medium"
          data-testid="editar-pdf-selecionadas"
        >
          {O.selecionadas(qtd)}
        </p>
      </div>
      <BarraDaSelecao
        botoes={botoesDaSelecao}
        botoesRef={botoesDaBarra}
        idDaDica={idDaDica}
        aoUsar={aoUsarNaBarra}
        prefixo="editar-pdf"
        soIcone={larga ? SO_ICONE : []}
        empilhada={!larga}
        rotulos={{ desfazer: P.desfazer }}
        descricoes={{ extrair: idDoAlcanceDoExtrair }}
      />
      <ul
        className="text-muted-foreground space-y-0.5 text-xs"
        data-testid="editar-pdf-dicas-das-paginas"
      >
        {[...motivosDaSelecao].map((motivo) => (
          <li key={motivo} id={idDaDica(motivo)}>
            {O.dicas[motivo]}
          </li>
        ))}
        {!motivoDe.extrair && (
          <li id={idDoAlcanceDoExtrair}>{P.alcanceDoExtrair}</li>
        )}
        <li>{P.atalho}</li>
      </ul>
    </div>
  )
  const pularParaAAberta = (
    <a
      href={`#${idDaArea}`}
      onClick={(evento) => {
        evento.preventDefault()
        pularParaAPagina()
      }}
      className="focus-visible:ring-ring sr-only rounded-md text-sm font-medium underline underline-offset-4 focus:not-sr-only focus:inline-flex focus:min-h-11 focus:items-center focus:px-2 focus-visible:ring-2 focus-visible:outline-hidden"
      data-testid="editar-pdf-pular"
    >
      {P.pular}
    </a>
  )
  const listaDasPaginas = atual?.ok ? (
    <ListaDaBancada
      paginas={lista}
      nomeDoArquivo={atual.arquivo.name}
      marcadas={new Set(marcadas)}
      aberta={aberta}
      miniaturas={miniaturasDaLista}
      bloqueado={montando}
      idDoTitulo={idDoTitulo}
      idDaDicaUnica={idDaDica('ultimaPagina')}
      aoAgir={aoAgirNaPagina}
      aoMover={moverArrastando}
      registrarCaixa={registrarCaixa}
    />
  ) : null
  const ferramentasDaPagina = (
    <div key="ferramentas" className="space-y-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div ref={barraRef} className="min-w-0">
          <BarraDeFerramentas
            ativa={ferramenta}
            aoEscolher={escolherFerramenta}
          />
        </div>
        <div
          role="group"
          aria-label={T.historico.rotulo}
          className="flex gap-1.5"
        >
          <Button
            ref={desfazerRef}
            type="button"
            variant="outline"
            className="h-11 gap-2 px-3"
            disabled={!podeVoltar}
            aria-describedby={podeVoltar ? undefined : idSemDesfazer}
            aria-keyshortcuts="Control+Z Meta+Z"
            onClick={() => voltarNoHistorico('desfazer')}
            data-testid="editar-pdf-desfazer"
          >
            <FontAwesomeIcon
              icon={faArrowRotateLeft}
              className="size-4"
              aria-hidden
            />
            {T.historico.desfazer}
          </Button>
          <Button
            ref={refazerRef}
            type="button"
            variant="outline"
            className="h-11 gap-2 px-3"
            disabled={!podeAvancar}
            aria-describedby={podeAvancar ? undefined : idSemRefazer}
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
            onClick={() => voltarNoHistorico('refazer')}
            data-testid="editar-pdf-refazer"
          >
            <FontAwesomeIcon
              icon={faArrowRotateRight}
              className="size-4"
              aria-hidden
            />
            {T.historico.refazer}
          </Button>
        </div>
      </div>
      <ul className="text-muted-foreground space-y-0.5 text-xs">
        {!podeVoltar && (
          <li id={idSemDesfazer}>{T.historico.nadaParaDesfazer}</li>
        )}
        {!podeAvancar && (
          <li id={idSemRefazer}>{T.historico.nadaParaRefazer}</li>
        )}
        <li>{T.historico.atalho}</li>
      </ul>

      <div
        className="bg-card border-border space-y-3 rounded-lg border p-3"
        data-testid="editar-pdf-opcoes"
      >
        {ferramenta === 'desenho' && (
          <p
            className="border-primary bg-accent-soft text-foreground rounded-md border px-3 py-2 text-sm font-medium"
            data-testid="editar-pdf-desenho-ativo"
          >
            {T.ferramentas.desenhoAtivo}
          </p>
        )}
        <p className="text-muted-foreground text-sm">{dicaDaFerramenta}</p>
        {ferramenta === 'cobrir' && (
          <p className="text-sm" data-testid="editar-pdf-aviso-cobrir">
            {T.cobrir.aviso}
          </p>
        )}

        {ferramenta === 'desenho' && (
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <div className="min-w-0 space-y-1">
              <label
                htmlFor={`${ids}-cor-desenho`}
                className="text-sm font-medium"
              >
                {T.ferramentas.corDoDesenho}
              </label>
              <select
                id={`${ids}-cor-desenho`}
                value={corDoDesenho ?? ''}
                onChange={(evento) => {
                  const cor = corDoNome(evento.target.value)
                  if (cor) {
                    setEstilos((atuais) => ({
                      ...atuais,
                      traco: { ...atuais.traco, cor },
                    }))
                  }
                }}
                className="border-input bg-background focus-visible:ring-ring h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
              >
                {!corDoDesenho && (
                  <option value="">{T.painel.personalizada}</option>
                )}
                {(Object.keys(CORES) as NomeDaCor[]).map((nome) => (
                  <option key={nome} value={nome}>
                    {T.painel.cores[nome]}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 space-y-1">
              <label
                htmlFor={`${ids}-espessura-desenho`}
                className="text-sm font-medium"
              >
                {T.ferramentas.espessuraDoDesenho}
              </label>
              <Input
                id={`${ids}-espessura-desenho`}
                type="number"
                inputMode="decimal"
                step="any"
                min={ESPESSURA_MINIMA}
                max={ESPESSURA_MAXIMA}
                defaultValue={estilos.traco.espessura}
                onChange={(evento) => {
                  const valor = Number(evento.target.value)
                  if (
                    evento.target.value.trim() !== '' &&
                    valor >= ESPESSURA_MINIMA &&
                    valor <= ESPESSURA_MAXIMA
                  ) {
                    setEstilos((atuais) => ({
                      ...atuais,
                      traco: { ...atuais.traco, espessura: valor },
                    }))
                  }
                }}
                className="h-11 tabular-nums focus-visible:ring-2"
              />
            </div>
          </div>
        )}

        {ferramenta === 'imagem' && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 px-4"
              onClick={() => inputDaImagemRef.current?.click()}
              data-testid="editar-pdf-escolher-imagem"
            >
              <FontAwesomeIcon icon={faImage} className="size-4" aria-hidden />
              {imagemParaPor ? T.imagem.outra : T.imagem.escolher}
            </Button>
            {estadoDaImagem &&
              (estadoDaImagem.tipo === 'aviso' ? (
                <p
                  role="alert"
                  className="bg-card border-destructive rounded-md border px-3 py-2 text-sm [overflow-wrap:anywhere]"
                  data-testid="editar-pdf-aviso-imagem"
                >
                  {estadoDaImagem.texto}
                </p>
              ) : (
                <p
                  className="text-sm [overflow-wrap:anywhere]"
                  data-testid="editar-pdf-estado-imagem"
                >
                  {estadoDaImagem.texto}
                </p>
              ))}
          </div>
        )}

        {criaPorClique && (
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 px-4"
            disabled={!tamanhoDaPagina}
            aria-disabled={
              ferramenta === 'imagem' && !imagemParaPor ? true : undefined
            }
            aria-describedby={
              ferramenta === 'imagem' && !imagemParaPor
                ? idSemImagem
                : undefined
            }
            onClick={() => {
              if (tamanhoDaPagina) {
                inserir({ centro: centroVisivel(tamanhoDaPagina) })
              }
            }}
            data-testid="editar-pdf-inserir-no-centro"
          >
            <FontAwesomeIcon
              icon={faCrosshairs}
              className="size-4"
              aria-hidden
            />
            {T.ferramentas.inserirNoCentro}
          </Button>
        )}
        {ferramenta === 'imagem' && !imagemParaPor && (
          <p id={idSemImagem} className="sr-only">
            {T.ferramentas.semImagem}
          </p>
        )}
        <input
          ref={inputDaImagemRef}
          type="file"
          accept="image/png,image/jpeg,.png,.jpg,.jpeg"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(evento) => {
            const escolhida = evento.target.files?.[0]
            evento.target.value = ''
            if (escolhida) void escolherImagem(escolhida)
          }}
          data-testid="editar-pdf-input-imagem"
        />
      </div>
    </div>
  )
  const paginaNaBancada = (
    <div key="pagina" className="space-y-4">
      {diferencaDoGiro !== 0 && (
        <p
          className="bg-card border-border flex gap-2 rounded-md border px-3 py-2 text-sm"
          data-testid="editar-pdf-nota-do-giro"
        >
          <FontAwesomeIcon
            icon={faRotate}
            className="text-primary mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <span className="min-w-0">{T.notaDoGiro(diferencaDoGiro)}</span>
        </p>
      )}

      <AreaDaPagina
        id={idDaArea}
        areaRef={areaRef}
        folhaRef={folhaRef}
        numeroDaPagina={pagina + 1}
        larguraCss={larguraCss}
        proporcao={proporcao}
        desenhando={desenhando}
        falhou={naoDesenhou}
        aoTentarDeNovo={tentarDeNovo}
      >
        {tamanhoDaPagina && (
          <QuadroDeObjetos
            numeroDaPagina={pagina + 1}
            tamanho={tamanhoDaPagina}
            objetos={objetosDaPagina}
            selecionado={objetoEscolhido?.id ?? null}
            ferramenta={ferramenta}
            urlsDasImagens={urlsDasImagens}
            nomesDasImagens={nomesDasImagens}
            estiloDoDesenho={estilos.traco}
            idDasInstrucoes={idDasInstrucoes}
            quadroRef={quadroRef}
            registrar={registrarObjeto}
            aoFocar={setSelecionado}
            aoMudar={mudarPeloQuadro}
            aoApagar={apagarObjeto}
            aoEditarTexto={() => textoRef.current?.focus()}
            aoSoltar={soltarObjeto}
            aoCriar={inserir}
            aoDesenhar={desenhar}
            aoClicarNaPagina={(ponto) => void clicarNaPagina(ponto)}
          />
        )}
      </AreaDaPagina>

      <ControlesDaPagina
        pagina={pagina}
        total={total}
        zoom={zoom}
        anteriorRef={anteriorRef}
        proximaRef={proximaRef}
        diminuirRef={diminuirRef}
        aumentarRef={aumentarRef}
        aoPassar={passar}
        aoMudarZoom={mudarZoom}
      />
      <p
        id={idDasInstrucoes}
        className="text-muted-foreground text-xs leading-relaxed"
      >
        {T.objetos.instrucoes}
      </p>

      {mostrarDicaDoTexto && (
        <div
          className="bg-card border-border flex flex-wrap items-center gap-3 rounded-md border px-3 py-3 text-sm"
          data-testid="editar-pdf-dica-texto"
        >
          <FontAwesomeIcon
            icon={faCircleInfo}
            className="text-primary size-4 shrink-0"
            aria-hidden
          />
          <p className="min-w-0 flex-1 basis-56">{T.textoExistente}</p>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => escolherFerramenta('cobrir')}
            data-testid="editar-pdf-usar-cobrir"
          >
            {T.usarCobrir}
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-8" data-testid="editar-pdf">
      <AvisoDePrivacidade />

      <section aria-label={T.rotulo} className="space-y-3">
        <ZonaDeArquivos
          multiplos={false}
          desabilitada={montando}
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
            data-testid="editar-pdf-erro"
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
        <section aria-labelledby={idDoDocumento} className="space-y-4">
          <CabecalhoDoDocumento
            idDoTitulo={idDoDocumento}
            titulo={T.aberto(atual.arquivo.name, total)}
            avisos={avisos}
          >
            {quantosObjetos > 0 && (
              <p className="text-muted-foreground text-sm">
                {T.gerar.resumo(quantosObjetos, cenaNoDocumento.objetos.size)}
              </p>
            )}
            {paginasComApagar.length > 0 && (
              <p className="text-sm" data-testid="editar-pdf-paginas-apagadas">
                {T.gerar.apagando(
                  paginasComApagar.map((id) => ordem.indexOf(id) + 1),
                )}
              </p>
            )}
            {montando ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm">{T.gerar.montando}</p>
                <Button
                  ref={cancelarRef}
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={cancelarGeracao}
                  data-testid="editar-pdf-cancelar"
                >
                  {T.gerar.cancelar}
                </Button>
              </div>
            ) : (
              <Button
                ref={gerarRef}
                type="button"
                className="h-11 gap-2 px-6"
                disabled={!mudou}
                aria-describedby={descricaoDoGerar}
                onClick={() => void gerar('editado', lista)}
                data-testid="editar-pdf-gerar"
              >
                <FontAwesomeIcon
                  icon={faFilePdf}
                  className="size-4"
                  aria-hidden
                />
                {T.gerar.botao}
              </Button>
            )}
            {!mudou && (
              <p id={idSemMudancas} className="text-muted-foreground text-xs">
                {T.gerar.semMudancas}
              </p>
            )}
            {(porCopia ||
              (resultado.estado === 'pronto' &&
                resultado.tipo === 'extraido')) && (
              <p
                id={idDoAlcance}
                className="text-muted-foreground text-xs leading-relaxed"
                data-testid="editar-pdf-alcance"
              >
                {TEXTOS.alcance}
              </p>
            )}

            {resultado.estado === 'falhou' && (
              <div
                role="alert"
                data-testid="editar-pdf-falha-ao-gerar"
                className="bg-card border-destructive flex flex-wrap items-center gap-3 rounded-md border px-3 py-3 text-sm"
              >
                <FontAwesomeIcon
                  icon={faCircleExclamation}
                  className="text-destructive size-4 shrink-0"
                  aria-hidden
                />
                <p className="min-w-0 flex-1 basis-56 [overflow-wrap:anywhere]">
                  {resultado.mensagem}
                </p>
                {resultado.objeto && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    onClick={() =>
                      resultado.objeto && mostrarObjeto(resultado.objeto)
                    }
                    data-testid="editar-pdf-mostrar-objeto"
                  >
                    {T.gerar.mostrarObjeto}
                  </Button>
                )}
              </div>
            )}

            {resultado.estado === 'pronto' && (
              <div
                data-testid="editar-pdf-resultado"
                data-tipo={tipoDoResultado ?? undefined}
                className="bg-background border-border motion-safe:animate-in motion-safe:fade-in-0 flex flex-wrap items-center gap-4 rounded-lg border p-4 motion-safe:duration-200"
              >
                <div className="min-w-0 flex-1 basis-48 space-y-0.5">
                  <p className="font-semibold">
                    {resultado.tipo === 'editado'
                      ? T.gerar.pronto
                      : O.resultado.extraido}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {T.gerar.resumoDoPronto(resultado.paginas, resultado.bytes)}
                  </p>
                </div>
                <Button asChild className="h-11 gap-2 px-5">
                  <a
                    ref={baixarRef}
                    href={resultado.url}
                    download={resultado.nome}
                    data-testid="editar-pdf-baixar"
                  >
                    <FontAwesomeIcon
                      icon={faDownload}
                      className="size-4"
                      aria-hidden
                    />
                    <span className="[overflow-wrap:anywhere] whitespace-normal">
                      {T.gerar.baixar(resultado.nome)}
                    </span>
                  </a>
                </Button>
              </div>
            )}
          </CabecalhoDoDocumento>

          <div
            className="space-y-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)_15rem] lg:items-start lg:gap-5 lg:space-y-0 xl:grid-cols-[17rem_minmax(0,1fr)_17rem]"
            data-testid="editar-pdf-bancada"
          >
            {larga && (
              <aside
                ref={registrarRegiao}
                aria-labelledby={idDoTitulo}
                className="bg-card border-border flex flex-col gap-3 rounded-lg border p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)]"
                data-testid="editar-pdf-coluna-de-paginas"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 id={idDoTitulo} className="font-semibold">
                    {T.paginas}
                  </h3>
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {total}
                  </span>
                </div>
                {acoesDasPaginas}
                {pularParaAAberta}
                <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
                  {listaDasPaginas}
                </div>
              </aside>
            )}

            <div
              inert={montando || undefined}
              className="min-w-0 space-y-4"
              data-testid="editar-pdf-edicao"
            >
              {!larga && (
                <Sheet open={folhaAberta} onOpenChange={setFolhaAberta}>
                  <SheetTrigger asChild>
                    <Button
                      ref={botaoDasPaginasRef}
                      type="button"
                      variant="outline"
                      className="h-11 gap-2 px-4"
                      data-testid="editar-pdf-botao-paginas"
                    >
                      <FontAwesomeIcon
                        icon={faLayerGroup}
                        className="size-4"
                        aria-hidden
                      />
                      {P.abrirFolha}
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    ref={registrarRegiao}
                    side="bottom"
                    aria-describedby={undefined}
                    onCloseAutoFocus={(evento) => {
                      const alvo = focoAoFechar.current
                      if (!alvo) return
                      focoAoFechar.current = null
                      evento.preventDefault()
                      alvo()?.focus()
                    }}
                    className="flex max-h-[85dvh] flex-col gap-3 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] [&>button:last-child]:top-2 [&>button:last-child]:right-2 [&>button:last-child]:flex [&>button:last-child]:size-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center"
                    data-testid="editar-pdf-folha-de-paginas"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 pr-12">
                      <SheetTitle>
                        <span id={idDoTitulo}>{P.titulo}</span>
                      </SheetTitle>
                      <span className="text-muted-foreground text-sm">
                        {P.contagem(total)}
                      </span>
                    </div>
                    {acoesDasPaginas}
                    <p className="text-muted-foreground text-sm">
                      {P.dicaDaFolha}
                    </p>
                    {pularParaAAberta}
                    <div
                      className="-mx-1 min-h-32 flex-1 overflow-y-auto px-1 py-1"
                      data-testid="editar-pdf-rolagem-da-folha"
                    >
                      {listaDasPaginas}
                    </div>
                  </SheetContent>
                </Sheet>
              )}

              {documento && (
                <div className="lg:hidden">
                  <FaixaDePaginas
                    documento={documento}
                    paginas={paginasDaFaixa}
                    pagina={pagina}
                    rotulo={T.paginas}
                    miniaturas={miniaturasDaFaixa}
                    aoEscolher={aoEscolherPagina}
                  />
                </div>
              )}

              {larga
                ? [ferramentasDaPagina, paginaNaBancada]
                : [paginaNaBancada, ferramentasDaPagina]}
            </div>

            <div
              inert={montando || undefined}
              className="min-w-0 space-y-4 lg:sticky lg:top-4"
              data-testid="editar-pdf-coluna-do-objeto"
            >
              {objetoEscolhido && tamanhoDaPagina ? (
                <PainelDoObjeto
                  key={objetoEscolhido.id}
                  objeto={objetoEscolhido}
                  nomeDaImagem={
                    objetoEscolhido.tipo === 'imagem'
                      ? imagens.get(objetoEscolhido.imagem)?.nome
                      : undefined
                  }
                  textoRef={textoRef}
                  aoMudar={mudarPeloPainel}
                  aoApagar={() => apagarObjeto(objetoEscolhido.id)}
                  aoVoltar={() =>
                    elementosDosObjetos.current.get(objetoEscolhido.id)?.focus()
                  }
                />
              ) : (
                <p
                  className="text-muted-foreground text-sm"
                  data-testid="editar-pdf-painel-vazio"
                >
                  {T.painel.nenhum}
                </p>
              )}

              {cobrirAqui && (
                <div
                  role="group"
                  aria-labelledby={`${ids}-cobrir`}
                  className="bg-card border-border space-y-3 rounded-lg border p-4"
                  data-testid="editar-pdf-cobrir"
                >
                  <h3 id={`${ids}-cobrir`} className="font-semibold">
                    {T.cobrir.titulo}
                  </h3>
                  <p id={idDoAvisoDoCobrir} className="text-sm">
                    {T.cobrir.aviso}
                  </p>
                  {apagarAqui ? (
                    <div className="space-y-2">
                      <p
                        className="text-sm font-medium"
                        data-testid="editar-pdf-apagar-ligado"
                      >
                        {T.cobrir.ligado(pagina + 1)}
                      </p>
                      <Button
                        ref={desligarApagarRef}
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={() => mudarApagarDeVerdade(false)}
                        data-testid="editar-pdf-so-cobrir"
                      >
                        {T.cobrir.desligar}
                      </Button>
                    </div>
                  ) : confirmandoApagar === aberta ? (
                    <div
                      className="space-y-2"
                      data-testid="editar-pdf-explicacao"
                    >
                      <p id={`${ids}-antes`} className="text-sm font-medium">
                        {T.cobrir.antes}
                      </p>
                      <ul
                        id={idDasConsequencias}
                        className="list-disc space-y-1 pl-5 text-sm"
                      >
                        {T.cobrir
                          .consequencias(porCopia)
                          .map((consequencia) => (
                            <li key={consequencia}>{consequencia}</li>
                          ))}
                      </ul>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          ref={confirmarApagarRef}
                          type="button"
                          variant="destructive"
                          className="h-11"
                          aria-describedby={`${ids}-antes ${idDasConsequencias}`}
                          onClick={() => mudarApagarDeVerdade(true)}
                          data-testid="editar-pdf-confirmar-apagar"
                        >
                          {T.cobrir.confirmar}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11"
                          onClick={() => {
                            setConfirmandoApagar(null)
                            focar(() => apagarDeVerdadeRef.current)
                          }}
                          data-testid="editar-pdf-cancelar-apagar"
                        >
                          {T.cobrir.cancelar}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      ref={apagarDeVerdadeRef}
                      type="button"
                      variant="outline"
                      className="h-11 whitespace-normal"
                      aria-describedby={idDoAvisoDoCobrir}
                      onClick={() => {
                        setConfirmandoApagar(aberta)
                        focar(() => confirmarApagarRef.current)
                      }}
                      data-testid="editar-pdf-apagar-de-verdade"
                    >
                      {T.cobrir.apagarDeVerdade}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <p role="status" className="sr-only" data-testid="editar-pdf-anuncio">
        {textoDoAnuncio}
        {anuncio.vez % 2 ? ' ' : ''}
      </p>
    </div>
  )
}
