export const SITE_DE_PRODUCAO = 'https://botai.pilutech.com.br'

export function urlDoSite(
  env: Record<string, string | undefined> = process.env,
): string {
  const valor = env.SITE_URL?.trim()
  if (!valor) return SITE_DE_PRODUCAO
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : SITE_DE_PRODUCAO
  } catch {
    return SITE_DE_PRODUCAO
  }
}

export function urlAbsoluta(
  caminho: string,
  siteUrl: string = urlDoSite(),
): string {
  return new URL(caminho, `${siteUrl}/`).href
}
