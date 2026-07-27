import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import { ConfigPage } from './config'

// Mockar `api` (não a rede) — mesmo padrão de BlocoComprometido.test.tsx /
// new-entry.test.tsx: `api` já traduz envelope/erro, testar aqui prova o
// COMPONENTE, não o transporte HTTP.
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

vi.mock('../auth-client', () => ({
  useSession: () => ({
    data: { user: { id: 'u1', email: 'dono@exemplo.com', name: 'Dono' } },
    isPending: false,
  }),
  signOut: vi.fn(),
}))

// jsdom não implementa matchMedia — só o clique em "Sistema" chama
// aplicarTema('sistema'), que lê window.matchMedia. Mock mínimo, sem
// simular mudança de SO (isso já é coberto por lib/theme.test.ts).
function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  stubMatchMedia()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('ConfigPage', () => {
  it('mostra o heading e busca a renda salva no mount', async () => {
    vi.mocked(api).mockResolvedValue({ fixed_net_cents: 360000 })

    render(<ConfigPage />)

    expect(
      screen.getByRole('heading', { name: 'Configurações' }),
    ).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByLabelText('Novo valor')).toHaveValue('3.600,00'),
    )
    expect(api).toHaveBeenCalledWith('/api/settings')
    expect(
      screen.getByText('Valor salvo hoje: R$ 3.600,00'),
    ).toBeInTheDocument()
  })

  it('erro ao carregar a renda mostra role="alert", sem derrubar o resto da tela', async () => {
    vi.mocked(api).mockRejectedValue(
      new ApiError(503, 'auth_unavailable', 'sem conexão com o servidor'),
    )

    render(<ConfigPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sem conexão com o servidor',
      ),
    )
    // O resto da tela continua de pé (Tema, Conta, Backup, Conectar contas).
    expect(screen.getByRole('heading', { name: 'Tema' })).toBeInTheDocument()
  })

  it('salva a nova renda via PUT com centavos inteiros, nunca float', async () => {
    const user = userEvent.setup()
    vi.mocked(api).mockImplementation(
      async (path: string, init?: RequestInit) => {
        if (path === '/api/settings' && !init)
          return { fixed_net_cents: 360000 }
        if (path === '/api/settings' && init?.method === 'PUT') {
          expect(init.body).toBe(JSON.stringify({ fixed_net_cents: 548000 }))
          return { fixed_net_cents: 548000 }
        }
        throw new Error(`chamada inesperada: ${path}`)
      },
    )

    render(<ConfigPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Novo valor')).toHaveValue('3.600,00'),
    )

    await user.clear(screen.getByLabelText('Novo valor'))
    await user.type(screen.getByLabelText('Novo valor'), '5.480,00')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Renda de referência salva.',
      ),
    )
    expect(
      screen.getByText('Valor salvo hoje: R$ 5.480,00'),
    ).toBeInTheDocument()
  })

  it('valor inválido (formato quebrado) não chama a API — mostra erro no cliente', async () => {
    const user = userEvent.setup()
    vi.mocked(api).mockResolvedValue({ fixed_net_cents: 360000 })

    render(<ConfigPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Novo valor')).toHaveValue('3.600,00'),
    )
    vi.mocked(api).mockClear()

    await user.clear(screen.getByLabelText('Novo valor'))
    await user.type(screen.getByLabelText('Novo valor'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Valor inválido')
    expect(api).not.toHaveBeenCalled()
  })

  it('zero é rejeitado no cliente antes do round-trip', async () => {
    const user = userEvent.setup()
    vi.mocked(api).mockResolvedValue({ fixed_net_cents: 360000 })

    render(<ConfigPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Novo valor')).toHaveValue('3.600,00'),
    )
    vi.mocked(api).mockClear()

    await user.clear(screen.getByLabelText('Novo valor'))
    await user.type(screen.getByLabelText('Novo valor'), '0,00')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Valor inválido')
    expect(api).not.toHaveBeenCalled()
  })

  it('erro do servidor (422) ao salvar aparece no formulário', async () => {
    const user = userEvent.setup()
    vi.mocked(api).mockImplementation(
      async (path: string, init?: RequestInit) => {
        if (!init) return { fixed_net_cents: 360000 }
        throw new ApiError(
          422,
          'invalid_setting',
          'fixed_net_cents precisa ser um número inteiro em centavos',
        )
      },
    )

    render(<ConfigPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Novo valor')).toHaveValue('3.600,00'),
    )

    await user.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'fixed_net_cents precisa ser um número inteiro',
      ),
    )
  })

  it('tema: reflete o valor salvo (aria-pressed) e trocar aplica .dark/persiste', async () => {
    const user = userEvent.setup()
    vi.mocked(api).mockResolvedValue({ fixed_net_cents: 360000 })

    render(<ConfigPage />)

    // Default (nada salvo ainda) é 'sistema' — mesmo default de temaSalvo().
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Escuro' }))

    expect(screen.getByRole('button', { name: 'Escuro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('financas-tema')).toBe('escuro')

    await user.click(screen.getByRole('button', { name: 'Claro' }))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('financas-tema')).toBe('claro')
  })

  it('conta: mostra o e-mail da sessão e Sair chama signOut', async () => {
    const { signOut } = await import('../auth-client')
    const user = userEvent.setup()
    vi.mocked(api).mockResolvedValue({ fixed_net_cents: 360000 })

    render(<ConfigPage />)

    expect(screen.getByText('dono@exemplo.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('backup: mostra o comando e o que ele cobre', async () => {
    vi.mocked(api).mockResolvedValue({ fixed_net_cents: 360000 })

    render(<ConfigPage />)

    expect(screen.getByText('make backup-financas')).toBeInTheDocument()
    expect(
      screen.getByText(/exporta o banco de produção, comprime/),
    ).toBeInTheDocument()
  })

  it('conectar contas: frase honesta de que não existe — SEM nenhum botão', async () => {
    vi.mocked(api).mockResolvedValue({ fixed_net_cents: 360000 })

    render(<ConfigPage />)

    const secao = screen.getByTestId('conectar-contas')
    expect(within(secao).getByText(/ainda não existe/)).toBeInTheDocument()
    expect(within(secao).getByText(/fatia ②/)).toBeInTheDocument()
    expect(within(secao).queryByRole('button')).not.toBeInTheDocument()
  })
})
