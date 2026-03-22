import { cookies, draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Ativa o Draft Mode do Next e redireciona para a URL de pré-visualização.
 * Com storage local do Keystatic, o conteúdo lê-se do disco; `noStore()` em
 * modo draft evita cache. Para GitHub mode, ver:
 * https://keystatic.com/docs/recipes/real-time-previews
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const to = url.searchParams.get('to')
  const branch = url.searchParams.get('branch')

  if (!to) {
    return new Response('Missing to param', { status: 400 })
  }

  const draft = await draftMode()
  draft.enable()

  if (branch) {
    ;(await cookies()).set('ks-branch', branch)
  }

  const toUrl = new URL(to, url.origin)
  toUrl.protocol = url.protocol
  toUrl.host = url.host
  redirect(toUrl.toString())
}
