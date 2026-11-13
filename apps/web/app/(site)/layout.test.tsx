import { nextHeadersFalso, selarPreviewDeTeste } from '@/lib/next-headers-falso'
import { renderEstatico } from '@/lib/render-estatico'
import type { ReactNode } from 'react'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)
jest.mock('@/components/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
jest.mock('@/utils/providers/react-query-provider', () => ({
  ReactQueryProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))
jest.mock('@/components/ui/sonner', () => ({ Toaster: () => null }))
jest.mock('@/components/medicao-da-vercel', () => ({
  MedicaoDaVercel: ({ rascunho }: { rascunho: boolean }) => (
    <i data-testid="medicao" data-rascunho={String(rascunho)} />
  ),
}))

import SiteLayout from './layout'

async function renderizar() {
  const elemento = await SiteLayout({ children: <p>conteúdo</p> })
  return renderEstatico(elemento)
}

function faixaDePreview(raiz: HTMLElement) {
  return raiz.querySelector('[role="status"]')
}

beforeEach(() => {
  process.env.ADMIN_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
  nextHeadersFalso.reiniciar()
})

describe('(site)/layout: faixa de pré-visualização', () => {
  it('sem draft mode, sem faixa e com medição', async () => {
    const raiz = await renderizar()
    expect(faixaDePreview(raiz)).toBeNull()
    expect(
      raiz
        .querySelector('[data-testid="medicao"]')
        ?.getAttribute('data-rascunho'),
    ).toBe('false')
  })

  it('draft mode sem o preview selado não mostra a faixa', async () => {
    nextHeadersFalso.reiniciar({ 'ks-branch': 'main' }, true)
    const raiz = await renderizar()
    expect(faixaDePreview(raiz)).toBeNull()
  })

  it('com o preview selado e válido, mostra a faixa com o ramo e o botão de encerrar', async () => {
    nextHeadersFalso.reiniciar(
      { piluvitu_preview: selarPreviewDeTeste('feat/x') },
      true,
    )
    const raiz = await renderizar()
    const faixa = faixaDePreview(raiz)
    expect(faixa?.textContent).toContain('Pré-visualização')
    expect(faixa?.textContent).toContain('feat/x')
    expect(faixa?.querySelector('form')?.getAttribute('action')).toBe(
      '/preview/end',
    )
    expect(
      raiz
        .querySelector('[data-testid="medicao"]')
        ?.getAttribute('data-rascunho'),
    ).toBe('true')
  })
})
