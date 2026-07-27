import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from './App'

vi.mock('./auth-client', () => ({
  useSession: () => ({
    data: {
      user: { id: 'u1', email: 'dono@exemplo.com', name: 'Dono' },
      session: {},
    },
    isPending: false,
  }),
  signIn: { social: vi.fn() },
  signOut: vi.fn(),
}))

// CommitmentsPage e BlocoCategorias (Task 8) esperam um objeto de relatório,
// não uma lista — usar `[]` pra toda rota (como um mock genérico faria)
// quebra `formatBRL(undefined)` em `report.fixed_net_cents`/`report.rows`
// assim que a tela/bloco monta (o segundo, de propósito, é o MESMO bug que
// o comentário original documentava só pra `/reports/commitments`: um
// `[].rows` daria `TypeError` antes até de chegar no `formatBRL`). As
// outras telas usadas aqui (Contas, Dívidas) esperam lista mesmo, `[]` serve.
function mockFetchVazio() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      const data = url.includes('/api/reports/commitments')
        ? {
            competences: [],
            rows: [],
            totals: [],
            fixed_net_cents: 0,
            pct_of_fixed_net: [],
          }
        : url.includes('/api/reports/by-category')
          ? { competence: '', rows: [], total_cents: 0 }
          : []
      return Promise.resolve({
        status: 200,
        json: async () => ({ ok: true, data, notifications: [] }),
      })
    }),
  )
}

afterEach(() => {
  window.location.hash = ''
  vi.unstubAllGlobals()
})

describe('App — roteamento por hash com Gate autenticado', () => {
  test('mostra o e-mail da sessão no cabeçalho', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByText('dono@exemplo.com')).toBeDefined(),
    )
  })

  // getByRole('heading', ...), não getByText: o <h1> de cada tela repete o
  // MESMO texto do link de nav sempre visível (<a href="#/dividas">Dívidas</a>
  // ao lado de <h1>Dívidas</h1>) — getByText('Dívidas') dá "Found multiple
  // elements" assim que a página carrega (DividasPage não tem gate de
  // loading antes do <h1>, ao contrário de Contas/Comprometido). Query por
  // role também torna o teste real: por texto puro, Contas/Comprometido
  // "passavam" batendo só no link do nav antes do fetch assíncrono resolver,
  // sem nunca provar que a página certa realmente montou. Mesma regra vale
  // pro <h1>Início</h1> da home (Task 6) — o nav ganhou um link "Início".
  test('hash default (#/) mostra a tela Início (home)', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
  })

  // Task 6: #/contas deixou de ser o default, mas continua acessível
  // explicitamente — é o que este teste prova.
  test('#/contas continua acessível mesmo não sendo mais o default', async () => {
    mockFetchVazio()
    window.location.hash = '#/contas'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Contas' })).toBeDefined(),
    )
  })

  test('#/dividas mostra a tela Dívidas', async () => {
    mockFetchVazio()
    window.location.hash = '#/dividas'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Dívidas' })).toBeDefined(),
    )
  })

  test('#/comprometido mostra a tela Comprometido', async () => {
    mockFetchVazio()
    window.location.hash = '#/comprometido'
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Comprometido' }),
      ).toBeDefined(),
    )
  })
})
