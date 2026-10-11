import { renderEstatico } from '@/lib/render-estatico'
import PrivacidadePage, { metadata } from './page'

const MAILTO_DA_PRIVACIDADE =
  'mailto:pilutechinformatica@gmail.com?subject=%5BPiluVitu%5D%20Privacidade'

const pagina = () => renderEstatico(<PrivacidadePage />)

const texto = (no: Element | null) =>
  (no?.textContent ?? '').replace(/\s+/g, ' ')

function secao(raiz: HTMLElement, titulo: string): HTMLElement {
  const h2 = [...raiz.querySelectorAll('h2')].find(
    (h) => h.textContent === titulo,
  )
  if (!h2) throw new Error(`sem a seção "${titulo}"`)
  return h2.closest('section') as HTMLElement
}

function link(raiz: Element, nome: string): HTMLAnchorElement {
  const a = [...raiz.querySelectorAll('a')].find(
    (el) => texto(el).trim() === nome,
  )
  if (!a) throw new Error(`sem o link "${nome}"`)
  return a
}

function esperaTrechos(raiz: Element, trechos: string[]) {
  for (const trecho of trechos) expect(texto(raiz)).toContain(trecho)
}

describe('/privacidade', () => {
  it('o h1, a data de vigência e o caminho de volta para a home', () => {
    const raiz = pagina()
    expect(texto(raiz.querySelector('h1'))).toBe('Política de privacidade')
    const vigencia = raiz.querySelector('time')
    expect(vigencia?.getAttribute('datetime')).toBe('2026-10-11')
    expect(texto(vigencia)).toBe('11 de outubro de 2026')
    expect(link(raiz, 'Paulo Victor').getAttribute('href')).toBe('/')
  })

  it('as seções, nesta ordem', () => {
    expect([...pagina().querySelectorAll('h2')].map(texto)).toEqual([
      'Quem é o responsável',
      'Estatísticas de visita',
      'Registros da hospedagem',
      'Votação de filmes',
      'Formulário de contato',
      'Conteúdo de outros sites',
      'O que fica só no seu navegador',
      'Seus direitos',
      'Mudanças nesta política',
    ])
  })

  it('o responsável é o Paulo Victor, pessoa física, com o e-mail de assunto [PiluVitu] Privacidade', () => {
    const responsavel = secao(pagina(), 'Quem é o responsável')
    esperaTrechos(responsavel, [
      'Paulo Victor Torres Silva',
      'Teresina (PI)',
      'não vende dados',
    ])
    expect(
      link(responsavel, 'pilutechinformatica@gmail.com').getAttribute('href'),
    ).toBe(MAILTO_DA_PRIVACIDADE)
  })

  // O que cada ferramenta registra vem das políticas da Vercel (conferidas em 2026-10-11):
  // https://vercel.com/docs/analytics/privacy-policy e https://vercel.com/docs/speed-insights/privacy-policy
  it('as estatísticas: o que o Web Analytics e o Speed Insights registram, sem cookie, e o que fica de fora', () => {
    esperaTrechos(secao(pagina(), 'Estatísticas de visita'), [
      'Vercel Web Analytics',
      'a página, a página de onde você veio',
      'o país, a região e a cidade aproximados',
      'o tipo de dispositivo, o sistema e o navegador',
      'não usa cookie',
      'descartado em 24 horas',
      'números somados',
      'Vercel Speed Insights',
      'as Web Vitals',
      'sem identificar quem visita',
      'a votação de filmes e o painel de administração não são medidos',
      'LGPD, art. 7º, IX',
    ])
  })

  it('os registros da hospedagem: a Vercel como operadora, fora do Brasil, com a política dela', () => {
    const hospedagem = secao(pagina(), 'Registros da hospedagem')
    esperaTrechos(hospedagem, [
      'endereço IP',
      'Vercel Inc.',
      'fora do Brasil',
      'LGPD, art. 7º, IX',
    ])
    expect(
      link(hospedagem, 'política de privacidade da Vercel').getAttribute(
        'href',
      ),
    ).toBe('https://vercel.com/legal/privacy-policy')
  })

  // Fatos conferidos no apps/ramielle em 2026-10-11: o D1 guarda user/account/session/votos, sem
  // rotina de limpeza; o Better Auth 1.6.25 sem `session.expiresIn` dá 7 dias, renovados a cada
  // dia de uso; o backup é o banco inteiro, no Mac do dono, com as 30 cópias mais recentes.
  it('a votação: o que o login com o Google guarda, o cookie, quem vê os votos, a base legal e o prazo', () => {
    esperaTrechos(secao(pagina(), 'Votação de filmes'), [
      'grupo de amigos',
      'login com o Google',
      'ramielle.piluvitu.com.br',
      'Cloudflare, Inc.',
      'o identificador do Google, o nome, o e-mail, a foto',
      'tokens de acesso',
      'o filme e a data',
      'o endereço IP e o navegador',
      '__Secure-better-auth.session_token',
      '7 dias',
      'Sair apaga',
      'Só o administrador vê quem votou em quê',
      'LGPD, art. 7º, V',
      'enquanto a votação existir',
      'as 30 mais recentes',
    ])
  })

  it('o formulário de contato: FormSubmit, reCAPTCHA e Gmail', () => {
    esperaTrechos(secao(pagina(), 'Formulário de contato'), [
      'o nome, o e-mail, o assunto e a mensagem',
      'FormSubmit (formsubmit.co)',
      'reCAPTCHA do Google',
      'Gmail',
      'só para responder',
    ])
  })

  it('o conteúdo de outros sites: a API do dev.to e as imagens de fora veem o IP', () => {
    esperaTrechos(secao(pagina(), 'Conteúdo de outros sites'), [
      'API do dev.to',
      'endereço IP',
    ])
  })

  it('o que fica só no navegador: o tema, o /tasks e a câmera do /tools', () => {
    esperaTrechos(secao(pagina(), 'O que fica só no seu navegador'), [
      'o tema',
      '/tasks',
      '/tools',
      'a câmera',
      'nenhuma imagem sai',
    ])
  })

  it('os direitos da LGPD, com o e-mail e a ANPD', () => {
    const direitos = secao(pagina(), 'Seus direitos')
    expect(texto(direitos)).toContain('art. 18')
    expect(
      link(direitos, 'pilutechinformatica@gmail.com').getAttribute('href'),
    ).toBe(MAILTO_DA_PRIVACIDADE)
    expect(
      link(
        direitos,
        'Autoridade Nacional de Proteção de Dados (ANPD)',
      ).getAttribute('href'),
    ).toBe('https://www.gov.br/anpd/pt-br')
  })

  it('todo link externo abre em aba nova, sem passar a referência', () => {
    const externos = [...pagina().querySelectorAll('a')].filter((a) =>
      a.getAttribute('href')?.startsWith('http'),
    )
    expect(externos.length).toBeGreaterThan(0)
    for (const a of externos) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('metadata: o título, a descrição e o canonical da página', () => {
    expect(metadata.title).toEqual({
      absolute: 'Política de privacidade | Paulo Victor Torres Silva',
    })
    expect(metadata.description).toMatch(/^.{50,160}$/)
    expect(metadata.alternates?.canonical).toBe('/privacidade')
  })
})
