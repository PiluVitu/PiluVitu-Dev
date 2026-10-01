import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'
import { getProdutos } from '@/lib/site-content'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'Botaí, gerador de dados fake para formulários, no PiluLabs'
export const runtime = 'nodejs'

export default async function Image() {
  const produto = (await getProdutos()).find((p) => p.slug === 'botai')
  return imagemOgPiluLabs({
    rotulo: '~/pilulabs/botai',
    titulo: produto?.nome ?? 'Botaí',
    subtitulo: produto?.resumo ?? '',
    icone: produto?.icone || undefined,
  })
}
