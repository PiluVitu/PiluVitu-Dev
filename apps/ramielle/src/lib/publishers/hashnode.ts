/**
 * Adapter Hashnode (Task 2 da fatia de distribuição) — porte 1:1 de
 * `apps/api/internal/distribution/hashnode.go`. `POST /` (GraphQL,
 * `gql.hashnode.com`), mutation `publishPost`, `kind: 'article_crosspost'`.
 *
 * ⚠️ **Header `Authorization` SEM o prefixo `Bearer `** (`hashnode.go:55`) —
 * a API do Hashnode espera o token cru nesse header. `Authorization: Bearer
 * TOKEN` seria REJEITADO (não é o formato que a API aceita).
 *
 * ⚠️ **Só `>=500`, `401` ou `403` são erro IMEDIATO** (`hashnode.go:61`).
 * Qualquer outro 4xx (400, 404, 422, …) passa por essa checagem e só é
 * detectado ao decodificar o corpo (`:80-85`) — GraphQL costuma responder
 * `200` mesmo com erro de validação (`errors[]` no corpo), mas o Hashnode
 * às vezes usa status HTTP não-2xx pra erro de validação também; `if
 * (!res.ok) throw` genérico divergiria dos dois.
 */
import type { DistributionKind } from '../../domain/distribution'
import type { Payload } from './types'

export type HashnodeConfig = {
  token: string
  publicationId: string
  /** Parametrizável só pra teste — produção usa o default real. */
  baseUrl?: string
}

const DEFAULT_BASE_URL = 'https://gql.hashnode.com'
const TIMEOUT_MS = 30_000

export const HASHNODE_PLATFORM = 'hashnode'
export const HASHNODE_KIND: DistributionKind = 'article_crosspost'

const MUTATION = `mutation publishPost($input: PublishPostInput!) {
  publishPost(input: $input) { post { url } }
}`

type HashnodeApiResponse = {
  data?: {
    publishPost?: {
      post?: {
        url?: string
      }
    }
  }
  errors?: { message: string }[]
}

/**
 * Publica um artigo no Hashnode. Retorna a URL pública do artigo.
 *
 * Porte de `Hashnode.Publish` (`hashnode.go:39-87`), mesma ordem: monta a
 * mutation → POST → `>=500`/`401`/`403` lançam IMEDIATO → decodifica →
 * `errors[]` não-vazio lança → `post.url` vazio lança → devolve a url.
 */
export async function publishHashnode(
  cfg: HashnodeConfig,
  payload: Payload,
): Promise<string> {
  const base = cfg.baseUrl ?? DEFAULT_BASE_URL
  const variables = {
    input: {
      title: payload.title,
      contentMarkdown: payload.bodyMd,
      publicationId: cfg.publicationId,
      originalArticleURL: payload.canonicalUrl,
      tags: [],
    },
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${base}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ⚠️ SEM "Bearer " — ver o comentário do topo do arquivo.
        Authorization: cfg.token,
      },
      body: JSON.stringify({ query: MUTATION, variables }),
      signal: controller.signal,
    })
  } catch {
    throw new Error('hashnode: falha ao executar a requisição de publicação')
  } finally {
    clearTimeout(timeoutId)
  }

  // ⚠️ armadilha 7 (plano): só >=500/401/403 são erro IMEDIATO — outros 4xx
  // passam e só são pegos ao decodificar o corpo, abaixo.
  if (res.status >= 500 || res.status === 401 || res.status === 403) {
    const corpo = await res.text().catch(() => '')
    throw new Error(
      `hashnode: status ${res.status}: ${corpo.slice(0, 4096).trim()}`,
    )
  }

  let out: HashnodeApiResponse
  try {
    out = (await res.json()) as HashnodeApiResponse
  } catch {
    throw new Error('hashnode: resposta não é um JSON válido')
  }

  if (out.errors && out.errors.length > 0) {
    throw new Error(`hashnode: ${out.errors[0]!.message}`)
  }
  const url = out.data?.publishPost?.post?.url ?? ''
  if (url === '') {
    throw new Error(`hashnode: resposta sem url (status ${res.status})`)
  }
  return url
}
