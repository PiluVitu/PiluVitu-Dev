import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  TETO_DAS_IMAGENS_EM_BYTES,
  TETO_DE_BYTES_COM_MINIATURAS,
  type Ponto,
} from '@piluvitu/tools/pdf-regras'
import { DocumentoPdfProvider, useDocumentoPdf } from './documento-pdf'
import { ZOOMS } from './area-da-pagina'
import { CONSULTA_DA_BANCADA_LARGA } from './bancada-larga'
import { EditarPdf } from './editar'
import type { ObjetoNaTela } from './motor'
import { criarMotorFalso } from './motor-falso'
import { criarRenderizadorFalso } from './renderizador-falso'
import { ERROS_DO_ARQUIVO, TEXTOS } from './textos'

// O motor e o renderizador reais criam Workers com import.meta; aqui os dois vêm injetados.
jest.mock('./novo-worker', () => ({ novoWorkerDePdf: jest.fn() }))
// Para provar que a proteção da janela vive com o editor: com o interruptor ligado, a zona não protege.
const mockZona = { semProtecao: false }
jest.mock('./zona-de-arquivos', () => {
  const real = jest.requireActual('./zona-de-arquivos')
  const { createElement } = jest.requireActual('react')
  return {
    ...real,
    ZonaDeArquivos: (props: object) =>
      mockZona.semProtecao
        ? createElement('div', { 'data-testid': 'pdf-zona' })
        : createElement(real.ZonaDeArquivos, props),
  }
})
jest.mock('./novo-worker-pdfjs', () => ({ novoWorkerDoPdfjs: jest.fn() }))

// O jsdom não tem IntersectionObserver: o falso diz "apareceu" assim que observa, ou só quando o
// teste chama mostrar(), para conferir que só as miniaturas na tela são desenhadas.
class ObservadorFalso {
  static todos: ObservadorFalso[] = []
  static automatico = true
  observados = new Set<Element>()
  constructor(private readonly aoCruzar: IntersectionObserverCallback) {
    ObservadorFalso.todos.push(this)
  }
  observe(alvo: Element) {
    this.observados.add(alvo)
    if (ObservadorFalso.automatico) queueMicrotask(() => this.avisar([alvo]))
  }
  unobserve(alvo: Element) {
    this.observados.delete(alvo)
  }
  disconnect() {
    this.observados.clear()
  }
  avisar(alvos: Element[]) {
    const vivos = alvos.filter((alvo) => this.observados.has(alvo))
    if (!vivos.length) return
    this.aoCruzar(
      vivos.map(
        (target) =>
          ({ target, isIntersecting: true }) as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    )
  }
}

// Nem ResizeObserver: o falso mede a área com a largura que o teste escolhe.
class MedidorFalso {
  static todos: MedidorFalso[] = []
  static largura = 500
  alvos: Element[] = []
  constructor(private readonly aoMedir: ResizeObserverCallback) {
    MedidorFalso.todos.push(this)
  }
  observe(alvo: Element) {
    this.alvos.push(alvo)
    queueMicrotask(() => this.medir(MedidorFalso.largura))
  }
  unobserve() {}
  disconnect() {
    this.alvos = []
  }
  medir(largura: number) {
    if (!this.alvos.length) return
    this.aoMedir(
      this.alvos.map(
        (target) =>
          ({ target, contentRect: { width: largura } }) as ResizeObserverEntry,
      ),
      this as unknown as ResizeObserver,
    )
  }
}

let container: HTMLDivElement
let root: Root
let documentoAtual: File | null = null

// A Bancada larga (a lista na coluna) ou estreita (a lista na folha) vem do matchMedia, que o teste escolhe.
let larga = true
const ouvintesDaLargura = new Set<() => void>()

function mudarLargura(nova: boolean) {
  larga = nova
  act(() => ouvintesDaLargura.forEach((ouvinte) => ouvinte()))
}

// O tamanho natural (em pixels) que o createImageBitmap falso dá a toda imagem.
let imagemDecodificada = { width: 400, height: 200 }

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.IntersectionObserver =
    ObservadorFalso as unknown as typeof IntersectionObserver
  window.ResizeObserver = MedidorFalso as unknown as typeof ResizeObserver
  window.matchMedia = ((consulta: string) => ({
    media: consulta,
    get matches() {
      return consulta === CONSULTA_DA_BANCADA_LARGA && larga
    },
    addEventListener: (_: string, ouvinte: () => void) => {
      if (consulta === CONSULTA_DA_BANCADA_LARGA) ouvintesDaLargura.add(ouvinte)
    },
    removeEventListener: (_: string, ouvinte: () => void) =>
      ouvintesDaLargura.delete(ouvinte),
  })) as unknown as typeof window.matchMedia
  // Sem canvas no jsdom: a largura do texto sai da média da fonte, e a imagem do bitmap falso.
  HTMLCanvasElement.prototype.getContext = jest.fn(
    () => null,
  ) as unknown as HTMLCanvasElement['getContext']
  globalThis.createImageBitmap = jest.fn(async () => ({
    ...imagemDecodificada,
    close() {},
  })) as unknown as typeof createImageBitmap
  // O Blob do jsdom não tem arrayBuffer().
  if (!Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function (this: Blob) {
      return new Promise<ArrayBuffer>((resolver) => {
        const leitor = new FileReader()
        leitor.onload = () => resolver(leitor.result as ArrayBuffer)
        leitor.readAsArrayBuffer(this)
      })
    }
  }
})

beforeEach(() => {
  larga = true
  imagemDecodificada = { width: 400, height: 200 }
  ObservadorFalso.todos = []
  ObservadorFalso.automatico = true
  MedidorFalso.todos = []
  MedidorFalso.largura = 500
  let proximaUrl = 0
  URL.createObjectURL = jest.fn(() => `blob:url-${proximaUrl++}`)
  URL.revokeObjectURL = jest.fn()
  Object.defineProperty(window, 'devicePixelRatio', {
    value: 1,
    configurable: true,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  mockZona.semProtecao = false
})

function Espiao() {
  const { arquivo } = useDocumentoPdf()
  useEffect(() => {
    documentoAtual = arquivo
  })
  return null
}

function montar({
  renderizador = criarRenderizadorFalso(),
  motor = criarMotorFalso(),
  arquivoInicial = null as File | null,
} = {}) {
  act(() =>
    root.render(
      <DocumentoPdfProvider arquivoInicial={arquivoInicial}>
        <EditarPdf renderizador={renderizador} motor={motor} />
        <Espiao />
      </DocumentoPdfProvider>,
    ),
  )
  return { renderizador, motor }
}

const q = (testId: string) =>
  container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

const todos = (testId: string) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  )

function porNome<T extends HTMLElement = HTMLButtonElement>(nome: string): T {
  const achado = Array.from(
    container.querySelectorAll<HTMLElement>('button, a, input'),
  ).find(
    (el) =>
      el.getAttribute('aria-label') === nome || el.textContent?.trim() === nome,
  )
  if (!achado) throw new Error(`nada com o nome "${nome}"`)
  return achado as T
}

const pdf = (nome: string) =>
  new File(['%PDF-1.7'], nome, { type: 'application/pdf' })

const anuncio = () => q('editar-pdf-anuncio')!.textContent!.trim()

const focado = () =>
  document.activeElement?.getAttribute('aria-label') ??
  document.activeElement?.textContent?.trim()

async function esperar(ms = 20) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

async function esperarAte(condicao: () => boolean, prazoMs = 2_000) {
  for (let passado = 0; !condicao(); passado += 10) {
    if (passado >= prazoMs) throw new Error('a condição não chegou no prazo')
    await esperar(10)
  }
}

const canvasNaFolha = () =>
  q('editar-pdf-folha')?.querySelector<HTMLCanvasElement>('canvas') ?? null

// Espera a abertura (pdf-lib e pdf.js) e, quando abriu, a primeira página grande na tela.
async function abrir(nome: string, opcoes: Parameters<typeof montar>[0] = {}) {
  const montado = montar({ ...opcoes, arquivoInicial: pdf(nome) })
  await esperarAte(
    () =>
      q('editar-pdf-erro') !== null ||
      (q('editar-pdf-documento') !== null && canvasNaFolha() !== null),
  )
  return montado
}

async function clicar(alvo: HTMLElement) {
  await act(async () => {
    alvo.focus()
    alvo.click()
  })
  await esperar()
}

async function escolher(arquivo: File) {
  const input = q('pdf-input') as HTMLInputElement
  Object.defineProperty(input, 'files', {
    value: Object.assign([arquivo], { item: () => arquivo }),
    configurable: true,
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await esperar()
}

async function teclar(alvo: EventTarget, key: string) {
  await act(async () => {
    alvo.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }),
    )
  })
  await esperar()
}

const miniaturas = () => todos('editar-pdf-miniatura')
const atual = () =>
  miniaturas().findIndex((m) => m.getAttribute('aria-current') === 'page')

describe('abrir o PDF', () => {
  it('sem documento: diz que nada sai do aparelho, pede um PDF só e não lê nada', () => {
    const { renderizador, motor } = montar()

    expect(container.textContent).toContain(
      'Seus arquivos não saem do aparelho',
    )
    expect(q('pdf-escolher')!.textContent).toBe('Escolher PDF')
    expect((q('pdf-input') as HTMLInputElement).multiple).toBe(false)
    expect(container.textContent).toContain(
      'Até 50 MB e 500 páginas, somando os PDFs que você abrir e adicionar.',
    )
    expect(motor.analisadas).toEqual([])
    expect(renderizador.abertos).toEqual([])
    expect(q('editar-pdf-folha')).toBeNull()
  })

  it('chegando de outro modo: o pdf-lib lê, o pdf.js abre e a primeira página aparece grande, na largura da área', async () => {
    const { renderizador, motor } = await abrir('contrato-3p.pdf')

    expect(motor.analisadas).toEqual(['contrato-3p.pdf'])
    expect(renderizador.abertos).toEqual(['contrato-3p.pdf'])
    expect(q('editar-pdf-documento')!.textContent).toBe(
      'contrato-3p.pdf · 3 páginas',
    )
    expect(renderizador.paginasPedidas).toEqual([
      expect.objectContaining({ indice: 0, larguraCss: 500 }),
    ])
    expect(canvasNaFolha()).toBe(renderizador.paginasPedidas[0].canvas)
    expect(q('editar-pdf-folha')!.style.width).toBe('500px')
    expect(q('editar-pdf-folha')!.getAttribute('role')).toBe('img')
    expect(q('editar-pdf-folha')!.getAttribute('aria-label')).toBe('Página 1')
    expect(q('editar-pdf-posicao')!.textContent).toBe('Página 1 de 3')
    expect(q('editar-pdf-desenhando')).toBeNull()
    expect(anuncio()).toBe('contrato-3p.pdf · 3 páginas')
  })

  it('escolher um PDF guarda no editor (para os outros modos) e abre', async () => {
    const { renderizador } = montar()

    await escolher(pdf('nota-2p.pdf'))
    await esperarAte(() => canvasNaFolha() !== null)

    expect(documentoAtual?.name).toBe('nota-2p.pdf')
    expect(renderizador.abertos).toEqual(['nota-2p.pdf'])
    expect(miniaturas()).toHaveLength(2)
  })

  it('PDF protegido: a mesma mensagem do organizar, e o pdf.js nem abre', async () => {
    const { renderizador } = await abrir('extrato-senha.pdf')

    const alerta = q('editar-pdf-erro')!
    expect(alerta.getAttribute('role')).toBe('alert')
    expect(alerta.textContent).toBe(
      `Não deu para abrir extrato-senha.pdf. ${ERROS_DO_ARQUIVO.protegido}`,
    )
    expect(renderizador.abertos).toEqual([])
    expect(q('editar-pdf-faixa')).toBeNull()
  })

  it('acima do teto de bytes: explica, sugere dividir e não lê nada', async () => {
    const grande = pdf('scan-3p.pdf')
    Object.defineProperty(grande, 'size', {
      value: TETO_DE_BYTES_COM_MINIATURAS + 1,
    })
    const { renderizador, motor } = montar({ arquivoInicial: grande })
    await esperar()

    expect(q('editar-pdf-erro')!.textContent).toMatch(
      /^scan-3p\.pdf tem .+ MB, mais que os .+ MB que dá para editar no navegador\. Divida o PDF/,
    )
    expect(motor.analisadas).toEqual([])
    expect(renderizador.abertos).toEqual([])
  })

  it('acima do teto de páginas: explica e não abre no pdf.js', async () => {
    const { renderizador } = await abrir('livro-600p.pdf')

    expect(q('editar-pdf-erro')!.textContent).toBe(
      'livro-600p.pdf tem 600 páginas, mais que as 500 que dá para editar de uma vez. Divida o PDF em partes de até 500 páginas no programa que o criou e abra uma de cada vez.',
    )
    expect(renderizador.abertos).toEqual([])
  })

  // As edições são salvas pelo pdf-lib no índice da página que a pessoa viu no pdf.js.
  it('pdf-lib e pdf.js contando páginas diferentes: recusado como corrompido, e o pdf.js fecha', async () => {
    const renderizador = criarRenderizadorFalso({ paginas: 3 })
    await abrir('arvore-torta-4p.pdf', { renderizador })

    expect(q('editar-pdf-erro')!.textContent).toBe(
      `Não deu para abrir arvore-torta-4p.pdf. ${ERROS_DO_ARQUIVO.corrompido}`,
    )
    expect(renderizador.fechados).toBe(1)
    expect(renderizador.paginasPedidas).toEqual([])
  })

  it('trocar de PDF fecha o anterior, e sair da página fecha o aberto', async () => {
    const { renderizador } = await abrir('a-2p.pdf')

    await escolher(pdf('b-3p.pdf'))
    await esperarAte(() => miniaturas().length === 3)
    expect(renderizador.fechados).toBe(1)

    act(() => root.unmount())
    expect(renderizador.fechados).toBe(2)
    root = createRoot(container)
  })
})

describe('as miniaturas', () => {
  it('uma por página, só as que aparecem são desenhadas, na largura da faixa', async () => {
    ObservadorFalso.automatico = false
    const { renderizador } = await abrir('livro-8p.pdf')
    expect(renderizador.miniaturas).toEqual([])

    const itens = todos('editar-pdf-item')
    expect(itens).toHaveLength(8)
    await act(async () => {
      ObservadorFalso.todos
        .find((observador) => observador.observados.has(itens[0]))!
        .avisar([itens[0], itens[1]])
    })
    await esperar()

    expect(renderizador.miniaturas).toEqual([
      { indice: 0, larguraCss: 64 },
      { indice: 1, larguraCss: 64 },
    ])
    expect(todos('editar-pdf-miniatura-imagem')).toHaveLength(2)
  })

  it('a página aberta é a atual da lista (aria-current), com o nome "Página N"', async () => {
    await abrir('livro-4p.pdf')

    expect(miniaturas().map((m) => m.getAttribute('aria-label'))).toEqual([
      'Página 1',
      'Página 2',
      'Página 3',
      'Página 4',
    ])
    expect(atual()).toBe(0)
  })

  it('escolher uma miniatura abre a página grande dela, anuncia e deixa o foco na miniatura', async () => {
    const { renderizador } = await abrir('livro-5p.pdf')

    await clicar(miniaturas()[2])
    await esperarAte(() => renderizador.paginasPedidas.length === 2)
    await esperar()

    expect(renderizador.paginasPedidas.at(-1)).toMatchObject({
      indice: 2,
      larguraCss: 500,
    })
    expect(atual()).toBe(2)
    expect(q('editar-pdf-posicao')!.textContent).toBe('Página 3 de 5')
    expect(anuncio()).toBe('Página 3 de 5.')
    expect(focado()).toBe('Página 3')
  })

  it('um ponto só no Tab: as setas, Home e End passam o foco entre as miniaturas, e Enter abre', async () => {
    await abrir('livro-5p.pdf')
    const faixa = q('editar-pdf-faixa')!
    const noTab = () =>
      miniaturas()
        .filter((m) => m.tabIndex === 0)
        .map((m) => m.ariaLabel)

    expect(noTab()).toEqual(['Página 1'])
    await act(async () => miniaturas()[0].focus())
    await teclar(faixa, 'ArrowRight')
    expect(focado()).toBe('Página 2')
    expect(noTab()).toEqual(['Página 2'])
    await teclar(faixa, 'End')
    expect(focado()).toBe('Página 5')
    await teclar(faixa, 'ArrowRight')
    expect(focado()).toBe('Página 5')
    await teclar(faixa, 'Home')
    expect(focado()).toBe('Página 1')
    await teclar(faixa, 'ArrowLeft')
    expect(focado()).toBe('Página 1')
    expect(atual()).toBe(0)

    // Enter num botão é um clique.
    await teclar(faixa, 'ArrowRight')
    await clicar(document.activeElement as HTMLElement)
    expect(atual()).toBe(1)
  })

  it('saindo da faixa, o ponto do Tab volta para a página aberta', async () => {
    await abrir('livro-5p.pdf')
    const faixa = q('editar-pdf-faixa')!

    await act(async () => miniaturas()[0].focus())
    await teclar(faixa, 'ArrowRight')
    await teclar(faixa, 'ArrowRight')
    await act(async () => porNome('Próxima página').focus())
    await esperar()

    expect(
      miniaturas()
        .filter((m) => m.tabIndex === 0)
        .map((m) => m.ariaLabel),
    ).toEqual(['Página 1'])
  })
})

describe('passar de página', () => {
  it('anterior e próxima, com a posição no texto e anunciada', async () => {
    const { renderizador } = await abrir('livro-3p.pdf')

    expect(porNome('Página anterior').disabled).toBe(true)
    await clicar(porNome('Próxima página'))
    await esperarAte(
      () => canvasNaFolha() === renderizador.paginasPedidas.at(-1)?.canvas,
    )

    expect(q('editar-pdf-posicao')!.textContent).toBe('Página 2 de 3')
    expect(anuncio()).toBe('Página 2 de 3.')
    expect(atual()).toBe(1)
    expect(focado()).toBe('Próxima página')
    expect(porNome('Página anterior').disabled).toBe(false)
  })

  it('chegando na ponta, o foco passa para o botão do outro sentido', async () => {
    await abrir('livro-2p.pdf')

    await clicar(porNome('Próxima página'))

    expect(porNome('Próxima página').disabled).toBe(true)
    expect(focado()).toBe('Página anterior')
    await clicar(porNome('Página anterior'))
    expect(focado()).toBe('Próxima página')
  })

  it('PDF de uma página: os dois botões ficam parados, e a posição diz por quê', async () => {
    await abrir('bilhete-1p.pdf')

    expect(porNome('Página anterior').disabled).toBe(true)
    expect(porNome('Próxima página').disabled).toBe(true)
    const posicao = q('editar-pdf-posicao')!
    expect(posicao.textContent).toBe('Página 1 de 1')
    expect(porNome('Próxima página').getAttribute('aria-describedby')).toBe(
      posicao.id,
    )
  })
})

describe('a página grande', () => {
  it('fica só a página nova: o canvas da anterior é esvaziado quando ela chega', async () => {
    const { renderizador } = await abrir('livro-3p.pdf')
    const primeira = renderizador.paginasPedidas[0].canvas!

    await clicar(miniaturas()[1])
    await esperarAte(() => canvasNaFolha() !== primeira)

    expect(q('editar-pdf-folha')!.children).toHaveLength(1)
    expect([primeira.width, primeira.height]).toEqual([0, 0])
  })

  it('mostra que está desenhando, e um pedido superado não aparece nem dá erro', async () => {
    // As páginas esperam o portão, não um relógio: com um atraso fixo, o CI lento terminava o desenho antes da asserção.
    const renderizador = criarRenderizadorFalso()
    await abrir('livro-4p.pdf', { renderizador })
    renderizador.prenderPaginas()

    await act(async () => miniaturas()[1].click())
    expect(q('editar-pdf-desenhando')!.textContent).toBe('Desenhando a página…')
    expect(q('editar-pdf-folha')!.getAttribute('aria-busy')).toBe('true')
    await act(async () => miniaturas()[3].click())
    renderizador.soltarPaginas()
    await esperarAte(() => q('editar-pdf-desenhando') === null)

    const pedidas = renderizador.paginasPedidas.map((p) => p.indice)
    expect(pedidas).toEqual([0, 1, 3])
    expect(renderizador.paginasPedidas[1].canvas).toBeUndefined()
    expect(canvasNaFolha()).toBe(renderizador.paginasPedidas[2].canvas)
    expect(q('editar-pdf-falha')).toBeNull()
  })

  it('se o desenho falha, diz o que houve e o que fazer, e Tentar de novo desenha de novo', async () => {
    const renderizador = criarRenderizadorFalso({ paginasQueFalham: [1] })
    await abrir('livro-3p.pdf', { renderizador })

    await clicar(miniaturas()[1])
    await esperarAte(() => q('editar-pdf-falha') !== null)
    const falha = q('editar-pdf-falha')!
    expect(falha.getAttribute('role')).toBe('alert')
    expect(falha.textContent).toContain(
      'Não deu para desenhar a página 2, talvez por falta de memória. Feche outras abas e tente de novo.',
    )
    expect(q('editar-pdf-desenhando')).toBeNull()

    await clicar(porNome('Tentar de novo'))
    await esperarAte(() => q('editar-pdf-falha') === null)
    expect(canvasNaFolha()).toBe(renderizador.paginasPedidas.at(-1)!.canvas)
    expect(renderizador.paginasPedidas.map((p) => p.indice)).toEqual([0, 1, 1])
  })

  // Sem objeto na página, nada dentro da área recebe o foco: sem ela no Tab, quem usa o teclado não
  // rola até o resto da página quando a página passa da área (com zoom, ou numa tela estreita).
  it('a área da página entra no Tab, com o nome da página aberta, para o teclado rolar a página', async () => {
    await abrir('livro-3p.pdf')
    const area = q('editar-pdf-area')!
    expect(area.tabIndex).toBe(0)
    expect(area.getAttribute('role')).toBe('group')
    expect(area.getAttribute('aria-label')).toBe('Área da página 1')

    await clicar(miniaturas()[1])
    expect(area.getAttribute('aria-label')).toBe('Área da página 2')
  })

  it('a folha tem a proporção da página desenhada (página deitada também)', async () => {
    await abrir('mapa-girado-2p.pdf')
    const folha = q('editar-pdf-folha')!
    expect(folha.style.height).toBe(`${Math.round((500 * 842) / 595)}px`)

    await clicar(miniaturas()[1])
    await esperarAte(
      () => folha.style.height === `${Math.round((500 * 595) / 842)}px`,
    )
  })

  it('a área mudou de largura: a página é desenhada de novo na largura nova, depois de parar de mudar', async () => {
    const { renderizador } = await abrir('livro-2p.pdf')
    const medidor = MedidorFalso.todos.at(-1)!

    await act(async () => {
      medidor.medir(380)
      medidor.medir(360)
    })
    expect(renderizador.paginasPedidas).toHaveLength(1)
    await esperarAte(() => renderizador.paginasPedidas.length === 2)

    expect(renderizador.paginasPedidas[1]).toMatchObject({
      indice: 0,
      larguraCss: 360,
    })
  })
})

describe('zoom', () => {
  it('+ e − mudam a largura da página, com o valor na tela e anunciado', async () => {
    const { renderizador } = await abrir('livro-2p.pdf')
    expect(q('editar-pdf-zoom')!.textContent).toBe('100%')

    await clicar(porNome('Aumentar o zoom'))
    await esperarAte(() => renderizador.paginasPedidas.length === 2)

    expect(renderizador.paginasPedidas[1]).toMatchObject({
      indice: 0,
      larguraCss: 625,
    })
    expect(q('editar-pdf-folha')!.style.width).toBe('625px')
    expect(q('editar-pdf-zoom')!.textContent).toBe('125%')
    expect(anuncio()).toBe('Zoom em 125%.')

    await clicar(porNome('Diminuir o zoom'))
    await clicar(porNome('Diminuir o zoom'))
    expect(q('editar-pdf-zoom')!.textContent).toBe('75%')
    expect(q('editar-pdf-folha')!.style.width).toBe('375px')
  })

  it('nas pontas, o botão fica parado com o motivo, e o foco vai para o outro', async () => {
    await abrir('livro-2p.pdf')

    for (let i = ZOOMS.indexOf(1); i > 0; i--) {
      await clicar(porNome('Diminuir o zoom'))
    }
    const diminuir = porNome('Diminuir o zoom')
    expect(q('editar-pdf-zoom')!.textContent).toBe('50%')
    expect(diminuir.disabled).toBe(true)
    expect(
      document.getElementById(diminuir.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe('O zoom já está no mínimo.')
    expect(focado()).toBe('Aumentar o zoom')

    for (let i = 0; i < ZOOMS.length - 1; i++) {
      await clicar(porNome('Aumentar o zoom'))
    }
    expect(q('editar-pdf-zoom')!.textContent).toBe('400%')
    expect(porNome('Aumentar o zoom').disabled).toBe(true)
    expect(focado()).toBe('Diminuir o zoom')
  })

  it('a página nova abre com o mesmo zoom, e um PDF novo volta para 100%', async () => {
    const { renderizador } = await abrir('livro-3p.pdf')
    await clicar(porNome('Aumentar o zoom'))

    await clicar(miniaturas()[2])
    await esperarAte(() => renderizador.paginasPedidas.at(-1)?.indice === 2)
    expect(renderizador.paginasPedidas.at(-1)!.larguraCss).toBe(625)

    await escolher(pdf('outro-2p.pdf'))
    await esperarAte(
      () => miniaturas().length === 2 && canvasNaFolha() !== null,
    )
    expect(q('editar-pdf-zoom')!.textContent).toBe('100%')
    expect(renderizador.paginasPedidas.at(-1)).toMatchObject({
      indice: 0,
      larguraCss: 500,
    })
  })
})

it('todo controle da tela tem nome e alvo de 44 px', async () => {
  await abrir('livro-3p.pdf')

  for (const nome of [
    'Página anterior',
    'Próxima página',
    'Diminuir o zoom',
    'Aumentar o zoom',
  ]) {
    expect(porNome(nome).className).toContain('size-11')
  }
  // A faixa tem nome próprio: no celular, a coluna com o título "Páginas" não existe.
  expect(q('editar-pdf-faixa')!.getAttribute('aria-label')).toBe('Páginas')
})

// ---- Fase 3: as ferramentas e os objetos sobre a página ----

// A página falsa é um A4 (595 × 842 pontos); com o quadro medido nesse tamanho, um pixel é um ponto.
const A4 = { largura: 595, altura: 842 }

const quadro = () => q('editar-pdf-quadro')!
const objetos = () => todos('editar-pdf-objeto')
const nomesDosObjetos = () => objetos().map((o) => o.getAttribute('aria-label'))
const ferramenta = (nome: string) =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'),
  ).find((b) => b.textContent?.trim() === nome)!
const pressionada = () =>
  Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[role="toolbar"] button[aria-pressed="true"]',
    ),
  ).map((b) => b.textContent?.trim())

function medirQuadro() {
  quadro().getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: A4.largura,
      bottom: A4.altura,
      width: A4.largura,
      height: A4.altura,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect
}

async function abrirParaEditar(
  nome = 'contrato-3p.pdf',
  opcoes: Parameters<typeof montar>[0] = {},
) {
  const montado = await abrir(nome, opcoes)
  await esperarAte(() => q('editar-pdf-quadro') !== null)
  medirQuadro()
  return montado
}

// O jsdom não tem PointerEvent: um MouseEvent com o tipo e os campos do ponteiro chega igual ao React.
async function ponteiro(
  alvo: Element,
  tipo: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  { x, y }: Ponto,
  pointerType = 'mouse',
) {
  const evento = new MouseEvent(tipo, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  })
  Object.defineProperties(evento, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
    pressure: { value: 0.5 },
  })
  await act(async () => {
    alvo.dispatchEvent(evento)
  })
}

async function arrastar(alvo: Element, de: Ponto, ate: Ponto) {
  await ponteiro(alvo, 'pointerdown', de)
  await ponteiro(quadro(), 'pointermove', {
    x: (de.x + ate.x) / 2,
    y: (de.y + ate.y) / 2,
  })
  await ponteiro(quadro(), 'pointermove', ate)
  await ponteiro(quadro(), 'pointerup', ate)
  await esperar()
}

/** Tecla com modificadores; devolve se a tela tirou o efeito padrão do navegador. */
async function tecla(
  alvo: EventTarget,
  key: string,
  modificadores: KeyboardEventInit = {},
) {
  const evento = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...modificadores,
  })
  await act(async () => {
    alvo.dispatchEvent(evento)
  })
  await esperar()
  return evento.defaultPrevented
}

async function digitar(
  campo: HTMLInputElement | HTMLTextAreaElement,
  valor: string,
) {
  const prototipo =
    campo instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototipo, 'value')!.set!.call(campo, valor)
    campo.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await esperar()
}

async function escolherNoCampo(campo: HTMLSelectElement, valor: string) {
  await act(async () => {
    campo.value = valor
    campo.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await esperar()
}

async function escolherImagem(imagem: File) {
  const input = q('editar-pdf-input-imagem') as HTMLInputElement
  Object.defineProperty(input, 'files', {
    value: Object.assign([imagem], { item: () => imagem }),
    configurable: true,
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await esperarAte(
    () =>
      q('editar-pdf-aviso-imagem') !== null ||
      q('editar-pdf-estado-imagem')?.textContent?.includes('pixels') === true,
  )
}

const png = (nome: string) =>
  new File(
    [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)],
    nome,
    { type: 'image/png' },
  )

async function inserirNoCentro(nomeDaFerramenta: string) {
  await clicar(ferramenta(nomeDaFerramenta))
  await clicar(porNome('Inserir no centro'))
}

const campo = (testId: string) => q(testId) as HTMLInputElement

describe('a barra de ferramentas', () => {
  it('é uma toolbar com as dez ferramentas, uma ligada por vez (aria-pressed), começando em Selecionar e mover', async () => {
    await abrirParaEditar()
    const barra = container.querySelector(
      '[role="toolbar"][aria-label="Ferramentas"]',
    )!

    expect(barra.getAttribute('aria-label')).toBe('Ferramentas')
    expect(
      Array.from(barra.querySelectorAll('button')).map((b) =>
        b.textContent?.trim(),
      ),
    ).toEqual([
      'Selecionar e mover',
      'Texto',
      'Imagem',
      'Desenhar',
      'Retângulo',
      'Elipse',
      'Linha',
      'Seta',
      'Marca-texto',
      'Cobrir',
    ])
    expect(pressionada()).toEqual(['Selecionar e mover'])

    await clicar(ferramenta('Elipse'))
    expect(pressionada()).toEqual(['Elipse'])
    expect(q('editar-pdf-quadro')!.dataset.ferramenta).toBe('elipse')
  })

  it('um ponto só no Tab, e as setas, Home e End passam entre os botões', async () => {
    await abrirParaEditar()
    const barra = container.querySelector(
      '[role="toolbar"][aria-label="Ferramentas"]',
    )!
    const noTab = () =>
      Array.from(barra.querySelectorAll('button'))
        .filter((b) => b.tabIndex === 0)
        .map((b) => b.textContent?.trim())

    expect(noTab()).toEqual(['Selecionar e mover'])
    await act(async () => ferramenta('Selecionar e mover').focus())
    await tecla(barra, 'ArrowRight')
    expect(focado()).toBe('Texto')
    expect(noTab()).toEqual(['Texto'])
    await tecla(barra, 'End')
    expect(focado()).toBe('Cobrir')
    await tecla(barra, 'ArrowRight')
    expect(focado()).toBe('Selecionar e mover')
    await tecla(barra, 'ArrowLeft')
    expect(focado()).toBe('Cobrir')
    await tecla(barra, 'Home')
    expect(focado()).toBe('Selecionar e mover')
    // Andar pelas setas não liga nada: só Enter, Espaço ou clique.
    expect(pressionada()).toEqual(['Selecionar e mover'])
  })

  it('cada ferramenta de criar tem Inserir no centro; Selecionar e Desenhar não', async () => {
    await abrirParaEditar()
    expect(q('editar-pdf-inserir-no-centro')).toBeNull()
    for (const nome of [
      'Texto',
      'Retângulo',
      'Linha',
      'Marca-texto',
      'Cobrir',
    ]) {
      await clicar(ferramenta(nome))
      expect(q('editar-pdf-inserir-no-centro')).not.toBeNull()
    }
    await clicar(ferramenta('Desenhar'))
    expect(q('editar-pdf-inserir-no-centro')).toBeNull()
  })
})

describe('inserir objetos', () => {
  it('Inserir no centro põe o objeto no meio da página, escolhido, com o foco nele e anunciado', async () => {
    await abrirParaEditar()

    await inserirNoCentro('Retângulo')

    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 238 por 381, 120 por 80 pontos',
    ])
    const objeto = objetos()[0]
    expect(objeto.getAttribute('role')).toBe('button')
    expect(objeto.getAttribute('aria-roledescription')).toBe('objeto do PDF')
    expect(document.activeElement).toBe(objeto)
    expect(objeto.dataset.escolhido).toBe('true')
    expect(anuncio()).toBe(
      'Inserido: Retângulo, em 238 por 381, 120 por 80 pontos.',
    )
    // Depois de pôr o objeto, a ferramenta volta para Selecionar e mover.
    expect(pressionada()).toEqual(['Selecionar e mover'])
  })

  it('o quadro é uma application com nome, e cada objeto aponta para as instruções de teclado', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Elipse')

    expect(quadro().getAttribute('role')).toBe('application')
    expect(quadro().getAttribute('aria-label')).toBe('Objetos da página 1')
    const instrucoes = document.getElementById(
      objetos()[0].getAttribute('aria-describedby')!,
    )!
    expect(instrucoes.textContent).toBe(TEXTOS.editar.objetos.instrucoes)
    expect(instrucoes.textContent).toMatch(/setas movem 1 ponto/)
  })

  it('clique e arraste com a ferramenta cria o objeto na caixa do arraste', async () => {
    await abrirParaEditar()
    await clicar(ferramenta('Retângulo'))

    await arrastar(quadro(), { x: 100, y: 120 }, { x: 220, y: 180 })

    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 100 por 120, 120 por 60 pontos',
    ])
  })

  it('clique sem arrastar põe o objeto no tamanho padrão, centrado no ponto', async () => {
    await abrirParaEditar()
    await clicar(ferramenta('Cobrir'))

    await arrastar(quadro(), { x: 300, y: 300 }, { x: 301, y: 300 })

    expect(nomesDosObjetos()).toEqual([
      'Retângulo de cobrir, em 220 por 284, 160 por 32 pontos',
    ])
  })

  it('linha arrastada de baixo para cima guarda o sentido', async () => {
    await abrirParaEditar()
    await clicar(ferramenta('Seta'))
    await arrastar(quadro(), { x: 300, y: 400 }, { x: 200, y: 300 })

    expect(nomesDosObjetos()).toEqual([
      'Seta, em 200 por 300, 100 por 100 pontos',
    ])
  })

  it('desenhar: a ferramenta trava a rolagem do toque e avisa; o traço vira um objeto, e a ferramenta continua ligada', async () => {
    await abrirParaEditar()
    expect(quadro().className).not.toContain('touch-none')

    await clicar(ferramenta('Desenhar'))
    expect(quadro().className).toContain('touch-none')
    expect(q('editar-pdf-desenho-ativo')!.textContent).toBe(
      TEXTOS.editar.ferramentas.desenhoAtivo,
    )

    await ponteiro(quadro(), 'pointerdown', { x: 100, y: 100 }, 'touch')
    await ponteiro(quadro(), 'pointermove', { x: 150, y: 130 }, 'touch')
    expect(q('editar-pdf-previa')).not.toBeNull()
    await ponteiro(quadro(), 'pointermove', { x: 200, y: 160 }, 'touch')
    await ponteiro(quadro(), 'pointerup', { x: 200, y: 160 }, 'touch')
    await esperar()

    expect(nomesDosObjetos()).toEqual([
      'Desenho, em 100 por 100, 100 por 60 pontos',
    ])
    expect(pressionada()).toEqual(['Desenhar'])
    expect(q('editar-pdf-previa')).toBeNull()
  })

  it('o arraste que o navegador cancela (o dedo rolou a página) não cria nada', async () => {
    await abrirParaEditar()
    await clicar(ferramenta('Retângulo'))

    await ponteiro(quadro(), 'pointerdown', { x: 100, y: 100 }, 'touch')
    await ponteiro(quadro(), 'pointercancel', { x: 100, y: 100 }, 'touch')
    await ponteiro(quadro(), 'pointerup', { x: 100, y: 100 }, 'touch')

    expect(objetos()).toHaveLength(0)
  })
})

describe('mover e redimensionar pelo teclado', () => {
  async function comRetangulo() {
    const montado = await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    return montado
  }

  it('setas movem 1 ponto e Shift+setas 10, com preventDefault, e o foco fica no objeto', async () => {
    await comRetangulo()
    const objeto = objetos()[0]

    expect(await tecla(objeto, 'ArrowRight')).toBe(true)
    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 239 por 381, 120 por 80 pontos',
    ])
    expect(await tecla(objeto, 'ArrowDown', { shiftKey: true })).toBe(true)
    expect(await tecla(objeto, 'ArrowLeft', { shiftKey: true })).toBe(true)
    expect(await tecla(objeto, 'ArrowUp')).toBe(true)
    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 229 por 390, 120 por 80 pontos',
    ])
    expect(document.activeElement).toBe(objetos()[0])
  })

  it('Alt+setas redimensionam pelo canto de baixo à direita (1 e 10 pontos), e Alt+← e Alt+→ não voltam a página do navegador', async () => {
    await comRetangulo()
    const objeto = objetos()[0]

    expect(await tecla(objeto, 'ArrowRight', { altKey: true })).toBe(true)
    expect(
      await tecla(objeto, 'ArrowDown', { altKey: true, shiftKey: true }),
    ).toBe(true)
    expect(await tecla(objeto, 'ArrowLeft', { altKey: true })).toBe(true)
    expect(await tecla(objeto, 'ArrowLeft', { altKey: true })).toBe(true)
    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 238 por 381, 119 por 90 pontos',
    ])
  })

  it('Ctrl com as setas fica com o navegador', async () => {
    await comRetangulo()
    expect(await tecla(objetos()[0], 'ArrowRight', { ctrlKey: true })).toBe(
      false,
    )
    expect(nomesDosObjetos()[0]).toContain('em 238 por 381')
  })

  it('na borda da página o objeto para', async () => {
    await comRetangulo()
    const objeto = objetos()[0]
    for (let i = 0; i < 30; i++) {
      await tecla(objeto, 'ArrowLeft', { shiftKey: true })
    }
    expect(nomesDosObjetos()[0]).toContain('em 0 por 381')
  })

  it('a posição nova é anunciada depois de uma pausa curta, e não a cada passo', async () => {
    await comRetangulo()
    const objeto = objetos()[0]

    await tecla(objeto, 'ArrowRight')
    await tecla(objeto, 'ArrowRight')
    expect(anuncio()).toBe(
      'Inserido: Retângulo, em 238 por 381, 120 por 80 pontos.',
    )
    await esperar(600)
    expect(anuncio()).toBe('Em 240 por 381, 120 por 80 pontos.')
  })

  it('Delete apaga, anuncia e leva o foco ao objeto vizinho (ou ao quadro, sem nenhum)', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    await inserirNoCentro('Elipse')
    await act(async () => objetos()[0].focus())

    await tecla(objetos()[0], 'Delete')
    expect(nomesDosObjetos()).toEqual([
      'Elipse, em 238 por 381, 120 por 80 pontos',
    ])
    expect(anuncio()).toBe('Apagado: Retângulo.')
    expect(document.activeElement).toBe(objetos()[0])

    await tecla(objetos()[0], 'Backspace')
    expect(objetos()).toHaveLength(0)
    expect(document.activeElement).toBe(quadro())
  })

  it('Esc solta o objeto: o foco vai para o quadro e o painel fica vazio', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    expect(q('editar-pdf-painel')).not.toBeNull()

    await tecla(objetos()[0], 'Escape')

    expect(document.activeElement).toBe(quadro())
    expect(objetos()[0].dataset.escolhido).toBeUndefined()
    expect(q('editar-pdf-painel')).toBeNull()
    expect(q('editar-pdf-painel-vazio')!.textContent).toMatch(
      /^Nenhum objeto escolhido/,
    )
    expect(anuncio()).toBe('Nenhum objeto escolhido.')
  })

  it('Tab chega no objeto e o escolhe', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    await tecla(objetos()[0], 'Escape')

    expect(objetos()[0].tabIndex).toBe(0)
    await act(async () => objetos()[0].focus())
    expect(objetos()[0].dataset.escolhido).toBe('true')
    expect(q('editar-pdf-painel')).not.toBeNull()
  })
})

describe('mover e redimensionar pelo ponteiro e pelo toque', () => {
  it('arrastar o objeto move só ele (touch-action none), num passo só do desfazer', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    const objeto = objetos()[0]
    expect(objeto.className).toContain('touch-none')

    await arrastar(objeto, { x: 250, y: 400 }, { x: 290, y: 420 })

    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 278 por 401, 120 por 80 pontos',
    ])
    await clicar(porNome('Desfazer'))
    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 238 por 381, 120 por 80 pontos',
    ])
  })

  it('a alça do canto muda o tamanho; ela tem área de 44 px no toque', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    const alca = q('editar-pdf-alca')!
    expect(alca.className).toContain('pointer-coarse:size-11')
    expect(alca.className).toContain('touch-none')
    expect(alca.getAttribute('aria-hidden')).toBe('true')

    await arrastar(alca, { x: 357, y: 461 }, { x: 400, y: 500 })

    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 238 por 381, 163 por 119 pontos',
    ])
  })

  it('o mouse que soltou fora da página não trava o próximo arraste', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')

    await ponteiro(quadro(), 'pointerdown', { x: 20, y: 20 })
    await ponteiro(quadro(), 'pointermove', { x: 5, y: 5 })
    // O pointerup caiu em outro lugar da página do site e não chegou ao quadro.
    await arrastar(objetos()[0], { x: 250, y: 400 }, { x: 260, y: 400 })

    expect(nomesDosObjetos()[0]).toContain('em 248 por 381')
  })

  it('o objeto menor fica por cima para o ponteiro (uma seta sobre o retângulo de cobrir), sem mudar a ordem do Tab', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Seta')
    await inserirNoCentro('Cobrir')
    await teclar(objetos()[1], 'Escape')
    expect(q('editar-pdf-painel-vazio')).not.toBeNull()

    const [seta, cobrir] = objetos()
    expect(seta.getAttribute('aria-label')).toMatch(/^Seta/)
    expect(Number(seta.style.zIndex)).toBeGreaterThan(
      Number(cobrir.style.zIndex),
    )
  })

  it('com outra ferramenta ligada, o ponteiro atravessa os objetos (o desenho passa por cima)', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    await clicar(ferramenta('Desenhar'))
    expect(objetos()[0].className).toContain('pointer-events-none')
    expect(objetos()[0].tabIndex).toBe(0)
  })

  it('o clique fora dos objetos solta o escolhido, e a página rola no toque (sem touch-none no quadro)', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')

    await ponteiro(quadro(), 'pointerdown', { x: 20, y: 500 }, 'touch')
    await ponteiro(quadro(), 'pointerup', { x: 20, y: 500 }, 'touch')
    await esperar()

    expect(objetos()[0].dataset.escolhido).toBeUndefined()
    expect(quadro().className).not.toContain('touch-none')
  })
})

describe('o painel de propriedades', () => {
  it('X, Y, largura e altura em campos numéricos com rótulo, que mudam o objeto dentro da página', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    const painel = q('editar-pdf-painel')!
    const rotulos = Array.from(painel.querySelectorAll('label')).map((l) =>
      l.textContent?.trim(),
    )
    expect(rotulos).toEqual(
      expect.arrayContaining([
        'X',
        'Y',
        'Largura',
        'Altura',
        'Cor',
        'Espessura (pontos)',
      ]),
    )
    for (const id of ['x', 'y', 'largura', 'altura']) {
      const entrada = campo(`editar-pdf-campo-${id}`)
      expect(
        document.querySelector(`label[for="${entrada.id}"]`),
      ).not.toBeNull()
    }

    await digitar(campo('editar-pdf-campo-x'), '50')
    await digitar(campo('editar-pdf-campo-y'), '60.5')
    await digitar(campo('editar-pdf-campo-largura'), '900')
    await digitar(campo('editar-pdf-campo-altura'), '40')

    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 50 por 61, 545 por 40 pontos',
    ])
    expect(campo('editar-pdf-campo-y').value).toBe('60.5')
  })

  it('a cor tem lista com nome, além do seletor, e a espessura é numérica', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Linha')
    const cor = q('editar-pdf-campo-cor') as unknown as HTMLSelectElement
    expect(Array.from(cor.options).map((o) => o.textContent)).toEqual([
      'Preto',
      'Cinza',
      'Branco',
      'Vermelho',
      'Laranja',
      'Amarelo',
      'Verde',
      'Azul',
      'Roxo',
      'Rosa',
    ])
    expect(cor.value).toBe('vermelho')
    expect(campo('editar-pdf-campo-outra-cor').getAttribute('aria-label')).toBe(
      'Escolher outra cor',
    )

    await escolherNoCampo(cor, 'azul')
    expect(campo('editar-pdf-campo-outra-cor').value).toBe('#1d4ed8')
    await digitar(campo('editar-pdf-campo-outra-cor'), '#123456')
    expect(cor.value).toBe('outra')
    await digitar(campo('editar-pdf-campo-espessura'), '6')
    expect(campo('editar-pdf-campo-espessura').value).toBe('6')

    // O próximo objeto do mesmo grupo nasce com o último estilo escolhido.
    await inserirNoCentro('Retângulo')
    expect(campo('editar-pdf-campo-outra-cor').value).toBe('#123456')
    expect(campo('editar-pdf-campo-espessura').value).toBe('6')
  })

  it('texto: fonte, negrito, itálico e tamanho da letra; o texto não tem largura e altura no painel', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Texto')
    expect(q('editar-pdf-campo-largura')).toBeNull()

    await escolherNoCampo(
      q('editar-pdf-campo-fonte') as unknown as HTMLSelectElement,
      'courier',
    )
    await act(async () => campo('editar-pdf-campo-negrito').click())
    await digitar(campo('editar-pdf-campo-tamanho'), '32')

    expect(campo('editar-pdf-campo-negrito').checked).toBe(true)
    expect(nomesDosObjetos()[0]).toMatch(
      /^Texto 'Texto', em \d+ por \d+, 96 por 25 pontos$/,
    )
    const texto = q('editar-pdf-quadro')!.querySelector('text')!
    expect(texto.getAttribute('font-size')).toBe('32')
    expect(texto.getAttribute('font-weight')).toBe('bold')
    expect(texto.getAttribute('font-family')).toMatch(/Courier New/)
  })

  it('Apagar objeto pelo painel', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Elipse')
    await clicar(q('editar-pdf-apagar-objeto')!)
    expect(objetos()).toHaveLength(0)
    expect(anuncio()).toBe('Apagado: Elipse.')
  })
})

describe('texto', () => {
  it('Inserir no centro põe "Texto" e leva o foco ao campo, com tudo escolhido para escrever por cima', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Texto')

    const area = q('editar-pdf-campo-texto') as HTMLTextAreaElement
    expect(document.activeElement).toBe(area)
    expect(area.value).toBe('Texto')
    expect([area.selectionStart, area.selectionEnd]).toEqual([0, 5])

    await digitar(area, 'Paulo Victor')
    expect(nomesDosObjetos()[0]).toMatch(/^Texto 'Paulo Victor', em /)
    expect(q('editar-pdf-quadro')!.querySelector('text')!.textContent).toBe(
      'Paulo Victor',
    )
  })

  it('caractere fora do WinAnsi é recusado no campo, com o aviso escrito, e o resto fica', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Texto')
    const area = q('editar-pdf-campo-texto') as HTMLTextAreaElement

    await digitar(area, 'Oi 😀 ✓ ç€')

    expect(area.value).toBe('Oi   ç€')
    const aviso = q('editar-pdf-aviso-winansi')!
    expect(aviso.getAttribute('role')).toBe('alert')
    expect(aviso.textContent).toBe(
      'Estes caracteres não entram, porque as fontes do PDF não os escrevem: 😀 e ✓. Use letras, números e sinais comuns.',
    )
    expect(area.getAttribute('aria-describedby')).toContain(aviso.id)
    expect(nomesDosObjetos()[0]).toMatch(/^Texto 'Oi ç€', em/)

    await digitar(area, 'Oi')
    expect(q('editar-pdf-aviso-winansi')).toBeNull()
  })

  it('Enter no objeto edita o texto, e Esc no campo volta para o objeto', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Texto')
    const area = q('editar-pdf-campo-texto') as HTMLTextAreaElement

    await tecla(area, 'Escape')
    expect(document.activeElement).toBe(objetos()[0])
    await tecla(objetos()[0], 'Enter')
    expect(document.activeElement).toBe(area)
  })

  it('Alt+setas no texto mudam a letra, e a caixa acompanha', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Texto')
    await tecla(q('editar-pdf-campo-texto')!, 'Escape')

    await tecla(objetos()[0], 'ArrowUp', { altKey: true, shiftKey: true })
    expect(campo('editar-pdf-campo-tamanho').value).toBe('6')
    await esperar(600)
    expect(anuncio()).toMatch(/, letra de 6 pontos\.$/)
  })

  it('clicar num texto do PDF com Selecionar diz que editar o texto existente não é confiável, e oferece Cobrir', async () => {
    await abrirParaEditar()

    await ponteiro(quadro(), 'pointerdown', { x: 100, y: 500 })
    await ponteiro(quadro(), 'pointerup', { x: 100, y: 500 })
    await esperar()
    expect(q('editar-pdf-dica-texto')).toBeNull()

    await ponteiro(quadro(), 'pointerdown', { x: 100, y: 100 })
    await ponteiro(quadro(), 'pointerup', { x: 100, y: 100 })
    await esperarAte(() => q('editar-pdf-dica-texto') !== null)

    expect(q('editar-pdf-dica-texto')!.textContent).toContain(
      'editar o texto que já existe não é confiável',
    )
    expect(anuncio()).toBe(TEXTOS.editar.textoExistente)
    await clicar(porNome('Usar Cobrir'))
    expect(pressionada()).toEqual(['Cobrir'])
    expect(q('editar-pdf-dica-texto')).toBeNull()
  })
})

describe('imagem', () => {
  it('escolher a ferramenta abre a escolha do arquivo; PNG conferido pelos bytes entra no centro', async () => {
    await abrirParaEditar()
    const input = q('editar-pdf-input-imagem') as HTMLInputElement
    const abriu = jest.fn()
    input.addEventListener('click', abriu)

    await clicar(ferramenta('Imagem'))
    expect(abriu).toHaveBeenCalledTimes(1)
    expect(input.accept).toBe('image/png,image/jpeg,.png,.jpg,.jpeg')

    await escolherImagem(png('carimbo.png'))
    expect(q('editar-pdf-estado-imagem')!.textContent).toBe(
      'carimbo.png, 400 por 200 pixels.',
    )
    await clicar(porNome('Inserir no centro'))

    expect(nomesDosObjetos()).toEqual([
      'Imagem carimbo.png, em 148 por 346, 300 por 150 pontos',
    ])
    expect(quadro().querySelector('image')!.getAttribute('href')).toMatch(
      /^blob:url-/,
    )
    expect(pressionada()).toEqual(['Selecionar e mover'])
  })

  it('o que não é PNG nem JPEG pelos bytes é recusado com o que fazer, mesmo com nome .png', async () => {
    await abrirParaEditar()
    await clicar(ferramenta('Imagem'))

    await escolherImagem(
      new File([Uint8Array.of(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)], 'foto.png'),
    )

    const aviso = q('editar-pdf-aviso-imagem')!
    expect(aviso.getAttribute('role')).toBe('alert')
    expect(aviso.textContent).toBe(
      'foto.png não é PNG nem JPEG. Escolha uma imagem PNG ou JPEG.',
    )
    const inserirNoMeio = porNome('Inserir no centro')
    expect(inserirNoMeio.getAttribute('aria-disabled')).toBe('true')
    expect(
      document.getElementById(inserirNoMeio.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe('Escolha a imagem primeiro.')
  })

  // Inserir outro objeto antes não pode soltar a imagem escolhida: ela ainda vai entrar.
  it('a imagem escolhida que espera para entrar sobrevive à inserção de um Texto', async () => {
    await abrirParaEditar()
    const input = q('editar-pdf-input-imagem') as HTMLInputElement
    const abriu = jest.fn()
    input.addEventListener('click', abriu)
    await clicar(ferramenta('Imagem'))
    await escolherImagem(png('logo.png'))
    expect(abriu).toHaveBeenCalledTimes(1)

    await inserirNoCentro('Texto')
    await clicar(ferramenta('Imagem'))
    expect(abriu).toHaveBeenCalledTimes(1)
    await clicar(porNome('Inserir no centro'))

    expect(q('editar-pdf-aviso-imagem')).toBeNull()
    expect(nomesDosObjetos()).toEqual([
      expect.stringMatching(/^Texto /),
      'Imagem logo.png, em 148 por 346, 300 por 150 pontos',
    ])
    expect(anuncio()).toMatch(/logo\.png/)
  })

  it(`acima de ${TETO_DAS_IMAGENS_EM_BYTES / 1e6} MB somando as imagens, a nova não entra`, async () => {
    await abrirParaEditar()
    await clicar(ferramenta('Imagem'))
    const grande = png('mapa.png')
    Object.defineProperty(grande, 'size', {
      value: TETO_DAS_IMAGENS_EM_BYTES + 1,
    })

    await escolherImagem(grande)

    expect(q('editar-pdf-aviso-imagem')!.textContent).toMatch(
      /^mapa\.png \(50 MB\) não entrou: as imagens passariam de 50 MB somando todas\. Apague alguma imagem ou escolha uma menor\.$/,
    )
  })

  it('imagem maior que 2400 px é reduzida no navegador antes de entrar, e a tela diz', async () => {
    imagemDecodificada = { width: 4800, height: 2400 }
    HTMLCanvasElement.prototype.toBlob = function (aoTerminar, tipo) {
      aoTerminar(new Blob(['menor'], { type: tipo }))
    }
    const getContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      drawImage() {},
    })) as unknown as HTMLCanvasElement['getContext']
    try {
      await abrirParaEditar()
      await clicar(ferramenta('Imagem'))
      await escolherImagem(png('scan.png'))
    } finally {
      HTMLCanvasElement.prototype.getContext = getContext
    }

    expect(q('editar-pdf-estado-imagem')!.textContent).toBe(
      'scan.png foi reduzida para 2.400 por 1.200 pixels, para o PDF não ficar pesado.',
    )
  })
})

describe('desfazer e refazer', () => {
  it('botões e Ctrl/⌘+Z e Ctrl/⌘+Shift+Z; passos seguidos da mesma seta viram um só', async () => {
    await abrirParaEditar()
    expect(porNome('Desfazer').disabled).toBe(true)
    expect(porNome('Refazer').disabled).toBe(true)
    await inserirNoCentro('Retângulo')
    const objeto = objetos()[0]
    await tecla(objeto, 'ArrowRight')
    await tecla(objeto, 'ArrowRight')
    await tecla(objeto, 'ArrowRight')

    await tecla(objeto, 'z', { ctrlKey: true })
    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 238 por 381, 120 por 80 pontos',
    ])
    expect(anuncio()).toBe('Desfeito.')
    expect(document.activeElement).toBe(objetos()[0])

    await tecla(objetos()[0], 'z', { metaKey: true })
    expect(objetos()).toHaveLength(0)
    expect(focado()).toBe('Refazer')

    await tecla(document.body, 'z', { ctrlKey: true, shiftKey: true })
    expect(objetos()).toHaveLength(1)
    await clicar(porNome('Refazer'))
    expect(nomesDosObjetos()).toEqual([
      'Retângulo, em 241 por 381, 120 por 80 pontos',
    ])
    expect(anuncio()).toBe('Refeito.')
    expect(porNome('Refazer').disabled).toBe(true)
    expect(focado()).toBe('Desfazer')
  })

  it('o atalho não dispara dentro de campo de texto', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Texto')
    const area = q('editar-pdf-campo-texto') as HTMLTextAreaElement

    expect(await tecla(area, 'z', { ctrlKey: true })).toBe(false)
    expect(objetos()).toHaveLength(1)
    expect(
      await tecla(campo('editar-pdf-campo-x'), 'z', { metaKey: true }),
    ).toBe(false)
  })

  it('desfazer o que mudou em outra página leva até ela', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Próxima página'))
    await esperarAte(
      () => q('editar-pdf-posicao')!.textContent === 'Página 2 de 3',
    )

    await clicar(porNome('Desfazer'))

    expect(q('editar-pdf-posicao')!.textContent).toBe('Página 1 de 3')
    expect(anuncio()).toBe('Desfeito na página 1.')
  })
})

describe('cobrir e apagar de verdade', () => {
  it('a ferramenta avisa que cobrir não apaga do arquivo', async () => {
    await abrirParaEditar()
    await clicar(ferramenta('Cobrir'))
    expect(q('editar-pdf-aviso-cobrir')!.textContent).toMatch(
      /mas o texto continua no arquivo: dá para selecionar, copiar e buscar/,
    )
  })

  it('apagar de verdade explica antes de confirmar, e o foco acompanha', async () => {
    await abrirParaEditar()
    expect(q('editar-pdf-cobrir')).toBeNull()
    await inserirNoCentro('Cobrir')

    const secao = q('editar-pdf-cobrir')!
    expect(secao.textContent).toContain('o texto continua no arquivo')
    await clicar(porNome('Apagar de verdade o que está embaixo'))

    expect(focado()).toBe('Apagar de verdade nesta página')
    const explicacao = q('editar-pdf-explicacao')!.textContent!
    for (const trecho of [
      'A página vira uma imagem',
      'deixa de ser selecionável',
      'O PDF fica maior',
      'Os links e os campos de formulário desta página saem, e também os marcadores que levam a ela',
      'formulário XFA',
      'sai do documento inteiro',
      'Continuam no PDF gerado, sem mudança: o título, o autor e as outras informações do documento',
      'o apagar de verdade não o tira',
      'O PDF das páginas extraídas sai sem eles.',
    ]) {
      expect(explicacao).toContain(trecho)
    }
    const confirmar = porNome('Apagar de verdade nesta página')
    const descricao = confirmar
      .getAttribute('aria-describedby')!
      .split(' ')
      .map((id) => document.getElementById(id)!.textContent)
      .join(' ')
    expect(descricao).toContain('A página vira uma imagem')

    await clicar(porNome('Cancelar'))
    expect(q('editar-pdf-explicacao')).toBeNull()
    expect(focado()).toBe('Apagar de verdade o que está embaixo')

    await clicar(porNome('Apagar de verdade o que está embaixo'))
    await clicar(porNome('Apagar de verdade nesta página'))
    expect(q('editar-pdf-apagar-ligado')!.textContent).toBe(
      'Na página 1, o que está embaixo dos retângulos de cobrir vai ser apagado de verdade quando você gerar o PDF.',
    )
    expect(focado()).toBe('Só cobrir, sem apagar')
    expect(q('editar-pdf-paginas-apagadas')!.textContent).toBe(
      'Para apagar de verdade, a página 1 vai virar imagem.',
    )

    await clicar(porNome('Só cobrir, sem apagar'))
    expect(q('editar-pdf-apagar-ligado')).toBeNull()
    expect(focado()).toBe('Apagar de verdade o que está embaixo')
  })

  it('ao gerar, a página marcada é desenhada com os cobrir pintados e vai como JPEG ao motor', async () => {
    const { renderizador, motor } = await abrirParaEditar()
    await inserirNoCentro('Cobrir')
    await inserirNoCentro('Texto')
    await clicar(porNome('Apagar de verdade o que está embaixo'))
    await clicar(porNome('Apagar de verdade nesta página'))

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)

    expect(renderizador.fundos).toEqual([
      {
        indice: 0,
        cobrir: [{ x: 217.5, y: 405, largura: 160, altura: 32 }],
        giro: 0,
      },
    ])
    const [pedido] = motor.montadas
    expect([...pedido.paginasRasterizadas.keys()]).toEqual(['a0p0'])
    expect(pedido.paginasRasterizadas.get('a0p0')!.type).toBe('image/jpeg')
    expect(pedido.objetosPorPagina.get('a0p0')!.map((o) => o.tipo)).toEqual([
      'cobrir',
      'texto',
    ])
  })
})

describe('gerar o PDF editado', () => {
  it('sem objeto e sem mudar página, o botão fica parado com o motivo escrito', async () => {
    await abrirParaEditar()
    const gerar = porNome('Gerar PDF')
    expect(gerar.disabled).toBe(true)
    expect(
      document.getElementById(gerar.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe(
      'Mude alguma página ou ponha um objeto numa página para gerar o PDF.',
    )
  })

  it('monta pelo motor com os objetos de cada página e as imagens usadas, e oferece o download com o foco no link', async () => {
    const { motor } = await abrirParaEditar('contrato-3p.pdf')
    await clicar(ferramenta('Imagem'))
    await escolherImagem(png('logo.png'))
    await clicar(porNome('Inserir no centro'))
    await inserirNoCentro('Marca-texto')
    await clicar(porNome('Próxima página'))
    await esperarAte(
      () => q('editar-pdf-posicao')!.textContent === 'Página 2 de 3',
    )
    await esperarAte(() => q('editar-pdf-quadro') !== null)
    await inserirNoCentro('Seta')

    expect(q('editar-pdf-gerar-area')!.textContent).toContain(
      '3 objetos em 2 páginas.',
    )
    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-baixar') !== null)

    const [pedido] = motor.montadas
    expect(pedido.nomes).toEqual(['contrato-3p.pdf'])
    expect(pedido.paginas).toEqual(
      [0, 1, 2].map((indice) => ({
        id: `a0p${indice}`,
        origem: { arquivo: 0, indice },
        giro: 0,
        moldura: 0,
      })),
    )
    expect([...pedido.objetosPorPagina.keys()]).toEqual(['a0p0', 'a0p1'])
    const imagem = pedido.objetosPorPagina.get('a0p0')![0] as Extract<
      ObjetoNaTela,
      { tipo: 'imagem' }
    >
    expect(imagem.tipo).toBe('imagem')
    expect([...pedido.imagens.keys()]).toEqual([imagem.imagem])
    expect(pedido.paginasRasterizadas.size).toBe(0)
    const baixar = q('editar-pdf-baixar') as HTMLAnchorElement
    expect(baixar.getAttribute('download')).toBe('contrato-3p-editado.pdf')
    expect(baixar.textContent).toBe('Baixar contrato-3p-editado.pdf')
    expect(document.activeElement).toBe(baixar)
    expect(anuncio()).toMatch(/^PDF editado pronto: 3 páginas, /)
  })

  it('mudar um objeto depois de pronto descarta o resultado', async () => {
    await abrirParaEditar()
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-baixar') !== null)

    await tecla(objetos()[0], 'ArrowLeft')
    expect(q('editar-pdf-resultado')).toBeNull()
  })

  it('Cancelar para a montagem, avisa e devolve o foco ao Gerar', async () => {
    const motor = criarMotorFalso({ montagem: 'nunca' })
    await abrirParaEditar('contrato-3p.pdf', { motor })
    await inserirNoCentro('Retângulo')

    await clicar(porNome('Gerar PDF'))
    expect(focado()).toBe('Cancelar')
    await clicar(porNome('Cancelar'))

    expect(anuncio()).toBe('Cancelado.')
    expect(focado()).toBe('Gerar PDF')
    expect(q('editar-pdf-resultado')).toBeNull()
  })

  it('a falha de um objeto diz o que fazer e leva até ele', async () => {
    const motor = criarMotorFalso()
    await abrirParaEditar('contrato-3p.pdf', { motor })
    await inserirNoCentro('Texto')
    const id = objetos()[0].dataset.id!
    motor.montar = jest.fn(() =>
      Promise.reject({
        motivo: 'texto_fora_do_winansi',
        pagina: 'a0p0',
        objeto: id,
        caracteres: ['ŧ'],
      }),
    )
    await tecla(q('editar-pdf-campo-texto')!, 'Escape')
    await tecla(objetos()[0], 'Escape')

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-falha-ao-gerar') !== null)

    const falha = q('editar-pdf-falha-ao-gerar')!
    expect(falha.getAttribute('role')).toBe('alert')
    expect(falha.textContent).toContain(
      'Um texto da página 1 tem um caractere que as fontes do PDF não escrevem: ŧ.',
    )
    expect(focado()).toBe('Gerar PDF')
    await clicar(porNome('Mostrar o objeto'))
    expect(document.activeElement).toBe(objetos()[0])
  })

  it('a falha vem com o id da página: o texto diz o número dela e o Mostrar leva até a página', async () => {
    const motor = criarMotorFalso()
    await abrirParaEditar('contrato-3p.pdf', { motor })
    await clicar(porNome('Próxima página'))
    await esperarAte(
      () => q('editar-pdf-posicao')!.textContent === 'Página 2 de 3',
    )
    await esperarAte(() => q('editar-pdf-quadro') !== null)
    await inserirNoCentro('Retângulo')
    const id = objetos()[0].dataset.id!
    await clicar(porNome('Página anterior'))
    await esperarAte(
      () => q('editar-pdf-posicao')!.textContent === 'Página 1 de 3',
    )
    motor.montar = jest.fn(() =>
      Promise.reject({
        motivo: 'imagem_nao_aceita',
        pagina: 'a0p1',
        objeto: id,
      }),
    )

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-falha-ao-gerar') !== null)

    expect(q('editar-pdf-falha-ao-gerar')!.textContent).toContain(
      'Uma imagem da página 2 não é PNG nem JPEG.',
    )
    await clicar(porNome('Mostrar o objeto'))
    expect(q('editar-pdf-posicao')!.textContent).toBe('Página 2 de 3')
    await esperarAte(() => document.activeElement === objetos()[0])
    expect(objetos()[0].dataset.id).toBe(id)
  })

  it('apagar de verdade duas vezes na mesma página do arquivo: diz o número dela, sem objeto para mostrar', async () => {
    const motor = criarMotorFalso({
      montagem: { motivo: 'apagar_na_pagina_repetida', pagina: 'a0p2' },
    })
    await abrirParaEditar('contrato-3p.pdf', { motor })
    await inserirNoCentro('Retângulo')

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-falha-ao-gerar') !== null)

    expect(q('editar-pdf-falha-ao-gerar')!.textContent).toContain(
      'A página 3 é a mesma página do arquivo que outra página deste PDF',
    )
    expect(() => porNome('Mostrar o objeto')).toThrow()
  })
})

it('todo controle novo tem 44 px e nome', async () => {
  await abrirParaEditar()
  for (const botao of container.querySelectorAll<HTMLButtonElement>(
    '[role="toolbar"] button',
  )) {
    expect(botao.className).toMatch(/\b(h|size)-11\b/)
  }
  expect(porNome('Desfazer').className).toContain('h-11')
  expect(porNome('Refazer').className).toContain('h-11')
  await inserirNoCentro('Retângulo')
  for (const entrada of q('editar-pdf-painel')!.querySelectorAll(
    'input:not([type="checkbox"]), select',
  )) {
    expect(entrada.className).toContain('h-11')
  }
})

// O motor falso dá os avisos pelo nome: "assinado" e "certificado" são a assinatura digital, "xfa" o XFA puro.
describe('os avisos do PDF aberto', () => {
  const avisos = () =>
    todos('editar-pdf-aviso').map((aviso) => aviso.textContent!.trim())

  it('assinado: diz que editar invalida a assinatura, junto do nome, e o anúncio do aberto leva o aviso', async () => {
    await abrir('contrato-assinado-2p.pdf')

    expect(avisos()).toEqual([TEXTOS.editar.avisos.assinatura_digital])
    expect(q('editar-pdf-avisos')!.getAttribute('aria-live')).toBeNull()
    expect(q('editar-pdf-avisos')!.closest('[role="status"]')).toBeNull()
    expect(anuncio()).toBe(
      `contrato-assinado-2p.pdf · 2 páginas. ${TEXTOS.editar.avisos.assinatura_digital}`,
    )
  })

  it('certificado: o mesmo aviso da assinatura', async () => {
    await abrir('termo-certificado.pdf')

    expect(avisos()).toEqual([TEXTOS.editar.avisos.assinatura_digital])
  })

  it('XFA puro: diz que o que for escrito por cima pode não aparecer no Adobe', async () => {
    await abrir('cadastro-xfa-3p.pdf')

    expect(avisos()).toEqual([TEXTOS.editar.avisos.xfa_puro])
    expect(anuncio()).toBe(
      `cadastro-xfa-3p.pdf · 3 páginas. ${TEXTOS.editar.avisos.xfa_puro}`,
    )
  })

  it('assinado e XFA juntos: os dois avisos, a assinatura primeiro, e um anúncio só', async () => {
    await abrir('formulario-xfa-certificado.pdf')

    expect(avisos()).toEqual([
      TEXTOS.editar.avisos.assinatura_digital,
      TEXTOS.editar.avisos.xfa_puro,
    ])
    expect(anuncio()).toBe(
      `formulario-xfa-certificado.pdf · 1 página. ${TEXTOS.editar.avisos.assinatura_digital} ${TEXTOS.editar.avisos.xfa_puro}`,
    )
  })

  it('PDF comum: nenhum aviso', async () => {
    await abrir('contrato-3p.pdf')

    expect(q('editar-pdf-avisos')).toBeNull()
  })

  it('não bloqueia: com o aviso, o Gerar habilita com um objeto e monta o PDF pelo motor', async () => {
    const { motor } = await abrirParaEditar('contrato-assinado-2p.pdf')
    await inserirNoCentro('Retângulo')

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-baixar') !== null)

    expect(motor.montadas.map(({ nomes }) => nomes)).toEqual([
      ['contrato-assinado-2p.pdf'],
    ])
    expect(avisos()).toEqual([TEXTOS.editar.avisos.assinatura_digital])
  })

  it('o aviso é do PDF aberto: o próximo sem assinatura não o herda, nem o recusado', async () => {
    await abrir('contrato-assinado-2p.pdf')

    await escolher(pdf('nota-2p.pdf'))
    await esperarAte(() => anuncio() === 'nota-2p.pdf · 2 páginas')
    expect(q('editar-pdf-avisos')).toBeNull()

    await escolher(pdf('outro-assinado.pdf'))
    await esperarAte(() => avisos().length === 1)
    await escolher(pdf('extrato-senha.pdf'))
    await esperarAte(() => q('editar-pdf-erro') !== null)
    expect(q('editar-pdf-avisos')).toBeNull()
  })
})

// ---- Editor único, PR 3: a Bancada (páginas e objetos na mesma tela) ----

const cartoes = () => todos('editar-pdf-pagina')
const rotulos = () =>
  cartoes().map(
    (c) => c.querySelector('[data-testid="editar-pdf-rotulo"]')!.textContent,
  )
const idsDaLista = () => cartoes().map((c) => c.dataset.id)
const posicao = () => q('editar-pdf-posicao')!.textContent

// Abre a página pela miniatura do cartão e espera o quadro dela, medido.
async function abrirPagina(numero: number) {
  await clicar(porNome(`Abrir a página ${numero}`))
  await esperarAte(
    () =>
      posicao() === `Página ${numero} de ${cartoes().length}` &&
      q('editar-pdf-quadro') !== null,
  )
  medirQuadro()
}

async function marcarPagina(numero: number) {
  await clicar(porNome<HTMLInputElement>(`Selecionar página ${numero}`))
}

describe('a Bancada: páginas, página aberta e objeto', () => {
  it('três colunas: páginas e seleção, a página com as ferramentas, o objeto; o Gerar no cabeçalho, antes da lista', async () => {
    await abrirParaEditar('livro-3p.pdf')

    const colunaDePaginas = q('editar-pdf-coluna-de-paginas')!
    expect(colunaDePaginas.tagName).toBe('ASIDE')
    expect(colunaDePaginas.contains(q('editar-pdf-paginas'))).toBe(true)
    expect(
      colunaDePaginas.querySelector(
        '[role="toolbar"][aria-label="Ações nas páginas selecionadas"]',
      ),
    ).not.toBeNull()
    expect(q('editar-pdf-edicao')!.contains(quadro())).toBe(true)
    expect(
      q('editar-pdf-coluna-do-objeto')!.contains(q('editar-pdf-painel-vazio')),
    ).toBe(true)
    const gerar = q('editar-pdf-gerar')!
    expect(
      gerar.compareDocumentPosition(colunaDePaginas) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('cada cartão: caixa de seleção, miniatura que abre a página, rótulo pela posição e a origem embaixo', async () => {
    const { renderizador } = await abrirParaEditar('livro-3p.pdf')

    expect(rotulos()).toEqual(['Página 1aberta', 'Página 2', 'Página 3'])
    expect(cartoes()[1].textContent).toContain('livro-3p.pdf, pág. 2')
    expect(porNome('Abrir a página 1').getAttribute('aria-current')).toBe(
      'page',
    )
    for (const nome of [
      'Selecionar página 2',
      'Abrir a página 2',
      'Girar a página 2 à direita',
      'Apagar a página 2',
    ]) {
      expect(porNome(nome)).toBeTruthy()
    }

    await abrirPagina(2)

    expect(renderizador.paginasPedidas.at(-1)).toMatchObject({ indice: 1 })
    expect(porNome('Abrir a página 2').getAttribute('aria-current')).toBe(
      'page',
    )
    expect(anuncio()).toBe('Página 2 de 3.')
    expect(focado()).toBe('Abrir a página 2')
  })

  it('o rótulo é a posição: mover muda o rótulo e a origem continua, com o anúncio pela posição', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await marcarPagina(3)

    await clicar(porNome('Mover para antes'))

    expect(idsDaLista()).toEqual(['a0p0', 'a0p2', 'a0p1'])
    expect(cartoes()[1].textContent).toContain('Página 2')
    expect(cartoes()[1].textContent).toContain('livro-3p.pdf, pág. 3')
    expect(anuncio()).toBe('Página 3 agora está na posição 2 de 3.')
    expect(focado()).toBe('Mover para antes')
  })

  it('os objetos seguem a página movida, e o Gerar manda a ordem nova com os objetos pelo id da página', async () => {
    const { motor } = await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await marcarPagina(1)

    await clicar(porNome('Mover para depois'))

    expect(idsDaLista()).toEqual(['a0p1', 'a0p0', 'a0p2'])
    expect(posicao()).toBe('Página 2 de 3')
    expect(objetos()).toHaveLength(1)

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)
    const [pedido] = motor.montadas
    expect(pedido.paginas.map((p) => p.id)).toEqual(['a0p1', 'a0p0', 'a0p2'])
    expect([...pedido.objetosPorPagina.keys()]).toEqual(['a0p0'])
    expect(pedido.porCopia).toBeUndefined()
  })

  it('apagar a página aberta abre a vizinha; desfazer as páginas a traz de volta com os objetos', async () => {
    const { motor } = await abrirParaEditar('livro-3p.pdf')
    await abrirPagina(2)
    await inserirNoCentro('Retângulo')

    await clicar(porNome('Apagar a página 2'))

    expect(idsDaLista()).toEqual(['a0p0', 'a0p2'])
    expect(posicao()).toBe('Página 2 de 2')
    expect(anuncio()).toBe('Página 2 apagada.')
    expect(focado()).toBe('Selecionar página 2')
    expect(objetos()).toHaveLength(0)
    expect(container.textContent).not.toContain('1 objeto em 1 página.')

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)
    expect(motor.montadas[0].paginas.map((p) => p.id)).toEqual(['a0p0', 'a0p2'])
    expect(motor.montadas[0].objetosPorPagina.size).toBe(0)

    await clicar(porNome('Desfazer nas páginas'))

    expect(idsDaLista()).toEqual(['a0p0', 'a0p1', 'a0p2'])
    expect(anuncio()).toBe('Desfeito nas páginas.')
    expect(container.textContent).toContain('1 objeto em 1 página.')
    expect(q('editar-pdf-resultado')).toBeNull()
    await abrirPagina(2)
    expect(objetos()).toHaveLength(1)
  })

  it('o desfazer dos objetos numa página apagada não navega e anuncia onde a mudança ficou', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await abrirPagina(2)
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Apagar a página 2'))

    await clicar(porNome('Desfazer'))

    expect(posicao()).toBe('Página 2 de 2')
    expect(anuncio()).toBe(
      'Desfeito numa página que você apagou. Para ela voltar, use Desfazer nas páginas.',
    )

    await clicar(porNome('Refazer'))
    expect(anuncio()).toBe(
      'Refeito numa página que você apagou. Para ela voltar, use Desfazer nas páginas.',
    )
  })

  it('girar uma página sem objetos: a página grande gira junto (a moldura é o giro)', async () => {
    const { renderizador } = await abrirParaEditar('livro-3p.pdf')

    await clicar(porNome('Girar a página 1 à direita'))
    await esperarAte(() => renderizador.paginasPedidas.at(-1)?.giro === 90)

    expect(anuncio()).toBe('Página 1 girada para 90°.')
    expect(q('editar-pdf-nota-do-giro')).toBeNull()
    expect(cartoes()[0].textContent).toContain('girada 90°')
  })

  it('girar uma página com objetos: os objetos giram junto, a página grande fica como estava, com a nota', async () => {
    const { renderizador, motor } = await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Cobrir')
    await clicar(porNome('Apagar de verdade o que está embaixo'))
    await clicar(porNome('Apagar de verdade nesta página'))
    const pedidas = renderizador.paginasPedidas.length

    await marcarPagina(1)
    await clicar(porNome('Girar à direita'))
    await esperar()

    expect(renderizador.paginasPedidas).toHaveLength(pedidas)
    expect(objetos()).toHaveLength(1)
    const nota = 'No PDF, esta página sai girada 90° à direita, com os objetos.'
    expect(q('editar-pdf-nota-do-giro')!.textContent).toBe(nota)
    expect(anuncio()).toBe(`Página 1 girada para 90°. ${nota}`)

    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)
    expect(motor.montadas[0].paginas[0]).toMatchObject({
      id: 'a0p0',
      giro: 90,
      moldura: 0,
    })
    expect(renderizador.fundos).toEqual([
      expect.objectContaining({ indice: 0, giro: 0 }),
    ])
  })

  it('objeto posto numa página já girada: a moldura é o giro, e o PDF sai como a tela mostra', async () => {
    const { motor } = await abrirParaEditar('livro-3p.pdf')
    await clicar(porNome('Girar a página 1 à direita'))
    await esperarAte(() => q('editar-pdf-quadro') !== null)
    medirQuadro()

    await inserirNoCentro('Retângulo')
    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)

    expect(motor.montadas[0].paginas[0]).toMatchObject({
      giro: 90,
      moldura: 90,
    })
    expect(q('editar-pdf-nota-do-giro')).toBeNull()
  })

  it('o aviso de alcance só aparece quando o PDF sai por cópia, e fica ligado ao Gerar', async () => {
    await abrirParaEditar('livro-3p.pdf')
    const descricaoDoGerar = () =>
      (porNome('Gerar PDF').getAttribute('aria-describedby') ?? '')
        .split(' ')
        .filter(Boolean)
        .map((id) => document.getElementById(id)!.textContent)
        .join(' ')

    await clicar(porNome('Girar a página 2 à direita'))
    expect(q('editar-pdf-alcance')).toBeNull()
    expect(porNome('Gerar PDF').disabled).toBe(false)
    expect(descricaoDoGerar()).toBe('')

    await clicar(porNome('Apagar a página 3'))
    expect(q('editar-pdf-alcance')!.textContent).toBe(TEXTOS.alcance)
    expect(descricaoDoGerar()).toBe(TEXTOS.alcance)
  })

  it('Extrair as selecionadas: só as páginas do pedido, com os objetos e o apagar de verdade delas, sempre por cópia', async () => {
    const { renderizador, motor } = await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Cobrir')
    await clicar(porNome('Apagar de verdade o que está embaixo'))
    await clicar(porNome('Apagar de verdade nesta página'))
    await abrirPagina(2)
    await inserirNoCentro('Retângulo')
    await marcarPagina(3)
    await marcarPagina(1)

    await clicar(porNome('Extrair as selecionadas'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)

    const [pedido] = motor.montadas
    expect(pedido.paginas.map((p) => p.id)).toEqual(['a0p0', 'a0p2'])
    expect(pedido.porCopia).toBe(true)
    expect([...pedido.objetosPorPagina.keys()]).toEqual(['a0p0'])
    expect([...pedido.paginasRasterizadas.keys()]).toEqual(['a0p0'])
    expect(renderizador.fundos.map((f) => f.indice)).toEqual([0])
    expect(q('editar-pdf-resultado')!.textContent).toContain(
      'PDF com as páginas extraídas pronto',
    )
    expect(q('editar-pdf-baixar')!.getAttribute('download')).toBe(
      'livro-3p-paginas.pdf',
    )
    expect(anuncio()).toMatch(/^PDF pronto: 2 páginas, /)
    expect(focado()).toBe('Baixar livro-3p-paginas.pdf')
  })

  it('a explicação do apagar de verdade muda quando o PDF sai por cópia: o título, o autor e os anexos não passam', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await clicar(porNome('Apagar a página 3'))
    await abrirPagina(1)
    await inserirNoCentro('Cobrir')

    await clicar(porNome('Apagar de verdade o que está embaixo'))

    const explicacao = q('editar-pdf-explicacao')!.textContent!
    expect(explicacao).toContain(
      'O PDF sai como um documento novo: o título, o autor e as outras informações do documento, e os anexos, não passam para ele.',
    )
    expect(explicacao).not.toContain('Continuam no PDF gerado')
  })

  it('o Extrair sai sempre por cópia: o aviso fica ligado a ele, e aparece com o PDF extraído, mesmo sem mudar a ordem', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await marcarPagina(1)
    const extrair = porNome('Extrair as selecionadas')
    const descricaoDoExtrair = (extrair.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter(Boolean)
      .map((id) => document.getElementById(id)!.textContent)
      .join(' ')
    expect(descricaoDoExtrair).toBe(
      'Extrair gera um PDF novo só com as selecionadas: os marcadores não passam, os links para outra página deixam de funcionar, e campos de formulário podem deixar de ser editáveis.',
    )
    expect(q('editar-pdf-alcance')).toBeNull()

    await clicar(extrair)
    await esperarAte(() => q('editar-pdf-resultado') !== null)

    expect(q('editar-pdf-alcance')!.textContent).toBe(TEXTOS.alcance)
    expect(
      porNome('Gerar PDF').getAttribute('aria-describedby') ?? '',
    ).not.toContain('alcance')
  })

  it('girar pelo cartão uma página com objetos anuncia a nota do giro', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')

    await clicar(porNome('Girar a página 1 à direita'))

    expect(anuncio()).toBe(
      'Página 1 girada para 90°. No PDF, esta página sai girada 90° à direita, com os objetos.',
    )
  })

  it('marcar ou desmarcar descarta só o resultado do Extrair; o PDF gerado continua', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)

    await marcarPagina(2)
    expect(q('editar-pdf-resultado')!.dataset.tipo).toBe('editado')

    await clicar(porNome('Extrair as selecionadas'))
    await esperarAte(
      () => q('editar-pdf-resultado')?.dataset.tipo === 'extraido',
    )
    await marcarPagina(3)
    expect(q('editar-pdf-resultado')).toBeNull()
  })

  it('a dica do texto do PDF consulta o ponto na moldura da página aberta, não no giro', async () => {
    const { renderizador } = await abrirParaEditar('livro-3p.pdf')
    await clicar(porNome('Girar a página 1 à direita'))
    await esperarAte(() => renderizador.paginasPedidas.at(-1)?.giro === 90)
    medirQuadro()

    await ponteiro(quadro(), 'pointerdown', { x: 100, y: 100 })
    await ponteiro(quadro(), 'pointerup', { x: 100, y: 100 })
    await esperar()
    expect(renderizador.textosConsultados.at(-1)).toMatchObject({
      indice: 0,
      giro: 90,
    })

    await inserirNoCentro('Retângulo')
    await clicar(porNome('Girar a página 1 à direita'))
    await ponteiro(quadro(), 'pointerdown', { x: 20, y: 20 })
    await ponteiro(quadro(), 'pointerup', { x: 20, y: 20 })
    await esperar()
    expect(renderizador.textosConsultados.at(-1)).toMatchObject({
      indice: 0,
      giro: 90,
    })
  })

  it('a barra da seleção: ícones com nome, o desfazer das páginas com nome próprio, e o motivo de cada botão parado', async () => {
    await abrirParaEditar('livro-3p.pdf')
    const descricao = (nome: string) =>
      document.getElementById(porNome(nome).getAttribute('aria-describedby')!)!
        .textContent

    for (const nome of [
      'Girar à esquerda',
      'Girar à direita',
      'Mover para antes',
      'Mover para depois',
      'Apagar',
      'Desfazer nas páginas',
    ]) {
      expect(porNome(nome).textContent).toBe('')
      expect(porNome(nome).className).toContain('size-11')
    }
    expect(porNome('Girar à direita').disabled).toBe(true)
    expect(descricao('Girar à direita')).toBe(TEXTOS.organizar.dicas.semSelecao)
    expect(descricao('Desfazer nas páginas')).toBe(
      TEXTOS.organizar.dicas.nadaParaDesfazer,
    )
    expect(q('editar-pdf-selecionadas')!.textContent).toBe(
      'Nenhuma página selecionada',
    )

    await clicar(porNome('Selecionar todas'))
    expect(q('editar-pdf-selecionadas')!.textContent).toBe(
      '3 páginas selecionadas',
    )
    expect(descricao('Apagar')).toBe(TEXTOS.organizar.dicas.todasSelecionadas)
    expect(focado()).toBe('Limpar seleção')
  })
})

// ---- Editor único, PR 3, etapa 2: o celular, o Ctrl/⌘+Z por região, o pular e a janela ----

// A folha é um portal do Radix no body, fora do container.
const folha = () => document.body.querySelector<HTMLElement>('[role="dialog"]')
const listasNoDocumento = () =>
  document.body.querySelectorAll('[data-testid="editar-pdf-paginas"]')
const cartoesNoDocumento = () =>
  Array.from(
    document.body.querySelectorAll<HTMLElement>(
      '[data-testid="editar-pdf-pagina"]',
    ),
  )

function naFolha<T extends HTMLElement = HTMLButtonElement>(nome: string): T {
  const achado = Array.from(
    folha()!.querySelectorAll<HTMLElement>('button, a, input'),
  ).find(
    (el) =>
      el.getAttribute('aria-label') === nome || el.textContent?.trim() === nome,
  )
  if (!achado) throw new Error(`nada na folha com o nome "${nome}"`)
  return achado as T
}

const segue = (antes: Node, depois: Node) =>
  Boolean(
    antes.compareDocumentPosition(depois) & Node.DOCUMENT_POSITION_FOLLOWING,
  )

async function abrirAFolha() {
  await clicar(porNome('Páginas'))
  await esperarAte(() => folha() !== null)
}

describe('a Bancada no celular: a folha Páginas', () => {
  it('sem a coluna; o botão Páginas abre a folha pela borda de baixo, com a lista uma vez só; Esc fecha e o foco volta ao botão', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')

    expect(q('editar-pdf-coluna-de-paginas')).toBeNull()
    expect(listasNoDocumento()).toHaveLength(0)
    const botao = porNome('Páginas')
    expect(botao.getAttribute('aria-haspopup')).toBe('dialog')
    expect(botao.getAttribute('aria-expanded')).toBe('false')
    expect(botao.className).toContain('h-11')

    await abrirAFolha()

    const dialogo = folha()!
    expect(dialogo.dataset.testid).toBe('editar-pdf-folha-de-paginas')
    expect(dialogo.className).toContain('bottom-0')
    expect(
      document.getElementById(dialogo.getAttribute('aria-labelledby')!)!
        .textContent,
    ).toBe('Páginas')
    expect(dialogo.textContent).toContain('3 páginas')
    expect(dialogo.textContent).toContain(
      'Toque numa miniatura para abrir a página.',
    )
    expect(listasNoDocumento()).toHaveLength(1)
    expect(dialogo.contains(listasNoDocumento()[0])).toBe(true)
    expect(cartoesNoDocumento()).toHaveLength(3)
    expect(dialogo.contains(document.activeElement)).toBe(true)
    expect(botao.getAttribute('aria-expanded')).toBe('true')

    await teclar(document.activeElement!, 'Escape')

    expect(folha()).toBeNull()
    expect(document.activeElement).toBe(botao)
  })

  it('girar, marcar e apagar pela folha deixam a folha aberta, com o foco dentro dela', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')
    await abrirAFolha()

    await clicar(naFolha('Girar a página 2 à direita'))
    await clicar(naFolha<HTMLInputElement>('Selecionar página 3'))
    expect(folha()!.textContent).toContain('1 página selecionada')
    await clicar(naFolha('Apagar a página 2'))

    expect(folha()).not.toBeNull()
    expect(cartoesNoDocumento().map((c) => c.dataset.id)).toEqual([
      'a0p0',
      'a0p2',
    ])
    expect(anuncio()).toBe('Página 2 apagada.')
    expect(folha()!.contains(document.activeElement)).toBe(true)
  })

  it('abrir uma página pela folha fecha a folha, abre a página, anuncia e leva o foco à área da página', async () => {
    larga = false
    const { renderizador } = await abrirParaEditar('livro-3p.pdf')
    await abrirAFolha()

    await clicar(naFolha('Abrir a página 3'))
    await esperarAte(() => posicao() === 'Página 3 de 3')

    expect(folha()).toBeNull()
    expect(renderizador.paginasPedidas.at(-1)).toMatchObject({ indice: 2 })
    expect(anuncio()).toBe('Página 3 de 3.')
    expect(document.activeElement).toBe(q('editar-pdf-area'))
  })

  it('Extrair pela folha fecha a folha e leva o foco ao Baixar do PDF extraído', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')
    await abrirAFolha()
    await clicar(naFolha<HTMLInputElement>('Selecionar página 2'))

    await clicar(naFolha('Extrair as selecionadas'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)

    expect(folha()).toBeNull()
    expect(focado()).toBe('Baixar livro-3p-paginas.pdf')
  })

  it('Extrair pela folha: enquanto monta, o foco fica no Cancelar; cancelado, volta ao botão Páginas', async () => {
    larga = false
    const motor = criarMotorFalso({ montagem: 'nunca' })
    await abrirParaEditar('livro-3p.pdf', { motor })
    await abrirAFolha()
    await clicar(naFolha<HTMLInputElement>('Selecionar página 2'))

    await clicar(naFolha('Extrair as selecionadas'))

    expect(folha()).toBeNull()
    expect(focado()).toBe('Cancelar')
    await clicar(porNome('Cancelar'))
    expect(document.activeElement).toBe(porNome('Páginas'))
  })

  it('na folha, as ações da seleção têm o nome escrito, como no desenho do celular', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')
    await abrirAFolha()

    for (const nome of [
      'Girar à esquerda',
      'Girar à direita',
      'Mover para antes',
      'Mover para depois',
      'Apagar',
      'Desfazer nas páginas',
    ]) {
      expect(naFolha(nome).textContent!.trim()).toBe(nome)
      expect(naFolha(nome).getAttribute('aria-label')).toBeNull()
    }
  })

  it('pular para a página aberta, pela folha, fecha a folha e leva o foco à área da página', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')
    await abrirAFolha()

    await clicar(naFolha<HTMLAnchorElement>('Pular para a página aberta'))

    expect(folha()).toBeNull()
    expect(document.activeElement).toBe(q('editar-pdf-area'))
  })

  it('no celular, a página vem antes das ferramentas, no fluxo, e a faixa numerada se chama Páginas; no largo, as ferramentas vêm antes', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')

    const ferramentas = () => q('editar-pdf-ferramentas')!
    expect(segue(q('editar-pdf-area')!, ferramentas())).toBe(true)
    expect(segue(porNome('Páginas'), q('editar-pdf-faixa')!)).toBe(true)
    expect(segue(q('editar-pdf-faixa')!, q('editar-pdf-area')!)).toBe(true)
    for (
      let no: HTMLElement | null = ferramentas();
      no && no !== container;
      no = no.parentElement
    ) {
      expect(no.className).not.toMatch(/\bfixed\b/)
    }
    expect(q('editar-pdf-faixa')!.getAttribute('aria-label')).toBe('Páginas')
    expect(segue(ferramentas(), q('editar-pdf-coluna-do-objeto')!)).toBe(true)

    mudarLargura(true)
    await esperar()

    expect(segue(ferramentas(), q('editar-pdf-area')!)).toBe(true)
    expect(q('editar-pdf-coluna-de-paginas')).not.toBeNull()
    expect(() => porNome('Páginas')).toThrow()
  })

  it('a janela que passa a larga com a folha aberta leva a lista para a coluna, ainda uma vez só', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')
    await abrirAFolha()

    mudarLargura(true)
    await esperar()

    expect(folha()).toBeNull()
    expect(listasNoDocumento()).toHaveLength(1)
    expect(
      q('editar-pdf-coluna-de-paginas')!.contains(listasNoDocumento()[0]),
    ).toBe(true)
  })
})

describe('a Bancada: Ctrl/⌘+Z por região, o pular e a janela', () => {
  it('nas páginas, Ctrl/⌘+Z desfaz as páginas e não os objetos; fora delas, desfaz os objetos', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Apagar a página 3'))
    await clicar(porNome('Girar a página 2 à direita'))
    const caixa = porNome<HTMLInputElement>('Selecionar página 1')
    caixa.focus()

    expect(await tecla(caixa, 'z', { ctrlKey: true })).toBe(true)
    expect(cartoes()[1].textContent).not.toContain('girada')
    expect(idsDaLista()).toEqual(['a0p0', 'a0p1'])
    expect(objetos()).toHaveLength(1)
    expect(anuncio()).toBe('Desfeito nas páginas.')
    expect(document.activeElement).toBe(caixa)

    expect(await tecla(caixa, 'z', { metaKey: true })).toBe(true)
    expect(idsDaLista()).toEqual(['a0p0', 'a0p1', 'a0p2'])
    expect(objetos()).toHaveLength(1)

    act(() => quadro().focus())
    await tecla(quadro(), 'z', { ctrlKey: true })
    expect(objetos()).toHaveLength(0)
    expect(idsDaLista()).toEqual(['a0p0', 'a0p1', 'a0p2'])
    expect(anuncio()).toBe('Desfeito.')
  })

  it('a região é a do último gesto: desenhar com o mouse depois de abrir a página pela coluna, Ctrl/⌘+Z desfaz o traço', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Apagar a página 3'))
    await clicar(ferramenta('Desenhar'))
    act(() => porNome('Abrir a página 1').focus())

    await ponteiro(quadro(), 'pointerdown', { x: 100, y: 100 })
    await ponteiro(quadro(), 'pointermove', { x: 150, y: 130 })
    await ponteiro(quadro(), 'pointerup', { x: 200, y: 160 })
    await esperar()
    expect(objetos()).toHaveLength(2)

    await tecla(document.activeElement!, 'z', { ctrlKey: true })

    expect(objetos()).toHaveLength(1)
    expect(idsDaLista()).toEqual(['a0p0', 'a0p1'])
    expect(anuncio()).toBe('Desfeito.')
  })

  it('clicar numa parte da coluna que não pega foco também conta como estar nas páginas', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Apagar a página 2'))
    act(() => (document.activeElement as HTMLElement | null)?.blur())

    await ponteiro(
      q('editar-pdf-coluna-de-paginas')!.querySelector('h3')!,
      'pointerdown',
      { x: 10, y: 10 },
    )
    await tecla(document.body, 'z', { ctrlKey: true })

    expect(idsDaLista()).toEqual(['a0p0', 'a0p1', 'a0p2'])
    expect(objetos()).toHaveLength(1)
    expect(anuncio()).toBe('Desfeito nas páginas.')
  })

  it('nas páginas, Ctrl/⌘+Shift+Z não refaz os objetos: diz que as páginas não têm refazer', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await clicar(porNome('Desfazer'))
    expect(objetos()).toHaveLength(0)
    const caixa = porNome<HTMLInputElement>('Selecionar página 2')
    act(() => caixa.focus())

    await tecla(caixa, 'z', { ctrlKey: true, shiftKey: true })

    expect(objetos()).toHaveLength(0)
    expect(anuncio()).toBe('Nas páginas não há refazer.')
  })

  it('na folha do celular, Ctrl/⌘+Z também desfaz as páginas', async () => {
    larga = false
    await abrirParaEditar('livro-3p.pdf')
    await inserirNoCentro('Retângulo')
    await abrirAFolha()
    await clicar(naFolha('Apagar a página 2'))

    await tecla(document.activeElement!, 'z', { ctrlKey: true })

    expect(cartoesNoDocumento()).toHaveLength(3)
    expect(objetos()).toHaveLength(1)
    expect(anuncio()).toBe('Desfeito nas páginas.')
  })

  it('o Desfazer nas páginas diz o atalho, e a coluna explica o Ctrl+Z dela', async () => {
    await abrirParaEditar('livro-3p.pdf')

    expect(
      porNome('Desfazer nas páginas').getAttribute('aria-keyshortcuts'),
    ).toBe('Control+Z Meta+Z')
    expect(q('editar-pdf-coluna-de-paginas')!.textContent).toContain(
      TEXTOS.editar.paginasDoDocumento.atalho,
    )
  })

  it('o link Pular para a página aberta vem antes da lista e leva o foco à área da página aberta', async () => {
    await abrirParaEditar('livro-3p.pdf')
    await abrirPagina(2)
    const link = porNome<HTMLAnchorElement>('Pular para a página aberta')

    expect(link.tagName).toBe('A')
    expect(q('editar-pdf-coluna-de-paginas')!.contains(link)).toBe(true)
    expect(segue(link, q('editar-pdf-paginas')!)).toBe(true)
    expect(link.getAttribute('href')).toBe(`#${q('editar-pdf-area')!.id}`)

    await clicar(link)

    expect(document.activeElement).toBe(q('editar-pdf-area'))
    expect(q('editar-pdf-area')!.getAttribute('aria-label')).toBe(
      'Área da página 2',
    )
  })

  it('com o PDF aberto, soltar um arquivo fora da zona não deixa o navegador abrir o arquivo, mesmo sem a proteção da zona', async () => {
    mockZona.semProtecao = true
    await abrirParaEditar('livro-3p.pdf')
    const evento = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(evento, 'dataTransfer', {
      value: { types: ['Files'], files: [] },
    })

    quadro().dispatchEvent(evento)

    expect(evento.defaultPrevented).toBe(true)
    expect(q('editar-pdf-documento')).not.toBeNull()
  })
})

// ---- Editor único, PR 4: adicionar outro PDF ----

const A = TEXTOS.editar.adicionar

// Só o começo: o arquivo escolhido chega ao input, e a abertura segue fora do act.
function comecarAAdicionar(arquivo: File) {
  const input = q('editar-pdf-input-pdf') as HTMLInputElement
  Object.defineProperty(input, 'files', {
    value: Object.assign([arquivo], { item: () => arquivo }),
    configurable: true,
  })
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function adicionarPdf(arquivo: File) {
  comecarAAdicionar(arquivo)
  await esperar()
}

const descricaoDe = (el: HTMLElement) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')

const marcadasNaLista = () =>
  cartoesNoDocumento()
    .filter((c) => c.dataset.selecionada)
    .map((c) => c.dataset.id)

const origens = () =>
  cartoesNoDocumento().map(
    (c) => c.querySelector('[data-testid="editar-pdf-origem"]')!.textContent,
  )

const alertaDaAdicao = () =>
  document.body.querySelector<HTMLElement>(
    '[data-testid="editar-pdf-recusa-da-adicao"]',
  )

describe('adicionar outro PDF', () => {
  it('o botão Adicionar PDF fica na coluna, antes da seleção, aceita um PDF só e diz onde o PDF entra', async () => {
    await abrirParaEditar('a-3p.pdf')
    const botao = porNome('Adicionar PDF')
    const coluna = q('editar-pdf-coluna-de-paginas')!

    expect(coluna.contains(botao)).toBe(true)
    expect(botao.className).toContain('h-11')
    expect(
      segue(
        botao,
        coluna.querySelector('[aria-label="Ações nas páginas selecionadas"]')!,
      ),
    ).toBe(true)
    const input = q('editar-pdf-input-pdf') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.multiple).toBe(false)
    expect(input.accept).toContain('application/pdf')
    expect(descricaoDe(botao)).toBe(A.onde(3, null))

    await marcarPagina(3)
    await marcarPagina(1)
    expect(descricaoDe(botao)).toBe(A.onde(3, { pagina: 1, marcadas: 2 }))
  })

  it('sem marcada: entra no fim, as páginas novas ficam marcadas, o foco vai à caixa da primeira e o anúncio diz onde', async () => {
    const { renderizador, motor } = await abrirParaEditar('a-3p.pdf')

    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 5)

    expect(idsDaLista()).toEqual(['a0p0', 'a0p1', 'a0p2', 'a1p0', 'a1p1'])
    expect(origens()).toEqual([
      'a-3p.pdf, pág. 1',
      'a-3p.pdf, pág. 2',
      'a-3p.pdf, pág. 3',
      'b-2p.pdf, pág. 1',
      'b-2p.pdf, pág. 2',
    ])
    expect(marcadasNaLista()).toEqual(['a1p0', 'a1p1'])
    expect(focado()).toBe('Selecionar página 4')
    expect(anuncio()).toBe(A.adicionadas('b-2p.pdf', 2, 3, []))
    expect(q('editar-pdf-documento')!.textContent).toBe(
      'a-3p.pdf + b-2p.pdf · 5 páginas',
    )
    expect(motor.analisadas).toEqual(['a-3p.pdf', 'b-2p.pdf'])
    expect(renderizador.abertos).toEqual(['a-3p.pdf', 'b-2p.pdf'])
    expect(renderizador.workers).toBe(1)
    // A página aberta não muda.
    expect(posicao()).toBe('Página 1 de 5')
  })

  it('com marcadas: entra depois da última marcada (D4), e a próxima adição entra depois das que acabaram de entrar (D3)', async () => {
    await abrirParaEditar('a-3p.pdf')
    await marcarPagina(3)
    await marcarPagina(1)

    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 5)
    expect(idsDaLista()).toEqual(['a0p0', 'a1p0', 'a1p1', 'a0p1', 'a0p2'])
    expect(anuncio()).toBe(A.adicionadas('b-2p.pdf', 2, 1, []))
    expect(descricaoDe(porNome('Adicionar PDF'))).toBe(
      A.onde(5, { pagina: 3, marcadas: 2 }),
    )

    await adicionarPdf(pdf('c-1p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 6)
    expect(idsDaLista()).toEqual([
      'a0p0',
      'a1p0',
      'a1p1',
      'a2p0',
      'a0p1',
      'a0p2',
    ])
    expect(marcadasNaLista()).toEqual(['a2p0'])
    expect(q('editar-pdf-documento')!.textContent).toBe(
      'a-3p.pdf + b-2p.pdf + c-1p.pdf · 6 páginas',
    )
  })

  it('acima do teto somado de páginas: um alerta diz o que ainda cabe, e o documento fica como estava, sem o pdf.js abrir o novo', async () => {
    const { renderizador } = await abrirParaEditar('a-3p.pdf')
    await marcarPagina(2)
    const antes = idsDaLista()
    const botao = porNome('Adicionar PDF')
    act(() => botao.focus())

    await adicionarPdf(pdf('b-498p.pdf'))
    await esperarAte(() => alertaDaAdicao() !== null)

    expect(alertaDaAdicao()!.getAttribute('role')).toBe('alert')
    expect(alertaDaAdicao()!.textContent).toBe(
      A.passouDoTeto(
        'b-498p.pdf',
        {
          passou: 'paginas',
          bytes: pdf('b-498p.pdf').size,
          paginas: 498,
          restam: { bytes: 50_000_000 - pdf('a-3p.pdf').size, paginas: 497 },
        },
        { bytes: 50_000_000, paginas: 500 },
      ),
    )
    expect(idsDaLista()).toEqual(antes)
    expect(marcadasNaLista()).toEqual(['a0p1'])
    expect(renderizador.abertos).toEqual(['a-3p.pdf'])
    expect(q('editar-pdf-documento')!.textContent).toBe('a-3p.pdf · 3 páginas')
    expect(document.activeElement).toBe(botao)
  })

  it('acima do teto somado de bytes: nem lê o arquivo, e o alerta diz quanto ainda cabe', async () => {
    const { motor } = await abrirParaEditar('a-3p.pdf')
    const grande = pdf('b-2p.pdf')
    Object.defineProperty(grande, 'size', { value: 49_999_999 })

    await adicionarPdf(grande)
    await esperarAte(() => alertaDaAdicao() !== null)

    expect(alertaDaAdicao()!.textContent).toContain(
      'Não deu para adicionar b-2p.pdf: ele tem 50 MB, e só cabem mais',
    )
    expect(motor.analisadas).toEqual(['a-3p.pdf'])
    expect(cartoesNoDocumento()).toHaveLength(3)
  })

  it('PDF protegido no lugar do novo: alerta com a mensagem de sempre, nada muda, e o próximo que dá certo tira o alerta', async () => {
    await abrirParaEditar('a-3p.pdf')

    await adicionarPdf(pdf('b-senha.pdf'))
    await esperarAte(() => alertaDaAdicao() !== null)
    expect(alertaDaAdicao()!.textContent).toBe(
      A.recusado('b-senha.pdf', 'protegido'),
    )
    expect(cartoesNoDocumento()).toHaveLength(3)

    await adicionarPdf(pdf('c-1p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 4)
    expect(alertaDaAdicao()).toBeNull()
  })

  it('um por vez (D5): enquanto um abre, o botão diz que está adicionando e não pede outro', async () => {
    const motor = criarMotorFalso({ atraso: 60 })
    await abrirParaEditar('a-3p.pdf', { motor })
    const botao = porNome('Adicionar PDF')
    const clicado = jest.fn()
    const input = q('editar-pdf-input-pdf') as HTMLInputElement
    input.addEventListener('click', clicado)

    comecarAAdicionar(pdf('b-2p.pdf'))
    expect(botao.getAttribute('aria-disabled')).toBe('true')
    expect(descricaoDe(botao)).toContain(A.adicionando('b-2p.pdf'))
    await clicar(botao)
    expect(clicado).not.toHaveBeenCalled()

    await esperarAte(() => cartoesNoDocumento().length === 5)
    expect(botao.getAttribute('aria-disabled')).toBeNull()
    await clicar(botao)
    expect(clicado).toHaveBeenCalledTimes(1)
  })

  it('a página do segundo arquivo: a página grande, a miniatura e a dica do texto vêm do documento dele', async () => {
    const { renderizador } = await abrirParaEditar('a-3p.pdf')
    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 5)

    await abrirPagina(5)
    await ponteiro(quadro(), 'pointerdown', { x: 100, y: 100 })
    await ponteiro(quadro(), 'pointerup', { x: 100, y: 100 })
    await esperar()

    expect(
      renderizador.pedidos.filter((p) => p.tipo === 'pagina').at(-1),
    ).toEqual({ arquivo: 'b-2p.pdf', tipo: 'pagina', indice: 1 })
    expect(
      renderizador.pedidos.filter((p) => p.tipo === 'texto').at(-1),
    ).toEqual({ arquivo: 'b-2p.pdf', tipo: 'texto', indice: 1 })
    expect(
      renderizador.pedidos.filter(
        (p) => p.tipo === 'miniatura' && p.arquivo === 'b-2p.pdf',
      ).length,
    ).toBeGreaterThan(0)
    expect(
      renderizador.pedidos.some(
        (p) =>
          p.tipo === 'miniatura' && p.arquivo === 'a-3p.pdf' && p.indice === 3,
      ),
    ).toBe(false)
  })

  it('Gerar com dois arquivos: o motor recebe os dois, com o objeto e o apagar de verdade na página do segundo, e o aviso de alcance aparece', async () => {
    const { motor, renderizador } = await abrirParaEditar('a-3p.pdf')
    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 5)
    await abrirPagina(4)
    await inserirNoCentro('Cobrir')
    await clicar(porNome('Apagar de verdade o que está embaixo'))
    await clicar(porNome('Apagar de verdade nesta página'))

    expect(q('editar-pdf-alcance')!.textContent).toBe(TEXTOS.alcance)
    await clicar(porNome('Gerar PDF'))
    await esperarAte(() => q('editar-pdf-baixar') !== null)

    const [pedido] = motor.montadas
    expect(pedido.nomes).toEqual(['a-3p.pdf', 'b-2p.pdf'])
    // Com outro arquivo no plano, o montarDocumento sai por cópia sozinho; o pedido não precisa forçar.
    expect(pedido.paginas.map(({ id, origem }) => [id, origem])).toEqual([
      ['a0p0', { arquivo: 0, indice: 0 }],
      ['a0p1', { arquivo: 0, indice: 1 }],
      ['a0p2', { arquivo: 0, indice: 2 }],
      ['a1p0', { arquivo: 1, indice: 0 }],
      ['a1p1', { arquivo: 1, indice: 1 }],
    ])
    expect([...pedido.objetosPorPagina.keys()]).toEqual(['a1p0'])
    expect([...pedido.paginasRasterizadas.keys()]).toEqual(['a1p0'])
    expect(renderizador.pedidos.filter((p) => p.tipo === 'fundo')).toEqual([
      { arquivo: 'b-2p.pdf', tipo: 'fundo', indice: 0 },
    ])
    expect((q('editar-pdf-baixar') as HTMLAnchorElement).download).toBe(
      'a-3p-editado.pdf',
    )
  })

  it('desfazer a adição (Desfazer nas páginas) tira as páginas, fecha o arquivo que nenhuma página alcança e o cabeçalho volta', async () => {
    const { renderizador } = await abrirParaEditar('a-3p.pdf')
    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 5)

    await clicar(porNome('Desfazer nas páginas'))

    expect(idsDaLista()).toEqual(['a0p0', 'a0p1', 'a0p2'])
    expect(renderizador.fechados).toBe(1)
    expect(q('editar-pdf-documento')!.textContent).toBe('a-3p.pdf · 3 páginas')
  })

  it('o cabeçalho junta só os arquivos com página na lista: apagar as do primeiro deixa só o nome do segundo', async () => {
    await abrirParaEditar('a-1p.pdf')
    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 3)

    await clicar(porNome('Apagar a página 1'))

    expect(q('editar-pdf-documento')!.textContent).toBe('b-2p.pdf · 2 páginas')
    expect(porNome('Gerar PDF').disabled).toBe(false)
  })

  it('os avisos do #124 com dois arquivos: cada aviso leva o nome do arquivo, e o anúncio da adição diz os do novo', async () => {
    await abrirParaEditar('a-xfa-1p.pdf')
    expect(todos('editar-pdf-aviso').map((a) => a.textContent)).toEqual([
      TEXTOS.editar.avisos.xfa_puro,
    ])

    await adicionarPdf(pdf('b-assinado-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 3)

    expect(todos('editar-pdf-aviso').map((a) => a.textContent)).toEqual([
      TEXTOS.editar.avisoDoArquivo('a-xfa-1p.pdf', 'xfa_puro'),
      TEXTOS.editar.avisoDoArquivo('b-assinado-2p.pdf', 'assinatura_digital'),
    ])
    expect(anuncio()).toBe(
      A.adicionadas('b-assinado-2p.pdf', 2, 1, ['assinatura_digital']),
    )
  })

  it('no celular: o botão curto ao lado de Páginas tem o nome inteiro e a descrição; adicionar por ele deixa o foco nele', async () => {
    larga = false
    await abrirParaEditar('a-3p.pdf')
    const botao = porNome('Adicionar PDF')

    expect(botao.textContent).toBe(A.botao)
    expect(botao.className).toContain('h-11')
    expect(segue(porNome('Páginas'), botao)).toBe(true)
    expect(descricaoDe(botao)).toBe(A.onde(3, null))
    act(() => botao.focus())

    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(
      () =>
        cartoesNoDocumento().length === 0 &&
        q('editar-pdf-documento')!.textContent!.includes('b-2p.pdf'),
    )

    expect(document.activeElement).toBe(botao)
    expect(anuncio()).toBe(A.adicionadas('b-2p.pdf', 2, 3, []))
    expect(miniaturas()).toHaveLength(5)
  })

  it('na folha do celular: o Adicionar PDF também está lá; o foco vai à caixa da primeira página nova, e a recusa aparece na folha', async () => {
    larga = false
    await abrirParaEditar('a-3p.pdf')
    await abrirAFolha()
    const botao = naFolha('Adicionar PDF')
    act(() => botao.focus())

    await adicionarPdf(pdf('b-senha.pdf'))
    await esperarAte(() => alertaDaAdicao() !== null)
    expect(folha()!.contains(alertaDaAdicao())).toBe(true)

    await adicionarPdf(pdf('b-2p.pdf'))
    await esperarAte(() => cartoesNoDocumento().length === 5)
    expect(folha()).not.toBeNull()
    expect(document.activeElement).toBe(
      naFolha<HTMLInputElement>('Selecionar página 4'),
    )
  })
})
