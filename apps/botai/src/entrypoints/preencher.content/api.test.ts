import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { ContentScriptContext } from 'wxt/utils/content-script-context'
import { simularLayout } from '../../test/layout'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { criarApi, type ComBotai } from './api'
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
  Reflect.deleteProperty(globalThis, '__botai')
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

  it('reinjetar (o atalho de novo) invalida a instância antiga e devolve o outline do site', () => {
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
  it('é registrado em runtime, sem CSS automático nem postMessage, e o main instala __botai', () => {
    expect(conteudo).toMatchObject({
      registration: 'runtime',
      cssInjectionMode: 'manual',
      noScriptStartedPostMessage: true,
    })
    void conteudo.main(new ContentScriptContext('preencher'))
    const api = (globalThis as ComBotai).__botai
    expect(api && Object.keys(api).sort()).toEqual([
      'aviso',
      'inserir',
      'mostrar',
      'preencher',
    ])
  })
})

describe('2ª passada do CEP', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<label>CEP <input name="cep"></label><label>Rua <input name="rua"></label><label>Complemento <input name="complemento"></label>'
  })

  afterEach(() => vi.useRealTimers())

  // Como um formulário que chama o ViaCEP no input do CEP e sobrescreve o complemento 200 ms depois.
  function simularBuscaDeCep() {
    const buscas = vi.fn()
    const cep = document.querySelector('[name="cep"]') as HTMLInputElement
    cep.addEventListener('input', () => {
      buscas()
      setTimeout(() => {
        ;(
          document.querySelector('[name="complemento"]') as HTMLInputElement
        ).value = 'de 612 a 1510 - lado par'
      }, 200)
    })
    return buscas
  }

  const complemento = () =>
    (document.querySelector('[name="complemento"]') as HTMLInputElement).value

  it('a busca do site troca o complemento e, ~1 s depois, a mesma instância devolve o da pessoa', () => {
    const buscas = simularBuscaDeCep()
    const resultado = criarApi(new ContentScriptContext('preencher')).preencher(
      P,
      HOJE,
    )
    const devolvido = structuredClone(resultado)
    vi.advanceTimersByTime(200)
    expect(complemento()).toBe('de 612 a 1510 - lado par')
    vi.advanceTimersByTime(800)
    expect(complemento()).toBe(P.endereco.complemento)
    expect(buscas).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual(devolvido)
  })

  it('reinjetar antes de 1 s cancela a 2ª passada da instância antiga', () => {
    simularBuscaDeCep()
    criarApi(new ContentScriptContext('preencher')).preencher(P, HOJE)
    vi.advanceTimersByTime(200)
    new ContentScriptContext('preencher')
    vi.advanceTimersByTime(800)
    expect(complemento()).toBe('de 612 a 1510 - lado par')
  })
})
