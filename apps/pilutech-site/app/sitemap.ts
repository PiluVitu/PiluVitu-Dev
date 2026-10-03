import type { MetadataRoute } from 'next'
import { urlAbsoluta } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: urlAbsoluta('/') }]
}
