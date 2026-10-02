import { imagemOg } from '@/lib/imagem-og'

export { contentType, size } from '@/lib/imagem-og'
export const alt = 'Política de privacidade do Botaí: nada sai do seu navegador'

export default function Image() {
  return imagemOg({
    rotulo: '~/pilulabs/botai/privacidade',
    titulo: 'Política de privacidade',
    subtitulo: 'Botaí: nada sai do seu navegador',
  })
}
