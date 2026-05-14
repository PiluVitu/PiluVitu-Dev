import { cookies, draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Ativa o Draft Mode e grava o ramo Keystatic em cookie para o reader GitHub.
 * Requer `branch` (o UI do Keystatic preenche `{branch}` no previewUrl).
 * @see https://keystatic.com/docs/recipes/real-time-previews
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const to = url.searchParams.get('to')
  const branch = url.searchParams.get('branch')

  if (!to || !branch) {
    return new Response('Missing to or branch param', { status: 400 })
  }

  const draft = await draftMode()
  draft.enable()
  ;(await cookies()).set('ks-branch', branch)

  const toUrl = new URL(to, url.origin)
  toUrl.protocol = url.protocol
  toUrl.host = url.host
  redirect(toUrl.toString())
}
