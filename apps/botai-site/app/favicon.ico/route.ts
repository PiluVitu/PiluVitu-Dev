import { faviconDoBotai } from '@/lib/favicon'

export const dynamic = 'force-static'

export function GET() {
  return new Response(faviconDoBotai(), {
    headers: { 'Content-Type': 'image/x-icon' },
  })
}
