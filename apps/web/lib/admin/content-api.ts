import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  openToken,
  sealToken,
  ADMIN_GH_COOKIE,
  type AdminGithubToken,
} from './token-cookie'
import { refreshToken as ghRefresh } from './github-oauth'
import { ensureFreshToken } from './token-refresh'
import { getCollection, type CollectionDef } from './content-registry'
import type { CommitResult } from './git-write'

/**
 * Token GitHub linkado da request. Renova proativamente (e re-sela o cookie)
 * quando o token está expirado/perto de expirar — assim TODA rota do admin
 * (leitura E escrita) se cura sozinha, sem precisar reconectar depois de ocioso.
 * O git-write segue com o refresh-no-401 como rede de segurança.
 */
export async function getLinkedToken(): Promise<AdminGithubToken | null> {
  const jar = await cookies()
  const sealed = jar.get(ADMIN_GH_COOKIE)?.value
  const tok = sealed ? openToken(sealed) : null
  if (!tok) return null

  let result: { token: AdminGithubToken; refreshed: boolean }
  try {
    result = await ensureFreshToken(tok, ghRefresh, Date.now())
  } catch {
    return tok // erro de rede no refresh → degrada pro token atual
  }

  if (result.refreshed) {
    try {
      jar.set(ADMIN_GH_COOKIE, sealToken(result.token), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 180,
      })
    } catch {
      // Contexto sem mutação de cookie (ex.: server component) — devolvemos o
      // token novo pra esta request; a próxima renova de novo.
    }
  }
  return result.token
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
