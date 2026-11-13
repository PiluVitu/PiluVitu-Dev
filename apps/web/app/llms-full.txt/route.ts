import { lerDadosPublicos } from '@/lib/dados-publicos'
import { llmsFullTxt } from '@/lib/llms'
import { getCanonicalSiteUrl } from '@/lib/site-url'

export const dynamic = 'force-static'

export async function GET() {
  return new Response(
    llmsFullTxt(await lerDadosPublicos(), getCanonicalSiteUrl()),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
