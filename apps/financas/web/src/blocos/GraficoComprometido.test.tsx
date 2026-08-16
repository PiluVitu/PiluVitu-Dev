import { act, render } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CashflowReportView } from '../lib/cashflow'
import type { CommitmentReportView } from '../lib/commitments'
import type { ByCategoryReportView } from '../lib/categories'
import { triggerResize } from '../test/setup'
import GraficoComprometido, {
  formatarLinhaTooltipFluxo,
  GraficoCategorias,
  GraficoFluxo,
} from './GraficoComprometido'

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
  // Degenerado (min === max) de propósito neste describe — o foco aqui é
  // largura/container, não faixa; a faixa em si é coberta no describe mais
  // abaixo ("GraficoComprometido — faixa min/max").
  totals: [200000, 180000, 150000, 120000, 90000, 60000].map((v) => ({
    min: v,
    max: v,
  })),
  fixed_net_cents: 360000,
  pct_of_fixed_net: [55, 51, 50, 49, 25, 10].map((v) => ({ min: v, max: v })),
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

// Task 6 (fatia ⑥, §5 do spec): a barra precisa representar uma FAIXA
// min/max, não um valor único. Implementado como duas `<Bar>` empilhadas
// (`stackId` compartilhado) — ver comentário de `COR_FAIXA_OPACIDADE` em
// GraficoComprometido.tsx pro raciocínio completo.
describe('GraficoComprometido — faixa min/max', () => {
  it('faixa DEGENERADA (min === max, o caso comum) desenha uma barra só por competência — nunca duas', () => {
    // Mesmo achado MEDIDO já documentado no arquivo de produção: uma barra
    // de valor EXATAMENTE 0 não renderiza <path class="recharts-rectangle">
    // — o segmento "faixaAdicional" (max - min = 0) simplesmente não
    // aparece no DOM, sobrando só o segmento "min". 6 competências, todas
    // degeneradas ⇒ 6 retângulos, nunca 12.
    const { container } = render(<GraficoComprometido report={report} />)

    const barras = container.querySelectorAll('.recharts-rectangle')
    expect(barras.length).toBe(6)
  })

  it('faixa DE VERDADE (min !== max, ex. DAS variando) desenha DOIS segmentos empilhados pra aquela competência', () => {
    const reportComFaixa: CommitmentReportView = {
      ...report,
      totals: [
        { min: 240000, max: 298800 }, // DAS: piso R$ 2.400, teto R$ 2.988
        ...report.totals.slice(1),
      ],
    }

    const { container } = render(
      <GraficoComprometido report={reportComFaixa} />,
    )

    // 5 competências degeneradas (1 retângulo cada) + 1 com faixa de
    // verdade (2 retângulos: "min" + "faixaAdicional") = 7.
    const barras = container.querySelectorAll('.recharts-rectangle')
    expect(barras.length).toBe(7)
  })

  it('cor decidida pelo TETO (pct.max), não pelo piso — piso abaixo do limiar, teto acima, ainda pinta de alerta', () => {
    // As outras 5 competências ficam num pct BAIXO e degenerado (10%, bem
    // abaixo do limiar) — só a 1ª testa a faixa cruzando o limiar; as
    // demais só existem pra provar que elas SEGUEM na cor padrão, sem
    // "contaminar" a leitura da 1ª.
    const reportCruzandoLimiar: CommitmentReportView = {
      ...report,
      totals: [{ min: 240000, max: 298800 }, ...report.totals.slice(1)],
      pct_of_fixed_net: [
        { min: 40, max: 66 }, // piso 40% (abaixo de 50), teto 66% (acima)
        ...Array.from({ length: 5 }, () => ({ min: 10, max: 10 })),
      ],
    }

    const { container } = render(
      <GraficoComprometido report={reportCruzandoLimiar} />,
    )

    // Ordem de inserção no SVG: recharts desenha série a série — as 6
    // Cell da <Bar dataKey="min"> primeiro (índices 0-5, uma por
    // competência), só depois a única Cell não-zero da <Bar
    // dataKey="faixaAdicional"> (índice 6, a da 1ª competência — as outras
    // 5 são degeneradas e não renderizam nada).
    const barras = container.querySelectorAll('.recharts-rectangle')
    expect(barras.length).toBe(7)
    const fills = Array.from(barras).map((b) => b.getAttribute('fill'))

    // 1ª competência: piso 40% (abaixo do limiar) — SE a cor fosse
    // decidida pelo piso, este segmento sairia na cor padrão. Ela sai de
    // alerta porque o TETO (66%) está acima.
    expect(fills[0]).toBe('hsl(var(--destructive))')
    // As 5 competências seguintes (10%, bem abaixo) continuam na cor padrão.
    expect(fills.slice(1, 6)).toEqual(Array(5).fill('hsl(var(--primary))'))
    // O segmento faixaAdicional da 1ª competência acompanha a mesma cor de
    // alerta do segmento min — nunca uma cor diferente/nova.
    expect(fills[6]).toBe('hsl(var(--destructive))')
  })

  it('o segmento "faixaAdicional" usa opacidade reduzida (marca visual de incerteza), nunca uma cor nova', () => {
    const reportComFaixa: CommitmentReportView = {
      ...report,
      totals: [{ min: 240000, max: 298800 }, ...report.totals.slice(1)],
    }

    const { container } = render(
      <GraficoComprometido report={reportComFaixa} />,
    )

    const barras = Array.from(container.querySelectorAll('.recharts-rectangle'))
    const opacidades = barras.map((b) => b.getAttribute('fill-opacity'))
    // Uma das 7 barras (o segmento faixaAdicional da 1ª competência) tem
    // opacidade reduzida; as outras 6 (segmentos "min") não têm o atributo
    // (opacidade default 1).
    expect(opacidades.filter((o) => o === '0.45')).toHaveLength(1)
  })
})

// ② O eixo X rotulava 3 de 6 competências — e o mês CORRENTE (a primeira
// barra, a que a tela existe pra responder) era um dos NÃO rotulados,
// MEDIDO a 390px E a 1280px. `interval={0}` + tick sem o ano.
describe('GraficoComprometido — o eixo X rotula TODAS as competências (②)', () => {
  /**
   * ⚠️ MEDIDO (recharts 3.10.1): o rótulo do tick NÃO é descendente de
   * `.recharts-xAxis` — o recharts hoista os textos pra um layer de
   * z-index próprio (`recharts-zIndex-layer_2000`), irmão do eixo. Um
   * seletor `.recharts-xAxis .recharts-cartesian-axis-tick-value` casa
   * ZERO elementos e faria este teste "passar" por vacuidade em qualquer
   * asserção de ausência. A âncora certa é o grupo dos rótulos.
   */
  function ticksDoEixoX(container: HTMLElement): string[] {
    return Array.from(
      container.querySelectorAll(
        '.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
      ),
    ).map((t) => t.textContent ?? '')
  }

  // ⚠️ **O QUE ESTE describe PROVA, E O QUE NÃO PROVA — medido, não
  // suposto.** A decisão de pular rótulo é do recharts e depende da LARGURA
  // MEDIDA do texto (`getStringSize`, que lê `offsetWidth` de um span
  // oculto). No jsdom `offsetWidth` é sempre 0 ⇒ nenhum rótulo jamais se
  // sobrepõe ⇒ os seis saem no DOM com ou sem `interval={0}`. CONFIRMADO
  // por mutação: removendo `interval={0}` do `<XAxis>`, os 26 casos deste
  // arquivo continuam verdes. Ou seja: `interval={0}` (a rede que garante
  // o comportamento independente da métrica de texto do navegador) NÃO é
  // observável aqui, e nenhuma asserção abaixo deve ser lida como prova
  // dele. O que ESTES testes travam é a outra metade do fix — o tick
  // ENCURTADO, que é o que faz seis rótulos CABEREM em 262px — e essa
  // metade é mutation-sensitive (tirar o `tickFormatter` derruba os dois).
  it('as SEIS competências aparecem no eixo — nenhuma omitida, incluindo a primeira (mês corrente)', () => {
    // Container estreito de propósito: 262px é a medida REAL do card da
    // home a 1280×900 (grid md:grid-cols-2) — a largura em que o recharts
    // decidia sozinho pular rótulos num navegador de verdade.
    const { container } = render(<GraficoComprometido report={report} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-comprometido"]',
    ) as HTMLElement
    medirContainer(wrapper, 262)

    const ticks = ticksDoEixoX(container)
    expect(ticks).toEqual(['ago', 'set', 'out', 'nov', 'dez', 'jan'])
  })

  it('o tick perde o ANO (cabe em 262px), mas o tooltip continua com a competência inteira — o ano não some da tela', () => {
    const { container } = render(<GraficoComprometido report={report} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-comprometido"]',
    ) as HTMLElement
    medirContainer(wrapper, 262)

    // O tick é só o mês…
    const ticks = ticksDoEixoX(container)
    expect(ticks).toHaveLength(report.competences.length)
    expect(ticks).not.toContain('ago/26')
    for (const t of ticks) expect(t).not.toMatch(/\//)

    // …mas o `dataKey` do eixo (o que o Tooltip usa de cabeçalho) continua
    // sendo `rotulo`, com o ano. Trocar o dataKey pelo rótulo curto — o
    // atalho óbvio — levaria o ano embora junto, e a virada dez→jan
    // deixaria de ser conferível em qualquer lugar da tela.
    expect(container.querySelector('.recharts-xAxis')).toBeInTheDocument()
  })
})

// ⑤ ACESSIBILIDADE: as duas cores das barras foram MEDIDAS a 1,80:1 (claro)
// e 1,31:1 (escuro) uma contra a outra — em escala de cinza ou sob sol são
// a MESMA barra. Cor não pode ser o único sinal de risco.
describe('GraficoComprometido — risco tem sinal NÃO-CROMÁTICO, não só cor (⑤)', () => {
  const reportComRisco: CommitmentReportView = {
    ...report,
    // 1ª competência 73% (acima do limiar), as outras 5 em 10% — o teste
    // consegue distinguir "só a em risco recebeu o tratamento" de "todas
    // receberam".
    pct_of_fixed_net: [
      { min: 73, max: 73 },
      ...Array.from({ length: 5 }, () => ({ min: 10, max: 10 })),
    ],
  }

  it('a barra em risco ganha CONTORNO TRACEJADO (canal de forma, sobrevive a escala de cinza) — as demais não', () => {
    const { container } = render(
      <GraficoComprometido report={reportComRisco} />,
    )

    const barras = Array.from(container.querySelectorAll('.recharts-rectangle'))
    expect(barras.length).toBe(6)

    const tracejadas = barras.filter(
      (b) => b.getAttribute('stroke-dasharray') === '3 2',
    )
    expect(tracejadas).toHaveLength(1)
    expect(barras.indexOf(tracejadas[0])).toBe(0) // a 1ª competência, a de 73%

    // O traço usa --foreground, NUNCA --destructive: o vermelho é
    // justamente a cor que falhou a medição de contraste; o que precisa
    // sobreviver aqui é a LUMINÂNCIA, não o matiz.
    expect(tracejadas[0].getAttribute('stroke')).toBe('hsl(var(--foreground))')
    expect(tracejadas[0].getAttribute('stroke')).not.toBe(
      'hsl(var(--destructive))',
    )
  })

  it('a barra em risco ganha o % ESCRITO (canal de texto) — e ele diz QUANTO, coisa que a cor nunca disse', () => {
    const { container } = render(
      <GraficoComprometido report={reportComRisco} />,
    )

    const rotulos = Array.from(
      container.querySelectorAll('.recharts-label-list text'),
    )
      .map((t) => t.textContent ?? '')
      .filter((t) => t !== '')

    // Só a competência em risco recebe rótulo — as de 10% ficam com string
    // vazia (nenhum texto no DOM).
    expect(rotulos).toEqual(['73%'])
  })

  it('sem NENHUMA competência em risco, nada de tracejado nem de rótulo — o sinal só aparece quando há risco', () => {
    const reportSemRisco: CommitmentReportView = {
      ...report,
      pct_of_fixed_net: Array.from({ length: 6 }, () => ({ min: 10, max: 10 })),
    }

    const { container } = render(
      <GraficoComprometido report={reportSemRisco} />,
    )

    const tracejadas = Array.from(
      container.querySelectorAll('.recharts-rectangle'),
    ).filter((b) => b.getAttribute('stroke-dasharray') === '3 2')
    expect(tracejadas).toHaveLength(0)

    const rotulos = Array.from(
      container.querySelectorAll('.recharts-label-list text'),
    )
      .map((t) => t.textContent ?? '')
      .filter((t) => t !== '')
    expect(rotulos).toEqual([])
  })

  it('o sinal segue o TETO da faixa (decisão 2: teto no Comprometido), nunca o piso', () => {
    const reportFaixaCruzando: CommitmentReportView = {
      ...report,
      totals: [{ min: 240000, max: 298800 }, ...report.totals.slice(1)],
      pct_of_fixed_net: [
        { min: 40, max: 66 }, // piso 40% (abaixo), teto 66% (acima)
        ...Array.from({ length: 5 }, () => ({ min: 10, max: 10 })),
      ],
    }

    const { container } = render(
      <GraficoComprometido report={reportFaixaCruzando} />,
    )

    // Se o sinal olhasse o PISO (40%), não haveria tracejado nenhum.
    const tracejadas = Array.from(
      container.querySelectorAll('.recharts-rectangle'),
    ).filter((b) => b.getAttribute('stroke-dasharray') === '3 2')
    // os DOIS segmentos empilhados daquela competência (piso + faixa)
    expect(tracejadas).toHaveLength(2)

    const rotulos = Array.from(
      container.querySelectorAll('.recharts-label-list text'),
    )
      .map((t) => t.textContent ?? '')
      .filter((t) => t !== '')
    // e o rótulo mostra a FAIXA inteira, não só o teto
    expect(rotulos).toEqual(['40% a 66%'])
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

  // ④ Até aqui o valor de cada categoria existia SÓ dentro do `<Tooltip>` —
  // num Android, ler quanto foi gasto em "DAS" exigia tocar a barra certa e
  // manter o dedo lá. Agora o número é texto permanente ao lado da barra.
  it('escreve o valor em BRL ao lado de CADA barra — o número não vive mais só no tooltip', () => {
    const { container } = render(<GraficoCategorias report={categoryReport} />)

    const rotulos = Array.from(
      container.querySelectorAll('.recharts-label-list text'),
    ).map((t) => t.textContent ?? '')

    // uma etiqueta por linha do relatório, na MESMA ordem (a API ordena,
    // o componente não reordena)
    expect(rotulos).toEqual(['R$ 500,00', 'R$ 300,00', 'R$ 100,00'])
  })

  it('o valor escrito é BRL formatado, nunca os centavos crus que vêm da API', () => {
    const { container } = render(<GraficoCategorias report={categoryReport} />)

    const texto = Array.from(
      container.querySelectorAll('.recharts-label-list text'),
    )
      .map((t) => t.textContent ?? '')
      .join(' ')

    // `-50000` (centavos, negativo) viraria "50000"/"-50000" sem
    // `formatBRL`/`Math.abs` — os dois seriam ilegíveis como dinheiro.
    expect(texto).not.toMatch(/50000/)
    expect(texto).not.toMatch(/-/)
    expect(texto).toContain('R$ 500,00')
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

// `GraficoFluxo` (Task 3, fatia ⑧ — mapa de fluxo de caixa) mora NESTE
// arquivo, não em `GraficoFluxo.tsx` separado — mesma razão de
// `GraficoCategorias` acima: um terceiro arquivo importando `recharts` de
// novo criaria um TERCEIRO chunk de ~104 KB gzip pro mesmo pacote.
// `pages/fluxo.tsx` resolve o `import()` pro MESMO módulo físico
// (`import('../blocos/GraficoComprometido').then(m => ({ default:
// m.GraficoFluxo }))`), então o custo de `recharts` continua pago uma vez
// só. `scripts/check-financas-lazy-chart.mjs` continua válido sem
// alteração — o gate verifica "o marcador de recharts está fora do chunk
// de entrada e dentro de ALGUM chunk lazy", não quantos gráficos moram lá.
const cashflowReport: CashflowReportView = {
  meses: ['2026-06', '2026-07', '2026-08'],
  linhas: [
    {
      competence: '2026-06',
      entrou_cents: 500000,
      saiu_cents: 200000,
      saldo_cents: 300000,
      acumulado_cents: 300000,
    },
    {
      competence: '2026-07',
      entrou_cents: 400000,
      saiu_cents: 350000,
      saldo_cents: 50000,
      acumulado_cents: 350000,
    },
    // Mês sem movimento nenhum (entrou/saiu zerados) — o caso que o spec
    // exige aparecer "zerado, nunca ausente" (coberto na tabela de
    // `pages/fluxo.test.tsx`; aqui serve pra provar que o gráfico não
    // quebra com uma barra de valor exatamente 0, mesmo achado MEDIDO já
    // documentado pra GraficoComprometido/GraficoCategorias: uma barra
    // EXATAMENTE 0 não renderiza <path class="recharts-rectangle">.
    {
      competence: '2026-08',
      entrou_cents: 0,
      saiu_cents: 0,
      saldo_cents: 0,
      acumulado_cents: 350000,
    },
  ],
}

describe('GraficoFluxo — barras de entrada/saída + área do acumulado (Task 1, fatia ⑨)', () => {
  // `GraficoFluxo` usa `ChartContainer` (`@piluvitu/ui/chart`, novo nesta
  // task), que embute `ResponsiveContainer` do recharts — diferente dos
  // outros dois gráficos deste arquivo (hook `useLarguraContainer` manual).
  //
  // ⚠️ MEDIDO: `ResponsiveContainer`, quando existe um `ResizeObserver`
  // GLOBAL, ignora a medição inicial (`initialDimension`) e passa a
  // depender do PRIMEIRO callback do observer pra decidir o tamanho — e o
  // stub de `src/test/setup.ts` (ligado pros outros dois gráficos, que só
  // olham `clientWidth`) só preenche `contentRect.width`, nunca
  // `contentRect.height`. Isso faz `ResponsiveContainer` computar
  // `containerHeight: NaN` e não renderizar NADA (guarda
  // `isAcceptableSize`), mesmo com `getBoundingClientRect` mockado — a
  // dispatch síncrona do `observe()` do stub sobrescreve a medição boa
  // logo em seguida. Corrigido removendo o `ResizeObserver` global só
  // durante este describe: sem ele, `ResponsiveContainer` mantém o
  // `initialDimension` default do shadcn (320×200, ver `chart.tsx`) —
  // mesmo mecanismo que os testes de `packages/ui/src/chart.test.tsx` já
  // usam (lá nunca existiu `ResizeObserver` global pra começo de conversa).
  const resizeObserverOriginal = globalThis.ResizeObserver

  beforeAll(() => {
    ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
      undefined
  })

  afterAll(() => {
    globalThis.ResizeObserver = resizeObserverOriginal
  })

  it('desenha duas barras (entrou/saiu) por mês com movimento, mais uma ÁREA de acumulado', () => {
    const { container } = render(<GraficoFluxo report={cashflowReport} />)

    // 2 meses com movimento (jun, jul) x 2 séries (entrou, saiu) = 4
    // retângulos. Ago não contribui nenhum retângulo — as duas séries
    // ficam em 0 naquele mês (ver comentário no fixture acima).
    const barras = container.querySelectorAll('.recharts-rectangle')
    expect(barras.length).toBe(4)

    // a área do acumulado sempre existe, independente de mês zerado —
    // acumulado nunca é 0 nos 3 meses deste fixture. `recharts-area-area`
    // é o preenchimento sob a curva (o que faz ser ÁREA, não linha);
    // `recharts-area-curve` é o traço por cima.
    expect(container.querySelector('.recharts-area-area')).toBeInTheDocument()
    expect(container.querySelector('.recharts-area-curve')).toBeInTheDocument()
    // Nunca mais uma <Line> — a série virou área de propósito (pedido do
    // dono, ver comentário em GraficoComprometido.tsx).
    expect(container.querySelector('.recharts-line-curve')).toBeNull()
  })

  it('cores por token do design system: entrou usa --primary, saiu usa --destructive — nunca hex solto', () => {
    const { container } = render(<GraficoFluxo report={cashflowReport} />)

    const barras = Array.from(container.querySelectorAll('.recharts-rectangle'))
    const fills = barras.map((b) => b.getAttribute('fill'))

    // Ordem de inserção no SVG = ordem de declaração das <Bar>: primeiro a
    // série "entrou" (2 retângulos, jun e jul — ago não desenha nada),
    // depois a série "saiu" (2 retângulos, mesma regra).
    expect(fills.slice(0, 2)).toEqual([
      'hsl(var(--primary))',
      'hsl(var(--primary))',
    ])
    expect(fills.slice(2, 4)).toEqual([
      'hsl(var(--destructive))',
      'hsl(var(--destructive))',
    ])

    for (const fill of fills) {
      expect(fill).not.toMatch(/^#/)
      expect(fill).toMatch(/^hsl\(var\(--/)
    }
  })

  it('a área do acumulado consome a var CSS injetada pelo ChartContainer (--color-acumulado), escopada ao token --chart-1 — nunca hex solto', () => {
    const { container } = render(<GraficoFluxo report={cashflowReport} />)

    const curva = container.querySelector('.recharts-area-curve')
    expect(curva?.getAttribute('stroke')).toBe('var(--color-acumulado)')

    // `ChartContainer`/`ChartStyle` (`@piluvitu/ui/chart`) injetam a var a
    // partir do `ChartConfig` — a prova de que a série está de fato ligada
    // ao mecanismo de cor do componente shadcn, não a um hex/token direto
    // hardcoded na área.
    const style = container.querySelector('style')
    expect(style?.innerHTML).toContain(
      '--color-acumulado: hsl(var(--chart-1));',
    )
  })

  it('renderiza dentro do slot data-slot="chart" do ChartContainer, com o data-testid conhecido', () => {
    const { container } = render(<GraficoFluxo report={cashflowReport} />)
    const wrapper = container.querySelector(
      '[data-testid="grafico-fluxo"]',
    ) as HTMLElement

    expect(wrapper).toBeInTheDocument()
    expect(wrapper).toHaveAttribute('data-slot', 'chart')
    expect(container.querySelector('.recharts-wrapper')).toBeInTheDocument()
  })

  it('formatarLinhaTooltipFluxo desenha o indicador + nome + valor em BRL (nunca centavos crus)', () => {
    const { container } = render(
      <>
        {formatarLinhaTooltipFluxo(350000, 'Acumulado', {
          color: 'hsl(var(--chart-1))',
          payload: {},
        })}
      </>,
    )

    // Valor em BRL, não os centavos crus (350000) nem `toLocaleString()`
    // (o default do shadcn, que mostraria "350.000" — errado pra centavos).
    expect(container.textContent).toContain('R$ 3.500,00')
    expect(container.textContent).toContain('Acumulado')

    const indicador = container.querySelector('div[style]') as HTMLElement
    expect(indicador.style.backgroundColor).toBe('hsl(var(--chart-1))')
  })

  it('formatarLinhaTooltipFluxo prioriza item.payload.fill sobre item.color, quando os dois existem', () => {
    const { container } = render(
      <>
        {formatarLinhaTooltipFluxo(50000, 'Entrou', {
          color: 'hsl(var(--chart-1))',
          payload: { fill: 'hsl(var(--primary))' },
        })}
      </>,
    )

    const indicador = container.querySelector('div[style]') as HTMLElement
    expect(indicador.style.backgroundColor).toBe('hsl(var(--primary))')
  })
})
