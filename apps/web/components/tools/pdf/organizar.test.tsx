import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TETO_DE_BYTES_COM_MINIATURAS } from '@piluvitu/tools/pdf-regras'
import { DocumentoPdfProvider, useDocumentoPdf } from './documento-pdf'
import { criarMotorFalso } from './motor-falso'
import { OrganizarPdf } from './organizar'
import { criarRenderizadorFalso } from './renderizador-falso'
import { ERROS_DO_ARQUIVO } from './textos'

// O motor e o renderizador reais criam Workers com import.meta; aqui os dois vêm injetados.
jest.mock('./novo-worker', () => ({ novoWorkerDePdf: jest.fn() }))
jest.mock('./novo-worker-pdfjs', () => ({ novoWorkerDoPdfjs: jest.fn() }))

// O jsdom não tem IntersectionObserver. O falso diz "apareceu" assim que observa (automático) ou
// quando o teste chama mostrar(), para conferir que só as páginas na tela são desenhadas.
class ObservadorFalso {
  static todos: ObservadorFalso[] = []
  static automatico = true
  observados = new Set<Element>()
  constructor(private readonly aoCruzar: IntersectionObserverCallback) {
    ObservadorFalso.todos.push(this)
  }
  observe(alvo: Element) {
    this.observados.add(alvo)
    if (ObservadorFalso.automatico) {
      queueMicrotask(() => this.avisar([alvo]))
    }
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

let container: HTMLDivElement
let root: Root
let documentoAtual: File | null = null
let proximaUrl = 0

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.IntersectionObserver =
    ObservadorFalso as unknown as typeof IntersectionObserver
  window.matchMedia = (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  ObservadorFalso.todos = []
  ObservadorFalso.automatico = true
  proximaUrl = 0
  URL.createObjectURL = jest.fn(() => `blob:url-${proximaUrl++}`)
  URL.revokeObjectURL = jest.fn()
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
        <OrganizarPdf renderizador={renderizador} motor={motor} />
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

const existe = (nome: string) => {
  try {
    porNome(nome)
    return true
  } catch {
    return false
  }
}

const pdf = (nome: string) =>
  new File(['%PDF-1.7'], nome, { type: 'application/pdf' })

const ordem = () => todos('organizar-pdf-rotulo').map((el) => el.textContent)

const anuncio = () => q('organizar-pdf-anuncio')!.textContent!.trim()

const focado = () =>
  document.activeElement?.getAttribute('aria-label') ??
  document.activeElement?.textContent?.trim()

async function esperar(ms = 20) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

async function clicar(nome: string) {
  const alvo = porNome(nome)
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

async function abrir(nome: string, opcoes: Parameters<typeof montar>[0] = {}) {
  const montado = montar({ ...opcoes, arquivoInicial: pdf(nome) })
  await esperar()
  return montado
}

async function teclar(alvo: EventTarget, init: KeyboardEventInit) {
  await act(async () => {
    alvo.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    )
  })
  await esperar()
}

describe('abrir o PDF', () => {
  it('sem documento: diz que nada sai do aparelho, pede um PDF só e não lê nada', () => {
    const { renderizador, motor } = montar()

    expect(container.textContent).toContain(
      'Seus arquivos não saem do aparelho',
    )
    expect(q('pdf-escolher')!.textContent).toBe('Escolher PDF')
    expect((q('pdf-input') as HTMLInputElement).multiple).toBe(false)
    expect(container.textContent).toContain(
      'Até 50 MB e 500 páginas por PDF. Para desenhar as páginas e montar o PDF final, o seu aparelho chega a usar umas 6 a 8 vezes o tamanho do arquivo',
    )
    expect(motor.analisadas).toEqual([])
    expect(renderizador.abertos).toEqual([])
  })

  it('chegando do mesclar: o pdf-lib lê, o pdf.js abre, e as páginas viram uma lista na ordem', async () => {
    const { renderizador, motor } = await abrir('mesclado-5p.pdf')

    expect(motor.analisadas).toEqual(['mesclado-5p.pdf'])
    expect(renderizador.abertos).toEqual(['mesclado-5p.pdf'])
    expect(q('organizar-pdf-documento')!.textContent).toBe(
      'mesclado-5p.pdf · 5 páginas',
    )
    expect(q('organizar-pdf-paginas')!.tagName).toBe('OL')
    expect(ordem()).toEqual([
      'Página 1',
      'Página 2',
      'Página 3',
      'Página 4',
      'Página 5',
    ])
  })

  it('escolher um PDF guarda no editor (para os outros modos) e abre', async () => {
    const { renderizador } = montar()

    await escolher(pdf('contrato-3p.pdf'))

    expect(documentoAtual?.name).toBe('contrato-3p.pdf')
    expect(renderizador.abertos).toEqual(['contrato-3p.pdf'])
    expect(ordem()).toHaveLength(3)
  })

  it('anuncia enquanto abre e quando abre', async () => {
    montar({
      motor: criarMotorFalso({ atraso: 50 }),
      arquivoInicial: pdf('a-2p.pdf'),
    })

    expect(anuncio()).toBe('Abrindo a-2p.pdf…')
    await esperar(120)
    expect(anuncio()).toBe('a-2p.pdf · 2 páginas')
  })

  it('PDF protegido: a leitura do pdf-lib decide, com a mesma mensagem do mesclar, e o pdf.js nem abre', async () => {
    const { renderizador } = await abrir('extrato-senha.pdf')

    const alerta = q('organizar-pdf-erro')!
    expect(alerta.getAttribute('role')).toBe('alert')
    expect(alerta.textContent).toBe(
      `Não deu para abrir extrato-senha.pdf. ${ERROS_DO_ARQUIVO.protegido}`,
    )
    expect(renderizador.abertos).toEqual([])
    expect(q('organizar-pdf-paginas')).toBeNull()
  })

  it('arquivo que não é PDF e PDF corrompido: as mensagens do mesclar', async () => {
    montar()
    await escolher(new File(['oi'], 'notas.txt'))
    expect(q('organizar-pdf-erro')!.textContent).toContain(
      ERROS_DO_ARQUIVO.nao_e_pdf,
    )

    await escolher(pdf('quebrado.pdf'))
    expect(q('organizar-pdf-erro')!.textContent).toContain(
      ERROS_DO_ARQUIVO.corrompido,
    )
  })

  it('acima do teto de bytes: explica, sugere dividir e não lê nada', async () => {
    const grande = pdf('scan-3p.pdf')
    Object.defineProperty(grande, 'size', {
      value: TETO_DE_BYTES_COM_MINIATURAS + 1,
    })
    const { renderizador, motor } = montar({ arquivoInicial: grande })
    await esperar()

    const alerta = q('organizar-pdf-erro')!
    expect(alerta.getAttribute('role')).toBe('alert')
    expect(alerta.textContent).toMatch(
      /^scan-3p\.pdf tem .+ MB, mais que os .+ MB que dá para organizar no navegador\. Divida o PDF em partes menores/,
    )
    expect(motor.analisadas).toEqual([])
    expect(renderizador.abertos).toEqual([])
  })

  it('acima do teto de páginas: explica, sugere dividir e não abre no pdf.js', async () => {
    const { renderizador } = await abrir('livro-600p.pdf')

    expect(q('organizar-pdf-erro')!.textContent).toBe(
      'livro-600p.pdf tem 600 páginas, mais que as 500 que dá para organizar de uma vez. Divida o PDF em partes de até 500 páginas no programa que o criou e abra uma de cada vez.',
    )
    expect(renderizador.abertos).toEqual([])
  })

  it('trocar de PDF fecha o anterior, e sair da página fecha o aberto', async () => {
    const { renderizador } = await abrir('a.pdf')

    await escolher(pdf('b-4p.pdf'))
    expect(renderizador.fechados).toBe(1)
    expect(ordem()).toHaveLength(4)

    act(() => root.unmount())
    root = createRoot(container)
    expect(renderizador.fechados).toBe(2)
  })

  it('PDF que termina de abrir depois de a pessoa trocar de arquivo é fechado sem aparecer', async () => {
    const { renderizador } = montar({
      renderizador: criarRenderizadorFalso({ atraso: 40 }),
      arquivoInicial: pdf('lento-9p.pdf'),
    })
    await esperar(10)
    expect(renderizador.abertos).toEqual(['lento-9p.pdf'])

    await escolher(pdf('b-2p.pdf'))
    await esperar(100)

    expect(renderizador.fechados).toBe(1)
    expect(q('organizar-pdf-documento')!.textContent).toBe(
      'b-2p.pdf · 2 páginas',
    )
    expect(ordem()).toHaveLength(2)
  })
})

describe('miniaturas', () => {
  it('só desenha as páginas que aparecem na tela, uma por vez, a 160 px', async () => {
    ObservadorFalso.automatico = false
    const { renderizador } = await abrir('a-6p.pdf', {
      renderizador: criarRenderizadorFalso({ atraso: 30 }),
    })
    await esperar(60)
    expect(renderizador.miniaturas).toEqual([])

    const paginas = todos('organizar-pdf-pagina')
    await act(async () => {
      for (const observador of ObservadorFalso.todos) {
        observador.avisar(paginas.slice(0, 3))
      }
    })
    await esperar(10)
    expect(renderizador.miniaturas).toHaveLength(1)

    await esperar(200)
    expect(renderizador.miniaturas).toEqual([
      { indice: 0, larguraCss: 160 },
      { indice: 1, larguraCss: 160 },
      { indice: 2, larguraCss: 160 },
    ])
    const imagens = todos('organizar-pdf-miniatura') as HTMLImageElement[]
    expect(imagens).toHaveLength(3)
    expect(imagens.map((img) => img.getAttribute('alt'))).toEqual(['', '', ''])
    expect(imagens[0].getAttribute('src')).toMatch(/^blob:/)
  })

  it('a rotação aparece girando a imagem, sem desenhar de novo', async () => {
    const { renderizador } = await abrir('a-2p.pdf')
    await esperar(40)
    const desenhadas = renderizador.miniaturas.length

    await clicar('Girar a página 2 à direita')

    const imagem = todos('organizar-pdf-miniatura')[1]
    expect(imagem.style.transform).toBe('rotate(90deg)')
    expect(renderizador.miniaturas).toHaveLength(desenhadas)
  })

  it('miniatura que falha mostra "Sem prévia" e a fila segue', async () => {
    await abrir('a-3p.pdf', {
      renderizador: criarRenderizadorFalso({ miniaturasQueFalham: [0] }),
    })
    await esperar(60)

    const [primeira, segunda] = todos('organizar-pdf-pagina')
    expect(primeira.textContent).toContain('Sem prévia')
    expect(
      segunda.querySelector('[data-testid="organizar-pdf-miniatura"]'),
    ).not.toBeNull()
  })

  it('as URLs das miniaturas são revogadas ao trocar de documento e ao sair', async () => {
    await abrir('a-2p.pdf')
    await esperar(40)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2)

    await escolher(pdf('b-1p.pdf'))
    await esperar(40)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-0')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1')

    act(() => root.unmount())
    root = createRoot(container)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-2')
  })
})

describe('seleção e barra de ações', () => {
  it('a barra é uma toolbar; sem seleção, os botões de lote ficam desabilitados com o motivo perto', async () => {
    await abrir('a-3p.pdf')

    const barra = q('organizar-pdf-barra')!
    expect(barra.getAttribute('role')).toBe('toolbar')
    expect(barra.getAttribute('aria-label')).toBe(
      'Ações nas páginas selecionadas',
    )
    for (const nome of [
      'Girar à esquerda',
      'Girar à direita',
      'Mover para antes',
      'Mover para depois',
      'Apagar',
      'Extrair as selecionadas',
    ]) {
      const botao = porNome(nome)
      expect(botao.disabled).toBe(true)
      const dica = document.getElementById(
        botao.getAttribute('aria-describedby')!,
      )
      expect(dica!.textContent).toBe(
        'Selecione uma ou mais páginas para girar, mover, apagar ou extrair.',
      )
    }
    const desfazer = porNome('Desfazer')
    expect(desfazer.disabled).toBe(true)
    expect(
      document.getElementById(desfazer.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe('Ainda não há nada para desfazer.')
    expect(q('organizar-pdf-selecionadas')!.textContent).toBe(
      'Nenhuma página selecionada',
    )
  })

  it('a caixa "Selecionar página N" escolhe a página, habilita a barra e marca o cartão', async () => {
    await abrir('a-3p.pdf')

    await clicar('Selecionar página 2')

    expect(porNome<HTMLInputElement>('Selecionar página 2').checked).toBe(true)
    expect(porNome('Girar à esquerda').disabled).toBe(false)
    expect(porNome('Apagar').disabled).toBe(false)
    expect(q('organizar-pdf-selecionadas')!.textContent).toBe(
      '1 página selecionada',
    )
    expect(todos('organizar-pdf-pagina')[1].dataset.selecionada).toBe('true')
  })

  it('Selecionar todas e Limpar seleção trocam de lugar, e o foco vai junto', async () => {
    await abrir('a-3p.pdf')

    await clicar('Selecionar todas')
    expect(q('organizar-pdf-selecionadas')!.textContent).toBe(
      '3 páginas selecionadas',
    )
    expect(anuncio()).toBe('3 páginas selecionadas.')
    expect(existe('Selecionar todas')).toBe(false)
    expect(focado()).toBe('Limpar seleção')

    await clicar('Limpar seleção')
    expect(q('organizar-pdf-selecionadas')!.textContent).toBe(
      'Nenhuma página selecionada',
    )
    expect(anuncio()).toBe('Seleção limpa.')
    expect(focado()).toBe('Selecionar todas')
  })

  it('a barra é um ponto só no Tab, e as setas andam entre os botões habilitados', async () => {
    await abrir('a-3p.pdf')
    await clicar('Selecionar página 2')

    const barra = q('organizar-pdf-barra')!
    const noTab = () =>
      Array.from(barra.querySelectorAll('button')).filter(
        (b) => b.tabIndex === 0,
      )
    expect(noTab()).toHaveLength(1)

    porNome('Girar à esquerda').focus()
    await teclar(document.activeElement!, { key: 'ArrowRight' })
    expect(focado()).toBe('Girar à direita')
    await teclar(document.activeElement!, { key: 'ArrowLeft' })
    await teclar(document.activeElement!, { key: 'ArrowLeft' })
    expect(focado()).toBe('Limpar seleção')
    await teclar(document.activeElement!, { key: 'End' })
    expect(focado()).toBe('Limpar seleção')
    await teclar(document.activeElement!, { key: 'Home' })
    expect(focado()).toBe('Girar à esquerda')
    expect(noTab().map((b) => b.textContent?.trim())).toEqual([
      'Girar à esquerda',
    ])
  })
})

describe('girar', () => {
  it('o botão rápido gira só a página dele, escreve "girada 90°", anuncia e mantém o foco', async () => {
    await abrir('a-3p.pdf')

    await clicar('Girar a página 2 à direita')

    const [primeira, segunda] = todos('organizar-pdf-pagina')
    expect(segunda.textContent).toContain('girada 90°')
    expect(primeira.textContent).not.toContain('girada')
    expect(anuncio()).toBe('Página 2 girada para 90°.')
    expect(focado()).toBe('Girar a página 2 à direita')

    await clicar('Girar a página 2 à direita')
    expect(anuncio()).toBe('Página 2 girada para 180°.')
  })

  it('na barra, gira as selecionadas para o lado pedido e anuncia quantas', async () => {
    await abrir('a-3p.pdf')
    await clicar('Selecionar página 1')
    await clicar('Selecionar página 3')

    await clicar('Girar à esquerda')

    const paginas = todos('organizar-pdf-pagina')
    expect(paginas[0].textContent).toContain('girada 270°')
    expect(paginas[1].textContent).not.toContain('girada')
    expect(paginas[2].textContent).toContain('girada 270°')
    expect(anuncio()).toBe('2 páginas giradas para a esquerda.')
    expect(focado()).toBe('Girar à esquerda')
  })
})

describe('mover', () => {
  it('Mover para depois anda uma posição, deixa o foco no botão e anuncia a posição', async () => {
    await abrir('a-3p.pdf')
    await clicar('Selecionar página 1')

    await clicar('Mover para depois')

    expect(ordem()).toEqual(['Página 2', 'Página 1', 'Página 3'])
    expect(focado()).toBe('Mover para depois')
    expect(anuncio()).toBe('Página 1 agora está na posição 2 de 3.')
  })

  it('chegando à ponta, o botão fica desabilitado com o motivo e o foco passa para o outro sentido', async () => {
    await abrir('a-2p.pdf')
    await clicar('Selecionar página 1')

    await clicar('Mover para depois')

    expect(ordem()).toEqual(['Página 2', 'Página 1'])
    const depois = porNome('Mover para depois')
    expect(depois.disabled).toBe(true)
    expect(
      document.getElementById(depois.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe('As páginas selecionadas já estão no fim.')
    expect(focado()).toBe('Mover para antes')
  })

  it('várias selecionadas andam juntas e o anúncio diz quantas', async () => {
    await abrir('a-4p.pdf')
    await clicar('Selecionar página 3')
    await clicar('Selecionar página 4')

    await clicar('Mover para antes')

    expect(ordem()).toEqual(['Página 1', 'Página 3', 'Página 4', 'Página 2'])
    expect(anuncio()).toBe('2 páginas movidas para antes.')
  })
})

describe('apagar', () => {
  it('o botão rápido apaga a página, leva o foco à caixa da seguinte e anuncia', async () => {
    await abrir('a-3p.pdf')

    await clicar('Apagar a página 2')

    expect(ordem()).toEqual(['Página 1', 'Página 3'])
    expect(focado()).toBe('Selecionar página 3')
    expect(anuncio()).toBe('Página 2 apagada.')
  })

  it('apagar a última da lista leva o foco à caixa da anterior', async () => {
    await abrir('a-3p.pdf')

    await clicar('Apagar a página 3')

    expect(focado()).toBe('Selecionar página 2')
  })

  it('com uma página só, Apagar fica desabilitado com o motivo perto', async () => {
    await abrir('a-2p.pdf')
    await clicar('Apagar a página 1')

    const apagar = porNome('Apagar a página 2')
    expect(apagar.disabled).toBe(true)
    expect(
      document.getElementById(apagar.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe('O PDF precisa de pelo menos uma página.')
  })

  it('na barra, apaga as selecionadas; com todas selecionadas, fica desabilitado com o motivo', async () => {
    await abrir('a-4p.pdf')
    await clicar('Selecionar página 2')
    await clicar('Selecionar página 3')

    await clicar('Apagar')

    expect(ordem()).toEqual(['Página 1', 'Página 4'])
    expect(anuncio()).toBe('2 páginas apagadas.')
    expect(focado()).toBe('Selecionar página 4')

    await clicar('Selecionar todas')
    const apagar = porNome('Apagar')
    expect(apagar.disabled).toBe(true)
    expect(
      document.getElementById(apagar.getAttribute('aria-describedby')!)!
        .textContent,
    ).toBe(
      'Para apagar, deixe pelo menos uma página sem selecionar: o PDF precisa de uma página.',
    )
  })
})

describe('desfazer', () => {
  it('Desfazer volta a última mudança, com a seleção de antes, e anuncia', async () => {
    await abrir('a-3p.pdf')
    await clicar('Selecionar página 2')
    await clicar('Apagar')
    expect(ordem()).toEqual(['Página 1', 'Página 3'])

    await clicar('Desfazer')

    expect(ordem()).toEqual(['Página 1', 'Página 2', 'Página 3'])
    expect(porNome<HTMLInputElement>('Selecionar página 2').checked).toBe(true)
    expect(anuncio()).toBe('Desfeito.')
  })

  it('volta uma mudança por vez e, sem mais nada, o foco sai do botão desabilitado para a barra', async () => {
    await abrir('a-3p.pdf')
    await clicar('Girar a página 1 à direita')
    await clicar('Girar a página 1 à direita')

    await clicar('Desfazer')
    expect(todos('organizar-pdf-pagina')[0].textContent).toContain('girada 90°')
    expect(focado()).toBe('Desfazer')

    await clicar('Desfazer')
    expect(todos('organizar-pdf-pagina')[0].textContent).not.toContain('girada')
    expect(porNome('Desfazer').disabled).toBe(true)
    expect(q('organizar-pdf-barra')!.contains(document.activeElement)).toBe(
      true,
    )
  })

  it('Ctrl+Z e ⌘+Z desfazem; dentro de campo de texto, não', async () => {
    await abrir('a-3p.pdf')
    await clicar('Apagar a página 1')
    await clicar('Apagar a página 2')
    expect(ordem()).toEqual(['Página 3'])

    await teclar(document.body, { key: 'z', ctrlKey: true })
    expect(ordem()).toEqual(['Página 2', 'Página 3'])
    expect(anuncio()).toBe('Desfeito.')

    const campo = document.createElement('input')
    campo.type = 'text'
    document.body.appendChild(campo)
    await teclar(campo, { key: 'z', metaKey: true })
    expect(ordem()).toEqual(['Página 2', 'Página 3'])
    campo.remove()

    await teclar(document.body, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(ordem()).toEqual(['Página 2', 'Página 3'])

    await teclar(document.body, { key: 'Z', metaKey: true })
    expect(ordem()).toEqual(['Página 1', 'Página 2', 'Página 3'])
  })
})

describe('baixar e extrair', () => {
  it('Gerar PDF organizado manda o plano ao pdf-lib e foca o link com o nome -organizado', async () => {
    const { motor } = await abrir('contrato-4p.pdf')
    await clicar('Girar a página 2 à direita')
    await clicar('Apagar a página 3')
    await clicar('Selecionar página 1')
    await clicar('Mover para depois')
    await clicar('Mover para depois')
    expect(ordem()).toEqual(['Página 2', 'Página 4', 'Página 1'])

    await clicar('Gerar PDF organizado')

    expect(motor.organizadas).toEqual([
      {
        nome: 'contrato-4p.pdf',
        plano: [
          { indice: 1, giro: 90 },
          { indice: 3, giro: 0 },
          { indice: 0, giro: 0 },
        ],
      },
    ])
    const link = porNome<HTMLAnchorElement>('Baixar contrato-4p-organizado.pdf')
    expect(link.getAttribute('download')).toBe('contrato-4p-organizado.pdf')
    expect(link.getAttribute('href')).toMatch(/^blob:/)
    expect(document.activeElement).toBe(link)
    expect(anuncio()).toBe('PDF pronto: 3 páginas, 8 bytes.')
  })

  it('Extrair as selecionadas baixa só elas, na ordem atual e com o giro, com o nome -paginas', async () => {
    const { motor } = await abrir('contrato-4p.pdf')
    await clicar('Selecionar página 4')
    await clicar('Selecionar página 2')
    await clicar('Girar à direita')

    await clicar('Extrair as selecionadas')

    expect(motor.organizadas.at(-1)!.plano).toEqual([
      { indice: 1, giro: 90 },
      { indice: 3, giro: 90 },
    ])
    const link = porNome<HTMLAnchorElement>('Baixar contrato-4p-paginas.pdf')
    expect(link.getAttribute('download')).toBe('contrato-4p-paginas.pdf')
    expect(document.activeElement).toBe(link)
    expect(ordem()).toHaveLength(4)
  })

  it('o nome do download passa pelo nomeDoPdfFinal', async () => {
    await abrir('rel:atório 3p.PDF')

    await clicar('Gerar PDF organizado')

    expect(existe('Baixar rel atório 3p-organizado.pdf')).toBe(true)
  })

  it('mudar as páginas depois de pronto descarta o link e revoga a URL', async () => {
    await abrir('a-2p.pdf')
    await clicar('Gerar PDF organizado')
    const url = porNome('Baixar a-2p-organizado.pdf').getAttribute('href')

    await clicar('Girar a página 1 à direita')

    expect(existe('Baixar a-2p-organizado.pdf')).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('enquanto monta, o foco vai para Cancelar e as ações esperam; Cancelar devolve o foco', async () => {
    const motor = criarMotorFalso({ organizacao: 'nunca' })
    await abrir('a-2p.pdf', { motor })

    await clicar('Gerar PDF organizado')

    expect(focado()).toBe('Cancelar')
    expect(porNome('Girar a página 1 à direita').disabled).toBe(true)
    expect(anuncio()).toBe('Montando o PDF…')

    await clicar('Cancelar')
    expect(anuncio()).toBe('Cancelado.')
    expect(focado()).toBe('Gerar PDF organizado')
    expect(porNome('Girar a página 1 à direita').disabled).toBe(false)
  })

  it('falha ao montar: alerta com o que fazer e o foco volta ao botão', async () => {
    await abrir('a-2p.pdf', {
      motor: criarMotorFalso({ organizacao: { motivo: 'inesperado' } }),
    })

    await clicar('Gerar PDF organizado')

    const alerta = q('organizar-pdf-falha')!
    expect(alerta.getAttribute('role')).toBe('alert')
    expect(alerta.textContent).toBe(
      'O navegador não conseguiu montar o PDF, talvez por falta de memória. Feche outras abas ou recarregue a página e tente de novo.',
    )
    expect(focado()).toBe('Gerar PDF organizado')
  })

  it('leva o mesmo aviso de alcance do mesclar, com os links internos', async () => {
    await abrir('a-2p.pdf')

    expect(container.textContent).toContain(
      'Os marcadores (o índice lateral) não passam para o PDF final, os links para outra página do mesmo PDF deixam de funcionar',
    )
  })
})
