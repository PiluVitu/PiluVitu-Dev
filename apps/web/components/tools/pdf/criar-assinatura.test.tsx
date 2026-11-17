import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Ponto } from '@piluvitu/tools/pdf-regras'
import { desenharAssinatura } from './assinatura-desenhada'
import {
  CriarAssinatura,
  ESPESSURA_DA_ASSINATURA,
  type AssinaturaPronta,
  type JeitoDeAssinar,
} from './criar-assinatura'
import { prepararImagem } from './imagem-inserida'
import { CORES } from './objetos'
import { TEXTOS } from './textos'

jest.mock('./assinatura-desenhada', () => ({ desenharAssinatura: jest.fn() }))
jest.mock('./imagem-inserida', () => ({
  ...jest.requireActual('./imagem-inserida'),
  prepararImagem: jest.fn(),
}))

const T = TEXTOS.assinatura
const desenhar = desenharAssinatura as jest.MockedFunction<
  typeof desenharAssinatura
>
const preparar = prepararImagem as jest.MockedFunction<typeof prepararImagem>

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  desenhar.mockReset()
  preparar.mockReset()
  desenhar.mockResolvedValue({
    blob: new Blob(['png'], { type: 'image/png' }),
    largura: 1200,
    altura: 400,
    reduzida: false,
  })
  let proxima = 0
  URL.createObjectURL = jest.fn(() => `blob:previa-${proxima++}`)
  URL.revokeObjectURL = jest.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function montar({
  aoCriar = jest.fn(),
  aoAnunciar = jest.fn(),
  aoCancelar,
  jeitoInicial,
}: {
  aoCriar?: jest.Mock
  aoAnunciar?: jest.Mock
  aoCancelar?: () => void
  jeitoInicial?: JeitoDeAssinar
} = {}) {
  act(() =>
    root.render(
      <CriarAssinatura
        aoCriar={aoCriar}
        aoAnunciar={aoAnunciar}
        aoCancelar={aoCancelar}
        jeitoInicial={jeitoInicial}
      />,
    ),
  )
  return { aoCriar, aoAnunciar }
}

const q = (testId: string) =>
  container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

function porTexto<T extends HTMLElement = HTMLButtonElement>(texto: string) {
  const achado = Array.from(
    container.querySelectorAll<HTMLElement>('button, label'),
  ).find((el) => el.textContent?.trim() === texto)
  if (!achado) throw new Error(`nada com o texto "${texto}"`)
  return achado as T
}

const radio = (texto: string) =>
  porTexto<HTMLLabelElement>(texto).querySelector('input')!

const descricao = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ')

async function esperar(ms = 10) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

async function clicar(alvo: HTMLElement) {
  await act(async () => {
    alvo.focus()
    alvo.click()
  })
  await esperar()
}

async function escolherJeito(texto: string) {
  await act(async () => {
    radio(texto).click()
  })
}

const quadro = () => q('quadro-assinatura')!

function medirQuadro() {
  quadro().getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 300,
      bottom: 100,
      width: 300,
      height: 100,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect
}

async function ponteiro(
  tipo: 'pointerdown' | 'pointermove' | 'pointerup',
  { x, y }: Ponto,
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
    pointerType: { value: 'mouse' },
    pressure: { value: 0.5 },
  })
  await act(async () => {
    quadro().dispatchEvent(evento)
  })
}

async function tracar(de: Ponto, ate: Ponto) {
  await ponteiro('pointerdown', de)
  await ponteiro('pointermove', { x: (de.x + ate.x) / 2, y: de.y + 5 })
  await ponteiro('pointermove', ate)
  await ponteiro('pointerup', ate)
}

async function digitar(campo: HTMLInputElement, valor: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(campo, valor)
    campo.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function escolherArquivo(arquivo: File) {
  const input = q('criar-assinatura-input') as HTMLInputElement
  Object.defineProperty(input, 'files', {
    value: Object.assign([arquivo], { item: () => arquivo }),
    configurable: true,
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await esperar()
}

const png = (nome: string) =>
  new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)], nome, {
    type: 'image/png',
  })

it('o aviso de que assinatura visual não é digital vem no topo, antes dos três jeitos', () => {
  montar()
  const aviso = q('aviso-assinatura-visual')!
  expect(aviso.textContent).toContain(T.aviso.titulo)
  expect(aviso.textContent).toContain('ICP-Brasil, gov.br')
  const jeitos = container.querySelector('fieldset')!
  expect(
    aviso.compareDocumentPosition(jeitos) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
})

it('os jeitos são três botões de opção nativos num fieldset "Como assinar", com o foco na marcada ao abrir', () => {
  montar()
  const fieldset = container.querySelector('fieldset')!
  expect(fieldset.querySelector('legend')!.textContent).toBe('Como assinar')
  const radios = Array.from(
    fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  )
  expect(radios.map((r) => r.closest('label')!.textContent?.trim())).toEqual([
    'Desenhar',
    'Enviar imagem',
    'Digitar o nome',
  ])
  expect(new Set(radios.map((r) => r.name)).size).toBe(1)
  expect(
    radios.every((r) => r.tabIndex === 0 || !r.hasAttribute('tabindex')),
  ).toBe(true)
  expect(radios[0].checked).toBe(true)
  expect(document.activeElement).toBe(radios[0])
})

it('com outro jeito inicial, o foco vai para ele', () => {
  montar({ jeitoInicial: 'digitar' })
  expect(document.activeElement).toBe(radio('Digitar o nome'))
  expect(radio('Digitar o nome').checked).toBe(true)
})

describe('desenhar', () => {
  it('o quadro tem nome e a dica, fica fora do Tab, e só ele trava a rolagem do toque', () => {
    montar()
    const elemento = quadro()
    expect(elemento.getAttribute('role')).toBe('img')
    expect(elemento.getAttribute('aria-label')).toBe('Quadro da assinatura')
    expect(descricao(elemento)).toBe(T.quadro.dica)
    expect(elemento.hasAttribute('tabindex')).toBe(false)
    expect(elemento.className).toContain('touch-none')
    expect(
      Array.from(container.querySelectorAll('.touch-none')).filter(
        (el) => el !== elemento,
      ),
    ).toEqual([])
    expect(q('quadro-assinatura-linha')).not.toBeNull()
  })

  it('o traço do ponteiro aparece no quadro, na cor da tinta', async () => {
    montar()
    medirQuadro()
    await tracar({ x: 30, y: 50 }, { x: 120, y: 40 })
    const tracos = container.querySelectorAll(
      '[data-testid="quadro-assinatura-traco"]',
    )
    expect(tracos).toHaveLength(1)
    expect(tracos[0].getAttribute('fill')).toBe(CORES.preto)

    const cor = container.querySelector<HTMLSelectElement>('select')!
    expect(container.querySelector(`label[for="${cor.id}"]`)!.textContent).toBe(
      'Cor da tinta',
    )
    expect(Array.from(cor.options).map((o) => o.textContent)).toEqual([
      'Preto',
      'Azul',
    ])
    await act(async () => {
      cor.value = 'azul'
      cor.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(
      container
        .querySelector('[data-testid="quadro-assinatura-traco"]')!
        .getAttribute('fill'),
    ).toBe(CORES.azul)
  })

  it('vazio: Limpar e Usar ficam com aria-disabled e o motivo escrito, e não fazem nada', async () => {
    const { aoCriar } = montar()
    const limpar = porTexto('Limpar')
    const usar = porTexto('Usar esta assinatura')
    for (const botao of [limpar, usar]) {
      expect(botao.getAttribute('aria-disabled')).toBe('true')
      expect(botao.disabled).toBe(false)
      expect(descricao(botao)).toBe('O quadro está vazio.')
    }
    await clicar(usar)
    expect(aoCriar).not.toHaveBeenCalled()
    expect(desenhar).not.toHaveBeenCalled()
  })

  it('Limpar apaga os traços, anuncia e o foco fica no botão (não cai no body)', async () => {
    const { aoAnunciar } = montar()
    medirQuadro()
    await tracar({ x: 30, y: 50 }, { x: 120, y: 40 })
    const limpar = porTexto('Limpar')
    expect(limpar.hasAttribute('aria-disabled')).toBe(false)

    await clicar(limpar)
    expect(
      container.querySelectorAll('[data-testid="quadro-assinatura-traco"]'),
    ).toHaveLength(0)
    expect(aoAnunciar).toHaveBeenLastCalledWith('Quadro limpo.')
    expect(document.activeElement).toBe(limpar)
    expect(limpar.getAttribute('aria-disabled')).toBe('true')
  })

  it('Usar desenha o PNG com os traços (em unidades do quadro) e o entrega', async () => {
    const { aoCriar } = montar()
    medirQuadro()
    await tracar({ x: 30, y: 50 }, { x: 120, y: 40 })
    await clicar(porTexto('Usar esta assinatura'))

    expect(desenhar).toHaveBeenCalledTimes(1)
    const [tracos, estilo] = desenhar.mock.calls[0]
    // O quadro medido tem 300 px para 600 unidades: cada pixel vale 2.
    expect(tracos[0][0]).toEqual([60, 100])
    expect(estilo).toEqual({
      cor: CORES.preto,
      espessura: ESPESSURA_DA_ASSINATURA,
    })
    const pronta: AssinaturaPronta = aoCriar.mock.calls[0][0]
    expect(pronta).toMatchObject({
      tipo: 'imagem',
      jeito: 'desenhada',
      largura: 1200,
      altura: 400,
    })
  })

  it('o navegador que não desenha e o aoCriar que recusa aparecem em role=alert', async () => {
    const aoCriar = jest.fn(() => 'Passou do teto.')
    montar({ aoCriar })
    medirQuadro()
    await tracar({ x: 30, y: 50 }, { x: 120, y: 40 })

    await clicar(porTexto('Usar esta assinatura'))
    expect(q('criar-assinatura-erro')!.getAttribute('role')).toBe('alert')
    expect(q('criar-assinatura-erro')!.textContent).toBe('Passou do teto.')

    desenhar.mockRejectedValueOnce({ motivo: 'falha_do_navegador' })
    await clicar(porTexto('Usar esta assinatura'))
    expect(q('criar-assinatura-erro')!.textContent).toBe(T.falha)
  })
})

describe('enviar imagem', () => {
  it('a escolha, o "Tirar o fundo branco" marcado com a dica, e a prévia sobre o xadrez', async () => {
    preparar.mockResolvedValue({
      blob: new Blob(['png'], { type: 'image/png' }),
      largura: 800,
      altura: 300,
      reduzida: false,
    })
    const { aoCriar } = montar({ jeitoInicial: 'enviar' })
    const input = q('criar-assinatura-input') as HTMLInputElement
    expect(input.accept).toBe('image/png,image/jpeg,.png,.jpg,.jpeg')
    const abriu = jest.fn()
    input.addEventListener('click', abriu)
    await clicar(porTexto('Escolher imagem da assinatura'))
    expect(abriu).toHaveBeenCalled()

    const fundo = porTexto<HTMLLabelElement>('Tirar o fundo branco')
    const caixa = document.getElementById(fundo.htmlFor) as HTMLInputElement
    expect(caixa.checked).toBe(true)
    expect(descricao(caixa)).toBe(T.enviar.dicaDoFundo)
    expect(porTexto('Usar esta assinatura').getAttribute('aria-disabled')).toBe(
      'true',
    )

    const arquivo = png('minha.png')
    await escolherArquivo(arquivo)
    expect(preparar).toHaveBeenLastCalledWith(arquivo, {
      tirarFundoBranco: true,
    })
    expect(q('criar-assinatura-previa')!.querySelector('img')!.src).toBe(
      'blob:previa-0',
    )
    expect(container.textContent).toContain('minha.png, 800 por 300 pixels.')

    // Desmarcar prepara de novo a mesma imagem, agora sem tirar o fundo.
    await act(async () => caixa.click())
    await esperar()
    expect(preparar).toHaveBeenLastCalledWith(arquivo, {
      tirarFundoBranco: false,
    })
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:previa-0')

    await clicar(porTexto('Usar esta assinatura'))
    expect(aoCriar.mock.calls[0][0]).toMatchObject({
      tipo: 'imagem',
      jeito: 'enviada',
      arquivo: 'minha.png',
      largura: 800,
      altura: 300,
    })
  })

  it('o que não é PNG nem JPEG é recusado em role=alert, com a mensagem da imagem', async () => {
    preparar.mockRejectedValue({ motivo: 'nao_aceita' })
    montar({ jeitoInicial: 'enviar' })
    await escolherArquivo(png('foto.gif'))
    const recusa = q('criar-assinatura-recusa')!
    expect(recusa.getAttribute('role')).toBe('alert')
    expect(recusa.textContent).toBe(TEXTOS.editar.imagem.naoAceita('foto.gif'))
    expect(porTexto('Usar esta assinatura').getAttribute('aria-disabled')).toBe(
      'true',
    )
  })
})

describe('digitar o nome', () => {
  it('"Seu nome" com autocomplete, a prévia em Times itálico e a cor; Usar entrega o texto', async () => {
    const { aoCriar } = montar({ jeitoInicial: 'digitar' })
    const rotulo = porTexto<HTMLLabelElement>('Seu nome')
    const campo = document.getElementById(rotulo.htmlFor) as HTMLInputElement
    expect(campo.autocomplete).toBe('name')
    expect(porTexto('Usar esta assinatura').getAttribute('aria-disabled')).toBe(
      'true',
    )
    expect(descricao(porTexto('Usar esta assinatura'))).toBe(
      'Escreva o seu nome primeiro.',
    )

    await digitar(campo, 'Ana Souza ')
    const previa = q('criar-assinatura-nome')!
    expect(previa.textContent).toBe('Ana Souza ')
    expect(previa.style.fontStyle).toBe('italic')
    expect(previa.style.fontFamily).toMatch(/Times/)
    expect(previa.getAttribute('aria-hidden')).toBe('true')

    await clicar(porTexto('Usar esta assinatura'))
    expect(aoCriar).toHaveBeenCalledWith({
      tipo: 'texto',
      jeito: 'digitada',
      nome: 'Ana Souza',
      cor: CORES.preto,
    })
  })

  it('caractere fora das fontes do PDF nem entra, com o aviso em role=alert', async () => {
    montar({ jeitoInicial: 'digitar' })
    const campo = document.getElementById(
      porTexto<HTMLLabelElement>('Seu nome').htmlFor,
    ) as HTMLInputElement
    await digitar(campo, 'Ana ✍️')
    expect(campo.value).toBe('Ana ')
    const aviso = q('criar-assinatura-winansi')!
    expect(aviso.getAttribute('role')).toBe('alert')
    expect(aviso.textContent).toMatch(/fontes do PDF não/)
  })
})

it('Cancelar só aparece quando há para onde voltar', async () => {
  montar()
  expect(() => porTexto('Cancelar')).toThrow()
  const aoCancelar = jest.fn()
  montar({ aoCancelar })
  await clicar(porTexto('Cancelar'))
  expect(aoCancelar).toHaveBeenCalled()
})

it('trocar de jeito guarda o que cada um já tinha', async () => {
  montar()
  medirQuadro()
  await tracar({ x: 30, y: 50 }, { x: 120, y: 40 })
  await escolherJeito('Digitar o nome')
  expect(q('quadro-assinatura')).toBeNull()
  await escolherJeito('Desenhar')
  expect(
    container.querySelectorAll('[data-testid="quadro-assinatura-traco"]'),
  ).toHaveLength(1)
})
