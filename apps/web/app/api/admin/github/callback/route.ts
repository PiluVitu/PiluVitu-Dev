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

  // Surface WHY a connect failed: log server-side (Vercel) + carry a coarse
  // `reason` (state|exchange|fetch|seal) on the redirect for quick diagnosis.
  const fail = (reason: string, detail?: unknown) => {
    console.error(`[admin/github/callback] failed: ${reason}`, detail ?? '')
    return NextResponse.redirect(`${origin}/admin?gh=error&reason=${reason}`)
  }

  if (!code || !state || !expected || state !== expected) {
    return fail('state', {
      hasCode: !!code,
      hasState: !!state,
      hasExpected: !!expected,
      match: state === expected,
    })
  }

  const redirectUri = `${origin}/api/admin/github/callback`
  let stage = 'exchange'
  try {
    const tok = await exchangeCode(code, redirectUri)
    if (!tok.access_token) {
      return fail('exchange', {
        error: tok.error,
        description: tok.error_description,
      })
    }
    stage = 'fetch'
    const login = await fetchGithubLogin(tok.access_token)
    stage = 'seal'
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
  } catch (err) {
    return fail(stage, err instanceof Error ? err.message : String(err))
  }
}
