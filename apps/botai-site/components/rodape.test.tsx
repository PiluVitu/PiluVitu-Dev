import { render, screen } from '@testing-library/react'
import { Rodape } from './rodape'

describe('Rodape', () => {
  it('é o contentinfo, com Powered by PiluTech e o suporte por e-mail', () => {
    render(<Rodape />)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Powered by PiluTech' }),
    ).toHaveAttribute('href', 'https://pilutech.com.br')
    expect(screen.getByRole('link', { name: 'Suporte' })).toHaveAttribute(
      'href',
      'mailto:pilutechinformatica@gmail.com',
    )
  })
})
