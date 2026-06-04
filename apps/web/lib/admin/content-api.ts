import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  openToken,
  sealToken,
  ADMIN_GH_COOKIE,
  type AdminGithubToken,
} from './token-cookie'
import { getCollection, type CollectionDef } from './content-registry'
import type { CommitResult } from './git-write'

export async function getLinkedToken(): Promise<AdminGithubToken | null> {
  const jar = await cookies()
  const sealed = jar.get(ADMIN_GH_COOKIE)?.value
  return sealed ? openToken(sealed) : null
}

/** If a write refreshed the token, re-seal the cookie so the next request stays linked. */
export async function resealIfRefreshed(result: CommitResult): Promise<void> {
  if (!result.refreshed) return
  const jar = await cookies()
  jar.set(ADMIN_GH_COOKIE, sealToken(result.refreshed), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string>,
) {
  return NextResponse.json({ error: { code, message, fields } }, { status })
}

export function resolveCollection(
  key: string,
): CollectionDef<Record<string, unknown>> | null {
  return getCollection(key)
}
