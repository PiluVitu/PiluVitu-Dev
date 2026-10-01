import { renderEstatico } from '@/lib/render-estatico'
import { StatusProduto } from './status-produto'

describe('StatusProduto', () => {
  it('em-breve mostra "Em breve"', () => {
    expect(renderEstatico(<StatusProduto fase="em-breve" />).textContent).toBe(
      'Em breve',
    )
  })

  it('disponivel mostra "Disponível"', () => {
    expect(
      renderEstatico(<StatusProduto fase="disponivel" />).textContent,
    ).toBe('Disponível')
  })
})
