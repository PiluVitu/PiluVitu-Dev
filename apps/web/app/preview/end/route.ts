import { cookies, draftMode } from 'next/headers'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin !== url.origin) {
    return new Response('Invalid origin', { status: 400 })
  }

  const referrer = request.headers.get('Referer')
  if (!referrer) {
    return new Response('Missing Referer', { status: 400 })
  }

  const draft = await draftMode()
  draft.disable()
  ;(await cookies()).delete('ks-branch')

  return Response.redirect(referrer, 303)
}
