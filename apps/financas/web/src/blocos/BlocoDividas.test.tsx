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

  // ⚠️ **DUAS dívidas de propósito.** Com uma só, a soma e a linha
  // coincidem e a asserção não prova nada: uma implementação que mostrasse
  // `remaining_cents` da PRIMEIRA linha em vez da soma passaria igual.
  const duasDividas = [
    {
      id: 'd1',
      title: 'Empréstimo do pai',
      payee_name: 'Pai',
      total_cents: 730000,
      paid_cents: 594000,
      remaining_cents: 136000,
    },
    {
      id: 'd2',
      title: 'Notebook',
      payee_name: 'Tio',
      total_cents: 300000,
      paid_cents: 50000,
      remaining_cents: 250000,
    },
  ]

  it('a manchete é a SOMA do que falta, não uma das linhas — "quanto eu devo no total?" deixa de ser conta de cabeça', async () => {
    vi.mocked(api).mockResolvedValue(duasDividas)

    render(<BlocoDividas />)

    // 136000 + 250000 = 386000 — um valor que NÃO é o de nenhuma linha.
    await waitFor(() =>
      expect(screen.getByTestId('total-devido-home')).toHaveTextContent(
        'R$ 3.860,00',
      ),
    )

    // as linhas continuam mostrando o próprio valor, intactas
    expect(screen.getByTestId('divida-d1-falta')).toHaveTextContent(
      'R$ 1.360,00',
    )
    expect(screen.getByTestId('divida-d2-falta')).toHaveTextContent(
      'R$ 2.500,00',
    )

    // o contexto conta quantas dívidas entraram na soma
    expect(screen.getByText('2 dívida(s) em aberto')).toBeInTheDocument()
  })

  it('a contagem sob a manchete é a das dívidas que a SOMA cobre, não o total de linhas', async () => {
    // ⚠️ Achado da revisão. Uma dívida recém-criada ainda não tem item, então
    // `remaining_cents: 0` — ela é uma linha real do card (mostra "Sem itens
    // lançados ainda") mas NÃO entra na soma. Com `dividas.length`, este
    // cenário lia "3 dívida(s) em aberto" sob um número que cobre 2, e o dono
    // dividiria dois valores por três pra estimar quanto deve por dívida.
    vi.mocked(api).mockResolvedValue([
      ...duasDividas,
      {
        id: 'd3',
        title: 'Bicicleta',
        payee_name: 'Vizinho',
        total_cents: 0,
        paid_cents: 0,
        remaining_cents: 0,
      },
    ])

    render(<BlocoDividas />)

    // a soma não mudou: a terceira dívida contribui 0
    await waitFor(() =>
      expect(screen.getByTestId('total-devido-home')).toHaveTextContent(
        'R$ 3.860,00',
      ),
    )
    expect(screen.getByText('2 dívida(s) em aberto')).toBeInTheDocument()
    expect(screen.queryByText('3 dívida(s) em aberto')).not.toBeInTheDocument()

    // ⚠️ e a terceira continua VISÍVEL na lista — ela não some do card, só
    // não entra na soma nem na contagem que qualifica a soma.
    expect(screen.getByTestId('divida-d3')).toBeInTheDocument()
  })

  it('a manchete é 24px com rótulo em versalete mono; as LINHAS continuam em text-sm (N manchetes = nenhuma manchete)', async () => {
    vi.mocked(api).mockResolvedValue(duasDividas)

    render(<BlocoDividas />)

    const manchete = await screen.findByTestId('total-devido-home')
    // `NUMERO_GRID` — escala escolhida por medição (174px de caixa útil a
    // 768px, o `md`), com `tabular-nums` embutido.
    expect(manchete).toHaveClass('text-2xl')
    expect(manchete).toHaveClass('tabular-nums')

    // `ROTULO` (`lib/tipografia.ts`), a assinatura do /admin.
    expect(screen.getByText('Total que devo')).toHaveClass(
      'font-mono',
      'uppercase',
      'text-xs',
    )

    // ⚠️ O `falta` de cada dívida NÃO foi promovido: seria N manchetes, e
    // a barra de progresso já é o comparativo da linha.
    expect(screen.getByTestId('divida-d1-falta')).not.toHaveClass('text-2xl')
    expect(screen.getByTestId('divida-d2-falta')).not.toHaveClass('text-2xl')
  })

  it('a manchete mantém os CENTAVOS — é o MESMO número que #/dividas já mostra com centavos', async () => {
    // Duas grafias do mesmo valor em duas telas é pior que qualquer
    // economia de pixel: `pages/DividasPage.tsx` usa `NumeroCard`
    // `escala="heroi"` (COM centavos) pra esta mesma soma.
    vi.mocked(api).mockResolvedValue([
      { ...duasDividas[0], remaining_cents: 18950 },
    ])

    render(<BlocoDividas />)

    await waitFor(() =>
      expect(screen.getByTestId('total-devido-home')).toHaveTextContent(
        'R$ 189,50',
      ),
    )
    expect(document.body.textContent).not.toContain('R$ 190')
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

    // ⚠️ E a manchete NÃO aparece: "R$ 0,00" em 24px no topo seria destaque
    // pra AUSÊNCIA de assunto. Mesmo espírito do `euDevo.length > 0` que
    // guarda o `NumeroCard` de `pages/DividasPage.tsx`. A linha já diz
    // "Sem itens lançados ainda".
    expect(screen.queryByTestId('total-devido-home')).not.toBeInTheDocument()
    expect(screen.queryByText('Total que devo')).not.toBeInTheDocument()
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
