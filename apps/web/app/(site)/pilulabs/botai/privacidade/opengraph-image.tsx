import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'
import { getPiluLabs } from '@/lib/site-content'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'Política de privacidade do Botaí: nada sai do seu navegador'
export const runtime = 'nodejs'

export default async function Image() {
  const item = (await getPiluLabs()).find((i) => i.slug === 'botai')
  return imagemOgPiluLabs({
    rotulo: '~/pilulabs/botai/privacidade',
    titulo: 'Política de privacidade',
    subtitulo: `${item?.nome ?? 'Botaí'}: nada sai do seu navegador`,
    icone: item?.logo || undefined,
  })
}
