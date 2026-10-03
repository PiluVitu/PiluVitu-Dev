import { render, screen, within } from '@testing-library/react'
import { ETAPAS } from '@/lib/conteudo'
import { ComoFunciona } from './como-funciona'

describe('ComoFunciona', () => {
  it('seção escura, rotulada pelo título, com a âncora #como-funciona', () => {
    render(<ComoFunciona />)
    const secao = screen.getByRole('region', {
      name: 'Quatro etapas, com escopo e valor por escrito.',
    })
    expect(secao).toHaveAttribute('id', 'como-funciona')
    expect(secao).toHaveClass('dark')
  })

  it('as 4 etapas numa lista ordenada, com número, título e texto', () => {
    render(<ComoFunciona />)
    const lista = screen.getByRole('list')
    expect(lista.tagName).toBe('OL')
    const itens = within(lista).getAllByRole('listitem')
    expect(
      itens.map(
        (li) => within(li).getByRole('heading', { level: 3 }).textContent,
      ),
    ).toEqual(ETAPAS.map((e) => e.titulo))
    expect(
      itens.map((li) => li.querySelector('[aria-hidden="true"]')?.textContent),
    ).toEqual(['01', '02', '03', '04'])
    for (const etapa of ETAPAS)
      expect(screen.getByText(etapa.texto)).toBeInTheDocument()
  })
})
