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
import { isTimeoutErro, lerCorpoErroLimitado, mensagemTimeout } from './http'
import type { DistributionPlatform, Payload } from './types'

export type MastodonConfig = {
  instanceUrl: string
  token: string
  /** Parametrizável só pra teste — produção usa `TIMEOUT_MS` (30s). */
  timeoutMs?: number
}

const TIMEOUT_MS = 30_000
const MAX_CHARS = 500

export const MASTODON_PLATFORM: DistributionPlatform = 'mastodon'
export const MASTODON_KIND: DistributionKind = 'social_hook'

type MastodonApiResponse = {
  url?: string
}

/**
 * Posta um status no Mastodon. Rejeita textos > 500 code points (após
 * anexar `payload.canonicalUrl`, quando presente). Retorna a URL pública do
 * toot — porte de `Mastodon.Publish` (`mastodon.go:37-68`).
 *
 * ⚠️ O timeout de `timeoutMs` cobre o `fetch` E a leitura do corpo (fix
 * round 1, I1) — ver o comentário equivalente em `devto.ts`.
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
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS

  let res: Response
  try {
    res = await fetch(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new Error(
      isTimeoutErro(err)
        ? mensagemTimeout('mastodon', timeoutMs)
        : 'mastodon: falha ao executar a requisição de publicação',
    )
  }

  if (res.status < 200 || res.status >= 300) {
    let corpo: string
    try {
      corpo = await lerCorpoErroLimitado(res)
    } catch (err) {
      throw new Error(
        isTimeoutErro(err)
          ? mensagemTimeout('mastodon', timeoutMs)
          : 'mastodon: falha ao executar a requisição de publicação',
      )
    }
    throw new Error(`mastodon: status ${res.status}: ${corpo}`)
  }

  let out: MastodonApiResponse
  try {
    out = (await res.json()) as MastodonApiResponse
  } catch (err) {
    throw new Error(
      isTimeoutErro(err)
        ? mensagemTimeout('mastodon', timeoutMs)
        : 'mastodon: resposta não é um JSON válido',
    )
  }
  return out.url ?? ''
}
