import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import type { InsightView } from '../lib/insight'
import { CartaoLeitura, InsightPage } from './insight'
import metaHistorias, * as todasAsHistorias from './insight.stories'

const { default: _meta, ...historias } = todasAsHistorias

// Mockar `api` (não a rede) — mesmo padrão de reserva.test.tsx/
// config.test.tsx: `api` já traduz envelope/erro, testar aqui prova o
// COMPONENTE, não o transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const numbersFixture = {
  competence: '2026-07',
  previous_competence: '2026-06',
  top_categories: [
    {
      category_id: 'c1',
      category_name: 'INSS',
      category_slug: 'inss',
      total_cents: -76000,
    },
    {
      category_id: 'c2',
      category_name: 'Contador',
      category_slug: 'contador',
      total_cents: -30000,
    },
  ],
  total_cents: -123000,
  previous_total_cents: -87000,
  variation_cents: 36000,
  variation_pct: 41,
  biggest_increase: {
    category_id: 'c1',
    category_name: 'INSS',
    category_slug: 'inss',
    current_cents: -76000,
    previous_cents: -40000,
    delta_cents: 36000,
  },
}

/** Roteia `api()` mockado por (método, path) — mesmo padrão das outras telas. */
function mockApi(
  opts: {
    numbers?: () => unknown
    latest?: () => unknown
    gerar?: () => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/insights/numbers')) {
      return opts.numbers ? opts.numbers() : numbersFixture
    }
    if (path === '/api/insights/latest') {
      return opts.latest ? opts.latest() : null
    }
    if (path === '/api/insights/generate') {
      if (!opts.gerar) throw new Error('gerar() não foi mockado neste teste')
      return opts.gerar()
    }
    throw new Error(`rota inesperada em teste: ${path}`)
  })
}

const insightNovo: InsightView = {
  id: 'i2',
  texto: 'Leitura novinha, saída da Claude agora.',
  modelo: 'claude-sonnet-5-5',
  periodo: '2026-07',
  generated_at: '2026-07-25T12:00:30Z',
}

function chamadasPara(path: string): number {
  return vi.mocked(api).mock.calls.filter((c) => c[0] === path).length
}

const chamadasDeGeracao = () => chamadasPara('/api/insights/generate')
const chamadasDeLatest = () => chamadasPara('/api/insights/latest')

afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('InsightPage — os números independem do texto (propriedade central)', () => {
  it('os números aparecem mesmo sem NENHUM insight jamais gravado (latest: null)', async () => {
    mockApi({ latest: () => null })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toHaveTextContent(
        'R$ 1.230,00',
      ),
    )
    expect(screen.getByTestId('insight-categoria-0')).toHaveTextContent('INSS')
    expect(screen.getByTestId('insight-categoria-0')).toHaveTextContent(
      'R$ 760,00',
    )
    // O lado do texto explica a ausência sem quebrar nem esconder os
    // números acima — "sem insight" não é um erro.
    expect(screen.getByTestId('sem-insight')).toHaveTextContent(
      /nenhuma leitura foi gerada/i,
    )
  })

  // Regressão, agora em cima do BOTÃO: o estado vazio mandava abrir um
  // terminal (antes `scripts/insight.mjs`, depois `make insight`). Nenhum
  // dos dois pode voltar num copy-paste futuro — as asserções NEGATIVAS
  // são as que importam aqui (mesmo padrão de importar.test.tsx, `accept`
  // não contendo "pdf"), porque o caminho de terminal continua existindo
  // no repo e é fácil ressuscitar a frase sem nada pegar.
  it('o estado vazio aponta pro botão, nunca mais pra um comando de terminal', async () => {
    mockApi({ latest: () => null })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toHaveTextContent(
        /use o botão abaixo/i,
      ),
    )
    expect(
      screen.getByRole('button', { name: /^Gerar insight de / }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('insight.mjs')
    expect(document.body.textContent).not.toContain('make insight')
    expect(screen.getByTestId('sem-insight').textContent).not.toMatch(
      /Mac|modelo local/,
    )
    expect(screen.getByTestId('sem-insight')).toHaveTextContent(/dia 1/)
  })

  it('os números aparecem mesmo que a BUSCA do insight falhe (não só "nunca gravado")', async () => {
    mockApi({
      latest: () => {
        throw new ApiError(503, 'auth_unavailable', 'D1 fora do ar')
      },
    })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toHaveTextContent(
        'R$ 1.230,00',
      ),
    )
    // O card "Leitura" mostra o erro contido — não deixa a tela em branco,
    // e principalmente não derruba o card "Números" ao lado.
    await waitFor(() =>
      expect(screen.getByText('D1 fora do ar')).toBeInTheDocument(),
    )
  })

  it('nenhum número renderizado vem do campo de texto', async () => {
    mockApi({
      latest: () => ({
        id: 'i1',
        // Número FALSO, bem diferente de qualquer valor real de
        // numbersFixture (R$ 1.230,00 / R$ 760,00 / R$ 300,00 / 41%) — se
        // algum valor numérico da tela viesse do texto, apareceria aqui.
        texto:
          'Você gastou R$ 999.999,99 este mês, um recorde histórico de 900%.',
        modelo: 'qwen2.5:7b-instruct',
        periodo: '2026-07',
        generated_at: new Date().toISOString(),
      }),
    })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toHaveTextContent(
        'R$ 1.230,00',
      ),
    )
    expect(screen.getByTestId('insight-total')).not.toHaveTextContent('999.999')
    expect(screen.getByTestId('insight-variacao')).toHaveTextContent('41%')
    expect(screen.getByTestId('insight-variacao')).not.toHaveTextContent('900%')
    expect(screen.getByTestId('insight-categoria-0')).toHaveTextContent(
      'R$ 760,00',
    )
    expect(screen.getByTestId('insight-maior-crescimento')).toHaveTextContent(
      'R$ 760,00',
    )

    // O número falso só existe DENTRO do parágrafo de prosa — nunca em
    // nenhum outro elemento numérico da tela.
    expect(screen.getByTestId('insight-texto')).toHaveTextContent('999.999')
  })
})

describe('InsightPage — com insight gerado', () => {
  it('mostra o texto e a data de geração, com o período a que se refere', async () => {
    mockApi({
      latest: () => ({
        id: 'i1',
        texto: 'INSS foi a maior despesa do mês, puxando o total pra cima.',
        modelo: 'qwen2.5:7b-instruct',
        periodo: '2026-07',
        generated_at: '2026-07-20T10:15:00Z',
      }),
    })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'INSS foi a maior despesa do mês',
      ),
    )
    expect(screen.getByTestId('insight-geracao')).toHaveTextContent('jul/26')
    expect(screen.getByTestId('insight-geracao')).toHaveTextContent(
      '20/07/2026',
    )
    expect(screen.getByText('Modelo: qwen2.5:7b-instruct')).toBeInTheDocument()
  })

  it('insight recente (hoje) não mostra alerta de desatualizado', async () => {
    mockApi({
      latest: () => ({
        id: 'i1',
        texto: 'Leitura de hoje.',
        modelo: 'qwen2.5:7b-instruct',
        periodo: '2026-07',
        generated_at: new Date().toISOString(),
      }),
    })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-geracao')).toHaveTextContent('hoje'),
    )
    expect(
      screen.queryByTestId('insight-alerta-desatualizado'),
    ).not.toBeInTheDocument()
  })

  it('insight antigo (3 semanas) aparece com a idade visível e um alerta de desatualizado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'))

    mockApi({
      latest: () => ({
        id: 'i1',
        texto: 'Leitura de três semanas atrás.',
        modelo: 'qwen2.5:7b-instruct',
        periodo: '2026-07',
        // 21 dias antes do "agora" travado acima — o próprio exemplo ruim
        // citado no spec ("insight de três semanas atrás apresentado como
        // se fosse de hoje é pior que insight nenhum").
        generated_at: '2026-07-04T12:00:00Z',
      }),
    })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-geracao')).toHaveTextContent(
        'há 3 semanas',
      ),
    )
    const alerta = screen.getByTestId('insight-alerta-desatualizado')
    expect(alerta).toHaveTextContent(/desatualizado/i)
    expect(alerta).toHaveTextContent(/botão/i)
    expect(alerta).toHaveTextContent('jul/26')
    expect(alerta.textContent).not.toMatch(/Mac|comando/)
    expect(screen.getByTestId('insight-geracao')).toHaveClass(
      'text-destructive',
    )
    // O texto continua visível — frescor, não silêncio: um insight velho
    // não deve sumir, só deixar de parecer atual.
    expect(screen.getByTestId('insight-texto')).toHaveTextContent(
      'Leitura de três semanas atrás.',
    )
  })
})

describe('InsightPage — frescor contra o período', () => {
  it('o insight do Cron de um mês fechado não fica desatualizado semanas depois', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
    mockApi({
      latest: () => ({
        id: 'cron',
        texto: 'Outubro fechou sem surpresas.',
        modelo: 'claude-sonnet-5-5',
        periodo: '2026-10',
        generated_at: '2026-11-01T12:00:00Z',
      }),
    })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-geracao')).toHaveTextContent(
        'há 3 semanas',
      ),
    )
    expect(
      screen.queryByTestId('insight-alerta-desatualizado'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('insight-geracao')).not.toHaveClass(
      'text-destructive',
    )
  })

  it('o botão diz para qual mês vai gerar, e acompanha o seletor', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'))
    mockApi({ latest: () => null })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('botao-gerar')).toHaveTextContent(
      'Gerar insight de nov/26',
    )

    const seletor = document.querySelector(
      'input[type="month"]',
    ) as HTMLInputElement
    fireEvent.change(seletor, { target: { value: '2026-10' } })

    expect(screen.getByTestId('botao-gerar')).toHaveTextContent(
      'Gerar insight de out/26',
    )
  })
})

describe('InsightPage — números: erro, mês e Ajuda', () => {
  it('mostra o erro do card de números sem impedir o card de Leitura', async () => {
    mockApi({
      numbers: () => {
        throw new ApiError(400, 'invalid_query', 'competência inválida')
      },
      latest: () => null,
    })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByText('competência inválida')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('sem-insight')).toBeInTheDocument()
  })

  it('trocar o mês refaz a busca de números com a nova competência', async () => {
    const user = userEvent.setup()
    mockApi({ latest: () => null })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toHaveTextContent(
        'R$ 1.230,00',
      ),
    )

    vi.mocked(api).mockClear()
    const seletor = screen.getByLabelText('Mês')
    await user.clear(seletor)
    await user.type(seletor, '2026-06')

    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        expect.stringContaining('competence=2026-06'),
      ),
    )
  })

  it('Ajuda ("Insight") abre no clique, explicando calculado vs. escrito pela Claude', async () => {
    const user = userEvent.setup()
    mockApi({ latest: () => null })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Insight' }),
    )

    const popover = await screen.findByText(/escrito pela Claude/i)
    expect(popover).toBeInTheDocument()
    expect(popover.textContent).toMatch(/calculad/i)
    expect(popover.textContent).toMatch(/só os totais/i)
    expect(popover.textContent).not.toMatch(/Mac|Ollama/)
  })
})

describe('InsightPage — o botão de gerar', () => {
  it('200: o texto aparece na hora, sem reler o latest', async () => {
    const user = userEvent.setup()
    mockApi({ latest: () => null, gerar: () => insightNovo })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )
    expect(chamadasDeLatest()).toBe(1)

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura novinha',
      ),
    )
    // O 200 já traz o insight gravado: nenhuma releitura, nenhum polling.
    expect(chamadasDeLatest()).toBe(1)
    expect(chamadasDeGeracao()).toBe(1)
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
    expect(screen.getByTestId('botao-gerar')).toBeEnabled()
    expect(screen.getByTestId('botao-gerar')).toHaveTextContent(
      /^Gerar insight de /,
    )
  })

  it('manda a competência selecionada no corpo, não um mês fixo', async () => {
    const user = userEvent.setup()
    mockApi({ latest: () => null, gerar: () => insightNovo })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )
    const seletor = document.querySelector(
      'input[type="month"]',
    ) as HTMLInputElement
    fireEvent.change(seletor, { target: { value: '2026-05' } })

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() => expect(chamadasDeGeracao()).toBe(1))
    expect(vi.mocked(api)).toHaveBeenCalledWith('/api/insights/generate', {
      method: 'POST',
      body: JSON.stringify({ competence: '2026-05' }),
    })
  })

  it('durante o request mostra "Gerando…" sem prometer tempo nem falar do Mac', async () => {
    const user = userEvent.setup()
    mockApi({ latest: () => null, gerar: () => new Promise(() => {}) })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    const status = await screen.findByTestId('gerando-status')
    expect(status).toHaveTextContent(/gerando/i)
    expect(status.textContent).not.toMatch(/segundos|Mac|Ollama/)
    expect(screen.getByTestId('botao-gerar')).toBeDisabled()
    expect(screen.getByTestId('botao-gerar')).toHaveTextContent('Gerando…')
  })

  it('429 teto_atingido: mostra a mensagem do teto e mantém o insight anterior', async () => {
    const user = userEvent.setup()
    const anterior: InsightView = {
      ...insightNovo,
      id: 'i1',
      texto: 'Leitura de antes.',
      generated_at: new Date().toISOString(),
    }
    const mensagem =
      'O teto de IA de US$ 2,00 para "insight" em 2026-07 foi atingido (gasto até agora: US$ 2,00). Volta no mês que vem.'
    mockApi({
      latest: () => anterior,
      gerar: () => {
        throw new ApiError(429, 'teto_atingido', mensagem)
      },
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura de antes.',
      ),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('geracao-erro')).toHaveTextContent(mensagem),
    )
    expect(screen.getByTestId('insight-texto')).toHaveTextContent(
      'Leitura de antes.',
    )
    expect(screen.getByTestId('botao-gerar')).toBeEnabled()
    expect(chamadasDeLatest()).toBe(1)
  })

  it('503 claude_desligado: repassa a mensagem do servidor, que diz o que fazer', async () => {
    const user = userEvent.setup()
    const mensagem =
      'A IA está desligada: falta a ANTHROPIC_API_KEY neste Worker (wrangler secret put ANTHROPIC_API_KEY).'
    mockApi({
      latest: () => null,
      gerar: () => {
        throw new ApiError(503, 'claude_desligado', mensagem)
      },
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('geracao-erro')).toHaveTextContent(mensagem),
    )
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
  })

  it('um sucesso depois de um erro apaga o erro', async () => {
    const user = userEvent.setup()
    let tentativa = 0
    mockApi({
      latest: () => null,
      gerar: () => {
        tentativa += 1
        if (tentativa === 1) {
          throw new ApiError(
            503,
            'claude_indisponivel',
            'A Claude não respondeu agora. Tente de novo em alguns instantes.',
          )
        }
        return insightNovo
      },
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))
    await screen.findByTestId('geracao-erro')
    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura novinha',
      ),
    )
    expect(screen.queryByTestId('geracao-erro')).not.toBeInTheDocument()
  })

  it('a leitura inicial que falhou some quando a geração dá certo', async () => {
    const user = userEvent.setup()
    mockApi({
      latest: () => {
        throw new ApiError(503, 'auth_unavailable', 'D1 fora do ar')
      },
      gerar: () => insightNovo,
    })

    render(<InsightPage />)
    await screen.findByText('D1 fora do ar')

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura novinha',
      ),
    )
    expect(screen.queryByText('D1 fora do ar')).not.toBeInTheDocument()
  })

  it('clique duplo não dispara duas gerações', async () => {
    const user = userEvent.setup()
    mockApi({
      latest: () => null,
      // Nunca resolve: segura a tela em "gerando" enquanto o 2º clique
      // acontece — é o instante exato em que o disparo duplo caberia.
      gerar: () => new Promise(() => {}),
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))
    await waitFor(() =>
      expect(screen.getByTestId('botao-gerar')).toBeDisabled(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    expect(chamadasDeGeracao()).toBe(1)
  })
})

describe('insight.stories — os estados do card de Leitura', () => {
  it('cada story renderiza o estado que o nome promete', () => {
    const esperado: Record<string, string> = {
      SemInsight: 'sem-insight',
      Gerando: 'gerando-status',
      Pronto: 'insight-texto',
      TetoAtingido: 'geracao-erro',
      ClaudeDesligado: 'geracao-erro',
    }
    expect(Object.keys(historias).sort()).toEqual(Object.keys(esperado).sort())

    for (const [nome, historia] of Object.entries(historias)) {
      const { unmount } = render(
        <CartaoLeitura {...metaHistorias.args} {...historia.args} />,
      )
      expect(screen.getByTestId(esperado[nome])).toBeInTheDocument()
      unmount()
    }
  })

  it('as stories de erro mostram o código certo', () => {
    render(
      <CartaoLeitura
        {...metaHistorias.args}
        {...historias.TetoAtingido.args}
      />,
    )
    expect(screen.getByTestId('geracao-erro')).toHaveTextContent(/teto/i)
  })
})

describe('InsightPage — o agregado virou manchete, os detalhes não', () => {
  it('o total gasto sai em ROTULO + 30px; a variação e as categorias não', async () => {
    // ⚠️ Um agregado em destaque, não cinco. As top categorias são uma
    // LISTA — cinco manchetes lado a lado não deixariam nenhuma ser
    // manchete, e a pergunta "gastei quanto?" tem uma resposta só.
    mockApi({ latest: () => null })

    render(<InsightPage />)

    const total = await screen.findByTestId('insight-total')
    expect(total).toHaveTextContent('R$ 1.230,00')
    expect(total.className).toContain('text-3xl')
    expect(total.className).toContain('tabular-nums')

    expect(screen.getByText('Total gasto').className).toContain('font-mono')
    expect(screen.getByText('Total gasto').className).toContain('uppercase')

    expect(screen.getByTestId('insight-variacao').className).not.toContain(
      'text-3xl',
    )
    expect(screen.getByTestId('insight-categoria-0').className).not.toContain(
      'text-3xl',
    )
  })
})

// ④ Barra de proporção por categoria — um `<div>` com `style.width`, nunca
// um gráfico (o arquivo novo de gráfico custaria +113 KB gzip num segundo
// chunk que `check-financas-lazy-chart.mjs` não pegaria).
describe('InsightPage — barra de proporção por categoria', () => {
  it('a largura de cada barra é a fatia da categoria no TOTAL do mês', async () => {
    mockApi()
    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toBeInTheDocument(),
    )

    // Fixture: total -123.000, INSS -76.000, Contador -30.000.
    // 76000/123000 = 61,8% → 62 ; 30000/123000 = 24,4% → 24.
    const inss = screen.getByTestId('insight-barra-0')
    const contador = screen.getByTestId('insight-barra-1')

    expect(inss).toHaveAttribute('data-pct', '62')
    expect(contador).toHaveAttribute('data-pct', '24')

    // ⚠️ A base é o TOTAL, não a maior categoria: com a maior como 100%, a
    // primeira barra estaria SEMPRE cheia e a leitura viraria "INSS é o
    // maior" (que a ordem já diz) em vez de "INSS é 62% do mês".
    expect(inss).not.toHaveAttribute('data-pct', '100')

    // A largura de fato aplicada no `<div>` interno.
    expect((inss.firstElementChild as HTMLElement).style.width).toBe('62%')
    expect((contador.firstElementChild as HTMLElement).style.width).toBe('24%')
  })

  it('mês com total ZERO não desenha barra — os valores ficam', async () => {
    // Estorno anulando o gasto: a proporção não significaria nada, e dividir
    // por zero daria Infinity.
    mockApi({
      numbers: () => ({ ...numbersFixture, total_cents: 0 }),
    })
    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('insight-categoria-0')).toBeInTheDocument(),
    )

    expect(screen.queryByTestId('insight-barra-0')).not.toBeInTheDocument()
    // O valor da categoria continua escrito.
    expect(screen.getByTestId('insight-categoria-0')).toHaveTextContent(
      'R$ 760,00',
    )
  })

  it('a barra é decorativa (aria-hidden) — o valor já está escrito ao lado', async () => {
    mockApi()
    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toBeInTheDocument(),
    )

    expect(screen.getByTestId('insight-barra-0')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  // ⚠️ Decisão nº 5 do "não mexer", aplicada à barra: nenhum número (nem a
  // proporção que a desenha) pode sair de `insight.texto`.
  it('a proporção sai de `numbers`, nunca do texto do modelo', async () => {
    mockApi({
      // O texto mente com uma proporção bem distinta da real (62%).
      latest: () => ({
        id: 'i1',
        texto: 'O INSS representou 99% do mes, um recorde absoluto.',
        modelo: 'qwen2.5:7b-instruct',
        periodo: '2026-08',
        generated_at: new Date().toISOString(),
      }),
    })
    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toBeInTheDocument(),
    )

    // A barra segue os números calculados, não o texto.
    expect(screen.getByTestId('insight-barra-0')).toHaveAttribute(
      'data-pct',
      '62',
    )
    expect(
      (screen.getByTestId('insight-barra-0').firstElementChild as HTMLElement)
        .style.width,
    ).toBe('62%')
    // E o 99% só existe dentro da prosa.
    expect(screen.getByTestId('insight-texto')).toHaveTextContent('99%')
  })
})
