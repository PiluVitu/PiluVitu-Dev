import { lerFaseDoBotai } from '@/lib/cms'
import { llmsTxt } from '@/lib/llms'
import { urlDoSite } from '@/lib/site'

export const dynamic = 'force-static'

export function GET() {
  return new Response(
    llmsTxt({ faseDoBotai: lerFaseDoBotai(), siteUrl: urlDoSite() }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
