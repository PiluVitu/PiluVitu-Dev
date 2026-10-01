import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { inserirNoFoco } from './inserir'

const fechadas = new Map<Element, ShadowRoot>()

beforeEach(() => {
  fechadas.clear()
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) =>
      el.shadowRoot ?? fechadas.get(el) ?? null,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

function focar(html: string): HTMLInputElement {
  document.body.innerHTML = html
  const el = document.querySelector('input') as HTMLInputElement
  el.focus()
  return el
}

describe('inserirNoFoco', () => {
  it('escreve no campo focado o valor do kind pedido', () => {
    const el = focar(
      '<label>Código de indicação <input name="ref_code"></label>',
    )
    expect(inserirNoFoco(P, 'cpf')).toEqual({ ok: true })
    expect(el.value).toBe(P.cpf)
  })

  it('formata para o campo: data de nascimento num type=date vai em aaaa-mm-dd', () => {
    const el = focar('<input type="date" name="d">')
    expect(inserirNoFoco(P, 'nascimento')).toEqual({ ok: true })
    expect(el.value).toBe(P.nascimento.iso)
  })

  it('sem campo em foco não faz nada', () => {
    document.body.innerHTML = '<input name="cep">'
    expect(inserirNoFoco(P, 'cep')).toEqual({ ok: false, motivo: 'sem-foco' })
  })

  it('checkbox em foco não conta como campo', () => {
    focar('<input type="checkbox" name="termos">')
    expect(inserirNoFoco(P, 'cpf')).toEqual({ ok: false, motivo: 'sem-foco' })
  })

  it('campo somente leitura recusa', () => {
    focar('<input name="cep" readonly>')
    expect(inserirNoFoco(P, 'cep')).toEqual({ ok: false, motivo: 'recusado' })
  })

  it('valor que não cabe no maxlength é recusado sem truncar', () => {
    const el = focar('<input type="password" name="s" maxlength="6">')
    expect(inserirNoFoco(P, 'senha')).toEqual({ ok: false, motivo: 'recusado' })
    expect(el.value).toBe('')
  })

  it('atravessa shadow root aberta e fechada até o campo focado', () => {
    document.body.innerHTML = '<div id="a"></div><div id="f"></div>'
    const aberta = (document.getElementById('a') as HTMLElement).attachShadow({
      mode: 'open',
    })
    aberta.innerHTML = '<input name="x">'
    const dentroDaAberta = aberta.querySelector('input') as HTMLInputElement
    dentroDaAberta.focus()
    expect(inserirNoFoco(P, 'email')).toEqual({ ok: true })
    expect(dentroDaAberta.value).toBe(P.email.endereco)

    const host = document.getElementById('f') as HTMLElement
    const fechada = host.attachShadow({ mode: 'closed' })
    fechada.innerHTML = '<input name="y">'
    fechadas.set(host, fechada)
    const dentroDaFechada = fechada.querySelector('input') as HTMLInputElement
    dentroDaFechada.focus()
    expect(inserirNoFoco(P, 'cep')).toEqual({ ok: true })
    expect(dentroDaFechada.value).toBe(P.endereco.cep)
  })
})

describe('inserirNoFoco com o alvo do menu (Firefox)', () => {
  const getTargetElement = vi.fn<(alvoId: number) => Element | null>()

  beforeEach(() => {
    getTargetElement.mockReset()
    Object.assign(fakeBrowser, { menus: { getTargetElement } })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(fakeBrowser, 'menus')
  })

  function doisCampos(htmlDoClicado = '<input name="clicado">') {
    document.body.innerHTML = `<input name="focado">${htmlDoClicado}`
    const focado = document.querySelector('[name="focado"]') as HTMLInputElement
    const clicado = document.querySelector(
      '[name="clicado"]',
    ) as HTMLInputElement
    focado.focus()
    return { focado, clicado }
  }

  it('no Firefox, escreve no campo do clique, mesmo com outro campo em foco', () => {
    vi.stubEnv('FIREFOX', 'true')
    const { focado, clicado } = doisCampos()
    getTargetElement.mockImplementation((id) => (id === 42 ? clicado : null))
    expect(inserirNoFoco(P, 'cpf', 42)).toEqual({ ok: true })
    expect(clicado.value).toBe(P.cpf)
    expect(focado.value).toBe('')
  })

  it('no Firefox, o campo de senha clicado recebe a senha', () => {
    vi.stubEnv('FIREFOX', 'true')
    const { clicado } = doisCampos('<input type="password" name="clicado">')
    getTargetElement.mockReturnValue(clicado)
    expect(inserirNoFoco(P, 'senha', 7)).toEqual({ ok: true })
    expect(clicado.value).toBe(P.senha)
  })

  it('no Firefox, id expirado (null) ou elemento que saiu da página caem no campo em foco', () => {
    vi.stubEnv('FIREFOX', 'true')
    const { focado } = doisCampos()
    getTargetElement.mockReturnValue(null)
    expect(inserirNoFoco(P, 'cpf', 42)).toEqual({ ok: true })
    expect(focado.value).toBe(P.cpf)

    focado.value = ''
    getTargetElement.mockReturnValue(document.createElement('input'))
    expect(inserirNoFoco(P, 'cep', 42)).toEqual({ ok: true })
    expect(focado.value).toBe(P.endereco.cep)
  })

  it('no Chrome, um alvoId que chegue é ignorado: vale o foco', () => {
    const { focado, clicado } = doisCampos()
    expect(inserirNoFoco(P, 'cpf', 42)).toEqual({ ok: true })
    expect(focado.value).toBe(P.cpf)
    expect(clicado.value).toBe('')
    expect(getTargetElement).not.toHaveBeenCalled()
  })
})
