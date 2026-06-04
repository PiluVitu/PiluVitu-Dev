import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'

export async function POST() {
  const jar = await cookies()
  jar.delete(ADMIN_GH_COOKIE)
  return NextResponse.json({ linked: false })
}
