import {
  POLITICA_DE_PRIVACIDADE,
  textoDoParagrafo,
} from '@/lib/politica-de-privacidade'
import { renderEstatico } from '@/lib/render-estatico'
import { PAGINA_PRIVACIDADE } from '@/lib/rotas-publicas'
import PrivacidadePage, { metadata } from './page'

const MAILTO_DA_PRIVACIDADE =
  'mailto:help@pilutech.com.br?subject=%5BPiluVitu%5D%20Privacidade'

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
    expect(vigencia?.getAttribute('datetime')).toBe('2026-11-16')
    expect(texto(vigencia)).toBe('16 de novembro de 2026')
    expect(link(raiz, 'Paulo Victor').getAttribute('href')).toBe('/')
  })

  it('as seções, nesta ordem', () => {
    expect([...pagina().querySelectorAll('h2')].map(texto)).toEqual([
      'Quem é o responsável',
      'Estatísticas de visita',
      'Registros da hospedagem',
      'A Cloudflare na frente do site',
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
    expect(link(responsavel, 'help@pilutech.com.br').getAttribute('href')).toBe(
      MAILTO_DA_PRIVACIDADE,
    )
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
      'Ficam de fora da medição da Vercel a votação de filmes (o Votaí, em votai.piluvitu.com.br, com o histórico) e o painel de administração',
      'a da Cloudflare vale para todas as páginas',
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

  // Conferido em 2026-11-16 na documentação da Cloudflare:
  // - papel e país: https://www.cloudflare.com/privacypolicy/ (Cloudflare, Inc., EUA; operadora dos
  //   "Customer Logs"; seção 7: "We primarily store your information in the United States and the
  //   EEA", com transferência e acesso de outros países onde o grupo opera);
  // - Web Analytics: https://www.cloudflare.com/web-analytics/ (sem cookie nem localStorage, sem
  //   "fingerprint" por IP ou navegador), https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/
  //   (país, caminho, referer, dispositivo, navegador, sistema),
  //   https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/
  //   (beacon de static.cloudflareinsights.com, tempos pela Navigation Timing API) e
  //   https://developers.cloudflare.com/web-analytics/faq/ (sem query string; 7 dias sem amostragem,
  //   depois cerca de 10%; "you can access data for the previous six months", sem dizer quando apaga);
  // - robôs: https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/
  //   (script invisível em /cdn-cgi/challenge-platform, resultado no cf_clearance) e
  //   https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/
  //   (cf_clearance guarda a prova do teste; __cf_bm, do Bot Management e do Bot Fight Mode, expira
  //   depois de 30 minutos sem uso);
  // - Speed Brain (https://developers.cloudflare.com/speed/optimization/content/speed-brain/), e-mail
  //   escondido (https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/)
  //   e Network Error Logging (https://developers.cloudflare.com/network-error-logging/: só falhas;
  //   do IP saem o ASN, o país e a área metropolitana, e o IP não é guardado).
  // A validade de 1 ano do cf_clearance não está em nenhuma dessas páginas: é medida (abaixo) e pode
  // mudar sem aviso; confira de novo quando a política for revista.
  // E na produção, só com GET e um Chromium (2026-11-17 UTC): as páginas não devolvem Set-Cookie; o
  // beacon do Web Analytics entra em todas, inclusive /admin e votai.piluvitu.com.br, que também passa
  // pela Cloudflare; o POST do /cdn-cgi/challenge-platform/.../jsd/oneshot grava o cf_clearance
  // (HttpOnly, Secure, SameSite=None, Domain=piluvitu.com.br) com validade de 1 ano; e os
  // cabeçalhos NEL e Report-To vêm com success_fraction 0.0 (só as falhas).
  it('a Cloudflare: o proxy, o Web Analytics sem cookie, o teste de robô com o cf_clearance e o resto da borda', () => {
    const cloudflare = secao(pagina(), 'A Cloudflare na frente do site')
    esperaTrechos(cloudflare, [
      'piluvitu.com.br e ao votai.piluvitu.com.br',
      'Cloudflare, Inc., empresa dos Estados Unidos',
      'o endereço IP, o navegador e a página pedida',
      'guarda esses dados principalmente nos Estados Unidos e no Espaço Econômico Europeu e pode transferi-los e acessá-los de outros países',
      'Cloudflare Web Analytics',
      'inclusive o Votaí e o painel de administração',
      'static.cloudflareinsights.com',
      'sem os parâmetros do endereço',
      'a página de onde você veio, o país, o tipo de dispositivo, o sistema, o navegador e os tempos de carregamento',
      'não usa cookie nem guarda nada no seu navegador',
      '7 dias',
      'fica disponível no painel por até 6 meses',
      '/cdn-cgi/challenge-platform',
      'cf_clearance',
      'vale por 1 ano',
      '__cf_bm',
      '30 minutos sem uso',
      'endereços de e-mail',
      'Network Error Logging',
      'a rede (ASN), o país e a região metropolitana',
      'LGPD, art. 7º, IX',
    ])
    expect(
      link(cloudflare, 'política de privacidade da Cloudflare').getAttribute(
        'href',
      ),
    ).toBe('https://www.cloudflare.com/privacypolicy/')
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
      'votai.piluvitu.com.br',
      'só no endereço desse serviço (ramielle.piluvitu.com.br)',
      'LGPD, art. 7º, V',
      'enquanto a votação existir',
      'as 30 mais recentes',
    ])
  })

  // O histórico público do Votaí (2026-10-26): as rotas GET /votacao/historico do ramielle só
  // devolvem sessões encerradas, com contagens e o número de participantes, sem dado pessoal.
  it('o histórico público: o que aparece sem login e o que nunca aparece', () => {
    esperaTrechos(secao(pagina(), 'Votação de filmes'), [
      'As votações encerradas ficam públicas, sem login, em votai.piluvitu.com.br/anteriores',
      'o título, a data, os filmes, a contagem de votos de cada filme, o vencedor (inclusive o sorteado na roleta) e o número de participantes',
      'O histórico não mostra quem votou nem em quê, e nenhum nome, e-mail ou foto de quem participou',
    ])
  })

  it('o resumo cita o Votaí e o histórico público só com contagens', () => {
    esperaTrechos(pagina().querySelector('article') as HTMLElement, [
      'o Vercel Web Analytics e o Cloudflare Web Analytics',
      'A Cloudflare, que fica na frente do site, grava um cookie para separar pessoas de robôs',
      'o Votaí, pede login com o Google para votar',
      'o histórico das votações encerradas é público e só mostra contagens',
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
    expect(link(direitos, 'help@pilutech.com.br').getAttribute('href')).toBe(
      MAILTO_DA_PRIVACIDADE,
    )
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
    expect(metadata.description).toBe(PAGINA_PRIVACIDADE.descricao)
    expect(metadata.alternates?.canonical).toBe('/privacidade')
  })

  // O llms-full.txt lê a mesma fonte: o que a página mostra é o que ele traz.
  it('o texto sai da fonte única (lib/politica-de-privacidade.ts): mesmo título, vigência, resumo, seções e parágrafos, na ordem', () => {
    const artigo = pagina().querySelector('article') as HTMLElement
    const politica = POLITICA_DE_PRIVACIDADE
    expect(texto(artigo.querySelector('h1'))).toBe(politica.titulo)
    expect(
      [...artigo.querySelectorAll(':scope > p')].map((p) => texto(p).trim()),
    ).toEqual([
      `Em vigor desde ${politica.vigencia.texto}`,
      textoDoParagrafo(politica.resumo),
    ])
    expect(
      [...artigo.querySelectorAll('section')].map((secao) => ({
        titulo: texto(secao.querySelector('h2')),
        paragrafos: [...secao.querySelectorAll('p')].map((p) =>
          texto(p).trim(),
        ),
      })),
    ).toEqual(
      politica.secoes.map(({ titulo, paragrafos }) => ({
        titulo,
        paragrafos: paragrafos.map(textoDoParagrafo),
      })),
    )
  })
})
