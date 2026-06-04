import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  exchangeCode,
  fetchGithubLogin,
  adminOAuthOrigin,
  ADMIN_OAUTH_STATE_COOKIE,
} from '@/lib/admin/github-oauth'
import { sealToken, ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'

export async function GET(req: Request) {
  const origin = adminOAuthOrigin(req)
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const jar = await cookies()
  const expected = jar.get(ADMIN_OAUTH_STATE_COOKIE)?.value

  // Always burn the one-time state cookie, whatever the outcome.
  jar.delete(ADMIN_OAUTH_STATE_COOKIE)

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${origin}/admin?gh=error`)
  }

  const redirectUri = `${origin}/api/admin/github/callback`
  try {
    const tok = await exchangeCode(code, redirectUri)
    if (!tok.access_token) {
      return NextResponse.redirect(`${origin}/admin?gh=error`)
    }
    const login = await fetchGithubLogin(tok.access_token)
    const sealed = sealToken({
      token: tok.access_token,
      login,
      refreshToken: tok.refresh_token,
      expiresAt: tok.expires_in
        ? Date.now() + tok.expires_in * 1000
        : undefined,
    })
    jar.set(ADMIN_GH_COOKIE, sealed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 180, // 180 days
    })
    return NextResponse.redirect(`${origin}/admin?gh=linked`)
  } catch {
    return NextResponse.redirect(`${origin}/admin?gh=error`)
  }
}
