/**
 * URL base canónica do site (Open Graph, URLs absolutas na OG image, etc.).
 * Em produção: define `NEXT_PUBLIC_SITE_URL` com o domínio público real
 * (ex.: https://piluvitu.com.br) para que `og:image` e metadados não apontem
 * para um host sem DNS ou diferente do site principal.
 */
export function getCanonicalSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  // Em produção na Vercel, VERCEL_URL é o host *.vercel.app — metadados e
  // og:image absolutos ficam errados sem domínio customizado. Esta variável
  // aponta para o hostname de produção do projeto (ex.: piluvitu.com.br).
  if (process.env.VERCEL_ENV === 'production') {
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    if (productionHost) {
      const host = productionHost.replace(/^https?:\/\//, '').replace(/\/$/, '')
      if (host) return `https://${host}`
    }
  }

  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000'
  return 'https://piluvitu.com.br'
}
