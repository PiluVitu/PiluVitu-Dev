import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { BotaoTema } from './botao-tema'

function renderizar(temaInicial: 'dark' | 'light') {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme={temaInicial}
      enableSystem={false}
    >
      <BotaoTema />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
})

describe('BotaoTema', () => {
  it('no escuro, troca para o claro e guarda a escolha', async () => {
    renderizar('dark')
    await userEvent.click(screen.getByRole('button', { name: 'Alternar tema' }))
    expect(document.documentElement).toHaveClass('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('no claro, troca para o escuro', async () => {
    renderizar('light')
    await userEvent.click(screen.getByRole('button', { name: 'Alternar tema' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  // A classe .dark do <html> sai do script do next-themes antes da hidratação: o ícone certo aparece sem piscar.
  it('os dois ícones vêm no HTML, e a classe dark decide qual aparece', () => {
    renderizar('dark')
    const botao = screen.getByRole('button', { name: 'Alternar tema' })
    expect(botao.querySelector('svg[data-icon="moon"]')).toHaveClass(
      'dark:hidden',
    )
    expect(botao.querySelector('svg[data-icon="sun"]')).toHaveClass(
      'hidden',
      'dark:block',
    )
  })
})
