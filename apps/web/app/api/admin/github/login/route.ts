import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { authorizeUrl } from '@/lib/admin/github-oauth'

const STATE_COOKIE = 'piluvitu_admin_oauth_state'

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const redirectUri = `${origin}/api/admin/github/callback`
  const state = randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return NextResponse.redirect(authorizeUrl(state, redirectUri))
}
