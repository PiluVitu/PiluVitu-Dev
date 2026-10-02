import type { MetadataRoute } from 'next'
import { NOME } from '@/lib/conteudo'
import { COR_DO_TEMA_ESCURO, DESCRICAO_DA_HOME } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOME,
    short_name: NOME,
    description: DESCRICAO_DA_HOME,
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: COR_DO_TEMA_ESCURO,
    theme_color: COR_DO_TEMA_ESCURO,
    icons: [{ src: '/icon.png', sizes: '300x300', type: 'image/png' }],
  }
}
