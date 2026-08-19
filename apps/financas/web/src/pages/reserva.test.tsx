import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatBRL } from '@piluvitu/tools/money'
import {
  simulateCashPurchase,
  simulateFinancedPurchase,
} from '@piluvitu/tools/simulacao'
import { api, ApiError } from '../api'
import { formatMeses } from '../lib/reserve'
import { ReservaPage } from './reserva'

// Mockar `api` (não a rede) — mesmo padrão de config.test.tsx/
// recorrentes.test.tsx: `api` já traduz envelope/erro, testar aqui prova o
// COMPONENTE, não o transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

const statusVazio = {
  saldo_cents: 0,
  meta_cents: { min: 0, max: 0 },
  meses: null,
  contas: [],
  goal_months: 3,
}

const contasFixture = [
  {
    id: 'a1',
    name: 'Nubank PJ',
    scope: 'PJ',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 100000,
  },
  {
    id: 'a2',
    name: 'Caixinha PF',
    scope: 'PF',
    kind: 'savings',
    closing_day: null,
    due_day: null,
    balance_cents: 50000,
  },
]

/** Roteia `api()` mockado por (método, path) — mesmo padrão das outras telas. */
function mockApi(
  opts: {
    reserve?: () => unknown
    accounts?: () => unknown
    settings?: () => unknown
    put?: (body: { account_ids: string[] }) => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && path.startsWith('/api/reserve')) {
        return opts.reserve ? opts.reserve() : statusVazio
      }
      if (method === 'GET' && path === '/api/accounts') {
        return opts.accounts ? opts.accounts() : contasFixture
      }
      // Denominador do simulador financiado (Task 4) — nunca o líquido
      // com freela; default aqui é o mesmo R$3.600 que o servidor usa
      // quando nada foi salvo em `settings`.
      if (method === 'GET' && path === '/api/settings') {
        return opts.settings ? opts.settings() : { fixed_net_cents: 360000 }
      }
      if (method === 'PUT' && path === '/api/reserve/accounts') {
        const body = init?.body
          ? (JSON.parse(String(init.body)) as { account_ids: string[] })
          : { account_ids: [] }
        return opts.put ? opts.put(body) : { account_ids: body.account_ids }
      }
      throw new Error(`chamada inesperada: ${method} ${path}`)
    },
  )
}

describe('ReservaPage', () => {
  it('1. mostra saldo, meta e meses como faixa', async () => {
    mockApi({
      reserve: () => ({
        saldo_cents: 150000,
        meta_cents: { min: 100000, max: 300000 },
        meses: { min: 2.1, max: 4.8 },
        contas: ['a1'],
        goal_months: 3,
      }),
    })

    render(<ReservaPage />)

    expect(
      await screen.findByRole('heading', { name: 'Reserva de emergência' }),
    ).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 1.500,00'),
    )
    expect(screen.getByTestId('meta')).toHaveTextContent(
      'R$ 1.000,00 a R$ 3.000,00',
    )
    expect(screen.getByTestId('meses')).toHaveTextContent(
      'entre 2,1 e 4,8 meses',
    )
  })

  describe('2. alerta pelo PISO, nunca pelo teto (espelho do limiar do Comprometido)', () => {
    it('piso abaixo da meta e teto acima ⇒ alerta visível', async () => {
      mockApi({
        reserve: () => ({
          saldo_cents: 60000,
          meta_cents: { min: 60000, max: 240000 },
          meses: { min: 2, max: 5 },
          contas: ['a1'],
          goal_months: 3,
        }),
      })

      render(<ReservaPage />)

      await waitFor(() =>
        expect(screen.getByTestId('meses')).toHaveTextContent(
          'entre 2,0 e 5,0 meses',
        ),
      )
      expect(screen.getByRole('alert')).toHaveTextContent(/abaixo/i)
    })

    it('piso na meta ou acima ⇒ SEM alerta, mesmo com faixa aberta', async () => {
      mockApi({
        reserve: () => ({
          saldo_cents: 300000,
          meta_cents: { min: 60000, max: 240000 },
          meses: { min: 4, max: 6 },
          contas: ['a1'],
          goal_months: 3,
        }),
      })

      render(<ReservaPage />)

      await waitFor(() =>
        expect(screen.getByTestId('meses')).toHaveTextContent(
          'entre 4,0 e 6,0 meses',
        ),
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('3. meses: null ⇒ explica que falta cadastrar custo fixo, com link pra Recorrentes', async () => {
    mockApi({
      reserve: () => ({
        ...statusVazio,
        saldo_cents: 100000,
        contas: ['a1'],
      }),
    })

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByTestId('sem-custo-fixo')).toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /recorrentes/i })
    expect(link).toHaveAttribute('href', '#/recorrentes')
    // Nunca "infinito" nem "0 meses" — as duas mentiras que a tela tem que
    // evitar quando a verdade é "nada foi cadastrado ainda".
    expect(screen.queryByText(/infinito/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('meses')).not.toBeInTheDocument()
  })

  it('4. nenhuma conta designada ⇒ explica o que fazer', async () => {
    mockApi({
      reserve: () => ({
        ...statusVazio,
        meses: { min: 2, max: 5 },
        contas: [],
      }),
    })

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByTestId('sem-conta-designada')).toBeInTheDocument(),
    )
  })

  it('nenhuma conta CADASTRADA (não só não designada) ⇒ explica e linka pra Contas', async () => {
    mockApi({
      reserve: () => statusVazio,
      accounts: () => [],
    })

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByText(/nenhuma conta cadastrada/i)).toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /criar conta/i })
    expect(link).toHaveAttribute('href', '#/contas')
  })

  it('5. designar conta e ver o saldo mudar', async () => {
    let designadas: string[] = []
    mockApi({
      reserve: () => ({
        ...statusVazio,
        saldo_cents: designadas.includes('a1') ? 100000 : 0,
        contas: designadas,
      }),
      put: (body) => {
        designadas = body.account_ids
        return { account_ids: body.account_ids }
      },
    })

    const user = userEvent.setup()
    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 0,00'),
    )

    await user.click(screen.getByLabelText(/Nubank PJ/))
    await user.click(
      screen.getByRole('button', { name: 'Salvar contas designadas' }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 1.000,00'),
    )
    expect(api).toHaveBeenCalledWith(
      '/api/reserve/accounts',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ account_ids: ['a1'] }),
      }),
    )
  })

  // PUT 200 + GET seguinte caindo. O PUT é idempotente (substitui a lista
  // inteira), então reenviar não corrompe nada — o defeito aqui é só
  // enganar: a tela dizia "falhou" e continuava mostrando o saldo/os meses
  // ANTIGOS, confirmando visualmente a mentira.
  it('designação salva mas recarga falhou: diz que salvou, nunca que falhou', async () => {
    let gets = 0
    mockApi({
      reserve: () => {
        gets++
        // 1º GET = mount; o 2º é o `carregar()` de depois do PUT.
        if (gets >= 2) {
          throw new ApiError(503, 'sem_conexao', 'sem conexão com o servidor')
        }
        return statusVazio
      },
    })

    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() => expect(screen.getByTestId('saldo')).toBeInTheDocument())

    await user.click(screen.getByLabelText(/Nubank PJ/))
    await user.click(
      screen.getByRole('button', { name: 'Salvar contas designadas' }),
    )

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(/foram salvas/i)
    expect(alerta).toHaveTextContent(/não consegui recarregar os números/i)
    expect(alerta.textContent ?? '').not.toMatch(/falh/i)
    expect(alerta.textContent ?? '').not.toMatch(/sem conexão/)

    // O PUT em si aconteceu — é isso que torna a mensagem verdadeira.
    expect(api).toHaveBeenCalledWith(
      '/api/reserve/accounts',
      expect.objectContaining({ method: 'PUT' }),
    )
    // A tela continua de pé com os números anteriores.
    expect(screen.getByTestId('saldo')).toBeInTheDocument()
  })

  it('falha REAL do PUT continua mostrando a mensagem do servidor', async () => {
    mockApi({
      put: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'Referência inválida: a conta informada não existe (ou foi removida).',
        )
      },
    })

    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() => expect(screen.getByTestId('saldo')).toBeInTheDocument())

    await user.click(screen.getByLabelText(/Nubank PJ/))
    await user.click(
      screen.getByRole('button', { name: 'Salvar contas designadas' }),
    )

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Referência inválida: a conta informada não existe (ou foi removida).',
    )
    // Falha de MUTAÇÃO nunca vira a mensagem de recarga.
    expect(alerta.textContent ?? '').not.toMatch(/foram salvas/i)
  })

  it('erro ao carregar mostra role="alert", sem renderizar o resto da tela', async () => {
    vi.mocked(api).mockRejectedValue(new Error('sem conexão'))

    render(<ReservaPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('sem conexão'),
    )
  })

  it('ajuda: explica por que a reserva vem antes de ativo que deprecia', async () => {
    mockApi({ reserve: () => statusVazio })
    const user = userEvent.setup()

    render(<ReservaPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeInTheDocument(),
    )

    const gatilho = screen.getByRole('button', {
      name: /Ajuda sobre Reserva de emergência/i,
    })
    expect(screen.queryByText(/deprecia/i)).not.toBeInTheDocument()

    await user.click(gatilho)

    expect(await screen.findByText(/deprecia/i)).toBeInTheDocument()
  })
})

// Task 4 (docs/superpowers/specs/2026-07-27-financas-reserva-design.md §6):
// o confronto reserva × ativo que deprecia. Custo fixo escolhido de propósito
// pra bater com o fixture de `packages/tools/src/simulacao.test.ts`
// (min:20000, max:80000 = R$200 a R$800) — meta_cents = custo * goal_months.
const statusComCustoFixo = {
  saldo_cents: 5000000, // R$50.000
  meta_cents: { min: 60000, max: 240000 }, // custo (200-800) * goal_months (3)
  meses: { min: 62.5, max: 250 },
  contas: ['a1'],
  goal_months: 3,
}

describe('Simulador: reserva × ativo que deprecia (Task 4)', () => {
  it('à vista — os números REAIS do caso do dono (Pop 110i, R$13.000): meses consumidos e sobrevivência resultante', async () => {
    mockApi({ reserve: () => statusComCustoFixo })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 50.000,00'),
    )

    const container = screen.getByTestId('simulador-a-vista')
    await user.type(
      within(container).getByLabelText(/valor à vista/i),
      '13.000,00',
    )

    const esperado = simulateCashPurchase(1300000, 5000000, {
      min: 20000,
      max: 80000,
    })!
    await waitFor(() =>
      expect(
        within(container).getByTestId('simulador-a-vista-meses-consumidos'),
      ).toHaveTextContent(formatMeses(esperado.monthsConsumed)),
    )
    expect(
      within(container).getByTestId('simulador-a-vista-sobrevivencia'),
    ).toHaveTextContent(formatMeses(esperado.survivalAfter))
  })

  it('compra à vista que derruba o PISO abaixo da meta ⇒ alerta — mesma inversão do card "Situação atual" (nunca o teto)', async () => {
    // saldo bem menor de propósito: a mesma faixa de custo (200-800), mas
    // R$3.000 guardados em vez de R$50.000 — uma compra de R$1.000 deixa
    // (3.000-1.000)/800 = 2,5 meses no pior cenário, abaixo da meta de 3.
    mockApi({
      reserve: () => ({ ...statusComCustoFixo, saldo_cents: 300000 }),
    })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 3.000,00'),
    )

    const container = screen.getByTestId('simulador-a-vista')
    await user.type(
      within(container).getByLabelText(/valor à vista/i),
      '1.000,00',
    )

    await waitFor(() =>
      expect(
        within(container).getByTestId('simulador-a-vista-alerta-piso'),
      ).toHaveTextContent(/abaixo da meta/i),
    )
    expect(
      within(container).getByTestId('simulador-a-vista-sobrevivencia'),
    ).toHaveTextContent('entre 2,5 e 10,0 meses')
  })

  it('compra à vista pequena, que NÃO derruba o piso abaixo da meta ⇒ sem alerta', async () => {
    mockApi({ reserve: () => statusComCustoFixo }) // saldo R$50.000
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(screen.getByTestId('saldo')).toHaveTextContent('R$ 50.000,00'),
    )

    const container = screen.getByTestId('simulador-a-vista')
    await user.type(
      within(container).getByLabelText(/valor à vista/i),
      '1.000,00',
    )

    await waitFor(() =>
      expect(
        within(container).getByTestId('simulador-a-vista-meses-consumidos'),
      ).toBeInTheDocument(),
    )
    expect(
      within(container).queryByTestId('simulador-a-vista-alerta-piso'),
    ).not.toBeInTheDocument()
  })

  it('financiado — os números REAIS do caso do dono (Polo Track, R$96.000 em 72x): parcela e % da renda fixa', async () => {
    mockApi({ reserve: () => statusComCustoFixo })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeInTheDocument(),
    )

    const container = screen.getByTestId('simulador-financiado')
    await user.type(
      within(container).getByLabelText(/valor financiado/i),
      '96.000,00',
    )
    await user.type(within(container).getByLabelText(/parcelas/i), '72')

    const esperado = simulateFinancedPurchase(9600000, 72, 360000)
    await waitFor(() =>
      expect(
        within(container).getByTestId('simulador-financiado-parcela'),
      ).toHaveTextContent(formatBRL(esperado.installmentCents)),
    )
    // % da renda fixa de R$3.600 (default do servidor) — NUNCA do líquido
    // com freela (R$5.300). 133.334 * 100 / 360.000 arredondado = 37.
    expect(
      within(container).getByTestId('simulador-financiado-pct'),
    ).toHaveTextContent(`${esperado.pctOfFixedNet}%`)
    expect(esperado.pctOfFixedNet).toBe(37)
  })

  it('usa a renda fixa SALVA em /api/settings, não um número fixo no componente', async () => {
    mockApi({
      reserve: () => statusComCustoFixo,
      settings: () => ({ fixed_net_cents: 450000 }), // R$4.500 configurado
    })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeInTheDocument(),
    )

    const container = screen.getByTestId('simulador-financiado')
    await user.type(
      within(container).getByLabelText(/valor financiado/i),
      '96.000,00',
    )
    await user.type(within(container).getByLabelText(/parcelas/i), '72')

    const esperado = simulateFinancedPurchase(9600000, 72, 450000)
    await waitFor(() =>
      expect(
        within(container).getByTestId('simulador-financiado-pct'),
      ).toHaveTextContent(`${esperado.pctOfFixedNet}%`),
    )
  })

  it('sem custo fixo cadastrado (meses: null) — o lado à vista explica, nunca mostra "infinito"/"0 meses"', async () => {
    mockApi({ reserve: () => statusVazio })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-custo-fixo')).toBeInTheDocument(),
    )

    const container = screen.getByTestId('simulador-a-vista')
    await user.type(
      within(container).getByLabelText(/valor à vista/i),
      '13.000,00',
    )

    await waitFor(() =>
      expect(
        within(container).getByTestId('simulador-a-vista-sem-custo-fixo'),
      ).toBeInTheDocument(),
    )
    expect(
      within(container).queryByTestId('simulador-a-vista-meses-consumidos'),
    ).not.toBeInTheDocument()
  })

  it('lado financiado NÃO depende de custo fixo cadastrado — continua calculável mesmo com meses: null', async () => {
    mockApi({ reserve: () => statusVazio })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(screen.getByTestId('sem-custo-fixo')).toBeInTheDocument(),
    )

    const container = screen.getByTestId('simulador-financiado')
    await user.type(
      within(container).getByLabelText(/valor financiado/i),
      '96.000,00',
    )
    await user.type(within(container).getByLabelText(/parcelas/i), '72')

    await waitFor(() =>
      expect(
        within(container).getByTestId('simulador-financiado-parcela'),
      ).toHaveTextContent('R$ 1.333,34'),
    )
  })

  it('valor à vista inválido mostra role="alert" sem derrubar a tela, e some ao corrigir', async () => {
    mockApi({ reserve: () => statusComCustoFixo })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeInTheDocument(),
    )

    const container = screen.getByTestId('simulador-a-vista')
    const campo = within(container).getByLabelText(/valor à vista/i)
    await user.type(campo, 'abc')

    await waitFor(() =>
      expect(within(container).getByRole('alert')).toBeInTheDocument(),
    )

    await user.clear(campo)
    await user.type(campo, '13.000,00')

    await waitFor(() =>
      expect(within(container).queryByRole('alert')).not.toBeInTheDocument(),
    )
    expect(
      within(container).getByTestId('simulador-a-vista-meses-consumidos'),
    ).toBeInTheDocument()
  })

  it('parcelas fora de 1..360 mostra role="alert" no lado financiado', async () => {
    mockApi({ reserve: () => statusComCustoFixo })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeInTheDocument(),
    )

    const container = screen.getByTestId('simulador-financiado')
    await user.type(
      within(container).getByLabelText(/valor financiado/i),
      '96.000,00',
    )
    await user.type(within(container).getByLabelText(/parcelas/i), '361')

    await waitFor(() =>
      expect(within(container).getByRole('alert')).toBeInTheDocument(),
    )
  })

  it('a tela nunca aconselha — mostra o número, não escreve "não compre" nem julga a decisão', async () => {
    mockApi({ reserve: () => statusComCustoFixo })
    const user = userEvent.setup()
    render(<ReservaPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeInTheDocument(),
    )

    const aVista = screen.getByTestId('simulador-a-vista')
    const financiado = screen.getByTestId('simulador-financiado')
    await user.type(
      within(aVista).getByLabelText(/valor à vista/i),
      '13.000,00',
    )
    await user.type(
      within(financiado).getByLabelText(/valor financiado/i),
      '96.000,00',
    )
    await user.type(within(financiado).getByLabelText(/parcelas/i), '72')

    await waitFor(() =>
      expect(
        within(aVista).getByTestId('simulador-a-vista-meses-consumidos'),
      ).toBeInTheDocument(),
    )

    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(/não compre|não financie|não vale a pena/i)
  })
})

describe('ReservaPage — alvo de toque da designação', () => {
  it('a faixa inteira do checkbox tem 44px, não só o quadradinho', async () => {
    // ⚠️ MEDIDO em Chrome real a 390×844: o `<input type="checkbox">` tem
    // 13,6×16 px — o menor alvo do app. O alvo real é o `<label>`, que já
    // embrulha o input e alterna a seleção; só faltava dar altura a ele.
    mockApi()
    render(<ReservaPage />)
    const rotulo = (await screen.findByLabelText(/Nubank PJ/)).closest('label')
    expect(rotulo).not.toBeNull()
    expect(rotulo!.className).toContain('min-h-11')
  })
})
