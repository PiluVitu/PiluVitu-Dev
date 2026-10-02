import { imagemOg } from '@/lib/imagem-og'

export { contentType, size } from '@/lib/imagem-og'
export const alt = 'Termos de uso do Botaí: dados fictícios, só para teste'

export default function Image() {
  return imagemOg({
    rotulo: '~/pilulabs/botai/termos',
    titulo: 'Termos de uso',
    subtitulo: 'Botaí: dados fictícios, só para teste',
  })
}
