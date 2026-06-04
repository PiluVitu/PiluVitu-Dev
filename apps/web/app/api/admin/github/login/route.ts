import { randomBytes } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  authorizeUrl,
  adminOAuthOrigin,
  ADMIN_OAUTH_STATE_COOKIE,
} from '@/lib/admin/github-oauth'

export async function GET(req: Request) {
  const origin = adminOAuthOrigin(req)
  const redirectUri = `${origin}/api/admin/github/callback`
  const state = randomBytes(16).toString('hex')
  const jar = await cookies()
  jar.set(ADMIN_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return NextResponse.redirect(authorizeUrl(state, redirectUri))
}
