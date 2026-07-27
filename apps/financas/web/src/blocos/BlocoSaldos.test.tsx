import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { BlocoSaldos } from './BlocoSaldos'

// Mockar `api` (não a rede) — mesmo padrão de BlocoComprometido.test.tsx: `api`
// já traduz o envelope e os erros, testar nesse nível prova o comportamento do
// COMPONENTE, não do transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BlocoSaldos', () => {
  it('com contas: separa PJ de PF, cada um com o próprio total (valores DIFERENTES — um filtro trocado falha)', async () => {
    vi.mocked(api).mockResolvedValue([
      { id: 'pj1', name: 'Nubank PJ', scope: 'PJ', balance_cents: 500000 },
      { id: 'pj2', name: 'Inter PJ', scope: 'PJ', balance_cents: 300000 },
      { id: 'pf1', name: 'Nubank PF', scope: 'PF', balance_cents: 100000 },
    ])

    render(<BlocoSaldos />)

    expect(screen.getByRole('heading', { name: 'Saldos' })).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByTestId('total-PJ')).toHaveTextContent('R$ 8.000,00'),
    )
    expect(screen.getByTestId('total-PF')).toHaveTextContent('R$ 1.000,00')

    // as três contas aparecem, cada uma com o próprio saldo
    expect(screen.getByTestId('saldo-pj1')).toHaveTextContent('R$ 5.000,00')
    expect(screen.getByTestId('saldo-pj2')).toHaveTextContent('R$ 3.000,00')
    expect(screen.getByTestId('saldo-pf1')).toHaveTextContent('R$ 1.000,00')

    // sem query string extra — conta arquivada já vem escondida pelo default
    // de GET /api/accounts, não precisa (nem deve) pedir ?archived=1
    expect(api).toHaveBeenCalledWith('/api/accounts')
  })

  it('sem conta nenhuma: estado vazio com uma chamada real para ação (sem conta não dá pra lançar nada)', async () => {
    vi.mocked(api).mockResolvedValue([])

    render(<BlocoSaldos />)

    await waitFor(() =>
      expect(screen.getByText(/nenhuma conta/i)).toBeInTheDocument(),
    )

    // não é decoração: tem um link de verdade pra sair do buraco
    const link = screen.getByRole('link', { name: /criar conta/i })
    expect(link).toHaveAttribute('href', '#/contas')
  })

  it('erro: mostra a mensagem dentro do próprio card, com role="alert"', async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
    )

    render(<BlocoSaldos />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sem conexão com o servidor',
      ),
    )
    expect(screen.queryByTestId('total-PJ')).not.toBeInTheDocument()
    expect(screen.queryByTestId('total-PF')).not.toBeInTheDocument()
  })
})
