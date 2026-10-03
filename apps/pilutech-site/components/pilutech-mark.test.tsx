import { render, screen } from '@testing-library/react'
import { PiluTechMark, SvgDaMarca } from './pilutech-mark'

describe('SvgDaMarca', () => {
  // No site, a versão escura ou clara vem do contexto (tokens do .dark ou do :root).
  it('no site, os blocos usam os tokens do contexto', () => {
    const { container } = render(<SvgDaMarca tamanho={30} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '30')
    expect(svg).toHaveAttribute('viewBox', '0 0 48 48')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    const blocos = [...container.querySelectorAll('rect')]
    expect(blocos).toHaveLength(5)
    expect(
      blocos
        .filter((b) => b.classList.contains('fill-primary'))
        .map((b) => [b.getAttribute('x'), b.getAttribute('y')]),
    ).toEqual([['25.5', '0']])
    expect(
      blocos.filter((b) => b.classList.contains('fill-foreground')),
    ).toHaveLength(4)
    for (const bloco of blocos) expect(bloco).toHaveAttribute('rx', '3.5')
  })

  it('nas imagens geradas, as cores vão no fill', () => {
    const { container } = render(
      <SvgDaMarca tamanho={48} cores={{ base: '#fff', destaque: '#0ff' }} />,
    )
    expect(
      [...container.querySelectorAll('rect')].map((b) =>
        b.getAttribute('fill'),
      ),
    ).toEqual(['#fff', '#0ff', '#fff', '#fff', '#fff'])
  })

  it('com rótulo, é uma imagem com nome', () => {
    render(<SvgDaMarca tamanho={48} rotulo="PiluTech" />)
    expect(screen.getByRole('img', { name: 'PiluTech' })).toBeInTheDocument()
  })
})

describe('PiluTechMark', () => {
  it('com lockup: símbolo decorativo e o nome em Jakarta 800, tracking −0.035em, a 60% do símbolo', () => {
    const { container } = render(<PiluTechMark tamanho={30} lockup />)
    const nome = screen.getByText('PiluTech')
    expect(nome).toHaveClass(
      'font-extrabold',
      'tracking-[-0.035em]',
      'text-foreground',
    )
    expect(nome).toHaveStyle({ fontSize: '18px' })
    expect(container.firstElementChild).toHaveStyle({ gap: '8px' })
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('sem lockup: só o símbolo, com o nome para o leitor de tela', () => {
    render(<PiluTechMark tamanho={48} />)
    expect(screen.getByRole('img', { name: 'PiluTech' })).toBeInTheDocument()
    expect(screen.queryByText('PiluTech')).toBeNull()
  })
})
