import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `main.tsx` monta a árvore real (`App` → `Gate` → Better Auth client, que
// dispara fetch de sessão) — fora de escopo pro que este teste prova (o
// boot sobrevive a `localStorage` indisponível). `./App` é mockado por um
// stub simples: o que importa aqui é que `createRoot(...).render(...)`
// FOI chamado e montou alguma coisa, não a árvore inteira do app.
vi.mock('./App', () => ({
  App: () => <div data-testid="app-montado" />,
}))

/**
 * M5 (fix final): `main.tsx` chama `aplicarTema(temaSalvo())` — que lê E
 * ESCREVE `localStorage` (`src/lib/theme.ts`) — ANTES de
 * `createRoot(...).render(...)`. `localStorage` pode LANÇAR em vez de só
 * faltar (Safari com storage particionado/privado, cookies bloqueados).
 * Sem o try/catch em volta dessa chamada, a exceção é síncrona e
 * interrompe o módulo antes mesmo de chegar no `createRoot` — não é
 * "perde o tema", é a tela inteira em branco, sem nenhum React montado.
 * `index.html` tem o mesmo risco (script inline síncrono no `<head>`,
 * também corrigido) — coberto por leitura de texto, já que não há DOM
 * de verdade pra montar antes do bundle carregar.
 */
describe('main.tsx — boot resiliente a localStorage indisponível (M5, fix final)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>'
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('localStorage.getItem lançando (storage particionado/privado) não impede o app de montar', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado pelo navegador', 'SecurityError')
    })

    await act(async () => {
      await import('./main')
    })

    expect(
      document.querySelector('[data-testid="app-montado"]'),
    ).toBeInTheDocument()
  })

  it('localStorage.setItem lançando (aplicarTema escreve) também não impede o app de montar', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado pelo navegador', 'SecurityError')
    })

    await act(async () => {
      await import('./main')
    })

    expect(
      document.querySelector('[data-testid="app-montado"]'),
    ).toBeInTheDocument()
  })

  it('caminho feliz (localStorage disponível) continua montando o app normalmente', async () => {
    await act(async () => {
      await import('./main')
    })

    expect(
      document.querySelector('[data-testid="app-montado"]'),
    ).toBeInTheDocument()
  })
})
