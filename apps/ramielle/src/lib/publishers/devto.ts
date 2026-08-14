/**
 * Adapter dev.to (Task 2 da fatia de distribuição) — porte 1:1 de
 * `apps/api/internal/distribution/devto.go`. `POST /api/articles`, header
 * `api-key`, `kind: 'article_crosspost'`.
 *
 * ⚠️ **Truncamento silencioso pra 4 tags** (`devto.go:34-37`) — sem erro, sem
 * log. dev.to rejeita mais de 4 tags por artigo; o Go só corta e segue.
 *
 * ⚠️ **Aceita status 200 OU 201** (`devto.go:59`) — não só `201 Created`.
 *
 * `DEVTO_API_KEY` NUNCA aparece em mensagem de erro — nenhuma delas é
 * construída a partir do header/config, só de status/corpo da resposta
 * (que é o servidor remoto falando, não algo que ecoa nossa própria chave).
 */
import type { DistributionKind } from '../../domain/distribution'
import type { Payload } from './types'

export type DevToConfig = {
  apiKey: string
  /** Parametrizável só pra teste — produção usa o default real. */
  baseUrl?: string
}

const DEFAULT_BASE_URL = 'https://dev.to'
const TIMEOUT_MS = 30_000
const MAX_TAGS = 4

export const DEVTO_PLATFORM = 'devto'
export const DEVTO_KIND: DistributionKind = 'article_crosspost'

type DevToApiResponse = {
  url?: string
}

/**
 * Publica um artigo no dev.to. Retorna a URL pública do artigo.
 *
 * Porte de `DevTo.Publish` (`devto.go:33-70`), mesma ordem de checagens:
 * trunca tags → monta corpo → POST → `200`/`201` aceitos, qualquer outro
 * status lança → decodifica `{url}`.
 */
export async function publishDevTo(
  cfg: DevToConfig,
  payload: Payload,
): Promise<string> {
  // ⚠️ armadilha 6 (plano): truncamento SILENCIOSO — sem erro, sem log.
  const tags = (payload.tags ?? []).slice(0, MAX_TAGS)
  const base = cfg.baseUrl ?? DEFAULT_BASE_URL

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${base}/api/articles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': cfg.apiKey,
      },
      body: JSON.stringify({
        article: {
          title: payload.title,
          body_markdown: payload.bodyMd,
          published: true,
          canonical_url: payload.canonicalUrl,
          description: payload.description,
          tags,
        },
      }),
      signal: controller.signal,
    })
  } catch {
    // Texto FIXO: nunca a URL nem o erro cru do fetch (mesma defesa de
    // `lib/tmdb.ts`/`lib/promeia.ts` — aqui a api-key vai em header, não na
    // URL, mas a disciplina é a mesma em todo este Worker).
    throw new Error('devto: falha ao executar a requisição de publicação')
  } finally {
    clearTimeout(timeoutId)
  }

  // ⚠️ armadilha 7 (plano): aceita 200 OU 201, não só 201.
  if (res.status !== 200 && res.status !== 201) {
    const corpo = await res.text().catch(() => '')
    throw new Error(
      `devto: status ${res.status}: ${corpo.slice(0, 4096).trim()}`,
    )
  }

  let out: DevToApiResponse
  try {
    out = (await res.json()) as DevToApiResponse
  } catch {
    throw new Error('devto: resposta não é um JSON válido')
  }
  return out.url ?? ''
}
