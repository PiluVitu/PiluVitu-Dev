import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { HomePage } from './home'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const reportVazio = {
  competences: [
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
  ],
  rows: [],
  totals: [0, 0, 0, 0, 0, 0],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [0, 0, 0, 0, 0, 0],
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('HomePage', () => {
  it('mostra o título Início e monta os quatro blocos', async () => {
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.startsWith('/api/reports/commitments'))
        return Promise.resolve(reportVazio)
      if (path.startsWith('/api/accounts')) return Promise.resolve([])
      if (path.startsWith('/api/debts')) return Promise.resolve([])
      if (path.startsWith('/api/reports/by-category'))
        return Promise.resolve({
          competence: '2026-07',
          rows: [],
          total_cents: 0,
        })
      return Promise.reject(new Error(`rota inesperada em teste: ${path}`))
    })

    render(<HomePage />)

    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument()
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Comprometido' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Saldos' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Dívidas' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Para onde foi o dinheiro' }),
      ).toBeInTheDocument()
    })
  })

  it('todos os blocos em erro: a home continua de pé (título + os 4 cards contidos)', async () => {
    vi.mocked(api).mockRejectedValue(new Error('falhou'))

    render(<HomePage />)

    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(4))
    // o título continua no ar — o erro ficou contido nos cards dos blocos
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument()
  })

  it('um bloco em erro NÃO derruba os outros — prova real: os outros dois mostram DADO de verdade, não só o card vazio', async () => {
    // Só o bloco Comprometido falha; Saldos e Dívidas recebem dado real.
    // Se o erro do Comprometido escapasse do próprio componente (ex.: um
    // throw síncrono no render em vez de ficar contido no `catch` do
    // `useEffect`), o React desmontaria a árvore inteira e NENHUMA das
    // asserções abaixo passaria — nem sequer o <h1>Início</h1>. Verificado
    // por mutação: ver task-7-report.md.
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.startsWith('/api/reports/commitments'))
        return Promise.reject(new Error('comprometido indisponível'))
      if (path.startsWith('/api/accounts')) {
        return Promise.resolve([
          { id: 'pj1', name: 'Nubank PJ', scope: 'PJ', balance_cents: 500000 },
          { id: 'pf1', name: 'Nubank PF', scope: 'PF', balance_cents: 100000 },
        ])
      }
      if (path.startsWith('/api/debts')) {
        return Promise.resolve([
          {
            id: 'd1',
            title: 'Empréstimo do pai',
            payee_name: 'Pai',
            total_cents: 730000,
            paid_cents: 594000,
            remaining_cents: 136000,
          },
        ])
      }
      if (path.startsWith('/api/reports/by-category')) {
        return Promise.resolve({
          competence: '2026-07',
          rows: [
            {
              category_id: 'c-das',
              category_name: 'DAS — Simples Nacional',
              category_slug: 'das',
              total_cents: -70000,
            },
          ],
          total_cents: -70000,
        })
      }
      return Promise.reject(new Error(`rota inesperada em teste: ${path}`))
    })

    render(<HomePage />)

    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument()

    // Comprometido: erro contido dentro do próprio card
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'comprometido indisponível',
      ),
    )

    // Saldos: dado REAL renderizado (não apenas "o card existe")
    expect(screen.getByTestId('total-PJ')).toHaveTextContent('R$ 5.000,00')
    expect(screen.getByTestId('total-PF')).toHaveTextContent('R$ 1.000,00')

    // Dívidas: dado REAL renderizado, com a barra de progresso funcionando
    expect(screen.getByTestId('divida-d1-falta')).toHaveTextContent(
      'R$ 1.360,00',
    )
    expect(
      screen.getByRole('progressbar', { name: /empréstimo do pai/i }),
    ).toHaveAttribute('aria-valuenow', '81')

    // Categorias: dado REAL renderizado, com o gráfico (lazy) montado
    await waitFor(() =>
      expect(screen.getByTestId('total-gasto')).toHaveTextContent('R$ 700,00'),
    )
    // O `<Suspense>` do gráfico resolve numa promise separada da `api()` —
    // `total-gasto` (fora do boundary) já pode estar no DOM antes do
    // `import()` dinâmico terminar, então isto precisa do próprio `waitFor`.
    await waitFor(() =>
      expect(screen.getByTestId('grafico-categorias')).toBeInTheDocument(),
    )

    // exatamente 1 alert na tela inteira — o erro não vazou para os outros
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
