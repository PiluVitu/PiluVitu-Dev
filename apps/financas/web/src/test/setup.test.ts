/// <reference types="vitest/jsdom" />
import { afterEach, describe, expect, it } from 'vitest'

/**
 * No Node 25+ o webstorage experimental vem ligado: `localStorage` e
 * `sessionStorage` já existem no global do Node (getters que devolvem
 * `undefined` sem `--localstorage-file`). O ambiente jsdom do Vitest só copia
 * para o global as chaves da janela que o Node ainda não tem, então o Storage
 * do jsdom ficava de fora e todo teste que toca o tema quebrava no Node 26
 * ("Cannot read properties of undefined (reading 'clear')"). O setup.ts põe
 * o Storage do jsdom no global explicitamente; este arquivo trava isso em
 * qualquer versão do Node (rode no 26 para ver o caso que importa).
 */
describe('setup dos testes: o Storage é o do jsdom', () => {
  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it.each(['localStorage', 'sessionStorage'] as const)(
    '%s é o da janela do jsdom, não o webstorage do Node',
    (chave) => {
      expect(globalThis[chave]).toBe(jsdom.window[chave])
      expect(globalThis[chave]).toBeInstanceOf(jsdom.window.Storage)
    },
  )

  it('grava e lê como um Storage de navegador', () => {
    localStorage.setItem('financas-tema', 'escuro')
    sessionStorage.setItem('chave', 'valor')

    expect(localStorage.getItem('financas-tema')).toBe('escuro')
    expect(window.localStorage.getItem('financas-tema')).toBe('escuro')
    expect(sessionStorage.getItem('chave')).toBe('valor')
    expect(localStorage.getItem('ausente')).toBeNull()
  })
})
