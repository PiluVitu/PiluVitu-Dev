import { robotsTxt } from '@/lib/rotas-publicas'
import { getCanonicalSiteUrl } from '@/lib/site-url'

export const dynamic = 'force-static'

export function GET() {
  return new Response(robotsTxt(getCanonicalSiteUrl()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
