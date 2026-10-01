import { describe, expect, it } from 'vitest'
import { criarRegistro } from './registro'

describe('criarRegistro', () => {
  it('guarda em sequência e devolve o elemento pelo idx', () => {
    document.body.innerHTML = '<input id="a"><input id="b">'
    const registro = criarRegistro()
    const a = document.getElementById('a') as HTMLInputElement
    const b = document.getElementById('b') as HTMLInputElement
    expect([registro.guardar(a), registro.guardar(b)]).toEqual([1, 2])
    expect(registro.buscar(2)).toBe(b)
    expect(registro.buscar(3)).toBeUndefined()
  })

  it('campo que saiu da página não é devolvido', () => {
    document.body.innerHTML = '<input id="a">'
    const registro = criarRegistro()
    const a = document.getElementById('a') as HTMLInputElement
    const idx = registro.guardar(a)
    a.remove()
    expect(registro.buscar(idx)).toBeUndefined()
  })
})
