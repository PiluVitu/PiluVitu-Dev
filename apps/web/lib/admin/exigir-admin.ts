import 'server-only'

import { repoDoBlog } from '@/lib/blog-repo'
import { getLinkedToken } from './content-api'
import type { AdminGithubToken } from './token-cookie'

export const PRAZO_DA_CONSULTA_MS = 5000

type Dependencias = {
  obterToken?: () => Promise<AdminGithubToken | null>
  fetch?: typeof fetch
  prazoMs?: number
}

function podeEscrever(repo: unknown): boolean {
  if (typeof repo !== 'object' || repo === null) return false
  const permissoes = (repo as { permissions?: unknown }).permissions
  if (typeof permissoes !== 'object' || permissoes === null) return false
  const { push, maintain, admin } = permissoes as Record<string, unknown>
  return push === true || maintain === true || admin === true
}

/**
 * A prova de admin que o servidor do apps/web tem: o token GitHub linkado só vale se o próprio
 * GitHub disser que ele escreve no repo do blog. "Linkado" sozinho não basta, porque o callback
 * sela o token de qualquer conta que autorizar a App. Falha fechada.
 */
export async function exigirAdmin(
  deps: Dependencias = {},
): Promise<{ login: string } | null> {
  const obterToken = deps.obterToken ?? getLinkedToken
  const buscar = deps.fetch ?? fetch

  let linkado: AdminGithubToken | null
  try {
    linkado = await obterToken()
  } catch {
    return null
  }
  if (!linkado) return null

  const { owner, repo } = repoDoBlog()
  try {
    const res = await buscar(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `Bearer ${linkado.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(deps.prazoMs ?? PRAZO_DA_CONSULTA_MS),
      },
    )
    if (!res.ok) return null
    return podeEscrever(await res.json()) ? { login: linkado.login } : null
  } catch {
    return null
  }
}
