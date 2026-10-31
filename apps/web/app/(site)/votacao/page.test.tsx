import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import VotacaoPage from './page'

// O ramielle responde 401 ao GET /votacao/sessions sem login. O Votaí é a porta de entrada
// pública (leva ao histórico), então o anônimo não pode ver "Erro ao carregar sessões.".
let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  jest.restoreAllMocks()
})

function resposta(status: number, data: unknown) {
  return {
    ok: status < 300,
    status,
    statusText: '',
    json: async () => ({
      ok: status < 300,
      data: status < 300 ? data : null,
      notifications:
        status < 300
          ? []
          : [
              {
                type: 'error',
                code: 'not_authenticated',
                message: 'Você precisa estar logado.',
              },
            ],
    }),
  } as Response
}

function api(logado: boolean) {
  const fetchMock = jest.fn(async (url: string) => {
    if (url.endsWith('/auth/me'))
      return logado
        ? resposta(200, {
            id: 1,
            email: 'a@example.com',
            name: 'Ana',
            picture: '',
            is_admin: false,
          })
        : resposta(401, null)
    if (url.endsWith('/votacao/sessions'))
      return logado
        ? resposta(200, {
            sessions: [
              {
                ID: 1,
                Title: 'Sexta 22/05',
                Status: 'open',
                CreatedAt: '2026-05-22T21:00:00Z',
                ClosedAt: null,
                SortOptionsJSON: '{}',
              },
            ],
          })
        : resposta(401, null)
    throw new Error(`fetch inesperado: ${url}`)
  })
  global.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

async function monta() {
  const client = new QueryClient()
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <VotacaoPage />
      </QueryClientProvider>,
    )
  })
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
}

it('sem login: não pede as sessões, não mostra erro e convida a entrar', async () => {
  const fetchMock = api(false)
  await monta()
  const texto = container.textContent ?? ''
  expect(texto).not.toContain('Erro ao carregar sessões.')
  expect(texto).toContain(
    'Entre com o Google para ver e votar nas sessões abertas.',
  )
  expect(texto).toContain('Votações anteriores')
  expect(
    fetchMock.mock.calls.some(([url]) => url.endsWith('/votacao/sessions')),
  ).toBe(false)
})

it('logado: lista as sessões', async () => {
  api(true)
  await monta()
  const texto = container.textContent ?? ''
  expect(texto).toContain('Sexta 22/05')
  expect(texto).not.toContain('Entre com o Google para ver')
})
