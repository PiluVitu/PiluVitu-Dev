'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import {
  faCircleExclamation,
  faDownload,
  faFilePdf,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
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
import { useDocumentoPdf } from './documento-pdf'
import { ehCampoDeTexto, podeTerFoco } from './foco'
import {
  BarraDaSelecao,
  ListaDePaginas,
  ORDEM_DA_BARRA,
  type AcaoDaPagina,
  type BotaoDaBarra,
  type ChaveDaBarra,
  type MotivoDesabilitado,
} from './lista-de-paginas'
import { montagemDoPlano } from './montagem'
import {
  criarMotorComWorker,
  ehFalhaDaOperacao,
  type MotorDePdf,
} from './motor'
import { novoWorkerDePdf } from './novo-worker'
import {
  criarRenderizadorComPdfjs,
  type DocumentoAberto,
  type RenderizadorDePdf,
} from './renderizador'
import { TEXTOS, formatarTamanho, paginas as textoDePaginas } from './textos'
import { useAbrirPdf, type RecusaDaAbertura } from './use-abrir-pdf'
import { useMiniaturas } from './use-miniaturas'
import { AvisoDePrivacidade, ZonaDeArquivos } from './zona-de-arquivos'

const T = TEXTOS.organizar

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

function mensagemDaRecusa(nome: string, recusa: RecusaDaAbertura): string {
  return 'paginasDemais' in recusa
    ? T.paginasDemais(nome, recusa.paginasDemais, TETO_DE_PAGINAS)
    : T.recusado(nome, recusa.motivo)
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

  const [edicao, setEdicao] = useState<Edicao>(SEM_EDICAO)
  const [resultado, setResultado] = useState<Resultado>({ estado: 'parado' })
  const [anuncio, setAnuncio] = useState({ texto: '', vez: 0 })

  const { atual, documento, grandeDemais } = useAbrirPdf(arquivo, {
    motor,
    renderizador: () =>
      (renderizadorRef.current ??= criarRenderizadorComPdfjs()),
    aoAbrir(aberto, doArquivo) {
      setEdicao({
        documento: aberto,
        plano: planoInicial(aberto.paginas),
        selecionadas: new Set(),
        passado: [],
      })
      setResultado({ estado: 'parado' })
      anunciar(T.aberto(doArquivo.name, aberto.paginas))
    },
    aoRecusar: () => anunciar(''),
  })
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
      const pdf = await motor().montar([origem], {
        paginas: montagemDoPlano(planoDoPdf),
        objetosPorPagina: new Map(),
        imagens: new Map(),
        paginasRasterizadas: new Map(),
      })
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

  function moverArrastando(de: number, para: number) {
    mudar(
      { plano: arrayMove([...plano], de, para), selecionadas },
      T.anuncios.movida(plano[de].indice + 1, para + 1, plano.length),
    )
  }

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
        ? mensagemDaRecusa(atual.arquivo.name, atual.recusa)
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
            <BarraDaSelecao
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

          <ListaDePaginas
            plano={plano}
            selecionadas={selecionadas}
            miniaturas={miniaturas}
            bloqueado={montando}
            idDoTitulo={idDoTitulo}
            idDaDicaUnica={idDaDica('ultimaPagina')}
            aoAgir={aoAgir}
            aoMover={moverArrastando}
            registrarCaixa={registrarCaixa}
          />
        </section>
      )}

      <p role="status" className="sr-only" data-testid="organizar-pdf-anuncio">
        {textoDoAnuncio}
        {anuncio.vez % 2 ? ' ' : ''}
      </p>
    </div>
  )
}
