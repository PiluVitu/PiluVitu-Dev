'use client'

import {
  memo,
  useCallback,
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
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  faArrowLeft,
  faArrowRight,
  faArrowRotateLeft,
  faCheckDouble,
  faFileExport,
  faRotateLeft,
  faRotateRight,
  faTrashCan,
  faXmark,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import type { PaginaDoPlano } from '@piluvitu/tools/pdf-regras'
import { useReduzirMovimento } from '@/hooks/use-reduzir-movimento'
import { TEXTOS } from './textos'

const T = TEXTOS.organizar

export type ChaveDaBarra =
  | 'girarEsquerda'
  | 'girarDireita'
  | 'moverAntes'
  | 'moverDepois'
  | 'apagar'
  | 'extrair'
  | 'selecionarTodas'
  | 'limparSelecao'
  | 'desfazer'

export type MotivoDesabilitado = keyof typeof T.dicas

export type BotaoDaBarra = {
  chave: ChaveDaBarra
  motivo: MotivoDesabilitado | null
}

export const ORDEM_DA_BARRA: readonly ChaveDaBarra[] = [
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

export type AcaoDaPagina =
  | { tipo: 'selecionar'; indice: number; marcada: boolean }
  | { tipo: 'girar'; indice: number }
  | { tipo: 'apagar'; indice: number }

const idDoArraste = (indice: number) => `p${indice}`

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

/** A grade das páginas: os cartões e o arrastar para reordenar. */
export function ListaDePaginas({
  plano,
  selecionadas,
  miniaturas,
  bloqueado,
  idDoTitulo,
  idDaDicaUnica,
  aoAgir,
  aoMover,
  registrarCaixa,
}: {
  plano: readonly PaginaDoPlano[]
  selecionadas: ReadonlySet<number>
  miniaturas: {
    urls: ReadonlyMap<number, string>
    falhas: ReadonlySet<number>
    observar: (elemento: Element, indice: number) => () => void
  }
  bloqueado: boolean
  idDoTitulo: string
  idDaDicaUnica: string
  aoAgir: (acao: AcaoDaPagina) => void
  /** Arrastou a página da posição `de` para a posição `para`. */
  aoMover: (de: number, para: number) => void
  registrarCaixa: (indice: number, caixa: HTMLInputElement | null) => void
}) {
  const unica = plano.length === 1

  function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || bloqueado) return
    const de = plano.findIndex((p) => idDoArraste(p.indice) === active.id)
    const para = plano.findIndex((p) => idDoArraste(p.indice) === over.id)
    if (de < 0 || para < 0) return
    aoMover(de, para)
  }

  const numeroPorId = (id: UniqueIdentifier) => Number(String(id).slice(1)) + 1
  const posicaoDe = (id: UniqueIdentifier) =>
    plano.findIndex((p) => idDoArraste(p.indice) === id) + 1
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

  return (
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
        items={plano.map((pagina) => idDoArraste(pagina.indice))}
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
              bloqueado={bloqueado}
              unica={unica}
              idDaDicaUnica={idDaDicaUnica}
              aoAgir={aoAgir}
              registrarCaixa={registrarCaixa}
              observar={miniaturas.observar}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

/** "Ações nas páginas selecionadas": um ponto só no Tab, com ←/→, Home e End entre os habilitados. */
export function BarraDaSelecao({
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

export const CartaoDaPagina = memo(function CartaoDaPagina({
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
    id: idDoArraste(indice),
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
