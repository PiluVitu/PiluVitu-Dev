import { cartoesDosProjetos } from './conteudo'
import { llmsTxt } from './llms'

const texto = llmsTxt({
  faseDoBotai: 'disponivel',
  siteUrl: 'https://pilutech.com.br',
})

it('segue o formato do llmstxt.org: título, resumo em citação e seções', () => {
  const linhas = texto.split('\n')
  expect(linhas[0]).toBe('# PiluTech')
  expect(linhas[2]).toMatch(/^> .+Teresina \(PI\)/)
  expect(texto).toMatch(/^## Produtos$/m)
  expect(texto).toMatch(/^## Site$/m)
  expect(texto).toMatch(/^## Contato$/m)
  expect(texto.endsWith('\n')).toBe(true)
})

it('lista cada produto com site como link para o próprio subdomínio', () => {
  for (const [nome, url] of [
    ['Botaí', 'https://botai.pilutech.com.br/'],
    ['Sombraí', 'https://sombrai.pilutech.com.br/'],
    ['Apuraí', 'https://apurai.pilutech.com.br/'],
    ['Reparaí', 'https://reparai.pilutech.com.br/'],
  ]) {
    expect(texto).toContain(`- [${nome}](${url}): `)
  }
})

it('traz todos os produtos dos cartões, com o mesmo tipo, situação e texto', () => {
  for (const cartao of cartoesDosProjetos('disponivel')) {
    expect(texto).toContain(cartao.nome)
    expect(texto).toContain(`${cartao.selo}. ${cartao.texto}`)
  }
})

it('produto sem site não ganha link inventado', () => {
  for (const nome of ['Vejaí', 'Oraí', 'Live PRs']) {
    expect(texto).toMatch(new RegExp(`^- ${nome}: `, 'm'))
    expect(texto).not.toContain(`[${nome}]`)
  }
})

it('a situação do Botaí vem do CMS', () => {
  const emBreve = llmsTxt({
    faseDoBotai: 'em-breve',
    siteUrl: 'https://pilutech.com.br',
  })
  expect(emBreve).toContain(
    '[Botaí](https://botai.pilutech.com.br/): Extensão de navegador · em breve.',
  )
})

it('os links do site usam a origem recebida', () => {
  expect(texto).toContain('- [Página inicial](https://pilutech.com.br/)')
  expect(texto).toContain(
    '- [Política de privacidade](https://pilutech.com.br/privacidade)',
  )
  const local = llmsTxt({
    faseDoBotai: 'disponivel',
    siteUrl: 'http://localhost:3021',
  })
  expect(local).toContain('- [Página inicial](http://localhost:3021/)')
})

it('contato com e-mail e WhatsApp, sem Votaí nem Finanças', () => {
  expect(texto).toContain('pilutechinformatica@gmail.com')
  expect(texto).toContain('https://wa.me/5586981737625')
  expect(texto).not.toMatch(/Votaí|Finanças|piluvitu/i)
})

it('o Sombraí não fala em baixar nem em loja', () => {
  const linha = texto.split('\n').find((l) => l.includes('[Sombraí]'))
  expect(linha).not.toMatch(/baix|Google Play|App Store|Play Store/i)
})
