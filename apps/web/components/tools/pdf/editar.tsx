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
import {
  faArrowRotateLeft,
  faArrowRotateRight,
  faCircleExclamation,
  faCircleInfo,
  faCrosshairs,
  faDownload,
  faFilePdf,
  faImage,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import {
  TETO_DAS_IMAGENS_EM_BYTES,
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  desfazer as desfazerNoHistorico,
  historicoInicial,
  nomeDoPdfDerivado,
  planoInicial,
  podeDesfazer,
  podeRefazer,
  refazer as refazerNoHistorico,
  registrarNoHistorico,
  type Historico,
  type Ponto,
  type PontoDoTraco,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import {
  AreaDaPagina,
  ControlesDaPagina,
  FaixaDePaginas,
  ZOOMS,
  ZOOM_INICIAL,
  usePaginaDesenhada,
} from './area-da-pagina'
import { useDocumentoPdf } from './documento-pdf'
import { ehCampoDeTexto, podeTerFoco } from './foco'
import { BarraDeFerramentas } from './barra-de-ferramentas'
import { ehFalhaDaImagem, prepararImagem } from './imagem-inserida'
import { idDaPagina, montagemDoPlano } from './montagem'
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
import { AvisoDePrivacidade, ZonaDeArquivos } from './zona-de-arquivos'

const T = TEXTOS.editar

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

  const { atual, documento, grandeDemais, avisos } = useAbrirPdf(arquivo, {
    motor,
    renderizador: () =>
      (renderizadorRef.current ??= criarRenderizadorComPdfjs()),
    aoAbrir(aberto, doArquivo, avisosDoArquivo) {
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
      anunciar(
        T.anuncios.aberto(doArquivo.name, aberto.paginas, avisosDoArquivo),
      )
    },
    aoRecusar: () => anunciar(''),
  })
  const miniaturas = useMiniaturas(documento, LARGURA_DA_MINIATURA_NA_FAIXA)

  const { pagina, zoom } =
    documento && vista.documento === documento ? vista : SEM_VISTA
  const total = documento?.paginas ?? 0
  const {
    larguraCss,
    desenhando,
    falhou: naoDesenhou,
    proporcao,
    tamanhoDaPagina,
    tentarDeNovo,
  } = usePaginaDesenhada({ documento, pagina, zoom, areaRef, folhaRef })

  const { historico } =
    documento && edicao.documento === documento ? edicao : SEM_EDICAO
  const cena = historico.presente
  const ordem = useMemo(
    () => Array.from({ length: total }, (_, indice) => idDaPagina(0, indice)),
    [total],
  )
  const aberta = idDaPagina(0, pagina)
  const objetosDaPagina = objetosDa(cena, aberta)
  const objetoEscolhido =
    (selecionado && objetosDaPagina.find((o) => o.id === selecionado)) || null
  const montando = resultado.estado === 'montando'
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
    mudarCena(
      incluirObjeto(cena, aberta, objeto),
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
    mudarCena(incluirObjeto(cena, aberta, objeto))
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
    if (!documento) return
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
    const mudadas = paginasMudadas(historico.presente, novo.presente, ordem)
    const outra =
      mudadas.length > 0 && !mudadas.includes(aberta)
        ? ordem.indexOf(mudadas[0])
        : null
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
    mudarCena(comApagarDeVerdade(cena, aberta, ligado))
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
      const rasterizadas = new Map<string, Blob>()
      for (const id of paginasParaApagar(cenaDoPdf, ordem)) {
        rasterizadas.set(
          id,
          await documento.fundo(ordem.indexOf(id), cobrirDa(cenaDoPdf, id)),
        )
        if (vez !== vezDaGeracao.current) return
      }
      const blobs = new Map<string, Blob>()
      for (const id of imagensDa(cenaDoPdf)) {
        const imagem = imagens.get(id)
        if (imagem) blobs.set(id, imagem.blob)
      }
      const pdf = await motor().montar([origem], {
        paginas: montagemDoPlano(planoInicial(documento.paginas)),
        objetosPorPagina: cenaDoPdf.objetos,
        imagens: blobs,
        paginasRasterizadas: rasterizadas,
      })
      if (vez !== vezDaGeracao.current) return
      setResultado({
        estado: 'pronto',
        url: URL.createObjectURL(pdf),
        nome: nomeDoPdfDerivado(origem.name, 'editado'),
        paginas: documento.paginas,
        bytes: pdf.size,
      })
      anunciar(T.anuncios.pronto(documento.paginas, pdf.size))
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

  const idDoTitulo = `${ids}-paginas`
  const idDasInstrucoes = `${ids}-instrucoes`
  const idSemImagem = `${ids}-sem-imagem`
  const idSemDesfazer = `${ids}-sem-desfazer`
  const idSemRefazer = `${ids}-sem-refazer`
  const idSemObjetos = `${ids}-sem-objetos`
  const idDoAvisoDoCobrir = `${ids}-aviso-cobrir`
  const idDasConsequencias = `${ids}-consequencias`
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
  const quantosObjetos = totalDeObjetos(cena)
  const paginasComApagar = paginasParaApagar(cena, ordem)
  const cobrirAqui = temCobrir(cena, aberta)
  const apagarAqui = cena.apagar.has(aberta)
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
            {avisos.length > 0 && (
              <ul className="mt-3 space-y-2" data-testid="editar-pdf-avisos">
                {avisos.map((aviso) => (
                  <li
                    key={aviso}
                    className="bg-card border-border flex gap-2 rounded-md border px-3 py-3 text-sm"
                    data-testid="editar-pdf-aviso"
                  >
                    <FontAwesomeIcon
                      icon={faTriangleExclamation}
                      className="text-primary mt-0.5 size-4 shrink-0"
                      aria-hidden
                    />
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      {T.avisos[aviso]}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {documento && (
            <FaixaDePaginas
              documento={documento}
              total={total}
              pagina={pagina}
              idDoTitulo={idDoTitulo}
              miniaturas={miniaturas}
              aoEscolher={aoEscolherPagina}
            />
          )}

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

          <div
            inert={montando || undefined}
            className="space-y-4"
            data-testid="editar-pdf-edicao"
          >
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

            <AreaDaPagina
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
                disabled={quantosObjetos === 0}
                aria-describedby={
                  quantosObjetos === 0 ? idSemObjetos : undefined
                }
                onClick={() => void gerar()}
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
            {quantosObjetos === 0 && (
              <p id={idSemObjetos} className="text-muted-foreground text-xs">
                {T.gerar.semObjetos}
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
                className="bg-card border-border motion-safe:animate-in motion-safe:fade-in-0 flex flex-wrap items-center gap-4 rounded-lg border p-4 motion-safe:duration-200"
              >
                <div className="min-w-0 flex-1 basis-48 space-y-0.5">
                  <p className="font-semibold">{T.gerar.pronto}</p>
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
