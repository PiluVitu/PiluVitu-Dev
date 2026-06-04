import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { openToken, ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'

export async function GET() {
  const jar = await cookies()
  const sealed = jar.get(ADMIN_GH_COOKIE)?.value
  const tok = sealed ? openToken(sealed) : null
  return NextResponse.json({ linked: !!tok, login: tok?.login ?? null })
}
