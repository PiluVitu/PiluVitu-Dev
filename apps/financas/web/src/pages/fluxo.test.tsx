import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FluxoPage } from './fluxo'

const reportBase = {
  meses: ['2026-06', '2026-07'],
  linhas: [
    {
      competence: '2026-06',
      entrou_cents: 500000,
      saiu_cents: 200000,
      saldo_cents: 300000,
      acumulado_cents: 300000,
    },
    // mês zerado de propósito — cobre "mês vazio aparece zerado, não ausente".
    {
      competence: '2026-07',
      entrou_cents: 0,
      saiu_cents: 0,
      saldo_cents: 0,
      acumulado_cents: 300000,
    },
  ],
}

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FluxoPage', () => {
  it('mostra entrou, saiu, saldo e acumulado por mês', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )
    const linha = within(screen.getByTestId('linha-2026-06'))
    expect(linha.getByTestId('entrou')).toHaveTextContent('R$ 5.000,00')
    expect(linha.getByTestId('saiu')).toHaveTextContent('R$ 2.000,00')
    expect(linha.getByTestId('saldo')).toHaveTextContent('R$ 3.000,00')
    expect(linha.getByTestId('acumulado')).toHaveTextContent('R$ 3.000,00')
  })

  it('mês sem movimento aparece zerado na tabela, não some da lista', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-07')).toBeInTheDocument(),
    )
    const linha = within(screen.getByTestId('linha-2026-07'))
    expect(linha.getByTestId('entrou')).toHaveTextContent('R$ 0,00')
    expect(linha.getByTestId('saiu')).toHaveTextContent('R$ 0,00')
    expect(linha.getByTestId('saldo')).toHaveTextContent('R$ 0,00')
    // acumulado migra o saldo do mês anterior, nunca zera.
    expect(linha.getByTestId('acumulado')).toHaveTextContent('R$ 3.000,00')
  })

  it('pede 12 meses por padrão, terminando no mês corrente', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: reportBase,
      notifications: [],
    })

    render(<FluxoPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/reports/cashflow?from=')
    expect(url).toContain('months=12')
  })

  // A PROVA que importa: uma SEGUNDA chamada de rede com a janela nova —
  // não só o <select> mudando de valor visualmente / estado local mudando.
  it('o seletor de janela REFAZ a busca — asserção na segunda chamada de fetch', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: reportBase,
      notifications: [],
    })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Janela'), {
      target: { value: '24' },
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const segundaUrl = String(fetchMock.mock.calls[1][0])
    expect(segundaUrl).toContain('months=24')
    // a primeira chamada usava months=12 — prova que a URL realmente mudou,
    // não é a mesma chamada repetida.
    expect(String(fetchMock.mock.calls[0][0])).toContain('months=12')
  })

  it('estado vazio (nenhum mês com entrada ou saída) explica que só lançamento liquidado entra', async () => {
    mockFetch({
      ok: true,
      data: {
        meses: ['2026-06', '2026-07'],
        linhas: [
          {
            competence: '2026-06',
            entrou_cents: 0,
            saiu_cents: 0,
            saldo_cents: 0,
            acumulado_cents: 0,
          },
          {
            competence: '2026-07',
            entrou_cents: 0,
            saiu_cents: 0,
            saldo_cents: 0,
            acumulado_cents: 0,
          },
        ],
      },
      notifications: [],
    })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByText(/liquidado/i)).toBeInTheDocument(),
    )
    // Explica a distinção com o Comprometido: parcela prevista é
    // compromisso, não caixa.
    expect(screen.getByText(/comprometido/i)).toBeInTheDocument()
    // sem dado nenhum, o gráfico (lazy) não deveria montar.
    expect(screen.queryByTestId('grafico-fluxo')).not.toBeInTheDocument()
  })

  it('com dado real (não vazio) não mostra a explicação de estado vazio', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/liquidado/i)).not.toBeInTheDocument()
  })

  it('mostra o erro da API', async () => {
    mockFetch(
      {
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'invalid_query',
            message: 'competencia invalida: 2026-8',
          },
        ],
      },
      400,
    )

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'competencia invalida',
      ),
    )
  })

  it('ajuda: "Fluxo de caixa" abre no clique explicando o que entra na tela', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    mockFetch({ ok: true, data: reportBase, notifications: [] })
    const user = userEvent.setup()

    render(<FluxoPage />)
    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Fluxo de caixa' }),
    )
    expect(await screen.findByText(/liquidado/i)).toBeInTheDocument()
  })
})
