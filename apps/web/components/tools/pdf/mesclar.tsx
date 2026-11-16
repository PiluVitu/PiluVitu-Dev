'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  faArrowDown,
  faArrowUp,
  faCircleExclamation,
  faDownload,
  faFilePdf,
  faGripVertical,
  faTableCellsLarge,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import {
  NOME_PADRAO_DO_PDF_FINAL,
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  TETO_TOTAL_EM_BYTES,
  cabemNoTeto,
  nomeDoPdfFinal,
  type MotivoDoErroDePdf,
} from '@piluvitu/tools/pdf-regras'
import { useReduzirMovimento } from '@/hooks/use-reduzir-movimento'
import { useDocumentoPdf } from './documento-pdf'
import {
  criarMotorComWorker,
  ehFalhaDaOperacao,
  type MotivoDaRecusa,
  type MotorDePdf,
} from './motor'
import {
  ERROS_DO_ARQUIVO,
  TEXTOS,
  formatarPorcentagem,
  formatarTamanho,
  paginas as textoDePaginas,
} from './textos'
import { novoWorkerDePdf } from './novo-worker'
import { AvisoDePrivacidade, ZonaDeArquivos } from './zona-de-arquivos'

type Item = {
  id: string
  arquivo: File
  paginas?: number
  erro?: MotivoDaRecusa
}

type Mesclagem =
  | { estado: 'parada' }
  | { estado: 'mesclando'; fracao: number; arquivo: number | null }
  | { estado: 'pronta'; pdf: Blob; url: string; paginas: number }
  | { estado: 'falhou'; mensagem: string }

type Botao = 'subir' | 'descer' | 'remover'

const lendo = (item: Item) =>
  item.paginas === undefined && item.erro === undefined

type Props = {
  /** Injetável para story e teste; sem ele, o motor usa um Web Worker com o pdf-lib. */
  motor?: MotorDePdf
}

export function MesclarPdf({ motor: motorInjetado }: Props) {
  const ids = useId()
  const router = useRouter()
  const documento = useDocumentoPdf()
  const motorRef = useRef<MotorDePdf | null>(motorInjetado ?? null)
  const proximoId = useRef(0)
  const escolherRef = useRef<HTMLButtonElement>(null)
  const mesclarRef = useRef<HTMLButtonElement>(null)
  const cancelarRef = useRef<HTMLButtonElement>(null)
  const baixarRef = useRef<HTMLAnchorElement>(null)
  const botoes = useRef(new Map<string, HTMLButtonElement>())
  const focoPendente = useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  )

  const [itens, setItens] = useState<Item[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [nome, setNome] = useState(NOME_PADRAO_DO_PDF_FINAL)
  const [mesclagem, setMesclagem] = useState<Mesclagem>({ estado: 'parada' })
  const [anuncio, setAnuncio] = useState({ texto: '', vez: 0 })

  const mesclando = mesclagem.estado === 'mesclando'
  const urlDoResultado = mesclagem.estado === 'pronta' ? mesclagem.url : null
  const usados = itens.reduce((soma, item) => soma + item.arquivo.size, 0)
  const totalDePaginas = itens.reduce((soma, i) => soma + (i.paginas ?? 0), 0)
  const algumLendo = itens.some(lendo)
  const algumComErro = itens.some((item) => item.erro)
  const dica =
    itens.length < 2
      ? TEXTOS.dicas.minimo
      : algumLendo
        ? TEXTOS.dicas.aguarde
        : algumComErro
          ? TEXTOS.dicas.remova
          : null
  const nomeFinal = nomeDoPdfFinal(nome)

  function motor() {
    motorRef.current ??= criarMotorComWorker(novoWorkerDePdf)
    return motorRef.current
  }

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

  function anunciar(texto: string) {
    setAnuncio(({ vez }) => ({ texto, vez: vez + 1 }))
  }

  function focar(alvo: () => HTMLElement | null | undefined) {
    focoPendente.current = alvo
  }

  function descartarResultado() {
    if (mesclagem.estado === 'pronta' || mesclagem.estado === 'falhou') {
      setMesclagem({ estado: 'parada' })
    }
  }

  function adicionar(lista: FileList) {
    if (mesclando) return
    const novos = Array.from(lista)
    const cabem = cabemNoTeto(
      usados,
      novos.map((arquivo) => arquivo.size),
    )
    setAvisos(
      novos
        .filter((_, i) => !cabem[i])
        .map((arquivo) =>
          TEXTOS.teto(arquivo.name, arquivo.size, TETO_TOTAL_EM_BYTES),
        ),
    )
    const criados: Item[] = novos
      .filter((_, i) => cabem[i])
      .map((arquivo) => ({
        id: `${ids}-pdf-${proximoId.current++}`,
        arquivo,
      }))
    if (!criados.length) return
    descartarResultado()
    setItens((atuais) => [...atuais, ...criados])
    anunciar(TEXTOS.anuncios.adicionados(criados.length))
    for (const item of criados) {
      void motor()
        .analisar(item.arquivo)
        .then((resultado) => {
          setItens((atuais) =>
            atuais.map((atual) =>
              atual.id !== item.id
                ? atual
                : resultado.ok
                  ? { ...atual, paginas: resultado.paginas }
                  : { ...atual, erro: resultado.motivo },
            ),
          )
          if (!resultado.ok) {
            anunciar(
              TEXTOS.anuncios.recusado(item.arquivo.name, resultado.motivo),
            )
          }
        })
    }
  }

  function reordenar(de: number, para: number) {
    setItens(arrayMove(itens, de, para))
    descartarResultado()
    anunciar(
      TEXTOS.anuncios.movido(itens[de].arquivo.name, para + 1, itens.length),
    )
  }

  function mover(id: string, botao: 'subir' | 'descer') {
    const de = itens.findIndex((item) => item.id === id)
    const para = botao === 'subir' ? de - 1 : de + 1
    if (de < 0 || para < 0 || para >= itens.length) return
    // Na ponta da lista o botão usado fica desabilitado: o foco passa para o do outro sentido.
    const naPonta = para === 0 || para === itens.length - 1
    const alvo: Botao = naPonta
      ? botao === 'subir'
        ? 'descer'
        : 'subir'
      : botao
    focar(() => botoes.current.get(`${id}:${alvo}`))
    reordenar(de, para)
  }

  function remover(id: string) {
    const indice = itens.findIndex((item) => item.id === id)
    const restantes = itens.filter((item) => item.id !== id)
    const vizinho = restantes[indice] ?? restantes[indice - 1]
    setItens(restantes)
    descartarResultado()
    setAvisos([])
    anunciar(TEXTOS.anuncios.removido(itens[indice].arquivo.name))
    focar(() =>
      vizinho
        ? botoes.current.get(`${vizinho.id}:remover`)
        : escolherRef.current,
    )
  }

  function limpar() {
    setItens([])
    setAvisos([])
    descartarResultado()
    anunciar(TEXTOS.anuncios.limpo)
    focar(() => escolherRef.current)
  }

  async function mesclar() {
    const fila = itens
    setAvisos([])
    setMesclagem({ estado: 'mesclando', fracao: 0, arquivo: 0 })
    anunciar(TEXTOS.anuncios.comecou)
    focar(() => cancelarRef.current)
    try {
      const pdf = await motor().mesclar(
        fila.map((item) => item.arquivo),
        ({ fracao, arquivo }) =>
          setMesclagem({ estado: 'mesclando', fracao, arquivo }),
      )
      setMesclagem({
        estado: 'pronta',
        pdf,
        url: URL.createObjectURL(pdf),
        paginas: totalDePaginas,
      })
      anunciar(TEXTOS.anuncios.pronto(totalDePaginas, pdf.size))
      focar(() => baixarRef.current)
    } catch (erro) {
      const falha = ehFalhaDaOperacao(erro) ? erro : { motivo: 'inesperado' }
      if (falha.motivo === 'cancelado') {
        setMesclagem({ estado: 'parada' })
        anunciar(TEXTOS.anuncios.cancelado)
        focar(() => mesclarRef.current)
        return
      }
      const culpado =
        'indice' in falha && falha.indice !== undefined
          ? fila[falha.indice]
          : undefined
      setMesclagem({
        estado: 'falhou',
        mensagem:
          falha.motivo === 'inesperado' || !culpado
            ? TEXTOS.falha.inesperada
            : TEXTOS.falha.arquivo(
                culpado.arquivo.name,
                falha.motivo as MotivoDoErroDePdf,
              ),
      })
      focar(() => mesclarRef.current)
    }
  }

  function organizarResultado(pdf: Blob) {
    documento.guardar(new File([pdf], nomeFinal, { type: 'application/pdf' }))
    router.push('/tools/pdf/organizar')
  }

  function aoSoltarNaLista({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const de = itens.findIndex((item) => item.id === active.id)
    const para = itens.findIndex((item) => item.id === over.id)
    if (de >= 0 && para >= 0) reordenar(de, para)
  }

  const nomePorId = (id: UniqueIdentifier) =>
    itens.find((item) => item.id === id)?.arquivo.name ?? ''
  const posicaoDe = (id: UniqueIdentifier) =>
    itens.findIndex((item) => item.id === id) + 1
  const anunciosDoArraste: Announcements = {
    onDragStart: ({ active }) => TEXTOS.arrastar.pegou(nomePorId(active.id)),
    onDragOver: ({ active, over }) =>
      over
        ? TEXTOS.arrastar.sobre(nomePorId(active.id), posicaoDe(over.id))
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? TEXTOS.arrastar.soltou(nomePorId(active.id), posicaoDe(over.id))
        : TEXTOS.arrastar.cancelou(nomePorId(active.id)),
    onDragCancel: ({ active }) =>
      TEXTOS.arrastar.cancelou(nomePorId(active.id)),
  }
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const idDoTitulo = `${ids}-lista`
  const idDaDica = `${ids}-dica`
  const idDoNome = `${ids}-nome`

  return (
    <div className="space-y-8" data-testid="mesclar-pdf">
      <AvisoDePrivacidade />

      <section aria-label={TEXTOS.zona.rotulo} className="space-y-3">
        <ZonaDeArquivos
          aoEscolher={adicionar}
          desabilitada={mesclando}
          botaoRef={escolherRef}
        />
        <p className="text-muted-foreground text-xs leading-relaxed">
          {TEXTOS.limites(TETO_TOTAL_EM_BYTES)}
        </p>
        {avisos.length > 0 && (
          <div
            role="alert"
            data-testid="mesclar-pdf-avisos"
            className="bg-card border-destructive flex gap-2 rounded-md border px-3 py-3 text-sm"
          >
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <ul className="space-y-1">
              {avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {itens.length > 0 && (
        <section aria-labelledby={idDoTitulo} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id={idDoTitulo} className="font-semibold">
                {TEXTOS.lista.titulo}
              </h2>
              <p
                className="text-muted-foreground text-xs"
                data-testid="mesclar-pdf-resumo"
              >
                {TEXTOS.lista.resumo(itens.length, totalDePaginas, usados)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              disabled={mesclando}
              onClick={limpar}
              data-testid="mesclar-pdf-limpar"
            >
              {TEXTOS.acoes.limpar}
            </Button>
          </div>

          <DndContext
            sensors={sensores}
            collisionDetection={closestCenter}
            onDragEnd={aoSoltarNaLista}
            accessibility={{
              announcements: anunciosDoArraste,
              screenReaderInstructions: {
                draggable: TEXTOS.arrastar.instrucoes,
              },
            }}
          >
            <SortableContext
              items={itens.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="space-y-2" data-testid="mesclar-pdf-lista">
                {itens.map((item, indice) => (
                  <LinhaDoArquivo
                    key={item.id}
                    item={item}
                    posicao={indice + 1}
                    bloqueado={mesclando}
                  >
                    {(['subir', 'descer', 'remover'] as const).map((botao) => (
                      <Button
                        key={botao}
                        ref={(no) => {
                          const chave = `${item.id}:${botao}`
                          if (no) botoes.current.set(chave, no)
                          else botoes.current.delete(chave)
                        }}
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11"
                        aria-label={TEXTOS.acoes[botao](item.arquivo.name)}
                        disabled={
                          mesclando ||
                          (botao === 'subir' && indice === 0) ||
                          (botao === 'descer' && indice === itens.length - 1)
                        }
                        onClick={() =>
                          botao === 'remover'
                            ? remover(item.id)
                            : mover(item.id, botao)
                        }
                        data-testid={`mesclar-pdf-${botao}`}
                      >
                        <FontAwesomeIcon
                          icon={
                            botao === 'subir'
                              ? faArrowUp
                              : botao === 'descer'
                                ? faArrowDown
                                : faTrashCan
                          }
                          className="size-4"
                          aria-hidden
                        />
                      </Button>
                    ))}
                  </LinhaDoArquivo>
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {TEXTOS.alcance}
          </p>
        </section>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor={idDoNome} className="text-sm font-medium">
            {TEXTOS.nome.rotulo}
          </label>
          <Input
            id={idDoNome}
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-11 max-w-sm"
            data-testid="mesclar-pdf-nome"
          />
        </div>

        {mesclagem.estado === 'mesclando' ? (
          <Andamento
            fracao={mesclagem.fracao}
            texto={
              mesclagem.arquivo === null
                ? TEXTOS.progresso.salvando
                : TEXTOS.progresso.lendo(
                    mesclagem.arquivo + 1,
                    itens.length,
                    itens[mesclagem.arquivo]?.arquivo.name ?? '',
                  )
            }
            aoCancelar={() => motor().cancelar()}
            cancelarRef={cancelarRef}
          />
        ) : (
          <div className="space-y-2">
            <Button
              ref={mesclarRef}
              type="button"
              className="h-11 gap-2 px-6"
              disabled={dica !== null}
              aria-describedby={dica ? idDaDica : undefined}
              onClick={mesclar}
              data-testid="mesclar-pdf-mesclar"
            >
              <FontAwesomeIcon
                icon={faFilePdf}
                className="size-4"
                aria-hidden
              />
              {TEXTOS.acoes.mesclar}
            </Button>
            {dica && (
              <p id={idDaDica} className="text-muted-foreground text-sm">
                {dica}
              </p>
            )}
          </div>
        )}

        {mesclagem.estado === 'falhou' && (
          <div
            role="alert"
            data-testid="mesclar-pdf-falha"
            className="bg-card border-destructive flex gap-2 rounded-md border px-3 py-3 text-sm"
          >
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <p>{mesclagem.mensagem}</p>
          </div>
        )}

        {mesclagem.estado === 'pronta' && (
          <div
            data-testid="mesclar-pdf-resultado"
            className="bg-card border-border animate-in fade-in-0 flex flex-wrap items-center gap-4 rounded-lg border p-4 duration-200"
          >
            <div className="min-w-0 flex-1 basis-48 space-y-0.5">
              <p className="font-semibold">{TEXTOS.resultado.titulo}</p>
              <p className="text-muted-foreground text-sm">
                {TEXTOS.resultado.resumo(mesclagem.paginas, mesclagem.pdf.size)}
              </p>
            </div>
            <Button asChild className="h-11 gap-2 px-5">
              <a
                ref={baixarRef}
                href={mesclagem.url}
                download={nomeFinal}
                data-testid="mesclar-pdf-baixar"
              >
                <FontAwesomeIcon
                  icon={faDownload}
                  className="size-4"
                  aria-hidden
                />
                <span className="[overflow-wrap:anywhere] whitespace-normal">
                  {TEXTOS.acoes.baixar(nomeFinal)}
                </span>
              </a>
            </Button>
            {mesclagem.pdf.size <= TETO_DE_BYTES_COM_MINIATURAS &&
            mesclagem.paginas <= TETO_DE_PAGINAS ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2 px-5"
                onClick={() => organizarResultado(mesclagem.pdf)}
                data-testid="mesclar-pdf-organizar"
              >
                <FontAwesomeIcon
                  icon={faTableCellsLarge}
                  className="size-4"
                  aria-hidden
                />
                <span className="whitespace-normal">
                  {TEXTOS.acoes.organizarResultado}
                </span>
              </Button>
            ) : (
              <p
                className="text-muted-foreground basis-full text-sm"
                data-testid="mesclar-pdf-organizar-fora-do-teto"
              >
                {TEXTOS.acoes.organizarForaDoTeto(
                  TETO_DE_BYTES_COM_MINIATURAS,
                  TETO_DE_PAGINAS,
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <p role="status" className="sr-only" data-testid="mesclar-pdf-anuncio">
        {anuncio.texto}
        {anuncio.vez % 2 ? ' ' : ''}
      </p>
    </div>
  )
}

function LinhaDoArquivo({
  item,
  posicao,
  bloqueado,
  children,
}: {
  item: Item
  posicao: number
  bloqueado: boolean
  children: ReactNode
}) {
  const reduzir = useReduzirMovimento()
  const {
    setNodeRef,
    setActivatorNodeRef,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: bloqueado,
    transition: reduzir
      ? null
      : { duration: 150, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  })
  const nome = item.arquivo.name

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
      }}
      data-testid="mesclar-pdf-item"
      className={cn(
        'bg-card animate-in fade-in-0 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border py-1 pr-1 duration-150',
        item.erro ? 'border-destructive' : 'border-border',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        aria-hidden
        title={TEXTOS.arrastar.alca(nome)}
        className={cn(
          'text-muted-foreground flex size-11 shrink-0 touch-none items-center justify-center',
          bloqueado ? 'opacity-50' : 'cursor-grab active:cursor-grabbing',
        )}
      >
        <FontAwesomeIcon icon={faGripVertical} className="size-4" />
      </span>
      <span
        className="text-muted-foreground w-6 shrink-0 text-right font-mono text-sm"
        aria-hidden
      >
        {TEXTOS.lista.posicao(posicao)}
      </span>
      <div className="min-w-0 flex-1 basis-40 py-1">
        <p
          className="text-sm font-medium [overflow-wrap:anywhere]"
          data-testid="mesclar-pdf-nome-do-item"
        >
          {nome}
        </p>
        {item.erro ? (
          <p className="text-destructive mt-0.5 flex gap-1.5 text-xs">
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="mt-0.5 size-3 shrink-0"
              aria-hidden
            />
            <span data-testid="mesclar-pdf-erro-do-item">
              {ERROS_DO_ARQUIVO[item.erro]}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            {item.paginas === undefined
              ? TEXTOS.lista.lendo
              : `${textoDePaginas(item.paginas)} · ${formatarTamanho(item.arquivo.size)}`}
          </p>
        )}
      </div>
      <div className="ml-auto flex shrink-0">{children}</div>
    </li>
  )
}

function Andamento({
  fracao,
  texto,
  aoCancelar,
  cancelarRef,
}: {
  fracao: number
  texto: string
  aoCancelar: () => void
  cancelarRef: RefObject<HTMLButtonElement | null>
}) {
  const id = useId()
  const porcento = Math.round(fracao * 100)
  return (
    <div className="space-y-3" data-testid="mesclar-pdf-andamento">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p id={id} className="[overflow-wrap:anywhere]">
          {texto}
        </p>
        <p className="text-muted-foreground font-mono" aria-hidden>
          {formatarPorcentagem(fracao)}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={TEXTOS.progresso.rotulo}
        aria-describedby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcento}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full motion-safe:transition-[width] motion-safe:duration-200"
          style={{ width: `${porcento}%` }}
        />
      </div>
      <Button
        ref={cancelarRef}
        type="button"
        variant="outline"
        className="h-11"
        onClick={aoCancelar}
        data-testid="mesclar-pdf-cancelar"
      >
        {TEXTOS.acoes.cancelar}
      </Button>
    </div>
  )
}
