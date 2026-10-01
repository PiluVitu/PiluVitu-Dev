import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cliqueDoUsuarioEmCampo, criarContornos } from './contornos'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML =
    '<input id="a" style="outline: 1px dotted red"><input id="b">'
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const el = (id: string) => document.getElementById(id) as HTMLInputElement
const outline = (id: string) => el(id).style.getPropertyValue('outline')
const novos = () => criarContornos((acao, ms) => setTimeout(acao, ms))

describe('criarContornos', () => {
  it('marca ciano sólido ou âmbar tracejado, com deslocamento de 1 px', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.marcar(el('b'), 'nao-reconhecido')
    expect(outline('a')).toBe('2px solid #38bdf8')
    expect(outline('b')).toBe('2px dashed #f5b82e')
    expect(el('a').style.getPropertyValue('outline-offset')).toBe('1px')
  })

  it('limpar devolve o outline original do site, salvo uma vez só', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'nao-reconhecido')
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    expect(outline('a')).toBe('1px dotted red')
    expect(el('a').style.getPropertyValue('outline-offset')).toBe('')
    expect(outline('b')).toBe('')
  })

  it('destacar pisca (âmbar, apagado, âmbar, apagado, âmbar) e termina no contorno do campo', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.destacar(el('a'))
    const visto = [outline('a')]
    for (let passo = 0; passo < 5; passo++) {
      vi.advanceTimersByTime(200)
      visto.push(outline('a'))
    }
    expect(visto).toEqual([
      '2px dashed #f5b82e',
      '2px dashed transparent',
      '2px dashed #f5b82e',
      '2px dashed transparent',
      '2px dashed #f5b82e',
      '2px solid #38bdf8',
    ])
  })

  it('destacar depois de limpar volta ao original do site', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(1600)
    expect(outline('a')).toBe('1px dotted red')
  })

  it('aviso que some no meio do pisca não deixa contorno velho para trás', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'nao-reconhecido')
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(300)
    contornos.limpar()
    vi.advanceTimersByTime(1000)
    expect(outline('a')).toBe('1px dotted red')
  })

  it('reinjetar no meio do pisca (timers cancelados) devolve o outline do site, mesmo com o aviso já fechado', () => {
    // Como o ctx.onInvalidated: os timers da instância antiga somem e só o limpar() roda.
    const timers: ReturnType<typeof setTimeout>[] = []
    const contornos = criarContornos((acao, ms) => {
      timers.push(setTimeout(acao, ms))
    })
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(300)
    timers.forEach(clearTimeout)
    contornos.limpar()
    expect(outline('a')).toBe('1px dotted red')
  })
})

describe('cliqueDoUsuarioEmCampo', () => {
  it('só vale para evento confiável do usuário dentro de um campo', () => {
    const campo = el('b')
    const div = document.createElement('div')
    expect(
      cliqueDoUsuarioEmCampo({ isTrusted: false, composedPath: () => [campo] }),
    ).toBe(false)
    expect(
      cliqueDoUsuarioEmCampo({ isTrusted: true, composedPath: () => [div] }),
    ).toBe(false)
    expect(
      cliqueDoUsuarioEmCampo({
        isTrusted: true,
        composedPath: () => [campo, document.body],
      }),
    ).toBe(true)
  })
})
