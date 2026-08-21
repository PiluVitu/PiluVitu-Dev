import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  sheetVariants,
} from './sheet'

const CONTEUDO = 'Contas, Categorias, Recorrentes'

function Exemplo({ side }: { side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Sheet>
      <SheetTrigger>Mais</SheetTrigger>
      <SheetContent side={side} data-testid="painel">
        <SheetTitle>Mais destinos</SheetTitle>
        <p>{CONTEUDO}</p>
      </SheetContent>
    </Sheet>
  )
}

describe('Sheet', () => {
  test('não renderiza o conteúdo no DOM antes de abrir', () => {
    render(<Exemplo />)

    expect(screen.queryByText(CONTEUDO)).not.toBeInTheDocument()
  })

  // ⚠️ Clique, nunca `mouseOver` — um `mouseOver` passaria contra qualquer
  // coisa que só esconde por CSS e não provaria qual primitive foi usado.
  test('abre no clique do gatilho, com role="dialog"', async () => {
    const user = userEvent.setup()
    render(<Exemplo side="bottom" />)

    await user.click(screen.getByRole('button', { name: 'Mais' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(CONTEUDO)).toBeInTheDocument()
  })

  test('fecha com Esc (comportamento do primitive, sem handler próprio)', async () => {
    const user = userEvent.setup()
    render(<Exemplo side="bottom" />)

    await user.click(screen.getByRole('button', { name: 'Mais' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('o botão de fechar tem nome acessível (não é um "×" mudo)', async () => {
    const user = userEvent.setup()
    render(<Exemplo side="bottom" />)

    await user.click(screen.getByRole('button', { name: 'Mais' }))

    expect(
      await screen.findByRole('button', { name: 'Fechar' }),
    ).toBeInTheDocument()
  })
})

describe('Sheet — variantes de `side`', () => {
  // A razão de este componente existir e não ser só `dialog.tsx`: o painel
  // ancora numa BORDA. Num celular, um menu de navegação tem que nascer perto
  // do polegar — `bottom` é o caso de uso que motivou o arquivo.
  test('`bottom` ancora embaixo e ocupa a largura toda', async () => {
    const user = userEvent.setup()
    render(<Exemplo side="bottom" />)

    await user.click(screen.getByRole('button', { name: 'Mais' }))
    const painel = await screen.findByTestId('painel')

    expect(painel.className).toContain('bottom-0')
    expect(painel.className).toContain('inset-x-0')
    expect(painel.className).not.toContain('inset-y-0')
  })

  test('cada `side` produz a âncora da sua borda', () => {
    expect(sheetVariants({ side: 'top' })).toContain('top-0')
    expect(sheetVariants({ side: 'bottom' })).toContain('bottom-0')
    expect(sheetVariants({ side: 'left' })).toContain('left-0')
    expect(sheetVariants({ side: 'right' })).toContain('right-0')
    // o default do `cva` é `right` — sem argumento nenhum ele não pode sair
    // sem âncora, senão o painel renderizaria solto no meio da tela.
    expect(sheetVariants()).toContain('right-0')
  })
})
