import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'
import { getPiluLabs } from '@/lib/site-content'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'Botaí, gerador de dados fake para formulários, no PiluLabs'
export const runtime = 'nodejs'

export default async function Image() {
  const item = (await getPiluLabs()).find((i) => i.slug === 'botai')
  return imagemOgPiluLabs({
    rotulo: '~/pilulabs/botai',
    titulo: item?.nome ?? 'Botaí',
    subtitulo: item?.subtitulo ?? '',
    icone: item?.logo || undefined,
  })
}
