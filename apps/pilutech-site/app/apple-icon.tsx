import { imagemDoIcone } from '@/lib/imagem-do-icone'
import { LADO_DO_APPLE_ICON } from '@/lib/marca'

export const size = { width: LADO_DO_APPLE_ICON, height: LADO_DO_APPLE_ICON }
export const contentType = 'image/png'

export default function AppleIcon() {
  return imagemDoIcone(LADO_DO_APPLE_ICON, { arredondado: false })
}
