import { render, screen, within } from '@testing-library/react'
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
      'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Suporte',
    )
  })

  it('leva à política de privacidade e aos termos de uso', () => {
    render(<Rodape />)
    const documentos = within(
      screen.getByRole('navigation', { name: 'Documentos' }),
    )
    expect(
      documentos.getByRole('link', { name: 'Privacidade' }),
    ).toHaveAttribute('href', '/privacidade')
    expect(
      documentos.getByRole('link', { name: 'Termos de uso' }),
    ).toHaveAttribute('href', '/termos')
  })
})
