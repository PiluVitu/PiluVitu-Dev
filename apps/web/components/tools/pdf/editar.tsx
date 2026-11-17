'use client'

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent as EventoDeFoco,
  type KeyboardEvent as EventoDeTeclado,
  type RefObject,
} from 'react'
import {
  faArrowRotateLeft,
  faArrowRotateRight,
  faChevronLeft,
  faChevronRight,
  faCircleExclamation,
  faCircleInfo,
  faCrosshairs,
  faDownload,
  faFilePdf,
  faImage,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import {
  TETO_DAS_IMAGENS_EM_BYTES,
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  desfazer as desfazerNoHistorico,
  historicoInicial,
  nomeDoPdfDerivado,
  podeDesfazer,
  podeRefazer,
  refazer as refazerNoHistorico,
  registrarNoHistorico,
  type Formulario,
  type Historico,
  type Ponto,
  type PontoDoTraco,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import { useDocumentoPdf } from './documento-pdf'
import { ehCampoDeTexto, podeTerFoco } from './foco'
import { BarraDeFerramentas } from './barra-de-ferramentas'
import { ehFalhaDaImagem, prepararImagem } from './imagem-inserida'
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
  FERRAMENTAS_DO_MODO,
  SUFIXO_DO_MODO,
  comApagarDeVerdade,
  comMudanca,
  corDoNome,
  cobrirDa,
  criarObjeto,
  criarTraco,
  imagensDa,
  incluirObjeto,
  lembrarEstilo,
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
  type ModoDaTela,
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
import { TEXTOS, TEXTOS_DO_MODO, type TextosDoModo } from './textos'
import { useAbrirPdf, type RecusaDaAbertura } from './use-abrir-pdf'
import { useMiniaturas } from './use-miniaturas'
import { AvisoDePrivacidade, ZonaDeArquivos } from './zona-de-arquivos'

const T = TEXTOS.editar

/** Frações da largura da área; 1 é a página na largura da área. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

const ZOOM_INICIAL = ZOOMS.indexOf(1)

const LARGURA_SEM_MEDIDA = 600

// Redimensionar a janela dispara a medida a cada quadro; a página só é desenhada de novo quando para.
const ESPERA_DO_REDIMENSIONAR_MS = 150

const PROPORCAO_DO_A4 = Math.SQRT2

// A imagem da miniatura na faixa: 4,5rem do botão menos o respiro.
const LARGURA_DA_MINIATURA_NA_FAIXA = 64

// Seta segurada ou campo digitado: os passos de um mesmo objeto, um logo depois do outro, viram um desfazer só.
const JANELA_DA_JUNCAO_MS = 1_000

// A posição só é falada quando a pessoa para de mexer, e não a cada passo.
const PAUSA_DO_ANUNCIO_MS = 500

type Vista = {
  documento: DocumentoAberto | null
  pagina: number
  zoom: number
}

const SEM_VISTA: Vista = { documento: null, pagina: 0, zoom: ZOOM_INICIAL }

type Desenho = {
  documento: DocumentoAberto
  pagina: number
  larguraCss: number
  tentativa: number
  ok: boolean
  /** O da última página desenhada: até a nova chegar, a folha fica com a proporção dela. */
  tamanho: Tamanho | null
}

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

type Resultado =
  | { estado: 'parado' }
  | { estado: 'montando' }
  | {
      estado: 'pronto'
      url: string
      nome: string
      paginas: number
      bytes: number
    }
  | {
      estado: 'falhou'
      mensagem: string
      objeto?: { pagina: number; id: string }
    }

type Foco = () => HTMLElement | null | undefined

type SentidoDoHistorico = 'desfazer' | 'refazer'

function mensagemDaRecusa(
  nome: string,
  recusa: RecusaDaAbertura,
  textos: TextosDoModo,
): string {
  return 'paginasDemais' in recusa
    ? textos.paginasDemais(nome, recusa.paginasDemais, TETO_DE_PAGINAS)
    : T.recusado(nome, recusa.motivo)
}

function useLarguraDaArea(
  area: RefObject<HTMLElement | null>,
  ativa: boolean,
): number | null {
  const [largura, setLargura] = useState<number | null>(null)
  useEffect(() => {
    const elemento = area.current
    if (!ativa || !elemento || typeof ResizeObserver === 'undefined') return
    let espera: ReturnType<typeof setTimeout> | undefined
    let primeira = true
    const observador = new ResizeObserver(([entrada]) => {
      const nova = Math.max(1, Math.floor(entrada.contentRect.width))
      clearTimeout(espera)
      if (primeira) {
        primeira = false
        setLargura(nova)
      } else {
        espera = setTimeout(() => setLargura(nova), ESPERA_DO_REDIMENSIONAR_MS)
      }
    })
    observador.observe(elemento)
    return () => {
      clearTimeout(espera)
      observador.disconnect()
    }
  }, [area, ativa])
  return typeof ResizeObserver === 'undefined' ? LARGURA_SEM_MEDIDA : largura
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
  /** O assinar é esta mesma tela, com as ferramentas dele e o formulário lido ao abrir. */
  modo?: ModoDaTela
  /** Injetável para story e teste; sem ele, o pdf.js é baixado quando o primeiro PDF chega. */
  renderizador?: RenderizadorDePdf
  /** Injetável para story e teste; sem ele, o motor usa um Web Worker com o pdf-lib. */
  motor?: MotorDePdf
}

export function EditarPdf({
  modo = 'editar',
  renderizador: renderizadorInjetado,
  motor: motorInjetado,
}: Props) {
  const ids = useId()
  const TM = TEXTOS_DO_MODO[modo]
  const ferramentasDoModo = FERRAMENTAS_DO_MODO[modo]
  const { arquivo, guardar } = useDocumentoPdf()
  const renderizadorRef = useRef<RenderizadorDePdf | null>(
    renderizadorInjetado ?? null,
  )
  const motorRef = useRef<MotorDePdf | null>(motorInjetado ?? null)
  const areaRef = useRef<HTMLDivElement>(null)
  const folhaRef = useRef<HTMLDivElement>(null)
  const quadroRef = useRef<HTMLDivElement>(null)
  const faixaRef = useRef<HTMLOListElement>(null)
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
  const botoesDasPaginas = useRef(new Map<number, HTMLButtonElement>())
  const elementosDosObjetos = useRef(new Map<string, HTMLElement>())
  const focoPendente = useRef<Foco | null>(null)
  const juncao = useRef<{ chave: string; quando: number } | null>(null)
  const anuncioAdiado = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const vezDaImagem = useRef(0)
  const vezDoClique = useRef(0)
  const vezDaGeracao = useRef(0)

  const [vista, setVista] = useState<Vista>(SEM_VISTA)
  const [desenho, setDesenho] = useState<Desenho | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [focoNaFaixa, setFocoNaFaixa] = useState<{
    documento: DocumentoAberto
    indice: number
  } | null>(null)
  const [anuncio, setAnuncio] = useState({ texto: '', vez: 0 })
  const [edicao, setEdicao] = useState<Edicao>(SEM_EDICAO)
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
    pagina: number
  } | null>(null)
  const [confirmandoApagar, setConfirmandoApagar] = useState<number | null>(
    null,
  )
  const [resultado, setResultado] = useState<Resultado>({ estado: 'parado' })
  const [formularioLido, setFormularioLido] = useState<{
    documento: DocumentoAberto
    formulario: Formulario
  } | null>(null)

  const { atual, documento, grandeDemais } = useAbrirPdf(arquivo, {
    motor,
    renderizador: () =>
      (renderizadorRef.current ??= criarRenderizadorComPdfjs()),
    formulario: modo === 'assinar',
    aoAbrir(aberto, doArquivo, formulario) {
      setFormularioLido(formulario ? { documento: aberto, formulario } : null)
      setVista({ ...SEM_VISTA, documento: aberto })
      setEdicao({ documento: aberto, historico: historicoInicial(CENA_VAZIA) })
      setFerramenta('selecionar')
      setSelecionado(null)
      setImagemPendente(null)
      setEstadoDaImagem(null)
      setDicaDoTexto(null)
      setConfirmandoApagar(null)
      setResultado({ estado: 'parado' })
      soltarImagens(new Set())
      juncao.current = null
      anunciar(T.aberto(doArquivo.name, aberto.paginas))
    },
    aoRecusar: () => anunciar(''),
  })
  const miniaturas = useMiniaturas(documento, LARGURA_DA_MINIATURA_NA_FAIXA)
  const larguraDaArea = useLarguraDaArea(areaRef, documento !== null)

  const { pagina, zoom } =
    documento && vista.documento === documento ? vista : SEM_VISTA
  const total = documento?.paginas ?? 0
  const larguraCss =
    larguraDaArea === null
      ? null
      : Math.max(1, Math.round(larguraDaArea * ZOOMS[zoom]))
  const desenhoDaVez =
    desenho &&
    desenho.documento === documento &&
    desenho.pagina === pagina &&
    desenho.larguraCss === larguraCss &&
    desenho.tentativa === tentativa
      ? desenho
      : null
  const desenhando = documento !== null && desenhoDaVez === null
  const tamanho =
    desenho && desenho.documento === documento ? desenho.tamanho : null
  const proporcao = tamanho ? tamanho.altura / tamanho.largura : PROPORCAO_DO_A4
  // Os objetos só aparecem quando a página deles já foi desenhada: é o tamanho dela que os posiciona.
  const tamanhoDaPagina =
    desenho &&
    desenho.documento === documento &&
    desenho.pagina === pagina &&
    desenho.ok
      ? desenho.tamanho
      : null
  const indiceFocavel =
    focoNaFaixa && focoNaFaixa.documento === documento
      ? focoNaFaixa.indice
      : pagina

  const { historico } =
    documento && edicao.documento === documento ? edicao : SEM_EDICAO
  const cena = historico.presente
  const objetosDaPagina = objetosDa(cena, pagina)
  const objetoEscolhido =
    (selecionado && objetosDaPagina.find((o) => o.id === selecionado)) || null
  const montando = resultado.estado === 'montando'
  const urlDoResultado = resultado.estado === 'pronto' ? resultado.url : null
  const imagemParaPor = imagemPendente ? imagens.get(imagemPendente) : undefined
  const formulario =
    formularioLido && formularioLido.documento === documento
      ? formularioLido.formulario
      : null

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
    if (!documento || larguraCss === null) return
    let ativo = true
    const pedido = { documento, pagina, larguraCss, tentativa }
    documento.pagina(pagina, larguraCss).then(
      ({ canvas, tamanho: daPagina }) => {
        if (!ativo) return
        canvas.className = 'block size-full'
        canvas.dataset.testid = 'editar-pdf-canvas'
        folhaRef.current?.replaceChildren(canvas)
        setDesenho({ ...pedido, ok: true, tamanho: daPagina })
      },
      () => {
        // O pedido superado por outra página ou outro zoom já saiu daqui (ativo é false).
        if (!ativo) return
        setDesenho((anterior) => ({
          ...pedido,
          ok: false,
          tamanho: anterior?.documento === documento ? anterior.tamanho : null,
        }))
      },
    )
    return () => {
      ativo = false
    }
  }, [documento, pagina, larguraCss, tentativa])

  // Só a faixa rola até a miniatura da página aberta: um scrollIntoView rolaria a página inteira junto.
  useEffect(() => {
    const faixa = faixaRef.current
    const botao = botoesDasPaginas.current.get(pagina)
    if (!faixa || !botao) return
    const daFaixa = faixa.getBoundingClientRect()
    const doBotao = botao.getBoundingClientRect()
    if (doBotao.left < daFaixa.left) {
      faixa.scrollLeft -= daFaixa.left - doBotao.left
    } else if (doBotao.right > daFaixa.right) {
      faixa.scrollLeft += doBotao.right - daFaixa.right
    }
  }, [pagina, documento])

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
    setVista({ documento, pagina: indice, zoom })
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
    setVista({ documento, pagina, zoom: novo })
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
    mudarCena(incluirObjeto(cena, pagina, objeto), undefined, null)
    setSelecionado(objeto.id)
    setFerramenta('selecionar')
    if (ferramenta === 'imagem') {
      setImagemPendente(null)
      setEstadoDaImagem(null)
    }
    anunciar(T.anuncios.inserido(objeto, imagemParaPor?.nome))
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
    mudarCena(incluirObjeto(cena, pagina, objeto))
    anunciar(T.anuncios.inserido(objeto))
  }

  function mudarPeloQuadro(novo: ObjetoNaTela, origem: OrigemDaMudanca) {
    mudarCena(
      trocarObjeto(cena, pagina, novo),
      origem === 'ponteiro' ? undefined : `${origem}:${novo.id}`,
    )
    anunciarDepois(T.anuncios.posicao(novo))
  }

  function mudarPeloPainel(mudanca: Mudanca) {
    if (!objetoEscolhido || !tamanhoDaPagina) return
    const novo = comMudanca(objetoEscolhido, mudanca, tamanhoDaPagina)
    mudarCena(
      trocarObjeto(cena, pagina, novo),
      `painel:${mudanca.campo}:${novo.id}`,
    )
    setEstilos((atuais) => lembrarEstilo(atuais, novo))
  }

  function apagarObjeto(id: string) {
    const posicao = objetosDaPagina.findIndex((o) => o.id === id)
    if (posicao < 0) return
    const vizinho =
      objetosDaPagina[posicao + 1] ?? objetosDaPagina[posicao - 1] ?? null
    mudarCena(tirarObjeto(cena, pagina, id))
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

  // A dica do texto do PDF manda usar o Cobrir: sem ele na barra, nem pergunta.
  async function clicarNaPagina(ponto: Ponto) {
    setSelecionado(null)
    if (!documento || !ferramentasDoModo.includes('cobrir')) return
    const vez = ++vezDoClique.current
    const temTexto = await documento
      .textoNoPonto(pagina, ponto)
      .catch(() => false)
    if (vez !== vezDoClique.current) return
    setDicaDoTexto(temTexto ? { documento, pagina } : null)
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
    const mudadas = paginasMudadas(historico.presente, novo.presente)
    const outra =
      mudadas.length > 0 && !mudadas.includes(pagina) ? mudadas[0] : null
    if (outra !== null) {
      setVista({ documento, pagina: outra, zoom })
      setSelecionado(null)
    }
    anunciar(
      outra === null
        ? T.anuncios[sentido === 'desfazer' ? 'desfeito' : 'refeito']
        : T.anuncios[
            sentido === 'desfazer' ? 'desfeitoNaPagina' : 'refeitoNaPagina'
          ](outra + 1),
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
    mudarCena(comApagarDeVerdade(cena, pagina, ligado))
    setConfirmandoApagar(null)
    anunciar(
      T.anuncios[ligado ? 'apagarLigado' : 'apagarDesligado'](pagina + 1),
    )
    focar(() =>
      ligado ? desligarApagarRef.current : apagarDeVerdadeRef.current,
    )
  }

  async function gerar() {
    if (!atual?.ok || !documento) return
    const origem = atual.arquivo
    const cenaDoPdf = cena
    const vez = ++vezDaGeracao.current
    setResultado({ estado: 'montando' })
    anunciar(T.anuncios.montando)
    focar(() => cancelarRef.current)
    try {
      const rasterizadas = new Map<number, Blob>()
      for (const indice of paginasParaApagar(cenaDoPdf)) {
        rasterizadas.set(
          indice,
          await documento.fundo(indice, cobrirDa(cenaDoPdf, indice)),
        )
        if (vez !== vezDaGeracao.current) return
      }
      const blobs = new Map<string, Blob>()
      for (const id of imagensDa(cenaDoPdf)) {
        const imagem = imagens.get(id)
        if (imagem) blobs.set(id, imagem.blob)
      }
      const pdf = await motor().editar(origem, {
        objetosPorPagina: cenaDoPdf.objetos,
        imagens: blobs,
        paginasRasterizadas: rasterizadas,
      })
      if (vez !== vezDaGeracao.current) return
      setResultado({
        estado: 'pronto',
        url: URL.createObjectURL(pdf),
        nome: nomeDoPdfDerivado(origem.name, SUFIXO_DO_MODO[modo]),
        paginas: documento.paginas,
        bytes: pdf.size,
      })
      anunciar(TM.anuncios.pronto(documento.paginas, pdf.size))
      focar(() => baixarRef.current)
    } catch (erro) {
      if (vez !== vezDaGeracao.current) return
      const falha = ehFalhaDaOperacao(erro)
        ? erro
        : { motivo: 'inesperado' as const }
      setResultado({
        estado: 'falhou',
        mensagem: T.falhaAoSalvar(falha),
        objeto:
          falha.pagina !== undefined && falha.objeto !== undefined
            ? { pagina: falha.pagina, id: falha.objeto }
            : undefined,
      })
      anunciar('')
      focar(() => gerarRef.current)
    }
  }

  function cancelarGeracao() {
    vezDaGeracao.current += 1
    motor().cancelar()
    setResultado({ estado: 'parado' })
    anunciar(T.anuncios.cancelado)
    focar(() => gerarRef.current)
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

  const irParaRef = useRef(irPara)
  const voltarRef = useRef(voltarNoHistorico)
  useLayoutEffect(() => {
    irParaRef.current = irPara
    voltarRef.current = voltarNoHistorico
  })
  const aoEscolherPagina = useCallback(
    (indice: number) => irParaRef.current(indice),
    [],
  )
  const aoFocarMiniatura = useCallback(
    (indice: number) => {
      if (documento) setFocoNaFaixa({ documento, indice })
    },
    [documento],
  )
  const registrarBotao = useCallback(
    (indice: number, botao: HTMLButtonElement | null) => {
      if (botao) botoesDasPaginas.current.set(indice, botao)
      else botoesDasPaginas.current.delete(indice)
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
      voltarRef.current(sentido)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [documento])

  function aoTeclarNaFaixa(evento: EventoDeTeclado<HTMLOListElement>) {
    const destinos: Record<string, number> = {
      ArrowRight: Math.min(total - 1, indiceFocavel + 1),
      ArrowLeft: Math.max(0, indiceFocavel - 1),
      Home: 0,
      End: total - 1,
    }
    const destino = destinos[evento.key]
    if (destino === undefined) return
    evento.preventDefault()
    botoesDasPaginas.current.get(destino)?.focus()
  }

  function aoSairDaFaixa(evento: EventoDeFoco<HTMLOListElement>) {
    if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
      setFocoNaFaixa(null)
    }
  }

  const idDoTitulo = `${ids}-paginas`
  const idDaPosicao = `${ids}-posicao`
  const idDoMinimo = `${ids}-zoom-minimo`
  const idDoMaximo = `${ids}-zoom-maximo`
  const idDasInstrucoes = `${ids}-instrucoes`
  const idSemImagem = `${ids}-sem-imagem`
  const idSemDesfazer = `${ids}-sem-desfazer`
  const idSemRefazer = `${ids}-sem-refazer`
  const idSemMudancas = `${ids}-sem-mudancas`
  const idDoAvisoDoCobrir = `${ids}-aviso-cobrir`
  const idDasConsequencias = `${ids}-consequencias`
  const noMinimo = zoom === 0
  const noMaximo = zoom === ZOOMS.length - 1
  const erro =
    arquivo && grandeDemais
      ? TM.grandeDemais(
          arquivo.name,
          arquivo.size,
          TETO_DE_BYTES_COM_MINIATURAS,
        )
      : atual && !atual.ok
        ? mensagemDaRecusa(atual.arquivo.name, atual.recusa, TM)
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
  const quantosObjetos = totalDeObjetos(cena)
  const paginasComApagar = paginasParaApagar(cena)
  const cobrirAqui = temCobrir(cena, pagina)
  const apagarAqui = cena.apagar.has(pagina)
  const mostrarDicaDoTexto =
    dicaDoTexto?.documento === documento && dicaDoTexto?.pagina === pagina
  const corDoDesenho = nomeDaCor(estilos.traco.cor)
  const criaPorClique = ferramenta !== 'selecionar' && ferramenta !== 'desenho'
  const dicaDaFerramenta =
    ferramenta === 'selecionar' ||
    ferramenta === 'texto' ||
    ferramenta === 'imagem' ||
    ferramenta === 'desenho'
      ? T.ferramentas.dicas[ferramenta]
      : T.ferramentas.dicas.forma

  return (
    <div
      className="space-y-8"
      data-testid="editar-pdf"
      data-formulario={formulario?.tipo}
    >
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
        <section aria-labelledby={idDoTitulo} className="space-y-4">
          <div>
            <h2 id={idDoTitulo} className="font-semibold">
              {T.paginas}
            </h2>
            <p
              className="text-muted-foreground text-sm [overflow-wrap:anywhere]"
              data-testid="editar-pdf-documento"
            >
              {T.aberto(atual.arquivo.name, atual.documento.paginas)}
            </p>
          </div>

          <div className="space-y-1">
            <ol
              ref={faixaRef}
              aria-labelledby={idDoTitulo}
              onKeyDown={aoTeclarNaFaixa}
              onBlur={aoSairDaFaixa}
              className="flex gap-2 overflow-x-auto p-1 pb-2"
              data-testid="editar-pdf-faixa"
            >
              {Array.from({ length: total }, (_, indice) => (
                <MiniaturaDaPagina
                  key={indice}
                  indice={indice}
                  atual={indice === pagina}
                  focavel={indice === indiceFocavel}
                  url={miniaturas.urls.get(indice)}
                  falhou={miniaturas.falhas.has(indice)}
                  aoEscolher={aoEscolherPagina}
                  aoFocar={aoFocarMiniatura}
                  registrar={registrarBotao}
                  observar={miniaturas.observar}
                />
              ))}
            </ol>
            <p className="text-muted-foreground text-xs">
              {T.atalhoDasPaginas}
            </p>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-2"
            data-testid="editar-pdf-controles"
          >
            <div className="flex items-center gap-1">
              <Button
                ref={anteriorRef}
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={T.anterior}
                aria-describedby={idDaPosicao}
                disabled={pagina === 0}
                onClick={() => passar(-1)}
                data-testid="editar-pdf-anterior"
              >
                <FontAwesomeIcon
                  icon={faChevronLeft}
                  className="size-4"
                  aria-hidden
                />
              </Button>
              <p
                id={idDaPosicao}
                className="min-w-28 px-1 text-center text-sm tabular-nums"
                data-testid="editar-pdf-posicao"
              >
                {T.paginaAtual(pagina + 1, total)}
              </p>
              <Button
                ref={proximaRef}
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={T.proxima}
                aria-describedby={idDaPosicao}
                disabled={pagina === total - 1}
                onClick={() => passar(1)}
                data-testid="editar-pdf-proxima"
              >
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="size-4"
                  aria-hidden
                />
              </Button>
            </div>

            <div
              role="group"
              aria-label={T.zoom.rotulo}
              className="flex items-center gap-1"
            >
              <Button
                ref={diminuirRef}
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={T.zoom.diminuir}
                aria-describedby={noMinimo ? idDoMinimo : undefined}
                disabled={noMinimo}
                onClick={() => mudarZoom(-1)}
                data-testid="editar-pdf-diminuir"
              >
                <FontAwesomeIcon
                  icon={faMagnifyingGlassMinus}
                  className="size-4"
                  aria-hidden
                />
              </Button>
              <p
                className="min-w-14 text-center text-sm tabular-nums"
                data-testid="editar-pdf-zoom"
              >
                {T.zoom.valor(ZOOMS[zoom])}
              </p>
              <Button
                ref={aumentarRef}
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={T.zoom.aumentar}
                aria-describedby={noMaximo ? idDoMaximo : undefined}
                disabled={noMaximo}
                onClick={() => mudarZoom(1)}
                data-testid="editar-pdf-aumentar"
              >
                <FontAwesomeIcon
                  icon={faMagnifyingGlassPlus}
                  className="size-4"
                  aria-hidden
                />
              </Button>
              {noMinimo && (
                <span id={idDoMinimo} className="sr-only">
                  {T.zoom.noMinimo}
                </span>
              )}
              {noMaximo && (
                <span id={idDoMaximo} className="sr-only">
                  {T.zoom.noMaximo}
                </span>
              )}
            </div>
          </div>

          <div
            inert={montando || undefined}
            className="space-y-4"
            data-testid="editar-pdf-edicao"
          >
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <div ref={barraRef} className="min-w-0">
                <BarraDeFerramentas
                  ativa={ferramenta}
                  ferramentas={ferramentasDoModo}
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
              <p className="text-muted-foreground text-sm">
                {dicaDaFerramenta}
              </p>
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
                    <FontAwesomeIcon
                      icon={faImage}
                      className="size-4"
                      aria-hidden
                    />
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

            <div
              ref={areaRef}
              className="bg-muted/50 border-border relative max-h-[75vh] min-h-40 [scrollbar-gutter:stable] overflow-auto rounded-lg border p-2 sm:p-4"
              data-testid="editar-pdf-area"
            >
              {larguraCss !== null && (
                <div className="relative mx-auto w-fit">
                  <div
                    ref={folhaRef}
                    role="img"
                    aria-label={T.pagina(pagina + 1)}
                    aria-busy={desenhando}
                    className="bg-white shadow-sm"
                    style={{
                      width: larguraCss,
                      height: Math.round(larguraCss * proporcao),
                    }}
                    data-testid="editar-pdf-folha"
                  />
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
                </div>
              )}
              {desenhando && (
                <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
                  <p
                    className="bg-background text-foreground border-border rounded-full border px-3 py-1 text-sm shadow-sm"
                    data-testid="editar-pdf-desenhando"
                  >
                    {T.desenhando}
                  </p>
                </div>
              )}
              {desenhoDaVez && !desenhoDaVez.ok && (
                <div className="absolute inset-x-0 top-4 flex justify-center px-4">
                  <div
                    role="alert"
                    data-testid="editar-pdf-falha"
                    className="bg-card border-destructive flex max-w-md flex-wrap items-center gap-3 rounded-md border px-3 py-3 text-sm shadow-sm"
                  >
                    <FontAwesomeIcon
                      icon={faCircleExclamation}
                      className="text-destructive size-4 shrink-0"
                      aria-hidden
                    />
                    <p className="min-w-0 flex-1 basis-48">
                      {T.naoDesenhou(pagina + 1)}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => setTentativa((n) => n + 1)}
                      data-testid="editar-pdf-tentar-de-novo"
                    >
                      {T.tentarDeNovo}
                    </Button>
                  </div>
                </div>
              )}
            </div>
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
                ) : confirmandoApagar === pagina ? (
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
                      {T.cobrir.consequencias.map((consequencia) => (
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
                      setConfirmandoApagar(pagina)
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

          <div className="space-y-3" data-testid="editar-pdf-gerar-area">
            {quantosObjetos > 0 && (
              <p className="text-muted-foreground text-sm">
                {T.gerar.resumo(quantosObjetos, cena.objetos.size)}
              </p>
            )}
            {paginasComApagar.length > 0 && (
              <p className="text-sm" data-testid="editar-pdf-paginas-apagadas">
                {T.gerar.apagando(paginasComApagar.map((p) => p + 1))}
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
                disabled={quantosObjetos === 0}
                aria-describedby={
                  quantosObjetos === 0 ? idSemMudancas : undefined
                }
                onClick={() => void gerar()}
                data-testid="editar-pdf-gerar"
              >
                <FontAwesomeIcon
                  icon={faFilePdf}
                  className="size-4"
                  aria-hidden
                />
                {TM.gerar.botao}
              </Button>
            )}
            {quantosObjetos === 0 && (
              <p id={idSemMudancas} className="text-muted-foreground text-xs">
                {TM.gerar.semMudancas}
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
                <p className="min-w-0 flex-1 basis-56">{resultado.mensagem}</p>
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
                className="bg-card border-border motion-safe:animate-in motion-safe:fade-in-0 flex flex-wrap items-center gap-4 rounded-lg border p-4 motion-safe:duration-200"
              >
                <div className="min-w-0 flex-1 basis-48 space-y-0.5">
                  <p className="font-semibold">{TM.gerar.pronto}</p>
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

const MiniaturaDaPagina = memo(function MiniaturaDaPagina({
  indice,
  atual,
  focavel,
  url,
  falhou,
  aoEscolher,
  aoFocar,
  registrar,
  observar,
}: {
  indice: number
  atual: boolean
  focavel: boolean
  url: string | undefined
  falhou: boolean
  aoEscolher: (indice: number) => void
  aoFocar: (indice: number) => void
  registrar: (indice: number, botao: HTMLButtonElement | null) => void
  observar: (elemento: Element, indice: number) => () => void
}) {
  const numero = indice + 1
  const refDoItem = useCallback(
    (no: HTMLLIElement | null) => {
      if (no) return observar(no, indice)
    },
    [observar, indice],
  )
  const refDoBotao = useCallback(
    (botao: HTMLButtonElement | null) => registrar(indice, botao),
    [registrar, indice],
  )

  return (
    <li ref={refDoItem} className="shrink-0" data-testid="editar-pdf-item">
      <button
        ref={refDoBotao}
        type="button"
        tabIndex={focavel ? 0 : -1}
        aria-current={atual ? 'page' : undefined}
        aria-label={T.escolherPagina(numero)}
        onClick={() => aoEscolher(indice)}
        onFocus={() => aoFocar(indice)}
        data-testid="editar-pdf-miniatura"
        className={cn(
          'bg-card focus-visible:ring-ring focus-visible:ring-offset-background flex w-[4.5rem] flex-col items-center gap-1 rounded-md border p-1 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors',
          atual
            ? 'border-primary ring-primary ring-2'
            : 'border-border hover:bg-accent',
        )}
      >
        <span className="bg-muted flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-sm">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura num Blob gerado no aparelho, sem otimizador
            <img
              src={url}
              alt=""
              draggable={false}
              className="max-h-full max-w-full"
              data-testid="editar-pdf-miniatura-imagem"
            />
          ) : falhou ? (
            <span className="text-foreground px-1 text-center text-[0.625rem] leading-tight">
              {T.semMiniatura}
            </span>
          ) : null}
        </span>
        <span className={cn('text-xs', atual && 'font-semibold')}>
          {T.numeroDaMiniatura(numero)}
        </span>
      </button>
    </li>
  )
})
