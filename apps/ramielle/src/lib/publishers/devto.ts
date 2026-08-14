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
 *
 * ⚠️ **M1 (fix round 1, registrado — não corrigir): `tags` ausente emite
 * `[]` aqui, `null` no Go.** `p.Tags` sem valor é um slice `nil` em Go;
 * `json.Marshal` de um `nil` `[]string` emite `"tags":null`. Aqui,
 * `payload.tags ?? []` sempre produz um array (`"tags":[]`). Inócuo hoje —
 * dev.to trata os dois como "sem tags" — mas é uma divergência de SHAPE do
 * corpo enviado que um `toEqual` completo (ver `devto.test.ts`) pegaria se
 * alguém tentasse "corrigir" pra bater byte a byte com o Go.
 */
import type { DistributionKind } from '../../domain/distribution'
import { isTimeoutErro, lerCorpoErroLimitado, mensagemTimeout } from './http'
import type { DistributionPlatform, Payload } from './types'

export type DevToConfig = {
  apiKey: string
  /** Parametrizável só pra teste — produção usa o default real. */
  baseUrl?: string
  /** Parametrizável só pra teste — produção usa `TIMEOUT_MS` (30s). */
  timeoutMs?: number
}

const DEFAULT_BASE_URL = 'https://dev.to'
const TIMEOUT_MS = 30_000
const MAX_TAGS = 4

export const DEVTO_PLATFORM: DistributionPlatform = 'devto'
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
 *
 * ⚠️ **O timeout de `timeoutMs` cobre o `fetch` E a leitura do corpo** (fix
 * round 1, I1) — `AbortSignal.timeout(timeoutMs)` passado direto pro
 * `fetch`, sem `AbortController`/`clearTimeout` manual: o sinal permanece
 * associado à resposta até o corpo terminar de ser lido, cobrindo tanto o
 * branch de erro (`lerCorpoErroLimitado`) quanto o `res.json()` do sucesso
 * — paridade real com o `http.Client{Timeout: 30s}` do Go, que documenta
 * cobrir "connection time, any redirects, and reading the response body".
 */
export async function publishDevTo(
  cfg: DevToConfig,
  payload: Payload,
): Promise<string> {
  // ⚠️ armadilha 6 (plano): truncamento SILENCIOSO — sem erro, sem log.
  const tags = (payload.tags ?? []).slice(0, MAX_TAGS)
  const base = cfg.baseUrl ?? DEFAULT_BASE_URL
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS

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
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    // Texto FIXO: nunca a URL nem o erro cru do fetch (mesma defesa de
    // `lib/tmdb.ts`/`lib/promeia.ts` — aqui a api-key vai em header, não na
    // URL, mas a disciplina é a mesma em todo este Worker). Timeout ganha
    // mensagem PRÓPRIA (M3) — é o único diagnóstico que sobra pro dono.
    throw new Error(
      isTimeoutErro(err)
        ? mensagemTimeout('devto', timeoutMs)
        : 'devto: falha ao executar a requisição de publicação',
    )
  }

  // ⚠️ armadilha 7 (plano): aceita 200 OU 201, não só 201.
  if (res.status !== 200 && res.status !== 201) {
    let corpo: string
    try {
      corpo = await lerCorpoErroLimitado(res)
    } catch (err) {
      throw new Error(
        isTimeoutErro(err)
          ? mensagemTimeout('devto', timeoutMs)
          : 'devto: falha ao executar a requisição de publicação',
      )
    }
    throw new Error(`devto: status ${res.status}: ${corpo}`)
  }

  let out: DevToApiResponse
  try {
    out = (await res.json()) as DevToApiResponse
  } catch (err) {
    throw new Error(
      isTimeoutErro(err)
        ? mensagemTimeout('devto', timeoutMs)
        : 'devto: resposta não é um JSON válido',
    )
  }
  return out.url ?? ''
}
