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

afterEach(() => {
  vi.clearAllMocks()
})

describe('BlocoCategorias', () => {
  it('com dados: busca a competência atual, mostra o total gasto e, quando o gráfico (lazy) termina de carregar, o conteúdo', async () => {
    vi.mocked(api).mockResolvedValue(reportComDados)

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

    expect(api).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\/api\/reports\/by-category\?competence=\d{4}-\d{2}$/,
      ),
    )
  })

  it('mês vazio (sem gasto no período): mostra a mensagem, sem gráfico — mas o seletor de mês continua disponível', async () => {
    vi.mocked(api).mockResolvedValue(reportVazio)

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
      if (path.includes('competence=2026-08')) {
        return Promise.resolve(reportAgosto)
      }
      return Promise.resolve(reportComDados)
    })

    render(<BlocoCategorias />)

    await waitFor(() =>
      expect(screen.getByTestId('total-gasto')).toHaveTextContent('R$ 900,00'),
    )
    expect(api).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Mês'), {
      target: { value: '2026-08' },
    })

    await waitFor(() =>
      expect(screen.getByTestId('total-gasto')).toHaveTextContent('R$ 200,00'),
    )

    // A PROVA que importa: uma SEGUNDA chamada de rede com a competência
    // nova — não só o `<select>` mudando de valor visualmente.
    expect(api).toHaveBeenCalledTimes(2)
    expect(api).toHaveBeenLastCalledWith(
      '/api/reports/by-category?competence=2026-08',
    )
  })

  it('o mês default vem de todayInTeresina() — não de new Date().toISOString() cru (UTC)', async () => {
    // 01:00 UTC de 01/08 é 22h de 31/07 em Teresina (UTC−3): a competência
    // é jul/26, não ago/26. Mesma armadilha de lib/dates.test.ts, um nível
    // acima — se este componente usasse `new Date().toISOString().slice(0,7)`
    // em vez de `competenciaAtual()`, este teste pediria '2026-08' e falharia.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      vi.mocked(api).mockResolvedValue(reportVazio)

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
