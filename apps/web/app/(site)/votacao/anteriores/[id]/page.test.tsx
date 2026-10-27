import { act, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { sessaoDoHistorico } from '@/lib/votacao/historico.fixtures'
import VotacaoAnteriorPage from './page'

// A página é de cliente, então o HTTP é sempre 200: sem o noindex no estado de erro, o id de uma
// sessão aberta ou inexistente ficaria indexável com o "index, follow" do layout (soft 404).
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

function responde(status: number, data: unknown = null) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status < 300,
    status,
    statusText: '',
    json: async () => ({
      ok: status < 300,
      data,
      notifications:
        status < 300
          ? []
          : [{ type: 'error', code: 'not_found', message: 'x' }],
    }),
  } as Response)
}

async function monta(id: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const params = Promise.resolve({ id })
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <VotacaoAnteriorPage params={params} />
        </Suspense>
      </QueryClientProvider>,
    )
  })
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
}

const robots = () =>
  Array.from(document.head.querySelectorAll('meta[name="robots"]')).map((m) =>
    m.getAttribute('content'),
  )

it('sessão aberta ou inexistente (404) pede noindex', async () => {
  responde(404)
  await monta('3')
  expect(container.textContent).toContain(
    'Essa votação não existe ou ainda está aberta.',
  )
  expect(robots()).toEqual(['noindex'])
})

it('id inválido pede noindex', async () => {
  responde(400)
  await monta('abc')
  expect(container.textContent).toContain('ID inválido.')
  expect(robots()).toEqual(['noindex'])
})

it('votação encerrada não pede noindex', async () => {
  responde(200, sessaoDoHistorico({ title: 'Noite boa' }))
  await monta('12')
  expect(container.textContent).toContain('Noite boa')
  expect(robots()).toEqual([])
})
