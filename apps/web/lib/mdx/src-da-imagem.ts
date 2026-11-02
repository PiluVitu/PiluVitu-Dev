const ABSOLUTA = /^https?:\/\//i
const UPLOADS_COLADO = /^\/?uploads\/?(?=https?:\/\/)/i

/** O `src` de uma imagem do post: URL absoluta como está, `/uploads` só em
 * caminho relativo. */
export function srcDaImagem(src: string | undefined): string | undefined {
  const s = src?.trim().replace(UPLOADS_COLADO, '')
  if (!s) return undefined
  if (ABSOLUTA.test(s) || s.startsWith('/')) return s
  return `/uploads/${s}`
}
