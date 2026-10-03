import { imagemDoIcone } from '@/lib/imagem-do-icone'
import { LADO_DO_ICONE } from '@/lib/marca'

export const size = { width: LADO_DO_ICONE, height: LADO_DO_ICONE }
export const contentType = 'image/png'

export default function Icon() {
  return imagemDoIcone(LADO_DO_ICONE, { arredondado: true })
}
