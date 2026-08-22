import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import type { InsightView } from '../lib/insight'
import {
  InsightPage,
  MENSAGEM_BASELINE_INDISPONIVEL,
  MENSAGEM_GERADO_SEM_RECARGA,
  MENSAGEM_SEM_CONFIRMACAO,
  POLL_INTERVALO_MS,
  POLL_LIMITE_MS,
} from './insight'

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
  texto: 'Leitura novinha, saída do Ollama agora.',
  modelo: 'qwen2.5:7b-instruct',
  periodo: '2026-07',
  generated_at: '2026-07-25T12:00:30Z',
}

/** Quantas chamadas a `api()` bateram em `POST /api/insights/generate`. */
function chamadasDeGeracao(): number {
  return vi
    .mocked(api)
    .mock.calls.filter((c) => c[0] === '/api/insights/generate').length
}

/**
 * ⚠️ Relógio FIXO + timers falsos, e as duas coisas juntas de propósito:
 * `shouldAdvanceTime` mantém `waitFor`/`userEvent` (que dependem de
 * `setTimeout` por baixo) funcionando, enquanto
 * `advanceTimersByTimeAsync` deixa os 90 s do teto de polling passarem em
 * milissegundos — nenhum teste espera 90 s de verdade. Sem o relógio
 * fixo, `insightAgeDays`/`isStaleInsight` derivariam com o calendário
 * (este app já teve 2 testes vermelhos por isso).
 */
function relogioFixo() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-25T12:00:00Z'))
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
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
      screen.getByRole('button', { name: 'Gerar insight deste mês' }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('insight.mjs')
    expect(document.body.textContent).not.toContain('make insight')
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

describe('InsightPage — o botão de gerar', () => {
  it('200: o texto aparece na hora, sem polling', async () => {
    const user = userEvent.setup()
    // O promeia publica ANTES de responder (ver routes/insights.ts) — o
    // mock reproduz isso: quando o POST volta, `latest` já mudou.
    let publicado: InsightView | null = null
    mockApi({
      latest: () => publicado,
      gerar: () => {
        publicado = insightNovo
        return {
          competence: '2026-07',
          texto: insightNovo.texto,
          modelo: insightNovo.modelo,
        }
      },
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura novinha',
      ),
    )
    // Nunca entrou em "gerando": o 200 já é o resultado.
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
    expect(screen.getByTestId('botao-gerar')).toBeEnabled()
    // A competência selecionada vai no corpo — não um mês fixo.
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      '/api/insights/generate',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('200 mas a RECARGA falha: diz que gerou — nunca que falhou', async () => {
    const user = userEvent.setup()
    let chamadasLatest = 0
    mockApi({
      latest: () => {
        chamadasLatest += 1
        // 1ª = mount, 2ª = a releitura da linha de base dentro de `gerar()`
        // (as duas OK); só a 3ª — a recarga PÓS-geração — é que cai.
        if (chamadasLatest > 2) {
          throw new ApiError(503, 'auth_unavailable', 'sem conexão')
        }
        return null
      },
      gerar: () => ({
        competence: '2026-07',
        texto: insightNovo.texto,
        modelo: insightNovo.modelo,
      }),
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('geracao-aviso')).toHaveTextContent(
        MENSAGEM_GERADO_SEM_RECARGA,
      ),
    )
    // A mensagem do GET NUNCA é repassada como se fosse falha da geração —
    // é o defeito inteiro que lib/mutar-e-recarregar.ts existe pra impedir,
    // aqui preservado à mão (ver comentário de gerar()).
    expect(document.body.textContent).not.toContain('sem conexão')
    expect(screen.queryByTestId('geracao-erro')).not.toBeInTheDocument()
  })

  it('202: entra em "gerando", faz polling e mostra o texto quando chega', async () => {
    const user = relogioFixo()
    let publicado: InsightView | null = null
    mockApi({
      latest: () => publicado,
      gerar: () => ({ status: 'gerando' }),
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('gerando-status')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('botao-gerar')).toBeDisabled()

    // Dois ciclos com o Mac ainda trabalhando: nada muda na tela.
    await avancar(POLL_INTERVALO_MS * 2)
    expect(screen.queryByTestId('insight-texto')).not.toBeInTheDocument()
    expect(screen.getByTestId('gerando-status')).toBeInTheDocument()

    // O promeia publica; o ciclo seguinte enxerga.
    publicado = insightNovo
    await avancar(POLL_INTERVALO_MS)

    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura novinha',
      ),
    )
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
    expect(screen.getByTestId('botao-gerar')).toBeEnabled()
    expect(screen.queryByTestId('geracao-aviso')).not.toBeInTheDocument()
  })

  it('202: um insight ANTIGO já na tela não passa por resultado novo', async () => {
    const user = relogioFixo()
    const antigo: InsightView = {
      id: 'i1',
      texto: 'Leitura de ontem.',
      modelo: 'qwen2.5:7b-instruct',
      periodo: '2026-07',
      generated_at: '2026-07-24T12:00:00Z',
    }
    let publicado: InsightView = antigo
    mockApi({ latest: () => publicado, gerar: () => ({ status: 'gerando' }) })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura de ontem.',
      ),
    )

    await user.click(screen.getByTestId('botao-gerar'))
    // `latest` continua devolvendo o MESMO generated_at — polling segue.
    await avancar(POLL_INTERVALO_MS * 3)
    expect(screen.getByTestId('gerando-status')).toBeInTheDocument()
    expect(screen.getByTestId('insight-texto')).toHaveTextContent(
      'Leitura de ontem.',
    )

    publicado = insightNovo
    await avancar(POLL_INTERVALO_MS)
    await waitFor(() =>
      expect(screen.getByTestId('insight-texto')).toHaveTextContent(
        'Leitura novinha',
      ),
    )
  })

  it('202: o polling TERMINA no teto, com uma frase honesta — nunca gira pra sempre', async () => {
    // ⚠️ O teto é aferido em VALOR, não só "existe": o `avancar()` abaixo
    // é derivado da própria constante, então um teto de uma hora passaria
    // por esta prova sem esta linha — e uma hora de spinner é, pro dono,
    // indistinguível de girar pra sempre.
    expect(POLL_LIMITE_MS).toBeLessThanOrEqual(120_000)

    const user = relogioFixo()
    mockApi({ latest: () => null, gerar: () => ({ status: 'gerando' }) })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))
    await waitFor(() =>
      expect(screen.getByTestId('gerando-status')).toBeInTheDocument(),
    )

    await avancar(POLL_LIMITE_MS + POLL_INTERVALO_MS)

    await waitFor(() =>
      expect(screen.getByTestId('geracao-aviso')).toHaveTextContent(
        MENSAGEM_SEM_CONFIRMACAO,
      ),
    )
    // Parou de girar e devolveu o controle ao dono.
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
    expect(screen.getByTestId('botao-gerar')).toBeEnabled()
    // E não inventou sucesso nenhum.
    expect(screen.queryByTestId('insight-texto')).not.toBeInTheDocument()
    expect(screen.getByTestId('sem-insight')).toBeInTheDocument()
  })

  it('503 promeia_unreachable: manda LIGAR o Mac, não mexer em secret', async () => {
    const user = userEvent.setup()
    mockApi({
      latest: () => null,
      gerar: () => {
        throw new ApiError(
          503,
          'promeia_unreachable',
          'Não consegui alcançar o promeia no Mac.',
        )
      },
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    const erro = await screen.findByTestId('geracao-erro')
    // A mensagem do servidor é repassada inteira, não reescrita.
    expect(erro).toHaveTextContent('Não consegui alcançar o promeia no Mac.')
    expect(screen.getByTestId('geracao-dica')).toHaveTextContent(
      /ligue o macbook/i,
    )
    // ⚠️ Assertiva NEGATIVA: os dois 503 mandam pra lados OPOSTOS —
    // sugerir `wrangler secret put` aqui faria o dono mexer no que já
    // está certo.
    expect(erro.textContent).not.toMatch(/wrangler secret put/i)
    // A tela segue de pé: os números não dependem disso.
    expect(screen.getByTestId('insight-total')).toHaveTextContent('R$ 1.230,00')
  })

  it('503 promeia_disabled: manda configurar os secrets, não ligar o Mac', async () => {
    const user = userEvent.setup()
    mockApi({
      latest: () => null,
      gerar: () => {
        throw new ApiError(
          503,
          'promeia_disabled',
          'A geração de insight está desligada.',
        )
      },
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    const erro = await screen.findByTestId('geracao-erro')
    expect(erro).toHaveTextContent('A geração de insight está desligada.')
    expect(screen.getByTestId('geracao-dica')).toHaveTextContent(
      /wrangler secret put/i,
    )
    expect(erro.textContent).not.toMatch(/ligue o macbook/i)
    expect(screen.getByTestId('insight-total')).toHaveTextContent('R$ 1.230,00')
  })

  /**
   * ⚠️ O caminho REAL que a revisão mediu com probe: `latest` falha SÓ no
   * mount (503 `auth_unavailable` — rede instável no Android, caminho
   * documentado no módulo) e depois volta a funcionar, devolvendo o insight
   * de ONTEM. Antes da correção, o `catch` do efeito marcava
   * `insightLoaded` com `insight` ainda `null`: botão habilitado, linha de
   * base `null`, e o PRIMEIRO ciclo do polling aceitava qualquer `latest`
   * (`novo !== null && novo.generated_at !== anterior`). Resultado medido:
   * o erro sumia, o texto de ontem aparecia, "gerando" sumia — a tela
   * afirmando um sucesso que não houve.
   */
  it('leitura inicial que FALHA não deixa a base desconhecida — o insight de ONTEM não passa por novo', async () => {
    const user = relogioFixo()
    const ontem: InsightView = {
      id: 'i1',
      texto: 'Leitura de ontem.',
      modelo: 'qwen2.5:7b-instruct',
      periodo: '2026-07',
      generated_at: '2026-07-24T12:00:00Z',
    }
    let chamadasLatest = 0
    mockApi({
      latest: () => {
        chamadasLatest += 1
        if (chamadasLatest === 1) {
          throw new ApiError(503, 'auth_unavailable', 'sem conexão')
        }
        return ontem
      },
      gerar: () => ({ status: 'gerando' }),
    })

    render(<InsightPage />)
    // Estado de partida do defeito: a leitura inicial caiu, e o botão
    // continua habilitado (ele é a saída do erro — ver comentário na tela).
    await waitFor(() => expect(screen.getByTestId('botao-gerar')).toBeEnabled())
    expect(screen.queryByTestId('insight-texto')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('botao-gerar'))
    await waitFor(() =>
      expect(screen.getByTestId('gerando-status')).toBeInTheDocument(),
    )

    // Vários ciclos com `latest` devolvendo SEMPRE o insight de ontem: ele
    // é a linha de base agora, então nada aqui é "resultado".
    await avancar(POLL_INTERVALO_MS * 4)
    expect(screen.getByTestId('gerando-status')).toBeInTheDocument()

    // E o fim é honesto — "não recebi confirmação", nunca um sucesso.
    await avancar(POLL_LIMITE_MS)
    await waitFor(() =>
      expect(screen.getByTestId('geracao-aviso')).toHaveTextContent(
        MENSAGEM_SEM_CONFIRMACAO,
      ),
    )
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
    // O texto de ontem fica visível (com a data/idade dele, como sempre) —
    // "frescor, não silêncio"; o que não pode é ter sido anunciado como o
    // resultado do clique, e não foi.
    expect(screen.getByTestId('insight-texto')).toHaveTextContent(
      'Leitura de ontem.',
    )
  })

  it('se a releitura da base falhar no clique, NADA é gerado — e a tela diz isso', async () => {
    const user = userEvent.setup()
    let chamadasLatest = 0
    mockApi({
      latest: () => {
        chamadasLatest += 1
        // Mount OK; a releitura da base (no clique) é que cai.
        if (chamadasLatest > 1) {
          throw new ApiError(503, 'auth_unavailable', 'sem conexão')
        }
        return null
      },
      gerar: () => ({ status: 'gerando' }),
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    await waitFor(() =>
      expect(screen.getByTestId('geracao-erro')).toHaveTextContent(
        MENSAGEM_BASELINE_INDISPONIVEL,
      ),
    )
    // O ponto inteiro: nenhuma rodada de GPU foi disparada às cegas.
    expect(chamadasDeGeracao()).toBe(0)
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
    expect(screen.getByTestId('botao-gerar')).toBeEnabled()
    // A propriedade central da tela segue de pé: os números não dependem
    // disso — e a mensagem do GET não é repassada como se fosse a falha.
    expect(screen.getByTestId('insight-total')).toHaveTextContent('R$ 1.230,00')
    expect(document.body.textContent).not.toContain('sem conexão')
  })

  it('enquanto CONFERE a base, não afirma que está gerando', async () => {
    const user = userEvent.setup()
    let chamadasLatest = 0
    mockApi({
      latest: () => {
        chamadasLatest += 1
        // 1ª: o mount, resolve. 2ª: a releitura da base dentro de `gerar()`,
        // que NUNCA resolve — simula a rede instável do Android que motivou
        // a correção da baseline. `api()` não tem timeout de cliente, então
        // este é um estado em que a tela pode ficar presa de verdade.
        if (chamadasLatest === 1) return null
        return new Promise(() => {})
      },
      gerar: () => ({ status: 'gerando' }),
    })

    render(<InsightPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-insight')).toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('botao-gerar'))

    // O botão TRAVA (nada de clique duplo)...
    await waitFor(() =>
      expect(screen.getByTestId('botao-gerar')).toBeDisabled(),
    )
    // ...mas o rótulo diz a verdade sobre a fase.
    expect(screen.getByTestId('botao-gerar')).toHaveTextContent('Conferindo…')

    // ⚠️ A asserção que importa: NADA foi pedido ao Mac, então a tela não
    // pode prometer "leva de 20 a 35 segundos". Antes do conserto, este
    // bloco aparecia com `chamadasDeGeracao() === 0`.
    expect(screen.queryByTestId('gerando-status')).not.toBeInTheDocument()
    expect(chamadasDeGeracao()).toBe(0)
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
