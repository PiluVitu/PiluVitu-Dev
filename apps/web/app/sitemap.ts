import type { MetadataRoute } from 'next'
import { lerDadosPublicos } from '@/lib/dados-publicos'
import { entradasDoSitemap, rotasPublicas } from '@/lib/rotas-publicas'
import { getCanonicalSiteUrl } from '@/lib/site-url'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { posts, piluLabs } = await lerDadosPublicos()
  return entradasDoSitemap(
    rotasPublicas({ posts, piluLabs }),
    getCanonicalSiteUrl(),
  )
}
