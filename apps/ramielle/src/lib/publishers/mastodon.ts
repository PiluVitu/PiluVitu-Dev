/**
 * Adapter Mastodon (Task 2 da fatia de distribuição) — porte 1:1 de
 * `apps/api/internal/distribution/mastodon.go`. `POST /api/v1/statuses`,
 * header `Authorization: Bearer`, `kind: 'social_hook'`.
 *
 * ⚠️ **Contagem de caracteres é CODE POINT, não `.length`**
 * (`mastodon.go:42`, `utf8.RuneCountInString`), aplicada DEPOIS de anexar o
 * `canonicalUrl` (quando presente) — mesma armadilha do Bluesky, ver o
 * comentário de `bluesky.ts`. `[...texto].length` itera por code point.
 */
import type { DistributionKind } from '../../domain/distribution'
import type { Payload } from './types'

export type MastodonConfig = {
  instanceUrl: string
  token: string
}

const TIMEOUT_MS = 30_000
const MAX_CHARS = 500

export const MASTODON_PLATFORM = 'mastodon'
export const MASTODON_KIND: DistributionKind = 'social_hook'

type MastodonApiResponse = {
  url?: string
}

/**
 * Posta um status no Mastodon. Rejeita textos > 500 code points (após
 * anexar `payload.canonicalUrl`, quando presente). Retorna a URL pública do
 * toot — porte de `Mastodon.Publish` (`mastodon.go:37-68`).
 */
export async function publishMastodon(
  cfg: MastodonConfig,
  payload: Payload,
): Promise<string> {
  let status = payload.text ?? ''
  if (payload.canonicalUrl) {
    status += `\n\n${payload.canonicalUrl}`
  }
  // ⚠️ Code point, não .length — ver o aviso do topo do arquivo.
  if ([...status].length > MAX_CHARS) {
    throw new Error('mastodon: texto excede 500 caracteres')
  }

  // Mesma normalização de `NewMastodon` (`mastodon.go:23-29`, `TrimRight`).
  const instance = cfg.instanceUrl.replace(/\/+$/, '')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ status }),
      signal: controller.signal,
    })
  } catch {
    throw new Error('mastodon: falha ao executar a requisição de publicação')
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status < 200 || res.status >= 300) {
    const corpo = await res.text().catch(() => '')
    throw new Error(
      `mastodon: status ${res.status}: ${corpo.slice(0, 4096).trim()}`,
    )
  }

  let out: MastodonApiResponse
  try {
    out = (await res.json()) as MastodonApiResponse
  } catch {
    throw new Error('mastodon: resposta não é um JSON válido')
  }
  return out.url ?? ''
}
