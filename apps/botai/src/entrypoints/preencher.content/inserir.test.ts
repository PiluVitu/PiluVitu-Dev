import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
