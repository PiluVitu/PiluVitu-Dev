import { render, screen } from '@testing-library/react'

import { Command, CommandInput, CommandItem, CommandList } from './command'

beforeAll(() => {
  // O cmdk observa o tamanho da lista e rola até o item selecionado; o jsdom não tem nenhum dos dois.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView ??= () => {}
})

function temAnel(elemento: Element, variante: string) {
  const classes = elemento.className.split(/\s+/)
  return ['ring-2', 'ring-ring', 'ring-inset'].every((c) =>
    classes.includes(`${variante}:${c}`),
  )
}

// Mesmo defeito do menu (UI-01): o item selecionado só trocava o fundo para `accent`
// (1,19:1 no claro), e o campo de busca focado não mostrava nada além do cursor (UI-23).
describe('Command — foco visível', () => {
  test('o item selecionado mostra o anel', () => {
    render(
      <Command>
        <CommandInput placeholder="Buscar" />
        <CommandList>
          <CommandItem>Primeiro</CommandItem>
        </CommandList>
      </Command>,
    )

    const item = screen.getByRole('option', { name: 'Primeiro' })
    expect(temAnel(item, 'aria-selected')).toBe(true)
  })

  test('o campo de busca focado mostra o anel no contêiner', () => {
    render(
      <Command>
        <CommandInput placeholder="Buscar" />
        <CommandList />
      </Command>,
    )

    const contêiner = screen
      .getByPlaceholderText('Buscar')
      .closest('[cmdk-input-wrapper]') as Element
    expect(temAnel(contêiner, 'focus-within')).toBe(true)
  })
})
