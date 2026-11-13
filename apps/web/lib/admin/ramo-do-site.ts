import 'server-only'

import { getGithubRepoSlash } from '@/keystatic.config'
import { getLinkedToken } from './content-api'
import { PRAZO_DA_CONSULTA_MS } from './exigir-admin'
import type { AdminGithubToken } from './token-cookie'

type Dependencias = {
  obterToken?: () => Promise<AdminGithubToken | null>
  fetch?: typeof fetch
  prazoMs?: number
  repo?: string
}

function nomeDoRamo(corpo: unknown): unknown {
  if (typeof corpo !== 'object' || corpo === null) return undefined
  return (corpo as { name?: unknown }).name
}

/**
 * O ramo existe no repo do site, o mesmo que o reader do preview lê, conferido com o token da
 * pessoa. Falha fechada: sem token, erro, prazo estourado ou outro nome na resposta dão `false`.
 */
export async function ramoDoSiteExiste(
  ramo: string,
  deps: Dependencias = {},
): Promise<boolean> {
  const obterToken = deps.obterToken ?? getLinkedToken
  const buscar = deps.fetch ?? fetch

  let linkado: AdminGithubToken | null
  try {
    linkado = await obterToken()
  } catch {
    return false
  }
  if (!linkado) return false

  const repo = (deps.repo ?? getGithubRepoSlash())
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  try {
    const res = await buscar(
      `https://api.github.com/repos/${repo}/branches/${encodeURIComponent(ramo)}`,
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
    if (!res.ok) return false
    return nomeDoRamo(await res.json()) === ramo
  } catch {
    return false
  }
}
