import { EMAIL_DA_PILUTECH } from '@piluvitu/tools/contato'
import { contatosProibidos } from './contatos-no-llms'

// O llms-full.txt leva os posts do blog inteiros: um tutorial pode mostrar um e-mail de exemplo, desde que
// num domínio reservado para isso (RFC 2606). Qualquer outro contato é dado pessoal que não vai para IA.
describe('contatosProibidos', () => {
  it('o e-mail público da PiluTech passa, também no fim de uma frase', () => {
    expect(
      contatosProibidos(
        `Escreva para ${EMAIL_DA_PILUTECH}. Ou ${EMAIL_DA_PILUTECH}`,
        EMAIL_DA_PILUTECH,
      ),
    ).toEqual([])
  })

  it('passam os domínios reservados de exemplo: example.com, .org, .net, os subdomínios deles e qualquer .invalid', () => {
    const texto = [
      'git config --global user.email "seuemail@example.com"',
      'ana@example.org e bia@example.net.',
      'ci@build.example.com, joao.silva+teste@EXAMPLE.COM',
      'ninguem@qualquer.invalid e alguem@x.y.invalid',
    ].join('\n')

    expect(contatosProibidos(texto, EMAIL_DA_PILUTECH)).toEqual([])
  })

  it('exemplo.com (em português) e os parecidos com example continuam reprovados', () => {
    const texto = [
      'seuemail@exemplo.com',
      'a@example.com.br',
      'b@notexample.com',
      'c@example.co',
      'd@example.invalid.com',
      'e@gmail.com',
    ].join(' ')

    expect(contatosProibidos(texto, EMAIL_DA_PILUTECH)).toEqual([
      'seuemail@exemplo.com',
      'a@example.com.br',
      'b@notexample.com',
      'c@example.co',
      'd@example.invalid.com',
      'e@gmail.com',
    ])
  })

  it('mailto:, tel:, wa.me e WhatsApp seguem proibidos, mesmo com um e-mail de exemplo', () => {
    expect(
      contatosProibidos(
        '[escreva](mailto:seuemail@example.com) tel:+5586999999999 https://wa.me/5586 WhatsApp',
        EMAIL_DA_PILUTECH,
      ),
    ).toEqual(['mailto:', 'tel:', 'wa.me', 'WhatsApp'])
  })

  it('WhatsApp e wa.me seguem proibidos mesmo dentro de um e-mail num domínio de exemplo', () => {
    const texto = [
      'fale no whatsapp@example.com',
      'wa.me@example.org',
      'x@whatsapp.example.com',
      'y@wa.me.invalid',
    ].join(' ')

    expect(contatosProibidos(texto, EMAIL_DA_PILUTECH)).toEqual([
      'whatsapp@example.com',
      'wa.me@example.org',
      'x@whatsapp.example.com',
      'y@wa.me.invalid',
    ])
  })
})
