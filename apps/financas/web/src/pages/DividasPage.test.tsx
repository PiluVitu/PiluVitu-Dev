import { formatBRL } from '@piluvitu/tools/money'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DividasPage } from './DividasPage'

function setLarguraJanela(largura: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: largura,
  })
}

const dividas = [
  {
    id: 'd1',
    title: 'Pai',
    payee_name: 'PAI',
    direction: 'i_owe',
    total_cents: 730000,
    paid_cents: 594000,
    remaining_cents: 136000,
  },
]

const payees = [{ id: 'p1', name: 'Pai', kind: 'person' }]

function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ ok: status < 400, data, notifications: [] }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.startsWith('/api/debts')) return json(dividas)
    if (method === 'GET' && url.startsWith('/api/payees')) return json(payees)
    if (method === 'POST' && url === '/api/payees')
      return json({ id: 'p9', name: 'Tio', kind: 'person' }, 201)
    if (method === 'POST' && url === '/api/debts')
      return json({ id: 'd9' }, 201)
    throw new Error(`url inesperada: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  setLarguraJanela(1024)
})

describe('DividasPage', () => {
  it('lista as dividas abertas com total, pago e restante', async () => {
    render(<DividasPage />)

    expect(await screen.findByRole('link', { name: 'Pai' })).toHaveAttribute(
      'href',
      '#/dividas/d1',
    )
    expect(screen.getByText(formatBRL(730000))).toBeInTheDocument()
    expect(screen.getByText(formatBRL(594000))).toBeInTheDocument()
    expect(screen.getByText(formatBRL(136000))).toBeInTheDocument()
  })

  it('sem "Aberta em" preenchida, usa o dia de Teresina (nao UTC) como default', async () => {
    // 01:00 UTC de 01/08 e 22h de 31/07 em Teresina (UTC-3). Fake so o Date
    // (nao os timers): waitFor/userEvent usam setTimeout de verdade por
    // baixo, e travariam se o relogio inteiro estivesse congelado.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-01T01:00:00Z'))
    try {
      const user = userEvent.setup()
      render(<DividasPage />)
      await screen.findByRole('link', { name: 'Pai' })

      await user.type(screen.getByLabelText('Título'), 'Tio')
      await user.selectOptions(screen.getByLabelText('Pessoa'), '__novo__')
      await user.type(screen.getByLabelText('Nome da pessoa'), 'Tio')
      await user.click(screen.getByRole('button', { name: 'Criar dívida' }))

      await waitFor(() => {
        const corpoDivida = fetchMock.mock.calls.find(
          (c) =>
            String(c[0]) === '/api/debts' &&
            (c[1] as RequestInit).method === 'POST',
        )
        expect(corpoDivida).toBeDefined()
        expect(
          JSON.parse(String((corpoDivida![1] as RequestInit).body)).opened_at,
        ).toBe('2026-07-31')
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('cria payee inline e usa o id retornado no POST /api/debts', async () => {
    const user = userEvent.setup()
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })

    await user.type(screen.getByLabelText('Título'), 'Tio')
    await user.selectOptions(screen.getByLabelText('Pessoa'), '__novo__')
    await user.type(screen.getByLabelText('Nome da pessoa'), 'Tio')
    await user.click(screen.getByRole('button', { name: 'Criar dívida' }))

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      )
      expect(posts.map((c) => String(c[0]))).toEqual([
        '/api/payees',
        '/api/debts',
      ])
    })

    const corpoPayee = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(
            (c) =>
              String(c[0]) === '/api/payees' &&
              (c[1] as RequestInit).method === 'POST',
          )![1] as RequestInit
        ).body,
      ),
    )
    expect(corpoPayee).toEqual({ name: 'Tio', kind: 'person' })

    const corpoDivida = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(
            (c) =>
              String(c[0]) === '/api/debts' &&
              (c[1] as RequestInit).method === 'POST',
          )![1] as RequestInit
        ).body,
      ),
    )
    expect(corpoDivida.payee_id).toBe('p9')
    expect(corpoDivida.title).toBe('Tio')
    expect(corpoDivida.direction).toBe('i_owe')
  })
})

// Important 3 (fix final): em ~390px (Android) a tabela de 5 colunas
// cortava Pago E Falta ao mesmo tempo (ver comentário de
// `useMenorQueSm` em DividasPage.tsx). Abaixo de `sm` (640px, default do
// Tailwind), a lista vira um card por dívida com "Falta" em destaque; a
// tabela continua intocada em `sm` pra cima — cobrindo os dois lados do
// breakpoint, incluindo a borda exata.
describe('DividasPage — abaixo de sm (Android, ~390px): cards em vez de tabela (Important 3, fix final)', () => {
  it('em 390px renderiza um card por dívida, não a tabela', async () => {
    setLarguraJanela(390)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    expect(screen.getByTestId('dividas-cards')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('em 390px o card mostra título, pessoa e as três somas (Total/Pago/Falta), sem cortar nada', async () => {
    setLarguraJanela(390)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    expect(screen.getByText('PAI')).toBeInTheDocument()
    expect(screen.getByText('Falta')).toBeInTheDocument()
    expect(screen.getByText(formatBRL(136000))).toBeInTheDocument()
    expect(screen.getByText(`Total ${formatBRL(730000)}`)).toBeInTheDocument()
    expect(screen.getByText(`Pago ${formatBRL(594000)}`)).toBeInTheDocument()
  })

  it('"Falta" fica em destaque (fonte maior) — a pergunta que a tela responde primeiro', async () => {
    setLarguraJanela(390)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    const falta = screen.getByText(formatBRL(136000))
    expect(falta.className).toMatch(/text-lg/)
  })

  it('em 640px (limite exato do breakpoint sm) continua mostrando a tabela, não os cards', async () => {
    setLarguraJanela(640)
    render(<DividasPage />)

    await screen.findByRole('link', { name: 'Pai' })

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByTestId('dividas-cards')).not.toBeInTheDocument()
  })

  it('acompanha resize em runtime: reduzindo a janela pra 390px em tempo real, troca de tabela pra cards', async () => {
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })
    expect(screen.getByRole('table')).toBeInTheDocument()

    setLarguraJanela(390)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(screen.getByTestId('dividas-cards')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
