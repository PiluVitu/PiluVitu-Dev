import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sem `globals: true` o auto-cleanup da Testing Library não se registra.
afterEach(() => {
  cleanup()
})

/**
 * Stub de `ResizeObserver` (Important 1, fix final) — jsdom não implementa
 * (mesma lacuna documentada pra `matchMedia`). `GraficoComprometido.tsx`/
 * `GraficoCategorias` (`blocos/GraficoComprometido.tsx`) passaram a medir
 * o CONTAINER real via `ResizeObserver` em vez de `window.innerWidth`
 * (Important 1 — a versão antiga estourava o card dentro do grid
 * `md:grid-cols-2`, ver CLAUDE.md). Sem este stub o hook simplesmente não
 * observaria nada (`typeof ResizeObserver === 'undefined'`) e o teste não
 * teria como provar a medição.
 *
 * Lê `target.clientWidth` no momento do `observe()` — igual ao
 * `ResizeObserver` real, que entrega uma medição inicial assim que
 * observação começa. jsdom não calcula layout, então `clientWidth` de
 * qualquer elemento é 0 a menos que o teste sobrescreva via
 * `Object.defineProperty` (mesmo padrão que os testes já usavam pra
 * `window.innerWidth`).
 *
 * `triggerResize()` é exportado só para teste: simula um reflow do
 * container em runtime (resize de janela, mudança de grid) sem precisar
 * desmontar/remontar o componente — reconsulta `clientWidth` e redispara
 * pra todo observer inscrito naquele elemento.
 */
type Watcher = { callback: ResizeObserverCallback }

const resizeWatchers = new Map<Element, Set<Watcher>>()

function dispatchResize(target: Element, watcher: Watcher): void {
  const entry = {
    target,
    contentRect: { width: target.clientWidth } as DOMRectReadOnly,
  } as ResizeObserverEntry
  watcher.callback([entry], {} as ResizeObserver)
}

class ResizeObserverStub {
  #watcher: Watcher

  constructor(callback: ResizeObserverCallback) {
    this.#watcher = { callback }
  }

  observe(target: Element): void {
    let set = resizeWatchers.get(target)
    if (!set) {
      set = new Set()
      resizeWatchers.set(target, set)
    }
    set.add(this.#watcher)
    dispatchResize(target, this.#watcher)
  }

  unobserve(target: Element): void {
    resizeWatchers.get(target)?.delete(this.#watcher)
  }

  disconnect(): void {
    for (const set of resizeWatchers.values()) set.delete(this.#watcher)
  }
}

export function triggerResize(target: Element): void {
  for (const watcher of resizeWatchers.get(target) ?? []) {
    dispatchResize(target, watcher)
  }
}

// Stub simplificado (só observe/unobserve/disconnect) — suficiente pro
// que os hooks de produção usam.
globalThis.ResizeObserver =
  ResizeObserverStub as unknown as typeof ResizeObserver

afterEach(() => {
  resizeWatchers.clear()
})
