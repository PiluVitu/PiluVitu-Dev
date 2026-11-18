import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons'
import { ToolPageShell } from './tool-page-shell'

jest.mock('@/components/page-top-bar', () => ({ PageTopBar: () => null }))

const ferramenta = {
  icon: faPenToSquare,
  title: 'Editar PDF',
  description: 'Organiza as páginas e escreve por cima delas',
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

it('a larga (a Bancada do editor de PDF, em três colunas) se abre a partir de lg', () => {
  expect(larguraDa(true)).toContain('max-w-3xl')
  expect(larguraDa(true)).toContain('lg:max-w-6xl')
})
