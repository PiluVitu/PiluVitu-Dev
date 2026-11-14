import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu'

// Sem o anel, o único sinal do item focado era o fundo `accent`: 1,19:1 contra o
// menu no tema claro e 1,14:1 no escuro (UI-01 da auditoria). O anel usa o token
// `ring`, que passa de 3:1 contra o menu e contra o fundo do item (contraste.test.ts).
function temAnel(elemento: Element, variante: string) {
  const classes = elemento.className.split(/\s+/)
  return ['ring-2', 'ring-ring', 'ring-inset'].every((c) =>
    classes.includes(`${variante}:${c}`),
  )
}

function Exemplo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Tema</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Claro</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked>Marcado</DropdownMenuCheckboxItem>
        <DropdownMenuRadioGroup value="a">
          <DropdownMenuRadioItem value="a">Opção</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Mais</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Dentro</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

describe('DropdownMenu — foco visível', () => {
  test('o item que recebe o foco pelo teclado mostra o anel', async () => {
    const user = userEvent.setup()
    render(<Exemplo />)

    screen.getByRole('button', { name: 'Tema' }).focus()
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowDown}')

    const focado = document.activeElement as Element
    expect(focado).toHaveTextContent('Marcado')
    expect(temAnel(focado, 'focus')).toBe(true)
  })

  test('os quatro tipos de item têm o anel', async () => {
    const user = userEvent.setup()
    render(<Exemplo />)

    screen.getByRole('button', { name: 'Tema' }).focus()
    await user.keyboard('{Enter}')

    const itens = [
      screen.getByRole('menuitem', { name: 'Claro' }),
      screen.getByRole('menuitemcheckbox', { name: 'Marcado' }),
      screen.getByRole('menuitemradio', { name: 'Opção' }),
      screen.getByRole('menuitem', { name: 'Mais' }),
    ]
    expect(itens.filter((item) => !temAnel(item, 'focus'))).toEqual([])
  })
})
