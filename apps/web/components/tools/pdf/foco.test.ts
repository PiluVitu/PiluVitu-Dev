import { ehCampoDeTexto, podeTerFoco } from './foco'

function criar<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  atributos: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag)
  for (const [nome, valor] of Object.entries(atributos)) {
    elemento.setAttribute(nome, valor)
  }
  document.body.appendChild(elemento)
  return elemento
}

afterEach(() => document.body.replaceChildren())

describe('ehCampoDeTexto (onde o Ctrl+Z é de quem escreve)', () => {
  it.each(['text', 'number', 'search', 'email'])('input %s é', (type) => {
    expect(ehCampoDeTexto(criar('input', { type }))).toBe(true)
  })

  it('textarea e conteúdo editável são', () => {
    expect(ehCampoDeTexto(criar('textarea'))).toBe(true)
    const editavel = criar('div', { contenteditable: 'true' })
    Object.defineProperty(editavel, 'isContentEditable', { value: true })
    expect(ehCampoDeTexto(editavel)).toBe(true)
  })

  it.each(['checkbox', 'color', 'button', 'file', 'radio', 'range'])(
    'input %s não é',
    (type) => {
      expect(ehCampoDeTexto(criar('input', { type }))).toBe(false)
    },
  )

  it('botão, select, a janela e nada não são', () => {
    expect(ehCampoDeTexto(criar('button'))).toBe(false)
    expect(ehCampoDeTexto(criar('select'))).toBe(false)
    expect(ehCampoDeTexto(window)).toBe(false)
    expect(ehCampoDeTexto(null)).toBe(false)
  })
})

describe('podeTerFoco', () => {
  it('só elemento na página e habilitado', () => {
    const botao = criar('button')
    expect(podeTerFoco(botao)).toBe(true)
    botao.disabled = true
    expect(podeTerFoco(botao)).toBe(false)
    expect(podeTerFoco(document.createElement('button'))).toBe(false)
    expect(podeTerFoco(null)).toBe(false)
  })
})
