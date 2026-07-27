import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CommitmentReportView } from '../lib/commitments'
import type { ByCategoryReportView } from '../lib/categories'
import { triggerResize } from '../test/setup'
import GraficoComprometido, { GraficoCategorias } from './GraficoComprometido'

const report: CommitmentReportView = {
  competences: [
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
  ],
  rows: [
    {
      account_id: 'a1',
      account_name: 'Nubank cartão',
      cells: [200000, 180000, 150000, 120000, 90000, 60000],
    },
  ],
  totals: [200000, 180000, 150000, 120000, 90000, 60000],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [55, 51, 50, 49, 25, 10],
}

const LARGURA_MAXIMA = 640

function larguraDoWrapper(container: HTMLElement): number {
  const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement
  return Number(wrapper.style.width.replace('px', ''))
}

/**
 * Simula o container medindo `largura` — o `ResizeObserver` real (stubado
 * em `src/test/setup.ts`) entrega essa medição assim que `observe()` é
 * chamado, mas jsdom não computa layout: `clientWidth` de QUALQUER
 * elemento é 0 até o teste sobrescrever explicitamente, mesmo padrão que
 * `setViewportWidth` fazia com `window.innerWidth` antes deste fix
 * (Important 1). `triggerResize` (do stub) redispara o observer inscrito
 * no elemento, simulando tanto a medição inicial quanto um reflow em
 * runtime.
 */
function medirContainer(elemento: HTMLElement, largura: number): void {
  Object.defineProperty(elemento, 'clientWidth', {
    configurable: true,
    value: largura,
  })
  act(() => {
    triggerResize(elemento)
  })
}

describe('GraficoComprometido — largura acompanha o CONTAINER (Important 1, fix final)', () => {
  // ⚠️ Important 2 (fix final): este describe NÃO fixa a largura numa
  // constante (`toBe('640px')`) — essa era exatamente a falha que deixou
  // o Important 1 passar batido na revisão anterior: com o container
  // real 2,4× mais estreito que o gráfico (262px vs 640px, MEDIDO em
  // 1280×900 com o grid `md:grid-cols-2` da Task 7), o teste antigo
  // continuava verde porque comparava a fórmula contra si mesma
  // (`window.innerWidth`), nunca contra um container de verdade — jsdom
  // não tem layout, então nada detectava o estouro. Os testes abaixo
  // afirmam a RELAÇÃO (largura do gráfico ≤ largura do container) contra
  // um container medido explicitamente, que é o que de fato importa pra
  // não esconder meses da janela atrás de scroll sem aviso.
  it('em container estreito (MEDIDO: 1280×900 dentro do grid md:grid-cols-2 → 262px), a largura NUNCA ultrapassa o container', () => {
    const { container } = render(<GraficoComprometido report={report} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-comprometido"]',
    ) as HTMLElement

    medirContainer(wrapper, 262)

    const largura = larguraDoWrapper(container)
    expect(largura).toBeLessThanOrEqual(262)
    expect(largura).toBe(262)
  })

  it('em container de largura de Android (MEDIDO: 390px de viewport → 308px de container), a largura acompanha o container', () => {
    const { container } = render(<GraficoComprometido report={report} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-comprometido"]',
    ) as HTMLElement

    medirContainer(wrapper, 308)

    const largura = larguraDoWrapper(container)
    expect(largura).toBeLessThanOrEqual(308)
    expect(largura).toBe(308)
  })

  it('em container largo (MacBook sem grid, ex. 900px) respeita o teto de 640px em vez de esticar sem limite', () => {
    const { container } = render(<GraficoComprometido report={report} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-comprometido"]',
    ) as HTMLElement

    medirContainer(wrapper, 900)

    const largura = larguraDoWrapper(container)
    expect(largura).toBeLessThanOrEqual(wrapper.clientWidth)
    expect(largura).toBe(LARGURA_MAXIMA)
  })

  it('acompanha reflow em runtime (resize de janela, grid recalculando) — não só a medição inicial', () => {
    const { container } = render(<GraficoComprometido report={report} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-comprometido"]',
    ) as HTMLElement

    medirContainer(wrapper, 262)
    expect(larguraDoWrapper(container)).toBe(262)

    medirContainer(wrapper, 500)
    expect(larguraDoWrapper(container)).toBeLessThanOrEqual(500)
    expect(larguraDoWrapper(container)).toBe(500)
  })

  it('sem nenhuma medição real (clientWidth 0, elemento nunca chegou a ter layout), mantém o fallback em vez de zerar o gráfico', () => {
    const { container } = render(<GraficoComprometido report={report} />)

    // Nenhum `medirContainer` chamado — `clientWidth` do wrapper continua
    // 0 (default do jsdom), e o hook ignora medições de 0 (guarda
    // `largura > 0`) em vez de propagar um gráfico de largura zero.
    expect(larguraDoWrapper(container)).toBe(LARGURA_MAXIMA)
  })
})

// `GraficoCategorias` (Task 8, "para onde foi o dinheiro") mora NESTE
// arquivo — não em `GraficoCategorias.tsx` separado — de propósito: os dois
// componentes são a ÚNICA fronteira `lazy()` que carrega `recharts` nesta
// SPA, e um segundo arquivo importando `recharts` de novo criaria um
// SEGUNDO chunk de ~104 KB gzip pro mesmo pacote (ver
// BlocoCategorias.tsx e scripts/check-financas-lazy-chart.mjs). Testado
// no MESMO arquivo de teste do componente que já existia, mesma convenção
// de colocation (um arquivo fonte, um arquivo de teste).
const categoryReport: ByCategoryReportView = {
  competence: '2026-07',
  rows: [
    {
      category_id: 'c-das',
      category_name: 'DAS — Simples Nacional',
      category_slug: 'das',
      total_cents: -50000,
    },
    {
      category_id: 'c-contador',
      category_name: 'Contador',
      category_slug: 'contador',
      total_cents: -30000,
    },
    {
      category_id: null,
      category_name: 'Sem categoria',
      category_slug: null,
      total_cents: -10000,
    },
  ],
  total_cents: -90000,
}

describe('GraficoCategorias — barras horizontais, uma por categoria', () => {
  it('desenha uma barra por linha do relatório', () => {
    const { container } = render(<GraficoCategorias report={categoryReport} />)

    const barras = container.querySelectorAll('.recharts-rectangle')
    expect(barras.length).toBe(3)
  })

  it('pinta "Sem categoria" (category_id null) numa cor DIFERENTE das categorias reais — nunca por nome/slug', () => {
    // Armadilha explícita do brief: `categories.slug` é nullable, então uma
    // categoria REAL do usuário também pode ter slug nulo (o segundo caso
    // abaixo). Só `category_id === null` pode decidir a cor "sem categoria".
    const report: ByCategoryReportView = {
      competence: '2026-07',
      rows: [
        {
          category_id: null,
          category_name: 'Sem categoria',
          category_slug: null,
          total_cents: -10000,
        },
        {
          category_id: 'c-real-sem-slug',
          category_name: 'Categoria real sem slug',
          category_slug: null,
          total_cents: -20000,
        },
      ],
      total_cents: -30000,
    }

    const { container } = render(<GraficoCategorias report={report} />)

    const barras = container.querySelectorAll('.recharts-rectangle')
    expect(barras.length).toBe(2)
    const fills = Array.from(barras).map((b) => b.getAttribute('fill'))

    // ordem = ordem de `rows` (a API já ordena, o componente não reordena)
    expect(fills[0]).toBe('hsl(var(--muted-foreground))') // Sem categoria (category_id null)
    expect(fills[1]).toBe('hsl(var(--primary))') // categoria REAL, slug nulo — não é "sem categoria"

    for (const fill of fills) {
      expect(fill).not.toMatch(/^#/)
      expect(fill).toMatch(/^hsl\(var\(--/)
    }
  })

  it('em container estreito (Android, ~308px) a largura acompanha o container — mesmo hook de GraficoComprometido (Important 1)', () => {
    const { container } = render(<GraficoCategorias report={categoryReport} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-categorias"]',
    ) as HTMLElement

    medirContainer(wrapper, 308)

    const largura = larguraDoWrapper(container)
    expect(largura).toBeLessThanOrEqual(308)
    expect(largura).toBe(308)
  })
})
