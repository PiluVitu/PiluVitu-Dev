import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CommitmentReportView } from '../lib/commitments'
import type { ByCategoryReportView } from '../lib/categories'
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

const LARGURA_PADRAO_JSDOM = 1024

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

function larguraDoWrapper(container: HTMLElement): string {
  const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement
  return wrapper.style.width
}

afterEach(() => {
  setViewportWidth(LARGURA_PADRAO_JSDOM)
})

describe('GraficoComprometido — largura responsiva (Task 6, fix round 1)', () => {
  // Fix round 1: a largura fixa (640px) original escondia metade da janela
  // de 6 meses no Android (~390px), o dispositivo PRIMÁRIO do dono pra
  // registrar gasto — e `#/` é a tela que ele vê primeiro. Este teste prova
  // que a largura acompanha o viewport, não fica travada em 640.
  it('em viewport estreito (Android, ~390px) a largura acompanha o innerWidth, não fica travada em 640', () => {
    setViewportWidth(390)

    const { container } = render(<GraficoComprometido report={report} />)

    // innerWidth (390) - margem (64) = 326, dentro do piso/teto
    expect(larguraDoWrapper(container)).toBe('326px')
  })

  it('em viewport largo (MacBook) respeita o teto de 640px em vez de esticar sem limite', () => {
    setViewportWidth(1440)

    const { container } = render(<GraficoComprometido report={report} />)

    expect(larguraDoWrapper(container)).toBe('640px')
  })

  it('em viewport muito estreito respeita um piso mínimo em vez de espremer até ilegível', () => {
    setViewportWidth(240)

    const { container } = render(<GraficoComprometido report={report} />)

    expect(larguraDoWrapper(container)).toBe('280px')
  })

  it('acompanha resize em runtime (rotação de tela / redimensionar janela)', () => {
    setViewportWidth(390)
    const { container } = render(<GraficoComprometido report={report} />)
    expect(larguraDoWrapper(container)).toBe('326px')

    setViewportWidth(800)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(larguraDoWrapper(container)).toBe('640px')
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
  afterEach(() => {
    setViewportWidth(LARGURA_PADRAO_JSDOM)
  })

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

  it('em viewport estreito (Android, ~390px) a largura acompanha o innerWidth — mesmo hook de GraficoComprometido', () => {
    setViewportWidth(390)

    const { container } = render(<GraficoCategorias report={categoryReport} />)

    expect(larguraDoWrapper(container)).toBe('326px')
  })
})
