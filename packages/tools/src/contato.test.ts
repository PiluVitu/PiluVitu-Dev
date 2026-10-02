import { EMAIL_DA_PILUTECH, mailtoDaPilutech } from './contato'

const assuntoDe = (mailto: string) =>
  new URL(mailto).searchParams.get('subject')

describe('mailtoDaPilutech', () => {
  it('todo projeto escreve para o mesmo e-mail', () => {
    expect(EMAIL_DA_PILUTECH).toBe('pilutechinformatica@gmail.com')
    expect(new URL(mailtoDaPilutech('Botaí', 'Suporte')).pathname).toBe(
      'pilutechinformatica@gmail.com',
    )
  })

  // O dono filtra no Gmail com subject:Botaí: o projeto vem primeiro, entre colchetes.
  it('o assunto começa pelo projeto entre colchetes', () => {
    expect(assuntoDe(mailtoDaPilutech('PiluTech', 'Contato pelo site'))).toBe(
      '[PiluTech] Contato pelo site',
    )
    expect(assuntoDe(mailtoDaPilutech('Botaí', 'Termos de uso'))).toBe(
      '[Botaí] Termos de uso',
    )
  })

  // RFC 6068: UTF-8 em percent-encoding. Em mailto o + é literal, e o URLSearchParams poria + no espaço.
  it('codifica em UTF-8, com %20 no espaço e nunca +', () => {
    expect(mailtoDaPilutech('Botaí', 'Suporte')).toBe(
      'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Suporte',
    )
    expect(mailtoDaPilutech('PiluTech', 'Contato pelo site')).not.toContain('+')
  })

  // Review Focus 5.
  it('&, ? e # no assunto não cortam o link nem criam outro campo', () => {
    const url = new URL(mailtoDaPilutech('PiluTech', 'Preço & prazo? #1'))
    expect([...url.searchParams.keys()]).toEqual(['subject'])
    expect(url.searchParams.get('subject')).toBe('[PiluTech] Preço & prazo? #1')
    expect(url.hash).toBe('')
  })
})
