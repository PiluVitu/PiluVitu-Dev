import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  TETO_DAS_IMAGENS_EM_BYTES,
  TETO_DE_BYTES_COM_MINIATURAS,
  type Ponto,
} from '@piluvitu/tools/pdf-regras'
import { DocumentoPdfProvider, useDocumentoPdf } from './documento-pdf'
import { EditarPdf, ZOOMS } from './editar'
import type { ObjetoNaTela } from './motor'
import { criarMotorFalso } from './motor-falso'
import { criarRenderizadorFalso } from './renderizador-falso'
import { ERROS_DO_ARQUIVO, TEXTOS } from './textos'

// O motor e o renderizador reais criam Workers com import.meta; aqui os dois vêm injetados.
jest.mock('./novo-worker', () => ({ novoWorkerDePdf: jest.fn() }))
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

// O tamanho natural (em pixels) que o createImageBitmap falso dá a toda imagem.
let imagemDecodificada = { width: 400, height: 200 }

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.IntersectionObserver =
    ObservadorFalso as unknown as typeof IntersectionObserver
  window.ResizeObserver = MedidorFalso as unknown as typeof ResizeObserver
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
    expect(container.textContent).toContain('Até 50 MB e 500 páginas por PDF.')
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
      ObservadorFalso.todos.at(-1)!.avisar([itens[0], itens[1]])
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
    const renderizador = criarRenderizadorFalso({ atraso: 30 })
    await abrir('livro-4p.pdf', { renderizador })

    await act(async () => miniaturas()[1].click())
    expect(q('editar-pdf-desenhando')!.textContent).toBe('Desenhando a página…')
    expect(q('editar-pdf-folha')!.getAttribute('aria-busy')).toBe('true')
    await act(async () => miniaturas()[3].click())
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
  expect(q('editar-pdf-faixa')!.getAttribute('aria-labelledby')).toBeTruthy()
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
    const barra = container.querySelector('[role="toolbar"]')!

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
    const barra = container.querySelector('[role="toolbar"]')!
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

    await escolherImagem(png('assinatura.png'))
    expect(q('editar-pdf-estado-imagem')!.textContent).toBe(
      'assinatura.png, 400 por 200 pixels.',
    )
    await clicar(porNome('Inserir no centro'))

    expect(nomesDosObjetos()).toEqual([
      'Imagem assinatura.png, em 148 por 346, 300 por 150 pontos',
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
      'Os links e os campos de formulário desta página saem',
      'Os metadados do documento (título, autor) continuam',
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

    await clicar(porNome('Gerar PDF editado'))
    await esperarAte(() => q('editar-pdf-resultado') !== null)

    expect(renderizador.fundos).toEqual([
      {
        indice: 0,
        cobrir: [{ x: 217.5, y: 405, largura: 160, altura: 32 }],
      },
    ])
    const [pedido] = motor.editadas
    expect([...pedido.paginasRasterizadas.keys()]).toEqual([0])
    expect(pedido.paginasRasterizadas.get(0)!.type).toBe('image/jpeg')
    expect(pedido.objetosPorPagina.get(0)!.map((o) => o.tipo)).toEqual([
      'cobrir',
      'texto',
    ])
  })
})

describe('gerar o PDF editado', () => {
  it('sem objeto, o botão fica parado com o motivo escrito', async () => {
    await abrirParaEditar()
    const gerar = porNome('Gerar PDF editado')
    expect(gerar.disabled).toBe(true)
    expect(
      document.getElementById(gerar.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe('Ponha pelo menos um objeto numa página para gerar o PDF editado.')
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
    await clicar(porNome('Gerar PDF editado'))
    await esperarAte(() => q('editar-pdf-baixar') !== null)

    const [pedido] = motor.editadas
    expect(pedido.nome).toBe('contrato-3p.pdf')
    expect([...pedido.objetosPorPagina.keys()]).toEqual([0, 1])
    const imagem = pedido.objetosPorPagina.get(0)![0] as Extract<
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
    await clicar(porNome('Gerar PDF editado'))
    await esperarAte(() => q('editar-pdf-baixar') !== null)

    await tecla(objetos()[0], 'ArrowLeft')
    expect(q('editar-pdf-resultado')).toBeNull()
  })

  it('Cancelar para a montagem, avisa e devolve o foco ao Gerar', async () => {
    const motor = criarMotorFalso({ edicao: 'nunca' })
    await abrirParaEditar('contrato-3p.pdf', { motor })
    await inserirNoCentro('Retângulo')

    await clicar(porNome('Gerar PDF editado'))
    expect(focado()).toBe('Cancelar')
    await clicar(porNome('Cancelar'))

    expect(anuncio()).toBe('Cancelado.')
    expect(focado()).toBe('Gerar PDF editado')
    expect(q('editar-pdf-resultado')).toBeNull()
  })

  it('a falha de um objeto diz o que fazer e leva até ele', async () => {
    const motor = criarMotorFalso()
    await abrirParaEditar('contrato-3p.pdf', { motor })
    await inserirNoCentro('Texto')
    const id = objetos()[0].dataset.id!
    motor.editar = jest.fn(() =>
      Promise.reject({
        motivo: 'texto_fora_do_winansi',
        pagina: 0,
        objeto: id,
        caracteres: ['ŧ'],
      }),
    )
    await tecla(q('editar-pdf-campo-texto')!, 'Escape')
    await tecla(objetos()[0], 'Escape')

    await clicar(porNome('Gerar PDF editado'))
    await esperarAte(() => q('editar-pdf-falha-ao-gerar') !== null)

    const falha = q('editar-pdf-falha-ao-gerar')!
    expect(falha.getAttribute('role')).toBe('alert')
    expect(falha.textContent).toContain(
      'Um texto da página 1 tem um caractere que as fontes do PDF não escrevem: ŧ.',
    )
    expect(focado()).toBe('Gerar PDF editado')
    await clicar(porNome('Mostrar o objeto'))
    expect(document.activeElement).toBe(objetos()[0])
  })
})

it('todo controle novo tem 44 px e nome', async () => {
  await abrirParaEditar()
  for (const botao of container.querySelectorAll<HTMLButtonElement>(
    '[role="toolbar"] button',
  )) {
    expect(botao.className).toContain('h-11')
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
