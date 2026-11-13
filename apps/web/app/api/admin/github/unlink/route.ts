import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_GH_COOKIE } from '@/lib/admin/token-cookie'
import { desligarPreview } from '@/lib/preview'

export async function POST() {
  const jar = await cookies()
  jar.delete(ADMIN_GH_COOKIE)
  await desligarPreview()
  return NextResponse.json({ linked: false })
}
