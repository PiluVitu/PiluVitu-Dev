import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { InsightPage } from './insight'

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
  } = {},
) {
  vi.mocked(api).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/insights/numbers')) {
      return opts.numbers ? opts.numbers() : numbersFixture
    }
    if (path === '/api/insights/latest') {
      return opts.latest ? opts.latest() : null
    }
    throw new Error(`rota inesperada em teste: ${path}`)
  })
}

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

  // Regressão (fix round 1, Finding 1 CRITICAL): o CLI Node
  // (scripts/insight.mjs) foi apagado na migração pro promeia — esta tela
  // continuava mandando o dono rodar exatamente esse arquivo apagado no
  // estado vazio, o comando real que ele veria em produção hoje (o dado
  // sintético da prova real foi limpo depois de provar o promeia). Copiar e
  // colar aquele comando falharia. A asserção NEGATIVA é a que importa: sem
  // ela, o comando morto pode voltar num copy-paste futuro sem nada pegar —
  // mesmo padrão de importar.test.tsx (accept não contendo "pdf").
  it('o estado vazio manda rodar "make insight", nunca o CLI Node apagado', async () => {
    mockApi({ latest: () => null })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toHaveTextContent(
        'make insight',
      ),
    )
    expect(document.body.textContent).not.toContain('insight.mjs')
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

  it('Ajuda ("Insight") abre no clique, explicando calculado vs. gerado localmente', async () => {
    const user = userEvent.setup()
    mockApi({ latest: () => null })

    render(<InsightPage />)

    await waitFor(() =>
      expect(screen.getByTestId('insight-total')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Insight' }),
    )

    const popover = await screen.findByText(/gerado por um modelo de IA local/i)
    expect(popover).toBeInTheDocument()
    expect(popover.textContent).toMatch(/calculad/i)
  })
})
