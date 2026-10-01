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

  it('outline do site só em longhands, com prioridades mistas, volta igual', () => {
    // O jsdom não expande o shorthand `outline`, então aqui o defeito não aparece; no Chrome,
    // ler `outline` com só longhands dá '' e restaurar pelo shorthand apagava o outline do site.
    const b = el('b')
    b.style.setProperty('outline-color', 'red', 'important')
    b.style.setProperty('outline-width', '3px')
    const contornos = novos()
    contornos.marcar(b, 'preenchido')
    contornos.limpar()
    expect(b.style.getPropertyValue('outline-color')).toBe('red')
    expect(b.style.getPropertyPriority('outline-color')).toBe('important')
    expect(b.style.getPropertyValue('outline-width')).toBe('3px')
    expect(b.style.getPropertyPriority('outline-width')).toBe('')
    expect(b.style.getPropertyValue('outline-offset')).toBe('')
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

  it('Mostrar clicado duas vezes seguidas e reinjeção no meio do 2º pisca ainda devolve o outline do site', () => {
    // O fim do 1º pisca (aos 1000 ms) não pode tirar o campo do conjunto enquanto o 2º
    // (que começou aos 500 ms) ainda está agendado: senão o limpar() da reinjeção o esquece
    // e o campo fica com o apagado/âmbar do pisca para sempre.
    const timers: ReturnType<typeof setTimeout>[] = []
    const contornos = criarContornos((acao, ms) => {
      timers.push(setTimeout(acao, ms))
    })
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(500)
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(700)
    timers.forEach(clearTimeout)
    contornos.limpar()
    expect(outline('a')).toBe('1px dotted red')
  })

  it('Mostrar clicado duas vezes seguidas termina no contorno do campo, sem passo velho do 1º pisca por cima', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(500)
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(500)
    expect(outline('a')).toBe('2px dashed #f5b82e')
    vi.advanceTimersByTime(500)
    expect(outline('a')).toBe('2px solid #38bdf8')
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
