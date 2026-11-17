import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { faSignature } from '@fortawesome/free-solid-svg-icons'
import { ToolPageShell } from './tool-page-shell'

jest.mock('@/components/page-top-bar', () => ({ PageTopBar: () => null }))

const ferramenta = {
  icon: faSignature,
  title: 'Assinar PDF',
  description: 'Põe sua assinatura e preenche formulários de PDF',
}

function larguraDa(larga?: boolean) {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() =>
    root.render(
      <ToolPageShell tool={ferramenta} larga={larga}>
        <p>conteúdo</p>
      </ToolPageShell>,
    ),
  )
  const classes = (container.firstElementChild as HTMLElement).className
  act(() => root.unmount())
  return classes
}

it('a página da ferramenta tem a largura de leitura', () => {
  expect(larguraDa()).toContain('max-w-3xl')
  expect(larguraDa()).not.toContain('lg:max-w-6xl')
})

it('a larga (o assinar, com a página e o formulário lado a lado) se abre a partir de lg', () => {
  expect(larguraDa(true)).toContain('max-w-3xl')
  expect(larguraDa(true)).toContain('lg:max-w-6xl')
})
