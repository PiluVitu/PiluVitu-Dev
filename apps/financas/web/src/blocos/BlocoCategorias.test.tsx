import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { BlocoCategorias } from './BlocoCategorias'

// Mockar `api` (não a rede) — mesmo padrão de BlocoComprometido.test.tsx: `api`
// já traduz o envelope e os erros, testar nesse nível prova o comportamento do
// COMPONENTE, não do transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const reportComDados = {
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

const reportVazio = { competence: '2026-07', rows: [], total_cents: 0 }

// ⑥ `GET /api/insights/numbers` — a referência ("é muito ou pouco?") que o
// total absoluto não tinha. Shape de `InsightNumbersView` (`lib/insight.ts`).
const numerosNeutros = {
  competence: '2026-07',
  previous_competence: '2026-06',
  top_categories: [],
  total_cents: 0,
  previous_total_cents: 0,
  variation_cents: 0,
  variation_pct: null,
  biggest_increase: null,
}

/**
 * ⚠️ **O mock precisa ROTEAR por path — um `mockResolvedValue` único não
 * serve mais.** Desde ⑥ este bloco busca DUAS rotas, e um mock que
 * respondesse a mesma coisa pras duas entregaria o relatório de categorias
 * onde o componente espera `variation_cents`/`previous_competence`: o teste
 * passaria a exercitar um shape que a API nunca devolve, e a variação
 * renderizaria `NaN` sem nada apontar isso.
 *
 * Rota fora da lista REJEITA (mesma disciplina de `App.test.tsx#mockFetchVazio`
 * depois do achado da Task 8): uma rota nova esquecida vira erro visível,
 * não um dado silenciosamente errado.
 */
function mockRotas(
  opts: { categorias?: unknown; numeros?: unknown } = {},
): void {
  vi.mocked(api).mockImplementation((path: string) => {
    if (path.startsWith('/api/insights/numbers'))
      return Promise.resolve(opts.numeros ?? numerosNeutros)
    if (path.startsWith('/api/reports/by-category'))
      return Promise.resolve(opts.categorias ?? reportVazio)
    return Promise.reject(new Error(`rota inesperada em teste: ${path}`))
  })
}

/** Só as chamadas de UMA rota — a de números não pode contaminar a contagem. */
function chamadas(prefixo: string): string[] {
  return vi
    .mocked(api)
    .mock.calls.map((c) => String(c[0]))
    .filter((p) => p.startsWith(prefixo))
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('BlocoCategorias', () => {
  it('com dados: busca a competência atual, mostra o total gasto e, quando o gráfico (lazy) termina de carregar, o conteúdo', async () => {
    mockRotas({ categorias: reportComDados })

    render(<BlocoCategorias />)

    expect(
      screen.getByRole('heading', { name: 'Para onde foi o dinheiro' }),
    ).toBeInTheDocument()

    // mesmo comportamento do Suspense provado em BlocoComprometido.test.tsx:
    // o gráfico só aparece depois que `report` chega, não antes.
    expect(screen.queryByTestId('grafico-categorias')).not.toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByTestId('grafico-categorias')).toBeInTheDocument(),
    )

    // total gasto em valor POSITIVO (magnitude) — a API devolve negativo
    // (só despesa), mas "gastei -R$900,00" é uma dupla negativa confusa.
    expect(screen.getByTestId('total-gasto')).toHaveTextContent('R$ 900,00')

    expect(chamadas('/api/reports/by-category')).toHaveLength(1)
    expect(api).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/api\/reports\/by-category\?competence=\d{4}-\d{2}$/,
      ),
    )
  })

  it('o total gasto é MANCHETE (24px) com rótulo em versalete mono — não mais um `text-sm` ao lado do seletor', async () => {
    mockRotas({ categorias: reportComDados })

    render(<BlocoCategorias />)

    const total = await screen.findByTestId('total-gasto')
    // `NUMERO_GRID` (24px). A escala saiu de medição: a caixa útil mais
    // apertada da home é a de 768px (o `md`), 174px por card.
    expect(total).toHaveClass('text-2xl')
    expect(total).toHaveClass('tabular-nums')
    expect(total).not.toHaveClass('text-sm')

    // ⚠️ `whitespace-nowrap` SAIU: ele existia porque o número dividia a
    // linha com o `<input type="month">`. Com a caixa inteira o valor cabe,
    // e mantê-lo transformaria uma quebra de linha inofensiva em overflow
    // de PÁGINA — o defeito já pago (e registrado) na `Variacao`.
    expect(total).not.toHaveClass('whitespace-nowrap')

    // `ROTULO` (`lib/tipografia.ts`) — a assinatura do /admin.
    expect(screen.getByText('Total gasto')).toHaveClass(
      'font-mono',
      'uppercase',
      'text-xs',
    )
  })

  it('o seletor de mês tem a PRÓPRIA linha — ele e o total não dividem mais a mesma faixa', async () => {
    // ⚠️ Medido a 768px (o `md`, 174px de caixa útil): `max-w-40` do
    // `<input type="month">` (160px) + `gap-3` (12) = 172 dos 174 — o total
    // de 14px JÁ saía em duas caixas de linha antes de qualquer promoção.
    // Promover a fonte sem mexer na estrutura pioraria um defeito existente.
    mockRotas({ categorias: reportComDados })

    render(<BlocoCategorias />)

    const total = await screen.findByTestId('total-gasto')
    const seletor = screen.getByLabelText('Mês')

    // ⚠️ **A versão anterior desta asserção era um PROXY, e o proxy passava
    // com o layout quebrado — achado da revisão, reproduzido:** ela era
    // `expect(total.parentElement).not.toContainElement(seletor)` mais
    // `expect(seletor.closest('label')?.parentElement).not.toContainElement(total)`,
    // o que descarta só a UMA forma anterior (o `<label>` como filho DIRETO
    // da faixa flex). Embrulhando o `<label>` num `<div>` a mais e pondo os
    // dois de volta num `flex … justify-between`, os 43px de overflow de
    // PÁGINA a 768 voltavam inteiros e a suíte saía **15/15 verde**.
    //
    // A prova que de fato vale em jsdom (que não computa layout, mas lê
    // className): subir de cada um até a raiz do bloco e exigir que NENHUM
    // ancestral com classe `flex` contenha os dois. É a faixa compartilhada
    // que causa o overflow, esteja ela a quantos wrappers de distância for.
    const ancestraisFlex = (el: HTMLElement | null): HTMLElement[] => {
      const acc: HTMLElement[] = []
      for (let n = el; n; n = n.parentElement) {
        if (n.className && /(^|\s)flex(\s|$)/.test(String(n.className))) {
          acc.push(n)
        }
      }
      return acc
    }
    for (const faixa of ancestraisFlex(total)) {
      expect(faixa).not.toContainElement(seletor)
    }
    for (const faixa of ancestraisFlex(seletor)) {
      expect(faixa).not.toContainElement(total)
    }
    // ⚠️ Sem isto a asserção passaria por VACUIDADE se um dia não houvesse
    // nenhum ancestral `flex` (ex.: o bloco virar `grid`): zero iterações de
    // loop é zero asserções, e o teste continuaria verde sem provar nada.
    expect(ancestraisFlex(seletor).length).toBeGreaterThan(0)
  })

  it('mês vazio (sem gasto no período): mostra a mensagem, sem gráfico — mas o seletor de mês continua disponível', async () => {
    mockRotas({ categorias: reportVazio })

    render(<BlocoCategorias />)

    await waitFor(() =>
      expect(screen.getByText(/nenhum gasto em/i)).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('grafico-categorias')).not.toBeInTheDocument()

    // Ao contrário do `vazio` genérico de `Bloco` (só texto): aqui o dono
    // precisa poder trocar de mês mesmo quando o mês corrente está vazio —
    // mesmo raciocínio de BlocoSaldos (Task 7) tratar "sem conta" como
    // conteúdo normal em vez do `vazio` do card, pra manter uma ação real
    // disponível.
    expect(screen.getByLabelText('Mês')).toBeInTheDocument()
  })

  // ⑥ "R$ 900,00 é muito ou pouco?" — a resposta é contra o mês anterior,
  // e os números vêm prontos de `GET /api/insights/numbers` (a regra de
  // sinal/magnitude mora no Worker; ver o ⚠️ em BlocoCategorias.tsx).
  it('mostra a variação contra o mês anterior, com sinal e mês nomeados', async () => {
    mockRotas({
      categorias: reportComDados,
      numeros: {
        ...numerosNeutros,
        previous_competence: '2026-06',
        variation_cents: 34000, // gastou R$ 340,00 a MAIS
        variation_pct: 61,
      },
    })

    render(<BlocoCategorias />)

    const variacao = await screen.findByTestId('variacao')
    expect(variacao).toHaveTextContent('+R$ 340,00')
    expect(variacao).toHaveTextContent('61%')
    expect(variacao).toHaveTextContent('a mais')
    // nomeia CONTRA QUAL mês — "+61%" sozinho não diz de onde saiu
    expect(variacao).toHaveTextContent('jun/26')
  })

  it('gastou MENOS: sinal e palavra invertem, e NUNCA entra verde (o par acessível do app é azul/vermelho)', async () => {
    mockRotas({
      categorias: reportComDados,
      numeros: {
        ...numerosNeutros,
        previous_competence: '2026-06',
        variation_cents: -34000,
        variation_pct: -27,
      },
    })

    render(<BlocoCategorias />)

    const variacao = await screen.findByTestId('variacao')
    expect(variacao).toHaveTextContent('−R$ 340,00')
    expect(variacao).toHaveTextContent('a menos')
    // Gastar menos é boa notícia, e o impulso óbvio é pintar de verde —
    // seria regressão de acessibilidade (protanopia/deuteranopia preservam
    // o azul, não o verde; --success fica pra confirmação de salvamento).
    //
    // ⚠️ **`not.toHaveClass('text-success')` sozinho era DECORATIVO — achado
    // da revisão, medido:** o verde real que alguém escreveria aqui é
    // `text-green-600` (a escala do Tailwind), e uma mutação com essa classe
    // passava por essa linha sem tocá-la; quem matava a mutação era só a
    // asserção POSITIVA logo abaixo. Uma negativa que nomeia a regressão
    // errada dá falsa segurança sobre exatamente a classe que ela cita.
    expect(variacao.className).not.toMatch(/green|emerald|success|lime|teal/i)
    expect(variacao).toHaveClass('text-muted-foreground')
    // e o sinal não é a cor: é o "−" e a palavra "a menos"
    expect(variacao).not.toHaveClass('text-destructive')
  })

  it('gastou mais usa --destructive (vermelho = dinheiro saindo, coerente com o resto do app)', async () => {
    mockRotas({
      categorias: reportComDados,
      numeros: { ...numerosNeutros, variation_cents: 34000, variation_pct: 61 },
    })

    render(<BlocoCategorias />)

    expect(await screen.findByTestId('variacao')).toHaveClass(
      'text-destructive',
    )
  })

  it('mês anterior sem gasto nenhum (variation_pct null): mostra só o valor, nunca um "Infinity%"', async () => {
    mockRotas({
      categorias: reportComDados,
      numeros: {
        ...numerosNeutros,
        previous_competence: '2026-06',
        variation_cents: 90000,
        variation_pct: null,
      },
    })

    render(<BlocoCategorias />)

    const variacao = await screen.findByTestId('variacao')
    expect(variacao).toHaveTextContent('+R$ 900,00')
    expect(variacao.textContent).not.toMatch(/Infinity|NaN|%/)
  })

  it('variação ZERO não renderiza nada — "+R$ 0,00 a mais" seria ruído', async () => {
    mockRotas({
      categorias: reportComDados,
      numeros: { ...numerosNeutros, variation_cents: 0, variation_pct: 0 },
    })

    render(<BlocoCategorias />)

    await waitFor(() =>
      expect(screen.getByTestId('total-gasto')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('variacao')).not.toBeInTheDocument()
  })

  it('⑥ falha em /api/insights/numbers NÃO derruba o card — a referência some, o total e o gráfico ficam', async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.startsWith('/api/insights/numbers'))
        return Promise.reject(
          new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
        )
      return Promise.resolve(reportComDados)
    })

    render(<BlocoCategorias />)

    await waitFor(() =>
      expect(screen.getByTestId('total-gasto')).toHaveTextContent('R$ 900,00'),
    )
    expect(screen.queryByTestId('variacao')).not.toBeInTheDocument()
    // sem alerta: a rota da referência não é o assunto deste card, e o dono
    // não tem o que fazer a respeito dela aqui
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a variação é REBUSCADA ao trocar de mês — nunca fica a do mês anterior colada na tela', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-20T15:00:00Z'))
    try {
      vi.mocked(api).mockImplementation((path: string) => {
        if (path.startsWith('/api/insights/numbers')) {
          return Promise.resolve(
            path.includes('competence=2026-08')
              ? {
                  ...numerosNeutros,
                  previous_competence: '2026-07',
                  variation_cents: -1000,
                  variation_pct: -5,
                }
              : {
                  ...numerosNeutros,
                  previous_competence: '2026-06',
                  variation_cents: 34000,
                  variation_pct: 61,
                },
          )
        }
        return Promise.resolve(reportComDados)
      })

      render(<BlocoCategorias />)

      expect(await screen.findByTestId('variacao')).toHaveTextContent(
        '+R$ 340,00',
      )

      fireEvent.change(screen.getByLabelText('Mês'), {
        target: { value: '2026-08' },
      })

      await waitFor(() =>
        expect(screen.getByTestId('variacao')).toHaveTextContent('−R$ 10,00'),
      )
      expect(chamadas('/api/insights/numbers')).toEqual([
        '/api/insights/numbers?competence=2026-07',
        '/api/insights/numbers?competence=2026-08',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('estado erro: mostra a mensagem dentro do próprio card, com role="alert"', async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
    )

    render(<BlocoCategorias />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sem conexão com o servidor',
      ),
    )
    expect(screen.queryByTestId('grafico-categorias')).not.toBeInTheDocument()
  })

  it('o seletor de mês REFAZ a busca — não é só um re-render local com o dado antigo', async () => {
    // Relógio fixado — mesmo motivo do último teste do arquivo ("mês
    // default vem de todayInTeresina()"): o mock abaixo distingue os dois
    // reports por COMPETÊNCIA LITERAL ('2026-08' = "o mês pra onde o dono
    // troca"), e o carregamento INICIAL usa `competenciaAtual()` (relógio
    // real). Sem fixar o relógio, o dia em que "hoje" cair em agosto/2026
    // faz a competência do carregamento inicial colidir com a competência
    // do mock de troca — o primeiro fetch já bate no branch errado
    // (`reportAgosto` em vez de `reportComDados`), quebrando o teste por
    // deriva de calendário, não por regressão no componente. Achado real:
    // este arquivo foi escrito em 2026-07-27 (quando "hoje" era julho); o
    // relógio da máquina alcançou 2026-08 e o teste passou a falhar sozinho.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-20T15:00:00Z'))
    try {
      const reportAgosto = {
        competence: '2026-08',
        rows: [
          {
            category_id: 'c-inss',
            category_name: 'INSS',
            category_slug: 'inss',
            total_cents: -20000,
          },
        ],
        total_cents: -20000,
      }
      vi.mocked(api).mockImplementation((path: string) => {
        if (path.startsWith('/api/insights/numbers'))
          return Promise.resolve(numerosNeutros)
        if (path.includes('competence=2026-08')) {
          return Promise.resolve(reportAgosto)
        }
        return Promise.resolve(reportComDados)
      })

      render(<BlocoCategorias />)

      await waitFor(() =>
        expect(screen.getByTestId('total-gasto')).toHaveTextContent(
          'R$ 900,00',
        ),
      )
      expect(chamadas('/api/reports/by-category')).toHaveLength(1)

      fireEvent.change(screen.getByLabelText('Mês'), {
        target: { value: '2026-08' },
      })

      await waitFor(() =>
        expect(screen.getByTestId('total-gasto')).toHaveTextContent(
          'R$ 200,00',
        ),
      )

      // A PROVA que importa: uma SEGUNDA chamada de rede com a competência
      // nova — não só o `<select>` mudando de valor visualmente.
      expect(chamadas('/api/reports/by-category')).toEqual([
        '/api/reports/by-category?competence=2026-07',
        '/api/reports/by-category?competence=2026-08',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('refetch falho DEPOIS de um carregamento inicial bem-sucedido não esconde o report antigo nem o seletor — erro aparece inline, o dono consegue tentar de novo', async () => {
    // Fix round 1 (Task 8, IMPORTANT do review): antes deste fix, este
    // cenário passava o `erro` de uma troca de mês pro `erro` de `Bloco`
    // do mesmo jeito que o erro do carregamento INICIAL — e `Bloco` troca
    // `children` inteiro (seletor incluído) pelo card de alerta. Resultado:
    // dono no Android com conexão instável troca de mês, a busca cai, e
    // fica sem `<input type="month">` NENHUM na tela pra tentar outro mês —
    // só navegando pra fora de `#/` e voltando. Este teste finca o
    // comportamento correto: erro de refetch aparece inline (role="alert"),
    // o total/seletor/gráfico do mês anterior continuam de pé, e uma nova
    // troca de mês (a "tentativa de novo") se recupera normalmente.
    // Relógio fixado — mesmo motivo do teste anterior ("o seletor de mês
    // REFAZ a busca"): o mock abaixo distingue os três reports por
    // COMPETÊNCIA LITERAL, e o carregamento INICIAL usa `competenciaAtual()`
    // (relógio real). Sem fixar, "hoje" caindo em '2026-08'/'2026-09' faz o
    // PRIMEIRO fetch (o carregamento inicial, que este teste espera que dê
    // CERTO) colidir com o branch de FALHA — o card nunca chega a mostrar o
    // total antigo, e o teste falha antes mesmo de chegar no cenário de
    // refetch que ele existe pra provar.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-20T15:00:00Z'))
    try {
      const reportSetembro = {
        competence: '2026-09',
        rows: [
          {
            category_id: 'c-inss',
            category_name: 'INSS',
            category_slug: 'inss',
            total_cents: -15000,
          },
        ],
        total_cents: -15000,
      }
      vi.mocked(api).mockImplementation((path: string) => {
        if (path.startsWith('/api/insights/numbers'))
          return Promise.resolve(numerosNeutros)
        if (path.includes('competence=2026-08')) {
          return Promise.reject(
            new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
          )
        }
        if (path.includes('competence=2026-09')) {
          return Promise.resolve(reportSetembro)
        }
        return Promise.resolve(reportComDados)
      })

      render(<BlocoCategorias />)

      await waitFor(() =>
        expect(screen.getByTestId('total-gasto')).toHaveTextContent(
          'R$ 900,00',
        ),
      )

      // troca pra um mês cuja busca vai falhar (refetch, não carregamento inicial)
      fireEvent.change(screen.getByLabelText('Mês'), {
        target: { value: '2026-08' },
      })

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'sem conexão com o servidor',
        ),
      )

      // NADA do que já estava na tela sumiu por causa do erro de refetch:
      // total antigo, seletor (com o valor novo, mesmo a busca tendo falhado
      // — é um `<input>` controlado, reflete o que o dono digitou) e gráfico
      // continuam de pé, ao lado do alerta — não em vez dele.
      expect(screen.getByTestId('total-gasto')).toHaveTextContent('R$ 900,00')
      expect(screen.getByLabelText('Mês')).toBeInTheDocument()
      expect(screen.getByLabelText('Mês')).toHaveValue('2026-08')
      expect(screen.getByTestId('grafico-categorias')).toBeInTheDocument()
      // o `Bloco` NÃO assumiu o card inteiro — o heading do bloco continua
      // no ar junto com o alerta (contraste direto com o teste de erro
      // INICIAL acima, onde só o alerta aparece).
      expect(
        screen.getByRole('heading', { name: 'Para onde foi o dinheiro' }),
      ).toBeInTheDocument()

      // recuperação: o seletor continua alcançável, então o dono TENTA DE
      // NOVO — troca pra um mês que dá certo, o alerta some, o total atualiza.
      fireEvent.change(screen.getByLabelText('Mês'), {
        target: { value: '2026-09' },
      })

      await waitFor(() =>
        expect(screen.getByTestId('total-gasto')).toHaveTextContent(
          'R$ 150,00',
        ),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('o mês default vem de todayInTeresina() — não de new Date().toISOString() cru (UTC)', async () => {
    // 01:00 UTC de 01/08 é 22h de 31/07 em Teresina (UTC−3): a competência
    // é jul/26, não ago/26. Mesma armadilha de lib/dates.test.ts, um nível
    // acima — se este componente usasse `new Date().toISOString().slice(0,7)`
    // em vez de `competenciaAtual()`, este teste pediria '2026-08' e falharia.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      mockRotas({ categorias: reportVazio })

      render(<BlocoCategorias />)

      await waitFor(() =>
        expect(api).toHaveBeenCalledWith(
          '/api/reports/by-category?competence=2026-07',
        ),
      )
      expect(screen.getByLabelText('Mês')).toHaveValue('2026-07')
    } finally {
      vi.useRealTimers()
    }
  })
})
