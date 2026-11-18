import { act } from 'react'
import { createRoot } from 'react-dom/client'
import EditarPdfPage from './page'

jest.mock('@/components/page-top-bar', () => ({ PageTopBar: () => null }))
jest.mock('@/components/tools/pdf/editar', () => ({
  EditarPdf: () => <p data-testid="bancada" />,
}))

it('a Bancada abre a página larga: as três colunas a partir de lg', () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(<EditarPdfPage />))

  const pagina = container.firstElementChild as HTMLElement
  expect(pagina.className).toContain('lg:max-w-6xl')
  expect(pagina.querySelector('[data-testid="bancada"]')).not.toBeNull()
  act(() => root.unmount())
})
