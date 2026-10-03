import {
  ABRE_EM_ABA_NOVA,
  EMAIL_DA_PILUTECH,
  linkDoWhatsApp,
  MAILTO_DO_SITE,
  MENSAGENS_DO_WHATSAPP,
  TELEFONE_INTERNACIONAL,
  TELEFONE_VISIVEL,
  WHATSAPP,
  WHATSAPP_NUMERO,
} from './contato'

const soDigitos = (texto: string) => texto.replace(/\D/g, '')

describe('WhatsApp', () => {
  it('o número com DDI e DDD, como o wa.me pede', () => {
    expect(WHATSAPP_NUMERO).toBe('5586981737625')
  })

  it('o telefone visível e o internacional são o mesmo número', () => {
    expect(TELEFONE_VISIVEL).toBe('(86) 98173-7625')
    expect(TELEFONE_INTERNACIONAL).toBe('+55 86 98173-7625')
    expect(`55${soDigitos(TELEFONE_VISIVEL)}`).toBe(WHATSAPP_NUMERO)
    expect(soDigitos(TELEFONE_INTERNACIONAL)).toBe(WHATSAPP_NUMERO)
  })

  it('as mensagens são as do design', () => {
    expect(MENSAGENS_DO_WHATSAPP).toEqual({
      geral: 'Olá! Vim pelo site da PiluTech e quero falar sobre um projeto.',
      essencial: 'Olá! Quero uma proposta do plano Essencial de manutenção.',
      evolucao: 'Olá! Quero uma proposta do plano Evolução de manutenção.',
      infraestrutura: 'Olá! Quero uma proposta do plano de Infraestrutura.',
    })
  })

  it('o link geral, codificado', () => {
    expect(WHATSAPP.geral).toBe(
      'https://wa.me/5586981737625?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20PiluTech%20e%20quero%20falar%20sobre%20um%20projeto.',
    )
  })

  it.each(Object.entries(MENSAGENS_DO_WHATSAPP))(
    '%s: o texto volta igual do link',
    (chave, mensagem) => {
      const url = new URL(WHATSAPP[chave as keyof typeof WHATSAPP])
      expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/5586981737625')
      expect(url.searchParams.get('text')).toBe(mensagem)
    },
  )

  it('& e # na mensagem não cortam o link', () => {
    expect(new URL(linkDoWhatsApp('a & b #1')).searchParams.get('text')).toBe(
      'a & b #1',
    )
  })
})

describe('e-mail', () => {
  it('o contato do site vai para o e-mail da PiluTech com [PiluTech] no assunto', () => {
    expect(EMAIL_DA_PILUTECH).toBe('pilutechinformatica@gmail.com')
    expect(MAILTO_DO_SITE).toBe(
      'mailto:pilutechinformatica@gmail.com?subject=%5BPiluTech%5D%20Contato%20pelo%20site',
    )
  })
})

it('link externo abre em aba nova sem passar a referência', () => {
  expect(ABRE_EM_ABA_NOVA).toEqual({
    target: '_blank',
    rel: 'noopener noreferrer',
  })
})
