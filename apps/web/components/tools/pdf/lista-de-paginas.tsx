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
  useSortable,
  verticalListSortingStrategy,
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
import { useReduzirMovimento } from '@/hooks/use-reduzir-movimento'
import type { PaginaDaBancada } from './bancada'
import { FolhaEmBranco } from './folha-em-branco'
import { TEXTOS } from './textos'

const T = TEXTOS.organizar
const P = TEXTOS.editar.paginasDoDocumento

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

export function BarraDaSelecao({
  botoes,
  botoesRef,
  idDaDica,
  aoUsar,
  prefixo = 'organizar-pdf',
  soIcone = [],
  rotulos = {},
  descricoes = {},
  empilhada = false,
}: {
  botoes: BotaoDaBarra[]
  botoesRef: RefObject<Map<ChaveDaBarra, HTMLButtonElement>>
  idDaDica: (motivo: MotivoDesabilitado) => string
  aoUsar: (chave: ChaveDaBarra) => void
  /** Do `data-testid` de cada botão. */
  prefixo?: string
  /** Os botões que mostram só o ícone, com o nome no `aria-label` (a coluna estreita da Bancada). */
  soIcone?: readonly ChaveDaBarra[]
  rotulos?: Partial<Record<ChaveDaBarra, string>>
  /** O `aria-describedby` do botão habilitado (o parado aponta para o motivo). */
  descricoes?: Partial<Record<ChaveDaBarra, string>>
  /** Grade de botões com o ícone em cima e o nome embaixo (a folha do celular). */
  empilhada?: boolean
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
      className={
        empilhada
          ? 'grid grid-cols-3 gap-1 min-[22rem]:grid-cols-4'
          : 'flex flex-wrap gap-1.5'
      }
      data-testid="organizar-pdf-barra"
    >
      {botoes.map(({ chave, motivo }) => {
        const rotulo = rotulos[chave] ?? T.acoes[chave]
        const icone = soIcone.includes(chave)
        return (
          <Button
            key={chave}
            ref={(no) => {
              if (no) botoesRef.current.set(chave, no)
              else botoesRef.current.delete(chave)
            }}
            type="button"
            variant="outline"
            className={
              icone
                ? 'size-11'
                : empilhada
                  ? 'h-15 flex-col gap-1 px-1 text-[0.6875rem] leading-tight whitespace-normal'
                  : 'h-11 gap-2 px-3'
            }
            size={icone ? 'icon' : undefined}
            aria-label={icone ? rotulo : undefined}
            title={icone ? rotulo : undefined}
            tabIndex={chave === noTab ? 0 : -1}
            disabled={motivo !== null}
            aria-describedby={motivo ? idDaDica(motivo) : descricoes[chave]}
            aria-keyshortcuts={
              chave === 'desfazer' ? 'Control+Z Meta+Z' : undefined
            }
            onFocus={() => setAtivo(chave)}
            onClick={() => aoUsar(chave)}
            data-testid={`${prefixo}-${chave}`}
          >
            <FontAwesomeIcon
              icon={ICONES[chave]}
              className={cn(
                'size-4',
                chave === 'apagar' &&
                  (icone || empilhada) &&
                  'text-destructive',
              )}
              aria-hidden
            />
            {!icone && rotulo}
          </Button>
        )
      })}
    </div>
  )
}

export type AcaoNaBancada =
  | { tipo: 'selecionar'; id: string; marcada: boolean }
  | { tipo: 'abrir'; id: string }
  | { tipo: 'girar'; id: string }
  | { tipo: 'apagar'; id: string }

export function ListaDaBancada({
  paginas,
  nomesDosArquivos,
  marcadas,
  aberta,
  miniaturas,
  bloqueado,
  idDoTitulo,
  idDaDicaUnica,
  aoAgir,
  aoMover,
  registrarCaixa,
}: {
  paginas: readonly PaginaDaBancada[]
  /** Pela posição do arquivo na sessão (o `arquivo` da origem): a origem do cartão diz de onde a página veio. */
  nomesDosArquivos: readonly string[]
  marcadas: ReadonlySet<string>
  aberta: string
  /** Pelo id da página: páginas de arquivos diferentes não dividem miniatura. */
  miniaturas: {
    urls: ReadonlyMap<string, string>
    falhas: ReadonlySet<string>
    observar: (elemento: Element, id: string) => () => void
  }
  bloqueado: boolean
  idDoTitulo: string
  idDaDicaUnica: string
  /** Estável entre renderizações: os cartões são memorizados. */
  aoAgir: (acao: AcaoNaBancada) => void
  aoMover: (de: number, para: number) => void
  registrarCaixa: (id: string, caixa: HTMLInputElement | null) => void
}) {
  const unica = paginas.length === 1
  const posicaoDe = (id: UniqueIdentifier) =>
    paginas.findIndex((pagina) => pagina.id === id) + 1

  function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id || bloqueado) return
    const de = posicaoDe(active.id) - 1
    const para = posicaoDe(over.id) - 1
    if (de < 0 || para < 0) return
    aoMover(de, para)
  }

  const anunciosDoArraste: Announcements = {
    onDragStart: ({ active }) => T.arrastar.pegou(posicaoDe(active.id)),
    onDragOver: ({ active, over }) =>
      over
        ? T.arrastar.sobre(posicaoDe(active.id), posicaoDe(over.id))
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? T.arrastar.soltou(posicaoDe(active.id), posicaoDe(over.id))
        : T.arrastar.cancelou(posicaoDe(active.id)),
    onDragCancel: ({ active }) => T.arrastar.cancelou(posicaoDe(active.id)),
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
        items={paginas.map(({ id }) => id)}
        strategy={verticalListSortingStrategy}
      >
        <ol
          aria-labelledby={idDoTitulo}
          className="flex flex-col gap-2"
          data-testid="editar-pdf-paginas"
        >
          {paginas.map((pagina, posicao) => (
            <CartaoDaBancada
              key={pagina.id}
              pagina={pagina}
              posicao={posicao + 1}
              nomeDoArquivo={
                'branca' in pagina.origem
                  ? ''
                  : (nomesDosArquivos[pagina.origem.arquivo] ?? '')
              }
              selecionada={marcadas.has(pagina.id)}
              aberta={pagina.id === aberta}
              url={miniaturas.urls.get(pagina.id)}
              falhou={miniaturas.falhas.has(pagina.id)}
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

export const CartaoDaBancada = memo(function CartaoDaBancada({
  pagina,
  posicao,
  nomeDoArquivo,
  selecionada,
  aberta,
  url,
  falhou,
  bloqueado,
  unica,
  idDaDicaUnica,
  aoAgir,
  registrarCaixa,
  observar,
}: {
  pagina: PaginaDaBancada
  /** A partir de 1: o rótulo "Página N" é a posição no documento final. */
  posicao: number
  nomeDoArquivo: string
  selecionada: boolean
  aberta: boolean
  url: string | undefined
  falhou: boolean
  bloqueado: boolean
  unica: boolean
  idDaDicaUnica: string
  aoAgir: (acao: AcaoNaBancada) => void
  registrarCaixa: (id: string, caixa: HTMLInputElement | null) => void
  observar: (elemento: Element, id: string) => () => void
}) {
  const reduzir = useReduzirMovimento()
  const { id, origem, giro } = pagina
  const branca = 'branca' in origem ? origem.branca : null
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled: bloqueado,
    transition: reduzir
      ? null
      : { duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  })
  const refDoItem = useCallback(
    (no: HTMLLIElement | null) => {
      setNodeRef(no)
      if (!no) return
      // A página em branco não tem miniatura para o pdf.js desenhar.
      const parar = branca ? () => {} : observar(no, id)
      return () => {
        parar()
        setNodeRef(null)
      }
    },
    [setNodeRef, observar, id, branca],
  )
  const refDaCaixa = useCallback(
    (caixa: HTMLInputElement | null) => registrarCaixa(id, caixa),
    [registrarCaixa, id],
  )

  return (
    <li
      ref={refDoItem}
      data-testid="editar-pdf-pagina"
      data-id={id}
      data-selecionada={selecionada || undefined}
      data-aberta={aberta || undefined}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
      }}
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-xl border p-1.5',
        aberta ? 'bg-accent-soft' : 'bg-card',
        selecionada ? 'border-primary ring-primary ring-1' : 'border-border',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <label
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center"
        data-testid="editar-pdf-selecao"
      >
        <input
          ref={refDaCaixa}
          type="checkbox"
          className="accent-primary size-5 cursor-pointer"
          aria-label={T.selecionar(posicao)}
          checked={selecionada}
          disabled={bloqueado}
          onChange={(evento) =>
            aoAgir({ tipo: 'selecionar', id, marcada: evento.target.checked })
          }
        />
      </label>

      <button
        ref={setActivatorNodeRef}
        {...listeners}
        type="button"
        aria-label={P.abrir(posicao)}
        aria-current={aberta ? 'page' : undefined}
        disabled={bloqueado}
        onClick={() => aoAgir({ tipo: 'abrir', id })}
        onContextMenu={(evento) => evento.preventDefault()}
        className={cn(
          'bg-muted focus-visible:ring-ring focus-visible:ring-offset-background flex size-16 shrink-0 touch-manipulation items-center justify-center overflow-hidden rounded-md border outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-offset-2',
          aberta ? 'border-primary border-2' : 'border-border',
          !bloqueado && 'cursor-grab active:cursor-grabbing',
        )}
        data-testid="editar-pdf-abrir-pagina"
      >
        {branca ? (
          <FolhaEmBranco tamanho={branca} giro={giro} className="size-[85%]" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura num Blob gerado no aparelho, sem otimizador
          <img
            src={url}
            alt=""
            draggable={false}
            data-testid="editar-pdf-cartao-miniatura"
            className="max-h-full max-w-full shadow-sm motion-safe:transition-transform motion-safe:duration-200"
            style={{ transform: `rotate(${giro}deg)` }}
          />
        ) : falhou ? (
          <span className="text-foreground px-1 text-center text-[0.625rem] leading-tight">
            {T.semMiniatura}
          </span>
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className="flex flex-wrap items-center gap-1.5 text-sm font-medium"
          data-testid="editar-pdf-rotulo"
        >
          {P.rotulo(posicao)}
          {aberta && (
            <span className="border-primary/30 bg-background text-primary rounded-full border px-2 text-xs font-semibold">
              {P.aberta}
            </span>
          )}
        </p>
        <p
          className="text-muted-foreground text-xs [overflow-wrap:anywhere]"
          data-testid="editar-pdf-origem"
        >
          {'branca' in origem
            ? P.origemDaBranca(origem.branca)
            : P.origem(nomeDoArquivo, origem.indice + 1)}
        </p>
        {giro !== 0 && (
          <p className="text-muted-foreground text-xs">{T.girada(giro)}</p>
        )}
        <div className="flex flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label={T.girarPagina(posicao)}
            disabled={bloqueado}
            onClick={() => aoAgir({ tipo: 'girar', id })}
            data-testid="editar-pdf-girar-pagina"
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
            className="size-11 shrink-0"
            aria-label={T.apagarPagina(posicao)}
            aria-describedby={unica ? idDaDicaUnica : undefined}
            disabled={bloqueado || unica}
            onClick={() => aoAgir({ tipo: 'apagar', id })}
            data-testid="editar-pdf-apagar-pagina"
          >
            <FontAwesomeIcon
              icon={faTrashCan}
              className="text-destructive size-4"
              aria-hidden
            />
          </Button>
        </div>
      </div>
    </li>
  )
})
