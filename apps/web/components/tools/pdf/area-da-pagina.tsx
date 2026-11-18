'use client'

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as EventoDeFoco,
  type KeyboardEvent as EventoDeTeclado,
  type ReactNode,
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
import type { Giro, Tamanho } from '@piluvitu/tools/pdf-regras'
import type { DocumentoAberto } from './renderizador'
import { TEXTOS } from './textos'

const T = TEXTOS.editar

/** Frações da largura da área; 1 é a página na largura da área. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

export const ZOOM_INICIAL = ZOOMS.indexOf(1)

const LARGURA_SEM_MEDIDA = 600

// Redimensionar a janela dispara a medida a cada quadro; a página só é desenhada de novo quando para.
const ESPERA_DO_REDIMENSIONAR_MS = 150

const PROPORCAO_DO_A4 = Math.SQRT2

type Desenho = {
  documento: DocumentoAberto
  pagina: number
  giro: Giro
  larguraCss: number
  tentativa: number
  ok: boolean
  /** O da última página desenhada: até a nova chegar, a folha fica com a proporção dela. */
  tamanho: Tamanho | null
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

export function usePaginaDesenhada({
  documento,
  pagina,
  giro = 0,
  zoom,
  areaRef,
  folhaRef,
}: {
  documento: DocumentoAberto | null
  /** O índice no arquivo. */
  pagina: number
  /** A moldura: a página é desenhada girada a mais, como os objetos dela foram postos. */
  giro?: Giro
  zoom: number
  areaRef: RefObject<HTMLElement | null>
  folhaRef: RefObject<HTMLElement | null>
}) {
  const [desenho, setDesenho] = useState<Desenho | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const larguraDaArea = useLarguraDaArea(areaRef, documento !== null)
  const larguraCss =
    larguraDaArea === null
      ? null
      : Math.max(1, Math.round(larguraDaArea * ZOOMS[zoom]))
  const desenhoDaVez =
    desenho &&
    desenho.documento === documento &&
    desenho.pagina === pagina &&
    desenho.giro === giro &&
    desenho.larguraCss === larguraCss &&
    desenho.tentativa === tentativa
      ? desenho
      : null
  const tamanho =
    desenho && desenho.documento === documento ? desenho.tamanho : null
  // Os objetos só aparecem quando a página deles já foi desenhada: é o tamanho dela que os posiciona.
  const tamanhoDaPagina =
    desenho &&
    desenho.documento === documento &&
    desenho.pagina === pagina &&
    desenho.giro === giro &&
    desenho.ok
      ? desenho.tamanho
      : null

  useEffect(() => {
    if (!documento || larguraCss === null) return
    let ativo = true
    const pedido = { documento, pagina, giro, larguraCss, tentativa }
    documento.pagina(pagina, larguraCss, giro).then(
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
  }, [documento, pagina, giro, larguraCss, tentativa, folhaRef])

  return {
    larguraCss,
    desenhando: documento !== null && desenhoDaVez === null,
    falhou: desenhoDaVez !== null && !desenhoDaVez.ok,
    proporcao: tamanho ? tamanho.altura / tamanho.largura : PROPORCAO_DO_A4,
    tamanhoDaPagina,
    tentarDeNovo: () => setTentativa((n) => n + 1),
  }
}

export function AreaDaPagina({
  id,
  areaRef,
  folhaRef,
  numeroDaPagina,
  larguraCss,
  proporcao,
  desenhando,
  falhou,
  aoTentarDeNovo,
  children,
}: {
  /** O alvo do link "Pular para a página aberta". */
  id?: string
  areaRef: RefObject<HTMLDivElement | null>
  folhaRef: RefObject<HTMLDivElement | null>
  numeroDaPagina: number
  larguraCss: number | null
  proporcao: number
  desenhando: boolean
  falhou: boolean
  aoTentarDeNovo: () => void
  children?: ReactNode
}) {
  return (
    <div
      ref={areaRef}
      id={id}
      role="group"
      aria-label={T.areaDaPagina(numeroDaPagina)}
      tabIndex={0}
      className="bg-muted/50 border-border focus-visible:ring-ring relative max-h-[75vh] min-h-40 [scrollbar-gutter:stable] overflow-auto rounded-lg border p-2 focus-visible:ring-2 focus-visible:outline-hidden sm:p-4"
      data-testid="editar-pdf-area"
    >
      {larguraCss !== null && (
        <div className="relative mx-auto w-fit">
          <div
            ref={folhaRef}
            role="img"
            aria-label={T.pagina(numeroDaPagina)}
            aria-busy={desenhando}
            className="bg-white shadow-sm"
            style={{
              width: larguraCss,
              height: Math.round(larguraCss * proporcao),
            }}
            data-testid="editar-pdf-folha"
          />
          {children}
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
      {falhou && (
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
              {T.naoDesenhou(numeroDaPagina)}
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={aoTentarDeNovo}
              data-testid="editar-pdf-tentar-de-novo"
            >
              {T.tentarDeNovo}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ControlesDaPagina({
  pagina,
  total,
  zoom,
  anteriorRef,
  proximaRef,
  diminuirRef,
  aumentarRef,
  aoPassar,
  aoMudarZoom,
}: {
  pagina: number
  total: number
  zoom: number
  anteriorRef: RefObject<HTMLButtonElement | null>
  proximaRef: RefObject<HTMLButtonElement | null>
  diminuirRef: RefObject<HTMLButtonElement | null>
  aumentarRef: RefObject<HTMLButtonElement | null>
  aoPassar: (sentido: -1 | 1) => void
  aoMudarZoom: (passo: -1 | 1) => void
}) {
  const ids = useId()
  const idDaPosicao = `${ids}-posicao`
  const idDoMinimo = `${ids}-zoom-minimo`
  const idDoMaximo = `${ids}-zoom-maximo`
  const noMinimo = zoom === 0
  const noMaximo = zoom === ZOOMS.length - 1

  return (
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
          onClick={() => aoPassar(-1)}
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
          onClick={() => aoPassar(1)}
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
          onClick={() => aoMudarZoom(-1)}
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
          onClick={() => aoMudarZoom(1)}
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
  )
}

export type PaginaDaFaixa = {
  readonly chave: string
  readonly giro: Giro
}

export function FaixaDePaginas({
  sessao,
  paginas,
  pagina,
  revelar = null,
  rotulo,
  miniaturas,
  aoEscolher,
}: {
  /** Trocar de sessão (outro PDF) devolve o ponto do Tab à página aberta. */
  sessao: object
  /** Na ordem do documento: o número de cada uma é a posição, e a miniatura vem pela chave. */
  paginas: readonly PaginaDaFaixa[]
  pagina: number
  /** Uma posição para a faixa mostrar sem abrir a página (as que acabaram de entrar); cada objeto novo rola uma vez. */
  revelar?: { readonly posicao: number } | null
  rotulo: string
  miniaturas: {
    urls: ReadonlyMap<string, string>
    falhas: ReadonlySet<string>
    observar: (elemento: Element, chave: string) => () => void
  }
  /** Estável entre renderizações: as miniaturas são memorizadas. Recebe a posição. */
  aoEscolher: (posicao: number) => void
}) {
  const total = paginas.length
  const faixaRef = useRef<HTMLOListElement>(null)
  const botoesDasPaginas = useRef(new Map<number, HTMLButtonElement>())
  const [focoNaFaixa, setFocoNaFaixa] = useState<{
    sessao: object
    indice: number
  } | null>(null)
  const indiceFocavel =
    focoNaFaixa && focoNaFaixa.sessao === sessao ? focoNaFaixa.indice : pagina

  // Só a faixa rola até a miniatura: um scrollIntoView rolaria a página inteira junto.
  const rolarAte = useCallback((posicao: number) => {
    const faixa = faixaRef.current
    const botao = botoesDasPaginas.current.get(posicao)
    if (!faixa || !botao) return
    const daFaixa = faixa.getBoundingClientRect()
    const doBotao = botao.getBoundingClientRect()
    if (doBotao.left < daFaixa.left) {
      faixa.scrollLeft -= daFaixa.left - doBotao.left
    } else if (doBotao.right > daFaixa.right) {
      faixa.scrollLeft += doBotao.right - daFaixa.right
    }
  }, [])

  useEffect(() => rolarAte(pagina), [pagina, sessao, rolarAte])

  useEffect(() => {
    if (revelar) rolarAte(revelar.posicao)
  }, [revelar, rolarAte])

  const aoFocarMiniatura = useCallback(
    (indice: number) => setFocoNaFaixa({ sessao, indice }),
    [sessao],
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

  return (
    <div className="space-y-1">
      <ol
        ref={faixaRef}
        aria-label={rotulo}
        onKeyDown={aoTeclarNaFaixa}
        onBlur={aoSairDaFaixa}
        className="flex gap-2 overflow-x-auto p-1 pb-2"
        data-testid="editar-pdf-faixa"
      >
        {paginas.map(({ chave, giro }, posicao) => (
          <MiniaturaDaPagina
            key={chave}
            indice={posicao}
            chave={chave}
            giro={giro}
            atual={posicao === pagina}
            focavel={posicao === indiceFocavel}
            url={miniaturas.urls.get(chave)}
            falhou={miniaturas.falhas.has(chave)}
            aoEscolher={aoEscolher}
            aoFocar={aoFocarMiniatura}
            registrar={registrarBotao}
            observar={miniaturas.observar}
          />
        ))}
      </ol>
      <p className="text-muted-foreground text-xs">{T.atalhoDasPaginas}</p>
    </div>
  )
}

const MiniaturaDaPagina = memo(function MiniaturaDaPagina({
  indice,
  chave,
  giro,
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
  chave: string
  giro: Giro
  atual: boolean
  focavel: boolean
  url: string | undefined
  falhou: boolean
  aoEscolher: (indice: number) => void
  aoFocar: (indice: number) => void
  registrar: (indice: number, botao: HTMLButtonElement | null) => void
  observar: (elemento: Element, chave: string) => () => void
}) {
  const numero = indice + 1
  const refDoItem = useCallback(
    (no: HTMLLIElement | null) => {
      if (no) return observar(no, chave)
    },
    [observar, chave],
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
              style={giro ? { transform: `rotate(${giro}deg)` } : undefined}
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
