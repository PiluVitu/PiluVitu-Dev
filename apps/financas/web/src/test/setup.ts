import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'

// Sem `globals: true` o auto-cleanup da Testing Library não se registra.
afterEach(() => {
  cleanup()
})

/**
 * Pré-aquece o chunk lazy do gráfico (fix de flake, ver CLAUDE.md § Home).
 * `BlocoComprometido.tsx`, `BlocoCategorias.tsx` e `pages/commitments.tsx`
 * fazem, cada um, seu PRÓPRIO `lazy(() => import('.../GraficoComprometido'))`
 * — três wrappers `lazy()` diferentes, mas os três resolvem o MESMO módulo
 * real, que importa `recharts` (~104 KB gzip). O `import()` de dentro de um
 * `lazy()` só é disparado na PRIMEIRA vez que o React tenta renderizar
 * aquele componente, e em teste isso é uma transformação/avaliação REAL do
 * módulo (recharts + as dependências dele) — não instantânea. Esse
 * `import()` acontece uma única vez por ARQUIVO de teste (module registry
 * isolado por arquivo) e fica em cache pro resto do arquivo — só que QUAL
 * teste dispara essa carga pela primeira vez é acidental, não controlado:
 * pode ser um teste que nunca espera pelo gráfico (ex.: o 1º teste de
 * `home.test.tsx`, que só confere headings — presentes mesmo antes do
 * `report` chegar), deixando a carga "em voo" pra um teste POSTERIOR que aí
 * sim faz `waitFor(() => getByTestId('grafico-...'))`.
 *
 * MEDIDO: rodando a suíte inteira repetidamente (sob a carga de todos os
 * arquivos em paralelo), essa transformação real ocasionalmente ultrapassa
 * o timeout padrão do `waitFor` (1000 ms) — sempre no mesmo ponto (o
 * fallback `aria-busy="true"` do `<Suspense>` ainda no DOM), nunca por uma
 * asserção errada. Não é lentidão do CI a mais — é o `import()` de verdade
 * competindo contra um timeout que não tem relação nenhuma com quanto tempo
 * carregar um módulo leva.
 *
 * Fix: pagar esse custo aqui, num `beforeAll` isolado — hook timeout padrão
 * do Vitest é 10 s, não os 1 s do `waitFor` — ANTES de qualquer teste do
 * arquivo rodar, em vez de deixar cair em qualquer teste ao acaso. Depois
 * disso, o `import()` de dentro do `lazy()` de produção resolve a partir do
 * módulo JÁ carregado (mesmo module registry do arquivo) — o `<Suspense>`
 * não espera mais por um carregamento real durante os testes, só pela
 * microtask normal do React, bem dentro de qualquer `waitFor`.
 *
 * NÃO de-lazifica nada em produção: o `lazy()`/`Suspense` dos três
 * consumidores continua intocado — só o AMBIENTE DE TESTE paga o custo de
 * carregamento antes, de propósito, em vez de deixar a corrida acontecer.
 * `scripts/check-financas-lazy-chart.mjs` (rodado no `build`, fora do
 * alcance deste setup de teste) continua sendo quem garante que `recharts`
 * fica fora do bundle principal — este `beforeAll` não afeta o bundle, só a
 * ORDEM em que o módulo é carregado dentro da suíte de teste.
 */
beforeAll(async () => {
  await import('../blocos/GraficoComprometido')
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

/**
 * `scrollIntoView` NÃO existe no jsdom — ele não faz layout, então nada que
 * dependa de posição de scroll é implementado. Sem este polyfill, qualquer
 * componente que chame o método quebra com `el.scrollIntoView is not a
 * function`, e o erro aparece como se fosse defeito do código de produção.
 *
 * ⚠️ **É polyfill, não mock global cego.** Fica como `vi.fn()` justamente
 * pra que um teste possa AFIRMAR a chamada e os argumentos — o `#/extrato`
 * usa `{ block: 'nearest' }` e a escolha desse valor é carregada de razão
 * (rolar o mínimo, e só quando o alerta está fora da vista), então ela
 * precisa ser verificável, não só tolerada.
 */
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }
})
