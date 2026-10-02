import { getCanonicalSiteUrl } from './site-url'

const ORIGINAL = { ...process.env }

function comAmbiente(env: Record<string, string>) {
  const limpo = { ...ORIGINAL }
  for (const chave of [
    'NEXT_PUBLIC_SITE_URL',
    'VERCEL_ENV',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'VERCEL_URL',
  ])
    delete limpo[chave]
  process.env = { ...limpo, ...env }
}

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('getCanonicalSiteUrl', () => {
  // A Vercel escolhe o domínio de produção mais curto, e pilutech.com.br tem o
  // mesmo tamanho de piluvitu.com.br: só a variável explícita segura o canônico.
  it('NEXT_PUBLIC_SITE_URL vence o domínio de produção da Vercel', () => {
    comAmbiente({
      NEXT_PUBLIC_SITE_URL: 'https://piluvitu.com.br/',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'pilutech.com.br',
    })
    expect(getCanonicalSiteUrl()).toBe('https://piluvitu.com.br')
  })

  it('sem NEXT_PUBLIC_SITE_URL, a produção usa o domínio que a Vercel escolher', () => {
    comAmbiente({
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'pilutech.com.br',
    })
    expect(getCanonicalSiteUrl()).toBe('https://pilutech.com.br')
  })
})
