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
  faChevronLeft,
  faChevronRight,
  faCircleExclamation,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import {
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import { useDocumentoPdf } from './documento-pdf'
import { criarMotorComWorker, type MotorDePdf } from './motor'
import { novoWorkerDePdf } from './novo-worker'
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

/** Frações da largura da área; 1 é a página na largura da área. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

const ZOOM_INICIAL = ZOOMS.indexOf(1)

const LARGURA_SEM_MEDIDA = 600

// Redimensionar a janela dispara a medida a cada quadro; a página só é desenhada de novo quando para.
const ESPERA_DO_REDIMENSIONAR_MS = 150

const PROPORCAO_DO_A4 = Math.SQRT2

// A imagem da miniatura na faixa: 4,5rem do botão menos o respiro.
const LARGURA_DA_MINIATURA_NA_FAIXA = 64

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

type Foco = () => HTMLElement | null | undefined

function mensagemDaRecusa(nome: string, recusa: RecusaDaAbertura): string {
  return 'paginasDemais' in recusa
    ? T.paginasDemais(nome, recusa.paginasDemais, TETO_DE_PAGINAS)
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
  const faixaRef = useRef<HTMLOListElement>(null)
  const anteriorRef = useRef<HTMLButtonElement>(null)
  const proximaRef = useRef<HTMLButtonElement>(null)
  const diminuirRef = useRef<HTMLButtonElement>(null)
  const aumentarRef = useRef<HTMLButtonElement>(null)
  const botoesDasPaginas = useRef(new Map<number, HTMLButtonElement>())
  const focoPendente = useRef<Foco | null>(null)

  const [vista, setVista] = useState<Vista>(SEM_VISTA)
  const [desenho, setDesenho] = useState<Desenho | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [focoNaFaixa, setFocoNaFaixa] = useState<{
    documento: DocumentoAberto
    indice: number
  } | null>(null)
  const [anuncio, setAnuncio] = useState({ texto: '', vez: 0 })

  const { atual, documento, grandeDemais } = useAbrirPdf(arquivo, {
    motor,
    renderizador: () =>
      (renderizadorRef.current ??= criarRenderizadorComPdfjs()),
    aoAbrir(aberto, doArquivo) {
      setVista({ ...SEM_VISTA, documento: aberto })
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
  const indiceFocavel =
    focoNaFaixa && focoNaFaixa.documento === documento
      ? focoNaFaixa.indice
      : pagina

  useEffect(() => () => motorRef.current?.encerrar(), [])

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
    setAnuncio(({ vez }) => ({ texto, vez: vez + 1 }))
  }

  function irPara(indice: number) {
    if (!documento || indice === pagina || indice < 0 || indice >= total) {
      return
    }
    setVista({ documento, pagina: indice, zoom })
    anunciar(T.anuncios.pagina(indice + 1, total))
  }

  function passar(sentido: -1 | 1) {
    const destino = pagina + sentido
    irPara(destino)
    const naPonta = sentido < 0 ? destino === 0 : destino === total - 1
    if (naPonta) {
      focoPendente.current = () =>
        (sentido < 0 ? proximaRef : anteriorRef).current
    }
  }

  function mudarZoom(passo: -1 | 1) {
    const novo = zoom + passo
    if (!documento || novo < 0 || novo >= ZOOMS.length) return
    setVista({ documento, pagina, zoom: novo })
    anunciar(T.anuncios.zoom(ZOOMS[novo]))
    if (novo === 0 || novo === ZOOMS.length - 1) {
      focoPendente.current = () =>
        (passo < 0 ? aumentarRef : diminuirRef).current
    }
  }

  const irParaRef = useRef(irPara)
  useLayoutEffect(() => {
    irParaRef.current = irPara
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
  const noMinimo = zoom === 0
  const noMaximo = zoom === ZOOMS.length - 1
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

  return (
    <div className="space-y-8" data-testid="editar-pdf">
      <AvisoDePrivacidade />

      <section aria-label={T.rotulo} className="space-y-3">
        <ZonaDeArquivos
          multiplos={false}
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
            ref={areaRef}
            className="bg-muted/50 border-border relative min-h-40 overflow-x-auto rounded-lg border p-2 sm:p-4"
            data-testid="editar-pdf-area"
          >
            {larguraCss !== null && (
              <div
                ref={folhaRef}
                role="img"
                aria-label={T.pagina(pagina + 1)}
                aria-busy={desenhando}
                className="mx-auto bg-white shadow-sm"
                style={{
                  width: larguraCss,
                  height: Math.round(larguraCss * proporcao),
                }}
                data-testid="editar-pdf-folha"
              />
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
