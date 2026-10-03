import type { MetadataRoute } from 'next'
import { LADO_DO_ICONE, NOME_DA_MARCA } from '@/lib/marca'
import { COR_DO_TEMA, DESCRICAO_DA_HOME } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOME_DA_MARCA,
    short_name: NOME_DA_MARCA,
    description: DESCRICAO_DA_HOME,
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: COR_DO_TEMA,
    theme_color: COR_DO_TEMA,
    icons: [
      {
        src: '/icon',
        sizes: `${LADO_DO_ICONE}x${LADO_DO_ICONE}`,
        type: 'image/png',
      },
    ],
  }
}
