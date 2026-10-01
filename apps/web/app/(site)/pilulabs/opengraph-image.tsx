import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'PiluLabs: produtos e apps da PiluTech'
export const runtime = 'nodejs'

export default function Image() {
  return imagemOgPiluLabs({
    rotulo: '$ ~/pilulabs',
    titulo: 'PiluLabs',
    subtitulo: 'Produtos e apps da PiluTech',
  })
}
