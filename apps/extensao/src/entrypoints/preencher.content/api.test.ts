import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { ContentScriptContext } from 'wxt/utils/content-script-context'
import { simularLayout } from '../../test/layout'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { criarApi, type ComPv } from './api'
import conteudo from './index'

const HOJE = '2026-10-01'
const rolar = vi.fn()
let desfazerLayout: () => void

beforeEach(() => {
  rolar.mockReset()
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) => el.shadowRoot,
  })
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: rolar,
    configurable: true,
    writable: true,
  })
  desfazerLayout = simularLayout()
  document.body.innerHTML =
    '<label>Nome completo <input name="nome" style="outline: 1px dotted red"></label><label>Código de indicação <input name="ref_code"></label>'
})

afterEach(() => {
  desfazerLayout()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  Reflect.deleteProperty(globalThis, '__pv')
  document.body.innerHTML = ''
})

const nome = () => document.querySelector('[name="nome"]') as HTMLInputElement
const outlineDoNome = () => nome().style.getPropertyValue('outline')

describe('criarApi', () => {
  it('preencher devolve o resultado do frame e contorna os campos', () => {
    const resultado = criarApi(new ContentScriptContext('preencher')).preencher(
      P,
      HOJE,
    )
    expect(resultado.preenchidos.map((l) => l.rotulo)).toEqual([
      'Nome completo',
    ])
    expect(resultado.naoReconhecidos.map((l) => l.rotulo)).toEqual([
      'Código de indicação',
    ])
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
  })

  it('reinjetar (Alt+Shift+P de novo) invalida a instância antiga e devolve o outline do site', () => {
    criarApi(new ContentScriptContext('preencher')).preencher(P, HOJE)
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
    const nova = new ContentScriptContext('preencher')
    expect(outlineDoNome()).toBe('1px dotted red')
    criarApi(nova).preencher(P, HOJE)
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
    nova.abort()
    expect(outlineDoNome()).toBe('1px dotted red')
  })

  it('evento de foco disparado por script não tira os contornos', () => {
    criarApi(new ContentScriptContext('preencher')).preencher(P, HOJE)
    nome().dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, composed: true }),
    )
    nome().dispatchEvent(
      new Event('pointerdown', { bubbles: true, composed: true }),
    )
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
  })

  it('mostrar rola até o campo do idx; idx desconhecido devolve false', () => {
    const api = criarApi(new ContentScriptContext('preencher'))
    const { naoReconhecidos } = api.preencher(P, HOJE)
    expect(api.mostrar(naoReconhecidos[0].idx)).toBe(true)
    expect(rolar).toHaveBeenCalledWith({ block: 'center' })
    expect(api.mostrar(9999)).toBe(false)
  })

  it('inserir escreve no campo em foco', () => {
    const api = criarApi(new ContentScriptContext('preencher'))
    const refCode = document.querySelector(
      '[name="ref_code"]',
    ) as HTMLInputElement
    refCode.focus()
    expect(api.inserir(P, 'cpf')).toEqual({ ok: true })
    expect(refCode.value).toBe(P.cpf)
  })
})

describe('content script preencher', () => {
  it('é registrado em runtime, sem CSS automático nem postMessage, e o main instala __pv', () => {
    expect(conteudo).toMatchObject({
      registration: 'runtime',
      cssInjectionMode: 'manual',
      noScriptStartedPostMessage: true,
    })
    void conteudo.main(new ContentScriptContext('preencher'))
    const pv = (globalThis as ComPv).__pv
    expect(pv && Object.keys(pv).sort()).toEqual([
      'aviso',
      'inserir',
      'mostrar',
      'preencher',
    ])
  })
})
