'use client'

import {
  memo,
  useRef,
  useState,
  type KeyboardEvent as EventoDeTeclado,
  type PointerEvent as EventoDePonteiro,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '@piluvitu/ui/cn'
import {
  OPACIDADE_DO_MARCA_TEXTO,
  PASSO_CURTO,
  PASSO_LONGO,
  extremosDaLinha,
  geometriaDaSeta,
  linhaEntre,
  linhasDeBase,
  type Ponto,
  type PontoDoTraco,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import {
  caminhoDoTraco,
  caminhoSvgDoContorno,
  contornoDoTraco,
} from '@piluvitu/tools/pdf-traco'
import type { ObjetoNaTela } from './motor'
import {
  DIRECAO_DA_TECLA,
  FAMILIAS_CSS,
  moverPara,
  mover,
  pontoDoEvento,
  redimensionar,
  redimensionarAte,
  type EstiloDoTraco,
  type Ferramenta,
  type Lugar,
} from './objetos'
import { TEXTOS } from './textos'

const T = TEXTOS.editar.objetos

/** De onde veio a mudança: o teclado junta os passos no desfazer, o ponteiro entrega só o fim do arraste. */
export type OrigemDaMudanca = 'posicao' | 'tamanho' | 'ponteiro'

type ArrasteDeObjeto = {
  tipo: 'mover' | 'redimensionar'
  ponteiro: number
  de: Ponto
  andou: boolean
  original: ObjetoNaTela
  atual: ObjetoNaTela
}

type ArrasteNaPagina = {
  tipo: 'criar' | 'clicar'
  ponteiro: number
  de: Ponto
  ate: Ponto
  andou: boolean
}

type Arraste =
  | ArrasteDeObjeto
  | ArrasteNaPagina
  | { tipo: 'desenhar'; ponteiro: number; pontos: PontoDoTraco[] }

const ehArrasteDeObjeto = (arraste: Arraste): arraste is ArrasteDeObjeto =>
  arraste.tipo === 'mover' || arraste.tipo === 'redimensionar'

// Em pixels da tela: abaixo disso, o ponteiro só clicou.
const LIMIAR_DO_ARRASTE = 4

// Em pixels da tela, em volta de cada objeto: linha reta e traço fino também dão para pegar.
const FOLGA = 4

const pct = (valor: number, total: number) => `${(valor / total) * 100}%`

type Props = {
  numeroDaPagina: number
  tamanho: Tamanho
  objetos: readonly ObjetoNaTela[]
  selecionado: string | null
  ferramenta: Ferramenta
  urlsDasImagens: ReadonlyMap<string, string>
  nomesDasImagens: ReadonlyMap<string, string>
  estiloDoDesenho: EstiloDoTraco
  idDasInstrucoes: string
  quadroRef: RefObject<HTMLDivElement | null>
  registrar: (id: string, elemento: HTMLElement | null) => void
  aoFocar: (id: string) => void
  aoMudar: (objeto: ObjetoNaTela, origem: OrigemDaMudanca) => void
  aoApagar: (id: string) => void
  aoEditarTexto: (id: string) => void
  aoSoltar: () => void
  aoCriar: (lugar: Lugar) => void
  aoDesenhar: (pontos: PontoDoTraco[]) => void
  aoClicarNaPagina: (ponto: Ponto) => void
}

/**
 * Os objetos de uma página por cima dela: `role=application`, para o leitor de tela deixar as setas com a
 * página, e cada objeto um botão focável que move e muda de tamanho pelo teclado e pelo ponteiro.
 */
export function QuadroDeObjetos({
  numeroDaPagina,
  tamanho,
  objetos,
  selecionado,
  ferramenta,
  urlsDasImagens,
  nomesDasImagens,
  estiloDoDesenho,
  idDasInstrucoes,
  quadroRef,
  registrar,
  aoFocar,
  aoMudar,
  aoApagar,
  aoEditarTexto,
  aoSoltar,
  aoCriar,
  aoDesenhar,
  aoClicarNaPagina,
}: Props) {
  const arrasteRef = useRef<Arraste | null>(null)
  const [arraste, setArraste] = useState<Arraste | null>(null)
  const selecionando = ferramenta === 'selecionar'

  function definir(novo: Arraste | null) {
    arrasteRef.current = novo
    setArraste(novo)
  }

  function medida() {
    const caixa = quadroRef.current?.getBoundingClientRect()
    return caixa && caixa.width > 0 && caixa.height > 0 ? caixa : null
  }

  function pontoDo(evento: { clientX: number; clientY: number }): Ponto {
    const [x, y] = pontoDoEvento(evento, medida(), tamanho)
    return { x, y }
  }

  function andouDe(de: Ponto, ate: Ponto) {
    const caixa = medida()
    if (!caixa) return false
    const pixels = Math.hypot(
      ((ate.x - de.x) / tamanho.largura) * caixa.width,
      ((ate.y - de.y) / tamanho.altura) * caixa.height,
    )
    return pixels > LIMIAR_DO_ARRASTE
  }

  function capturar(ponteiro: number) {
    try {
      quadroRef.current?.setPointerCapture?.(ponteiro)
    } catch {
      // O ponteiro já saiu (o dedo levantou antes); o arraste segue sem captura.
    }
  }

  // Um segundo dedo não atrapalha o arraste do primeiro; o mesmo ponteiro (o mouse é sempre o mesmo) que
  // volta sem ter soltado aqui, porque soltou fora, começa de novo.
  const podeComecar = (evento: EventoDePonteiro) =>
    (evento.pointerType !== 'mouse' || evento.button === 0) &&
    (!arrasteRef.current || arrasteRef.current.ponteiro === evento.pointerId)

  function pegarObjeto(
    evento: EventoDePonteiro<HTMLElement>,
    objeto: ObjetoNaTela,
    tipo: 'mover' | 'redimensionar',
  ) {
    if (!selecionando || !podeComecar(evento)) return
    evento.preventDefault()
    evento.stopPropagation()
    const elemento =
      tipo === 'mover'
        ? evento.currentTarget
        : evento.currentTarget.closest<HTMLElement>('[role="button"]')
    elemento?.focus()
    capturar(evento.pointerId)
    definir({
      tipo,
      ponteiro: evento.pointerId,
      de: pontoDo(evento),
      andou: false,
      original: objeto,
      atual: objeto,
    })
  }

  const pontoDoTraco = (evento: {
    clientX: number
    clientY: number
    pressure?: number
    pointerType?: string
  }): PontoDoTraco => pontoDoEvento(evento, medida(), tamanho)

  function aoApertar(evento: EventoDePonteiro<HTMLDivElement>) {
    if (!podeComecar(evento)) return
    const de = pontoDo(evento)
    capturar(evento.pointerId)
    if (selecionando) {
      definir({
        tipo: 'clicar',
        ponteiro: evento.pointerId,
        de,
        ate: de,
        andou: false,
      })
      return
    }
    // No toque, quem decide a rolagem é o touch-action: fora do desenho, o dedo que arrasta rola a página
    // (o navegador manda pointercancel) e o toque curto põe o objeto.
    if (ferramenta === 'desenho' || evento.pointerType !== 'touch') {
      evento.preventDefault()
    }
    definir(
      ferramenta === 'desenho'
        ? {
            tipo: 'desenhar',
            ponteiro: evento.pointerId,
            pontos: [pontoDoTraco(evento)],
          }
        : {
            tipo: 'criar',
            ponteiro: evento.pointerId,
            de,
            ate: de,
            andou: false,
          },
    )
  }

  function aoMover(evento: EventoDePonteiro<HTMLDivElement>) {
    const atual = arrasteRef.current
    if (!atual || evento.pointerId !== atual.ponteiro) return
    if (atual.tipo === 'desenhar') {
      const eventos = evento.nativeEvent.getCoalescedEvents?.() ?? []
      const novos = (eventos.length ? eventos : [evento]).map(pontoDoTraco)
      definir({ ...atual, pontos: [...atual.pontos, ...novos] })
      return
    }
    const ponto = pontoDo(evento)
    const andou = atual.andou || andouDe(atual.de, ponto)
    if (!ehArrasteDeObjeto(atual)) {
      definir({ ...atual, ate: ponto, andou })
      return
    }
    if (!andou) return
    definir({
      ...atual,
      andou,
      atual:
        atual.tipo === 'mover'
          ? moverPara(
              atual.original,
              atual.original.x + ponto.x - atual.de.x,
              atual.original.y + ponto.y - atual.de.y,
              tamanho,
            )
          : redimensionarAte(atual.original, ponto, tamanho),
    })
  }

  function aoSoltarPonteiro(evento: EventoDePonteiro<HTMLDivElement>) {
    const atual = arrasteRef.current
    if (!atual || evento.pointerId !== atual.ponteiro) return
    definir(null)
    switch (atual.tipo) {
      case 'mover':
      case 'redimensionar':
        if (atual.atual !== atual.original) aoMudar(atual.atual, 'ponteiro')
        return
      case 'criar':
        aoCriar(
          atual.andou ? { de: atual.de, ate: atual.ate } : { centro: atual.de },
        )
        return
      case 'clicar':
        if (!atual.andou) aoClicarNaPagina(atual.de)
        return
      case 'desenhar':
        aoDesenhar(atual.pontos)
    }
  }

  function cancelarArraste() {
    if (!arrasteRef.current) return false
    definir(null)
    return true
  }

  function aoTeclarNoObjeto(
    evento: EventoDeTeclado<HTMLDivElement>,
    objeto: ObjetoNaTela,
  ) {
    if (evento.key === 'Escape') {
      evento.preventDefault()
      if (!cancelarArraste()) aoSoltar()
      return
    }
    const direcao = DIRECAO_DA_TECLA[evento.key]
    if (direcao) {
      if (evento.ctrlKey || evento.metaKey) return
      // Alt+← e Alt+→ são voltar e avançar do navegador no Windows e no Linux.
      evento.preventDefault()
      if (arrasteRef.current) return
      const passo = evento.shiftKey ? PASSO_LONGO : PASSO_CURTO
      aoMudar(
        evento.altKey
          ? redimensionar(objeto, direcao, passo, tamanho)
          : mover(objeto, direcao, passo, tamanho),
        evento.altKey ? 'tamanho' : 'posicao',
      )
      return
    }
    if (evento.key === 'Delete' || evento.key === 'Backspace') {
      evento.preventDefault()
      aoApagar(objeto.id)
      return
    }
    if (evento.key === 'Enter' && objeto.tipo === 'texto') {
      evento.preventDefault()
      aoEditarTexto(objeto.id)
    }
  }

  const emArraste = arraste && ehArrasteDeObjeto(arraste) ? arraste.atual : null
  const visiveis = emArraste
    ? objetos.map((objeto) => (objeto.id === emArraste.id ? emArraste : objeto))
    : objetos

  return (
    <div
      ref={quadroRef}
      role="application"
      aria-label={T.quadro(numeroDaPagina)}
      tabIndex={-1}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltarPonteiro}
      onPointerCancel={() => definir(null)}
      onLostPointerCapture={(evento) => {
        if (arrasteRef.current?.ponteiro === evento.pointerId) definir(null)
      }}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && cancelarArraste())
          evento.preventDefault()
      }}
      className={cn(
        'absolute inset-0 outline-none select-none [-webkit-touch-callout:none]',
        ferramenta === 'desenho' && 'touch-none',
        !selecionando && 'cursor-crosshair',
      )}
      data-testid="editar-pdf-quadro"
      data-ferramenta={ferramenta}
    >
      {visiveis.map((objeto) => (
        <DesenhoDoObjeto
          key={`desenho-${objeto.id}`}
          objeto={objeto}
          tamanho={tamanho}
          url={
            objeto.tipo === 'imagem'
              ? urlsDasImagens.get(objeto.imagem)
              : undefined
          }
        />
      ))}

      {arraste?.tipo === 'desenhar' && (
        <svg
          aria-hidden
          viewBox={`0 0 ${tamanho.largura} ${tamanho.altura}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
          data-testid="editar-pdf-previa"
        >
          <path
            d={caminhoSvgDoContorno(
              contornoDoTraco(arraste.pontos, estiloDoDesenho.espessura, false),
            )}
            fill={estiloDoDesenho.cor}
          />
        </svg>
      )}
      {arraste?.tipo === 'criar' && arraste.andou && (
        <PreviaDaCriacao
          ferramenta={ferramenta}
          de={arraste.de}
          ate={arraste.ate}
          tamanho={tamanho}
        />
      )}

      {visiveis.map((objeto) => {
        const escolhido = objeto.id === selecionado
        return (
          <div
            key={objeto.id}
            ref={(elemento) => registrar(objeto.id, elemento)}
            role="button"
            tabIndex={0}
            aria-roledescription={T.papel}
            aria-label={T.nome(
              objeto,
              objeto.tipo === 'imagem'
                ? nomesDasImagens.get(objeto.imagem)
                : undefined,
            )}
            aria-describedby={idDasInstrucoes}
            onFocus={() => aoFocar(objeto.id)}
            onKeyDown={(evento) => aoTeclarNoObjeto(evento, objeto)}
            onPointerDown={(evento) => pegarObjeto(evento, objeto, 'mover')}
            data-testid="editar-pdf-objeto"
            data-id={objeto.id}
            data-escolhido={escolhido || undefined}
            className={cn(
              'focus-visible:ring-ring absolute rounded-sm outline-none focus-visible:ring-2',
              selecionando ? 'cursor-move touch-none' : 'pointer-events-none',
              escolhido
                ? 'ring-primary z-10 ring-2 ring-offset-1 ring-offset-white'
                : selecionando && 'hover:ring-primary/70 hover:ring-1',
            )}
            style={{
              left: `calc(${pct(objeto.x, tamanho.largura)} - ${FOLGA}px)`,
              top: `calc(${pct(objeto.y, tamanho.altura)} - ${FOLGA}px)`,
              width: `calc(${pct(objeto.largura, tamanho.largura)} + ${2 * FOLGA}px)`,
              height: `calc(${pct(objeto.altura, tamanho.altura)} + ${2 * FOLGA}px)`,
            }}
          >
            {escolhido && selecionando && (
              <span
                aria-hidden
                onPointerDown={(evento) =>
                  pegarObjeto(evento, objeto, 'redimensionar')
                }
                className="absolute flex size-5 translate-x-1/2 translate-y-1/2 cursor-nwse-resize touch-none items-center justify-center pointer-coarse:size-11"
                style={{ right: FOLGA, bottom: FOLGA }}
                data-testid="editar-pdf-alca"
              >
                <span className="bg-primary size-3 rounded-full border-2 border-white shadow-sm" />
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PreviaDaCriacao({
  ferramenta,
  de,
  ate,
  tamanho,
}: {
  ferramenta: Ferramenta
  de: Ponto
  ate: Ponto
  tamanho: Tamanho
}) {
  const reta = ferramenta === 'linha' || ferramenta === 'seta'
  const caixa = linhaEntre(de, ate)
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${tamanho.largura} ${tamanho.altura}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
      data-testid="editar-pdf-previa"
    >
      {reta ? (
        <line
          x1={de.x}
          y1={de.y}
          x2={ate.x}
          y2={ate.y}
          stroke="#2563eb"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <rect
          x={caixa.x}
          y={caixa.y}
          width={caixa.largura}
          height={caixa.altura}
          fill="none"
          stroke="#2563eb"
          strokeWidth={1}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}

/** O objeto como vai sair no PDF, num SVG do tamanho da página (em pontos), só para ver. */
export const DesenhoDoObjeto = memo(function DesenhoDoObjeto({
  objeto,
  tamanho,
  url,
}: {
  objeto: ObjetoNaTela
  tamanho: Tamanho
  url?: string
}) {
  const svg = (filhos: ReactNode, misturar = false) => (
    <svg
      aria-hidden
      viewBox={`0 0 ${tamanho.largura} ${tamanho.altura}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      style={misturar ? { mixBlendMode: 'multiply' } : undefined}
      data-testid="editar-pdf-desenho"
      data-tipo={objeto.tipo}
    >
      {filhos}
    </svg>
  )
  switch (objeto.tipo) {
    case 'texto':
      return svg(
        linhasDeBase(objeto).map((linha, i) => (
          <text
            key={i}
            x={linha.x}
            y={linha.y}
            fill={objeto.cor}
            fontFamily={FAMILIAS_CSS[objeto.fonte]}
            fontSize={objeto.tamanho}
            fontWeight={objeto.negrito ? 'bold' : 'normal'}
            fontStyle={objeto.italico ? 'italic' : 'normal'}
            style={{ whiteSpace: 'pre' }}
          >
            {linha.conteudo}
          </text>
        )),
      )
    case 'imagem':
      return svg(
        url ? (
          <image
            href={url}
            x={objeto.x}
            y={objeto.y}
            width={objeto.largura}
            height={objeto.altura}
            preserveAspectRatio="none"
          />
        ) : null,
      )
    case 'traco':
      return svg(<path d={caminhoDoTraco(objeto)} fill={objeto.cor} />)
    case 'retangulo':
      return svg(
        <rect
          x={objeto.x}
          y={objeto.y}
          width={objeto.largura}
          height={objeto.altura}
          fill="none"
          stroke={objeto.cor}
          strokeWidth={objeto.espessura}
        />,
      )
    case 'elipse':
      return svg(
        <ellipse
          cx={objeto.x + objeto.largura / 2}
          cy={objeto.y + objeto.altura / 2}
          rx={objeto.largura / 2}
          ry={objeto.altura / 2}
          fill="none"
          stroke={objeto.cor}
          strokeWidth={objeto.espessura}
        />,
      )
    case 'linha':
    case 'seta': {
      const { de, ate } = extremosDaLinha(objeto)
      const seta =
        objeto.tipo === 'seta'
          ? geometriaDaSeta(de, ate, objeto.espessura)
          : null
      const haste = seta ? seta.haste : { de, ate }
      return svg(
        <>
          <line
            x1={haste.de.x}
            y1={haste.de.y}
            x2={haste.ate.x}
            y2={haste.ate.y}
            stroke={objeto.cor}
            strokeWidth={objeto.espessura}
            strokeLinecap="round"
          />
          {seta?.ponta && (
            <polygon
              points={seta.ponta.map(({ x, y }) => `${x},${y}`).join(' ')}
              fill={objeto.cor}
            />
          )}
        </>,
      )
    }
    case 'marca-texto':
      return svg(
        <rect
          x={objeto.x}
          y={objeto.y}
          width={objeto.largura}
          height={objeto.altura}
          fill={objeto.cor}
          fillOpacity={OPACIDADE_DO_MARCA_TEXTO}
        />,
        true,
      )
    case 'cobrir':
      return svg(
        <rect
          x={objeto.x}
          y={objeto.y}
          width={objeto.largura}
          height={objeto.altura}
          fill="#ffffff"
        />,
      )
  }
})
