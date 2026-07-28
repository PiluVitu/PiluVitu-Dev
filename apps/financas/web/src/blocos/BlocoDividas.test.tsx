import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { BlocoDividas } from './BlocoDividas'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('BlocoDividas', () => {
  it('dívida parcial: mostra a barra de progresso e o valor que falta', async () => {
    // Caso real do dono: dívida com o pai, itens Steam Deck (280000) +
    // MacBook (450000) = 730000 no total; pago 594000 até agora ⇒ falta
    // 136000 (R$ 1.360, o valor em aberto hoje).
    vi.mocked(api).mockResolvedValue([
      {
        id: 'd1',
        title: 'Empréstimo do pai',
        payee_name: 'Pai',
        total_cents: 730000,
        paid_cents: 594000,
        remaining_cents: 136000,
      },
    ])

    render(<BlocoDividas />)

    expect(screen.getByRole('heading', { name: 'Dívidas' })).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByTestId('divida-d1-falta')).toHaveTextContent(
        'R$ 1.360,00',
      ),
    )

    const barra = screen.getByRole('progressbar', {
      name: /empréstimo do pai/i,
    })
    // 594000 / 730000 = 81,36...% → arredonda pra 81
    expect(barra).toHaveAttribute('aria-valuenow', '81')
    expect(barra).toHaveAttribute('aria-valuemin', '0')
    expect(barra).toHaveAttribute('aria-valuemax', '100')

    expect(screen.getByText(/pai/i)).toBeInTheDocument()

    // só dívida em aberto que EU devo — nunca o que me devem
    expect(api).toHaveBeenCalledWith('/api/debts?status=open&direction=i_owe')
  })

  it('dívida sem item: não divide por zero, mostra aviso em vez de barra quebrada', async () => {
    vi.mocked(api).mockResolvedValue([
      {
        id: 'd2',
        title: 'Dívida nova, sem item ainda',
        payee_name: 'Alguém',
        total_cents: 0,
        paid_cents: 0,
        remaining_cents: 0,
      },
    ])

    render(<BlocoDividas />)

    await waitFor(() =>
      expect(
        screen.getByText(/dívida nova, sem item ainda/i),
      ).toBeInTheDocument(),
    )

    expect(
      screen.queryByRole('progressbar', { name: /dívida nova/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/sem itens lançados/i)).toBeInTheDocument()
  })

  it('lista vazia: mostra a mensagem de vazio, não uma tabela quebrada', async () => {
    vi.mocked(api).mockResolvedValue([])

    render(<BlocoDividas />)

    await waitFor(() =>
      expect(screen.getByText(/nenhuma dívida em aberto/i)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('erro: mostra a mensagem dentro do próprio card, com role="alert"', async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
    )

    render(<BlocoDividas />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sem conexão com o servidor',
      ),
    )
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
