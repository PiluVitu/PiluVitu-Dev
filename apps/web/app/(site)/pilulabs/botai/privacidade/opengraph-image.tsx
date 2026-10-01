import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'
import { getProdutos } from '@/lib/site-content'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'Política de privacidade do Botaí: nada sai do seu navegador'
export const runtime = 'nodejs'

export default async function Image() {
  const produto = (await getProdutos()).find((p) => p.slug === 'botai')
  return imagemOgPiluLabs({
    rotulo: '~/pilulabs/botai/privacidade',
    titulo: 'Política de privacidade',
    subtitulo: `${produto?.nome ?? 'Botaí'}: nada sai do seu navegador`,
    icone: produto?.icone || undefined,
  })
}
