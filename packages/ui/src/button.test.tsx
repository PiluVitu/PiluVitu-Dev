import { render, screen } from '@testing-library/react'
import { Button } from './button'

// O "afundar" ao pressionar é transform (barato) e fica atrás de motion-safe:
// com prefers-reduced-motion o navegador simplesmente não aplica a escala.
describe('Button — retorno ao pressionar', () => {
  it('escala ao pressionar só quando o sistema permite movimento', () => {
    render(<Button>Salvar</Button>)
    const classes = screen.getByRole('button').className.split(/\s+/)
    expect(classes).toContain('motion-safe:active:scale-[0.97]')
    expect(classes.some((c) => /^active:scale/.test(c))).toBe(false)
  })

  it('a transição cobre a escala e dura 150 ms', () => {
    render(<Button>Salvar</Button>)
    const classes = screen.getByRole('button').className.split(/\s+/)
    expect(classes).toContain(
      'transition-[color,background-color,border-color,transform]',
    )
    expect(classes).toContain('duration-150')
    expect(classes).not.toContain('transition-colors')
  })
})
