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
 *
 * ⚠️ **Registrado, não corrigido (fix round 1, "relacionado" ao I2):**
 * `title`/`contentMarkdown`/`originalArticleURL` ausentes no `Payload`
 * (chave `undefined`) somem do JSON enviado (`JSON.stringify` omite chaves
 * `undefined`); o Go sempre emite `""` pros campos string vazios de
 * `Payload` (struct, sem `omitempty`). Aqui a omissão é até MAIS segura que
 * o `originalArticleURL: ""` do Go (evita mandar uma URL canônica vazia
 * pro Hashnode) — mas é uma divergência de shape não registrada antes.
 * Inócuo hoje: a Task 3 sempre preenche os três campos.
 */
import type { DistributionKind } from '../../domain/distribution'
import { isTimeoutErro, lerCorpoErroLimitado, mensagemTimeout } from './http'
import type { DistributionPlatform, Payload } from './types'

export type HashnodeConfig = {
  token: string
  publicationId: string
  /** Parametrizável só pra teste — produção usa o default real. */
  baseUrl?: string
  /** Parametrizável só pra teste — produção usa `TIMEOUT_MS` (30s). */
  timeoutMs?: number
}

const DEFAULT_BASE_URL = 'https://gql.hashnode.com'
const TIMEOUT_MS = 30_000

export const HASHNODE_PLATFORM: DistributionPlatform = 'hashnode'
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
 *
 * ⚠️ O timeout de `timeoutMs` cobre o `fetch` E a leitura do corpo (fix
 * round 1, I1) — ver o comentário equivalente em `devto.ts`.
 */
export async function publishHashnode(
  cfg: HashnodeConfig,
  payload: Payload,
): Promise<string> {
  const base = cfg.baseUrl ?? DEFAULT_BASE_URL
  const timeoutMs = cfg.timeoutMs ?? TIMEOUT_MS
  const variables = {
    input: {
      title: payload.title,
      contentMarkdown: payload.bodyMd,
      publicationId: cfg.publicationId,
      originalArticleURL: payload.canonicalUrl,
      tags: [],
    },
  }

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
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw new Error(
      isTimeoutErro(err)
        ? mensagemTimeout('hashnode', timeoutMs)
        : 'hashnode: falha ao executar a requisição de publicação',
    )
  }

  // ⚠️ armadilha 7 (plano): só >=500/401/403 são erro IMEDIATO — outros 4xx
  // passam e só são pegos ao decodificar o corpo, abaixo.
  if (res.status >= 500 || res.status === 401 || res.status === 403) {
    let corpo: string
    try {
      corpo = await lerCorpoErroLimitado(res)
    } catch (err) {
      throw new Error(
        isTimeoutErro(err)
          ? mensagemTimeout('hashnode', timeoutMs)
          : 'hashnode: falha ao executar a requisição de publicação',
      )
    }
    throw new Error(`hashnode: status ${res.status}: ${corpo}`)
  }

  let out: HashnodeApiResponse
  try {
    out = (await res.json()) as HashnodeApiResponse
  } catch (err) {
    throw new Error(
      isTimeoutErro(err)
        ? mensagemTimeout('hashnode', timeoutMs)
        : 'hashnode: resposta não é um JSON válido',
    )
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
