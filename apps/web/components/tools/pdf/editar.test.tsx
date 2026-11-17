import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TETO_DE_BYTES_COM_MINIATURAS } from '@piluvitu/tools/pdf-regras'
import { DocumentoPdfProvider, useDocumentoPdf } from './documento-pdf'
import { EditarPdf, ZOOMS } from './editar'
import { criarMotorFalso } from './motor-falso'
import { criarRenderizadorFalso } from './renderizador-falso'
import { ERROS_DO_ARQUIVO } from './textos'

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

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.IntersectionObserver =
    ObservadorFalso as unknown as typeof IntersectionObserver
  window.ResizeObserver = MedidorFalso as unknown as typeof ResizeObserver
})

beforeEach(() => {
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
