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

const contas = [
  { id: 'pj1', name: 'Nubank PJ', scope: 'PJ', balance_cents: 500000 },
  { id: 'pj2', name: 'Inter PJ', scope: 'PJ', balance_cents: 300000 },
  { id: 'pf1', name: 'Nubank PF', scope: 'PF', balance_cents: 100000 },
]

/**
 * ⑥ `GET /api/reserve` — de onde sai o custo fixo mensal (ver
 * `custoFixoMensal` em `lib/reserve.ts`). `meta_cents = custo *
 * goal_months`, então este fixture representa um custo de R$ 800,00 a
 * R$ 1.000,00 por mês.
 */
const reserva = {
  saldo_cents: 0,
  meta_cents: { min: 240000, max: 300000 },
  meses: { min: 0, max: 0 },
  contas: [],
  goal_months: 3,
}

/** Sem nenhuma recorrente cadastrada — o estado real de produção hoje. */
const reservaSemCustoFixo = {
  ...reserva,
  meta_cents: { min: 0, max: 0 },
  meses: null,
}

/**
 * ⚠️ Rota fora da lista REJEITA — mesma disciplina de
 * `App.test.tsx#mockFetchVazio` depois do achado da Task 8: uma rota nova
 * esquecida vira erro visível, não um shape silenciosamente errado.
 */
function mockRotas(opts: { contas?: unknown; reserva?: unknown } = {}): void {
  vi.mocked(api).mockImplementation((path: string) => {
    if (path.startsWith('/api/reserve'))
      return Promise.resolve(opts.reserva ?? reservaSemCustoFixo)
    if (path.startsWith('/api/accounts'))
      return Promise.resolve(opts.contas ?? [])
    return Promise.reject(new Error(`rota inesperada em teste: ${path}`))
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('BlocoSaldos', () => {
  it('com contas: separa PJ de PF, cada um com o próprio total (valores DIFERENTES — um filtro trocado falha)', async () => {
    mockRotas({ contas })

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

  // ⑥ "R$ 8.000,00 é muito ou pouco?" — sem referência, um total absoluto
  // não responde nada. `monthlyFixedCost` já existia e só a Reserva usava.
  it('cada escopo ganha "≈ N meses de custo fixo" — a referência que faltava pro total absoluto', async () => {
    mockRotas({ contas, reserva })

    render(<BlocoSaldos />)

    // PJ = R$ 8.000,00 contra custo de R$ 800,00–R$ 1.000,00/mês
    // piso = 800000/100000 = 8,0 ; teto = 800000/80000 = 10,0
    await waitFor(() =>
      expect(screen.getByTestId('meses-PJ')).toHaveTextContent(
        '≈ entre 8,0 e 10,0 meses de custo fixo',
      ),
    )
    // PF = R$ 1.000,00 → piso 1,0 ; teto 1,25 → "entre 1,0 e 1,3 meses"
    expect(screen.getByTestId('meses-PF')).toHaveTextContent(
      '≈ entre 1,0 e 1,3 meses de custo fixo',
    )
  })

  it('⚠️ a referência é POR ESCOPO — PJ e PF continuam SEM nunca serem somados', async () => {
    mockRotas({ contas, reserva })

    render(<BlocoSaldos />)

    await waitFor(() => expect(screen.getByTestId('meses-PJ')).toBeVisible())

    // O total combinado (R$ 9.000,00) e a sua tradução em meses (9.000/1.000
    // = 9,0 até 9.000/800 = 11,25) NÃO podem aparecer em lugar nenhum: o
    // card se recusa a somar PJ+PF de propósito (ver o ⚠️ do topo de
    // BlocoSaldos.tsx), e uma referência sobre a soma reintroduziria
    // exatamente o número que a separação existe pra evitar.
    expect(document.body.textContent).not.toContain('R$ 9.000,00')
    expect(document.body.textContent).not.toContain('11,3 meses')
  })

  it('sem NENHUMA recorrente cadastrada (o estado real de produção) não inventa referência nenhuma', async () => {
    mockRotas({ contas, reserva: reservaSemCustoFixo })

    render(<BlocoSaldos />)

    await waitFor(() =>
      expect(screen.getByTestId('total-PJ')).toHaveTextContent('R$ 8.000,00'),
    )
    // Nunca "≈ 0 meses" nem "∞": sem custo fixo a pergunta não tem
    // resposta, e a ausência é a resposta honesta.
    expect(screen.queryByTestId('meses-PJ')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('meses de custo fixo')
  })

  it('⑥ falha em /api/reserve NÃO derruba os saldos — a referência some, o assunto do card fica', async () => {
    // Efeitos separados, nunca um Promise.all: a rota da referência não
    // pode levar junto a lista que o card existe pra mostrar.
    vi.mocked(api).mockImplementation((path: string) => {
      if (path.startsWith('/api/reserve'))
        return Promise.reject(
          new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
        )
      return Promise.resolve(contas)
    })

    render(<BlocoSaldos />)

    await waitFor(() =>
      expect(screen.getByTestId('total-PJ')).toHaveTextContent('R$ 8.000,00'),
    )
    expect(screen.getByTestId('saldo-pj1')).toHaveTextContent('R$ 5.000,00')
    expect(screen.queryByTestId('meses-PJ')).not.toBeInTheDocument()
    // e NENHUM alerta: o dono não pode resolver a falha de /api/reserve a
    // partir deste card, então um erro aqui só seria ruído.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a coluna de dinheiro usa tabular-nums (senão os dígitos não alinham de cima a baixo)', async () => {
    mockRotas({ contas })

    render(<BlocoSaldos />)

    await waitFor(() =>
      expect(screen.getByTestId('total-PJ')).toHaveClass('tabular-nums'),
    )
    expect(screen.getByTestId('saldo-pj1')).toHaveClass('tabular-nums')
    expect(screen.getByTestId('saldo-pj2')).toHaveClass('tabular-nums')
  })

  it('sem conta nenhuma: estado vazio com uma chamada real para ação (sem conta não dá pra lançar nada)', async () => {
    mockRotas({ contas: [] })

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
