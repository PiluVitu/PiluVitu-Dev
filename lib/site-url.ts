/**
 * URL base canónica do site (Open Graph, URLs absolutas na OG image, etc.).
 * Em produção: define `NEXT_PUBLIC_SITE_URL` com o domínio público real
 * (ex.: https://piluvitu.com.br) para que `og:image` e metadados não apontem
 * para um host sem DNS ou diferente do site principal.
 */
export function getCanonicalSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`
  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000'
  return 'https://piluvitu.com.br'
}
