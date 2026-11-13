import 'server-only'

import { abrir, selar } from '@/lib/admin/token-cookie'
import { cookies, draftMode } from 'next/headers'

export const PREVIEW_COOKIE = 'piluvitu_preview'
export const COOKIE_ANTIGO_DO_PREVIEW = 'ks-branch'
export const COOKIE_DO_DRAFT_MODE = '__prerender_bypass'
/** Segundos. Vale para o selado e para o cookie do draft mode. */
export const PRAZO_DO_PREVIEW = 3600

export type PreviewSelado = { branch: string; login: string; exp: number }

const RAMO = /^[A-Za-z0-9._/-]{1,100}$/
// O git resolve `pull/N/head` como `refs/pull/N/head`, o ramo de um PR de fork.
const REF_QUE_NAO_E_RAMO = /^(?:refs|pull)\/|^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i

export function branchValido(branch: string): boolean {
  return (
    RAMO.test(branch) &&
    !branch.includes('..') &&
    !/^[/-]/.test(branch) &&
    !REF_QUE_NAO_E_RAMO.test(branch)
  )
}

/**
 * Link do próprio site ou URL digitada. O `piluvitu_admin_gh` é `SameSite=Lax` e vai junto numa
 * navegação vinda de outro site, então só ele não prova que foi o admin quem pediu.
 */
export function navegacaoDoProprioSite(cabecalhos: Headers): boolean {
  const origem = cabecalhos.get('sec-fetch-site')
  return origem === 'same-origin' || origem === 'none'
}

const CAMINHO_DO_SITE = /^\/(?![/\\])[^\\\u0000-\u001f\u007f]*$/

/** O `to` do /preview/start: só um caminho do próprio site. */
export function destinoDoPreview(to: string, origem: string): URL | null {
  if (!CAMINHO_DO_SITE.test(to)) return null
  const destino = new URL(to, origem)
  return destino.origin === origem ? destino : null
}

export function selarPreview(
  { branch, login }: { branch: string; login: string },
  agora: number,
): string {
  if (!branchValido(branch)) throw new Error('Ramo inválido para o preview')
  const dados: PreviewSelado = {
    branch,
    login,
    exp: agora + PRAZO_DO_PREVIEW * 1000,
  }
  return selar(dados, PREVIEW_COOKIE)
}

export function abrirPreview(
  selado: string,
  agora: number,
): PreviewSelado | null {
  const dados = abrir(selado, PREVIEW_COOKIE)
  if (typeof dados !== 'object' || dados === null) return null
  const { branch, login, exp } = dados as Record<string, unknown>
  if (typeof branch !== 'string' || !branchValido(branch)) return null
  if (typeof login !== 'string' || !login) return null
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
  if (exp <= agora || exp > agora + PRAZO_DO_PREVIEW * 1000) return null
  return { branch, login, exp }
}

export async function desligarPreview(): Promise<void> {
  ;(await draftMode()).disable()
  const jar = await cookies()
  jar.delete(PREVIEW_COOKIE)
  jar.delete(COOKIE_ANTIGO_DO_PREVIEW)
}

export function opcoesDosCookiesDoPreview() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: PRAZO_DO_PREVIEW,
  }
}

/**
 * O preview só vale com o draft mode do Next E o cookie selado pelo /preview/start de um admin.
 * O draft mode é lido antes dos cookies: numa página estática ele é falso e `cookies()` nem roda.
 */
export async function previewAtivo(): Promise<{ branch: string } | null> {
  const { isEnabled } = await draftMode()
  if (!isEnabled) return null
  const selado = (await cookies()).get(PREVIEW_COOKIE)?.value
  if (!selado) return null
  const dados = abrirPreview(selado, Date.now())
  return dados ? { branch: dados.branch } : null
}
