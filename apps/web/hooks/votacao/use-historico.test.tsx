import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiBase } from '@/lib/votacao/api-client'
import { sessaoDoHistorico } from '@/lib/votacao/historico.fixtures'
import { useHistorico, useHistoricoSessao } from './use-historico'

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  jest.restoreAllMocks()
})

function responde(data: unknown, status = 200) {
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

async function monta(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await act(async () => {
    root.render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function Lista({ page }: { page: number }) {
  const q = useHistorico(page)
  return (
    <p>{q.data ? `p${q.data.page}:${q.data.sessions.length}` : q.status}</p>
  )
}

function Detalhe({ id }: { id: number }) {
  const q = useHistoricoSessao(id)
  return <p>{q.data?.title ?? q.fetchStatus + ':' + q.status}</p>
}

it('useHistorico busca a página pedida', async () => {
  responde({
    sessions: [sessaoDoHistorico()],
    page: 2,
    page_size: 10,
    total: 11,
    has_more: false,
  })
  await monta(<Lista page={2} />)
  expect(container.textContent).toBe('p2:1')
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
    `${apiBase}/votacao/historico?page=2`,
  )
})

it('useHistorico não busca página inválida', async () => {
  responde({})
  await monta(<Lista page={0} />)
  expect(global.fetch).not.toHaveBeenCalled()
})

it('useHistoricoSessao busca pelo id e não busca id inválido', async () => {
  responde(sessaoDoHistorico({ title: 'Noite' }))
  await monta(<Detalhe id={12} />)
  expect(container.textContent).toBe('Noite')

  responde({})
  await monta(<Detalhe id={Number.NaN} />)
  expect(global.fetch).not.toHaveBeenCalled()
  expect(container.textContent).toBe('idle:pending')
})

it('useHistoricoSessao expõe o 404 como erro', async () => {
  responde(null, 404)
  await monta(<Detalhe id={5} />)
  expect(container.textContent).toBe('idle:error')
})
