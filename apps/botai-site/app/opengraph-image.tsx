import { NOME, PROPOSTA } from '@/lib/conteudo'
import { imagemOg } from '@/lib/imagem-og'

export { contentType, size } from '@/lib/imagem-og'
export const alt =
  'Botaí: gerador de dados fake para formulários (CPF, CNPJ, CEP)'

export default function Image() {
  return imagemOg({
    rotulo: '~/pilulabs/botai',
    titulo: NOME,
    subtitulo: PROPOSTA,
  })
}
