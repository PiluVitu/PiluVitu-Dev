/**
 * Adapter Bluesky (Task 2 da fatia de distribuição) — porte 1:1 de
 * `apps/api/internal/distribution/bluesky.go`. AT Protocol via `fetch` puro
 * (zero dependência nova) — `createSession` → `createRecord` (1 ou 2×),
 * `kind: 'social_hook'`.
 *
 * ⚠️ **Contagem de caracteres é CODE POINT, não `.length`**
 * (`bluesky.go:41`, `utf8.RuneCountInString`) — `.length` do JS conta
 * unidades de código UTF-16, que DIVERGE de code point pra qualquer coisa
 * fora do BMP (emoji incluso). `[...texto].length` itera por code point —
 * é o que usamos abaixo. Ver `bluesky.test.ts`, describe "code point ≠
 * .length", pra um caso que só passa com a contagem certa.
 *
 * ⚠️ **O offset do facet do link é em BYTES UTF-8, não `.length`**
 * (`bluesky.go:78`, `len([]byte(...))`) — `new TextEncoder().encode(url)
 * .length` é o equivalente exato em JS. Um caractere acentuado na URL
 * (2 bytes UTF-8, 1 unidade UTF-16) já basta pra divergir.
 *
 * ⚠️ **DUAS escritas por publicação, se houver `canonicalUrl`**: o post
 * principal (só o hook) e uma REPLY com o link clicável via richtext facet.
 * Se a reply falhar, esta função lança — mas o post principal JÁ EXISTE no
 * Bluesky nesse ponto (o primeiro `createRecord` já retornou sucesso).
 * Republicar (o fluxo normal de "clicar Publicar de novo" num alvo
 * `failed`) cria um SEGUNDO post duplicado, porque o AT Protocol não
 * dedupa. **Isto é comportamento medido do Go, replicado de propósito —
 * NÃO consertar aqui.** É decisão do dono (ver plano da fatia, armadilha 2:
 * `docs/superpowers/plans/2026-08-13-ramielle-distribuicao.md`). Provado em
 * `bluesky.test.ts`, describe "armadilha 2".
 */
import type { DistributionKind } from '../../domain/distribution'
import type { Payload } from './types'

export type BlueskyConfig = {
  handle: string
  appPassword: string
  /** Parametrizável só pra teste — produção usa o default real. */
  baseUrl?: string
}

const DEFAULT_BASE_URL = 'https://bsky.social'
const TIMEOUT_MS = 30_000
const MAX_CHARS = 300

export const BLUESKY_PLATFORM = 'bluesky'
export const BLUESKY_KIND: DistributionKind = 'social_hook'

type Session = { accessJwt: string; did: string }
type RecordResult = { uri: string; cid: string }

/**
 * POST autenticado (opcional) no AT Protocol — porte de `Bluesky.post`
 * (`bluesky.go:105-125`). `bearer === ''` omite o header `Authorization`
 * (usado só por `createSession`, que ainda não tem token).
 */
async function blueskyPost<T>(
  base: string,
  path: string,
  bearer: string,
  body: unknown,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (bearer !== '') headers.Authorization = `Bearer ${bearer}`

  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    // Texto FIXO: nem a URL (não carrega credencial hoje, mas a disciplina
    // é uniforme neste Worker) nem o erro cru do fetch.
    throw new Error(`bluesky: falha ao executar a requisição (${path})`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status < 200 || res.status >= 300) {
    const corpo = await res.text().catch(() => '')
    throw new Error(
      `bluesky: ${path} status ${res.status}: ${corpo.slice(0, 4096).trim()}`,
    )
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new Error(`bluesky: resposta de ${path} não é um JSON válido`)
  }
}

/**
 * Posta um hook no Bluesky. Rejeita textos > 300 code points. Se
 * `payload.canonicalUrl` não for vazio, posta um segundo record em reply ao
 * principal com o link clicável via richtext facet (ver os avisos no topo
 * do arquivo).
 *
 * Retorna `https://bsky.app/profile/<handle>/post/<rkey>` do post
 * principal — porte de `Bluesky.Publish` (`bluesky.go:40-103`).
 */
export async function publishBluesky(
  cfg: BlueskyConfig,
  payload: Payload,
): Promise<string> {
  const text = payload.text ?? ''
  // ⚠️ Code point, não .length — ver o aviso do topo do arquivo.
  if ([...text].length > MAX_CHARS) {
    throw new Error('bluesky: texto excede 300 caracteres')
  }
  const base = cfg.baseUrl ?? DEFAULT_BASE_URL

  // 1) Criar sessão: recebe accessJwt + did.
  const sess = await blueskyPost<Session>(
    base,
    '/xrpc/com.atproto.server.createSession',
    '',
    { identifier: cfg.handle, password: cfg.appPassword },
  )

  // 2) Criar record principal (só o hook, sem link).
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
  }
  const rec = await blueskyPost<RecordResult>(
    base,
    '/xrpc/com.atproto.repo.createRecord',
    sess.accessJwt,
    { repo: sess.did, collection: 'app.bsky.feed.post', record },
  )
  const mainUri = rec.uri
  const mainCid = rec.cid

  const idx = mainUri.lastIndexOf('/')
  if (idx < 0 || idx === mainUri.length - 1) {
    throw new Error(`bluesky: unexpected uri format: "${mainUri}"`)
  }
  const rkey = mainUri.slice(idx + 1)

  // 3) Se houver URL canônica, postar reply com link clicável (facet).
  //
  // ⚠️ A PARTIR DAQUI: o post principal (passo 2) já existe de verdade no
  // Bluesky. Se a chamada abaixo falhar, esta função lança — mas não há
  // como "desfazer" o passo 2. Ver o aviso do topo do arquivo.
  if (payload.canonicalUrl) {
    // ⚠️ Bytes UTF-8, não .length — ver o aviso do topo do arquivo.
    const urlBytes = new TextEncoder().encode(payload.canonicalUrl).length
    const replyRecord = {
      $type: 'app.bsky.feed.post',
      text: payload.canonicalUrl,
      createdAt: new Date().toISOString(),
      facets: [
        {
          index: { byteStart: 0, byteEnd: urlBytes },
          features: [
            {
              $type: 'app.bsky.richtext.facet#link',
              uri: payload.canonicalUrl,
            },
          ],
        },
      ],
      reply: {
        root: { uri: mainUri, cid: mainCid },
        parent: { uri: mainUri, cid: mainCid },
      },
    }
    await blueskyPost<RecordResult>(
      base,
      '/xrpc/com.atproto.repo.createRecord',
      sess.accessJwt,
      { repo: sess.did, collection: 'app.bsky.feed.post', record: replyRecord },
    )
  }

  return `https://bsky.app/profile/${cfg.handle}/post/${rkey}`
}
