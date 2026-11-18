import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { metadataDaFerramenta } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import EditorDePdfPage, { metadata } from './page'

jest.mock('@/components/page-top-bar', () => ({
  PageTopBar: ({ backHref, backLabel }: Record<string, string>) => (
    <a data-testid="voltar" href={backHref}>
      {backLabel}
    </a>
  ),
}))
jest.mock('@/components/tools/pdf/editar', () => ({
  EditarPdf: () => <p data-testid="bancada" />,
}))

function renderizar() {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => root.render(<EditorDePdfPage />))
  return { container, desmontar: () => act(() => root.unmount()) }
}

it('/tools/pdf é o editor: a Bancada na página larga, com as três colunas a partir de lg', () => {
  const { container, desmontar } = renderizar()

  const pagina = container.firstElementChild as HTMLElement
  expect(pagina.className).toContain('lg:max-w-6xl')
  expect(pagina.querySelector('[data-testid="bancada"]')).not.toBeNull()
  expect(container.querySelector('[data-testid="pdf-modo"]')).toBeNull()
  desmontar()
})

it('o voltar leva às ferramentas', () => {
  const { container, desmontar } = renderizar()

  const voltar = container.querySelector('[data-testid="voltar"]')!
  expect(voltar.getAttribute('href')).toBe('/tools')
  expect(voltar.textContent).toBe('Ferramentas')
  desmontar()
})

it('a metadata é a da ferramenta, com o canonical em /tools/pdf', () => {
  const pdf = TOOLS.find(({ slug }) => slug === 'pdf')!
  expect(metadata).toEqual(metadataDaFerramenta(pdf))
  expect(metadata.alternates?.canonical).toBe('/tools/pdf')
})
