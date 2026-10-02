import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DESCRICAO_DA_HOME,
  DESCRICAO_DA_PRIVACIDADE,
  DESCRICAO_DOS_TERMOS,
  metadataDaPagina,
  metadataDoSite,
  TITULO_DA_HOME,
  TITULO_DA_PRIVACIDADE,
  TITULO_DOS_TERMOS,
  VIEWPORT,
} from './seo'

const SITE = 'https://botai.pilutech.com.br'

describe('textos de busca', () => {
  it('título da home: até 60 caracteres, com o nome e o que ele gera', () => {
    expect(TITULO_DA_HOME).toBe(
      'Botaí: gerador de CPF, CNPJ e CEP para testar formulários',
    )
    expect(TITULO_DA_HOME.length).toBeLessThanOrEqual(60)
  })

  it('descrição da home: 140–160 caracteres, com os termos buscados', () => {
    expect(DESCRICAO_DA_HOME.length).toBeGreaterThanOrEqual(140)
    expect(DESCRICAO_DA_HOME.length).toBeLessThanOrEqual(160)
    for (const termo of [
      'Chrome, Firefox, Edge e Opera',
      'dados de teste',
      'CPF e CNPJ válidos',
      'CEP real',
      'formulário',
    ])
      expect(DESCRICAO_DA_HOME).toContain(termo)
  })

  it('a política tem título e descrição próprios', () => {
    expect(TITULO_DA_PRIVACIDADE).toBe('Política de privacidade do Botaí')
    expect(DESCRICAO_DA_PRIVACIDADE.length).toBeGreaterThanOrEqual(140)
    expect(DESCRICAO_DA_PRIVACIDADE.length).toBeLessThanOrEqual(160)
  })

  it('os termos têm título e descrição próprios', () => {
    expect(TITULO_DOS_TERMOS).toBe('Termos de uso do Botaí')
    expect(DESCRICAO_DOS_TERMOS.length).toBeGreaterThanOrEqual(140)
    expect(DESCRICAO_DOS_TERMOS.length).toBeLessThanOrEqual(160)
  })

  // Texto honesto: antes das lojas, nada de "disponível".
  it('nenhum texto de busca diz que já está disponível', () => {
    for (const texto of [
      TITULO_DA_HOME,
      DESCRICAO_DA_HOME,
      TITULO_DA_PRIVACIDADE,
      DESCRICAO_DA_PRIVACIDADE,
      TITULO_DOS_TERMOS,
      DESCRICAO_DOS_TERMOS,
    ])
      expect(texto).not.toMatch(/dispon[ií]vel/i)
  })
})

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName vêm de novo.
  it('canonical, Open Graph e Twitter da rota, sem declarar imagem', () => {
    expect(
      metadataDaPagina({
        caminho: '/privacidade',
        titulo: TITULO_DA_PRIVACIDADE,
        descricao: DESCRICAO_DA_PRIVACIDADE,
      }),
    ).toEqual({
      title: { absolute: TITULO_DA_PRIVACIDADE },
      description: DESCRICAO_DA_PRIVACIDADE,
      alternates: { canonical: '/privacidade' },
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        siteName: 'Botaí',
        url: '/privacidade',
        title: TITULO_DA_PRIVACIDADE,
        description: DESCRICAO_DA_PRIVACIDADE,
      },
      twitter: {
        card: 'summary_large_image',
        title: TITULO_DA_PRIVACIDADE,
        description: DESCRICAO_DA_PRIVACIDADE,
      },
    })
  })
})

describe('metadataDoSite', () => {
  // O tipo é `null | string | URL | undefined`: `.href` não compila no tsc (o ts-jest só transpila e
  // não acusaria), e `toEqual(new URL(…))` passaria sempre (URL não tem propriedade própria enumerável).
  it('metadataBase no site e a PiluTech como autora', () => {
    const metadata = metadataDoSite(SITE, {})
    expect(metadata.metadataBase?.toString()).toBe(`${SITE}/`)
    expect(metadata).toMatchObject({
      applicationName: 'Botaí',
      creator: 'PiluTech',
      publisher: 'PiluTech',
    })
    expect(metadata).not.toHaveProperty('verification')
  })

  it('GOOGLE_SITE_VERIFICATION vira a meta do Search Console', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: ' abc123 ' })
        .verification,
    ).toEqual({ google: 'abc123' })
  })

  it('vazia, nenhuma meta de verificação', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: '' }),
    ).not.toHaveProperty('verification')
  })
})

const CSS_DO_DESIGN_SYSTEM = readFileSync(
  join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'styles.css'),
  'utf8',
)

function hslParaHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const luz = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(luz, 1 - luz)
  const canal = (n: number) =>
    luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[0, 8, 4]
    .map((n) =>
      Math.round(canal(n) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function fundoDoTema(seletor: ':root' | '.dark'): string {
  const bloco = CSS_DO_DESIGN_SYSTEM.slice(
    CSS_DO_DESIGN_SYSTEM.indexOf(`${seletor} {`),
  )
  const [, h, s, l] = /--background:\s*(\d+)\s+(\d+)%\s+(\d+)%/.exec(bloco)!
  return hslParaHex(Number(h), Number(s), Number(l))
}

// A barra do navegador acompanha o fundo de cada tema do @piluvitu/ui.
it('theme-color claro e escuro são o --background dos dois temas', () => {
  expect(VIEWPORT.themeColor).toEqual([
    { media: '(prefers-color-scheme: light)', color: fundoDoTema(':root') },
    { media: '(prefers-color-scheme: dark)', color: fundoDoTema('.dark') },
  ])
})
