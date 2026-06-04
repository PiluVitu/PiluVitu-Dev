import { NextResponse } from 'next/server'
import { listEntries, getEntry } from '@/lib/admin/content-read'
import { serializeEntry } from '@/lib/admin/content-yaml'
import { commitFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  resolveCollection,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ collection: string }> },
) {
  // try/catch cobre TODO o handler (incl. getLinkedToken) + loga no servidor,
  // pra um erro nunca virar um 502 opaco do gateway sem rastro.
  try {
    const { collection } = await ctx.params
    const auth = await getLinkedToken()
    if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
    const def = resolveCollection(collection)
    if (!def)
      return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
    const entries = await listEntries(def, auth.token)
    return NextResponse.json({ entries })
  } catch (err) {
    console.error('[admin/content GET] falhou', err)
    return jsonError(502, 'github_error', 'Falha ao ler do GitHub.', {
      detail: String(err),
    })
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ collection: string }> },
) {
  const { collection } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')

  const body = await req.json().catch(() => null)
  const parsed = def.schema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
    )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  const data = parsed.data as Record<string, unknown>
  const slug = String(data[def.slugField])

  try {
    await getEntry(def, slug, auth.token)
    return jsonError(
      409,
      'slug_exists',
      `Já existe um item com o slug "${slug}".`,
    )
  } catch (err) {
    // Only a 404 means "free to create". Any other error (5xx/network/parse) must surface,
    // not be mistaken for "doesn't exist" (which could overwrite an existing file).
    if ((err as { status?: number } | null)?.status !== 404) {
      return jsonError(
        502,
        'github_error',
        'Falha ao verificar o slug no GitHub.',
        { detail: String(err) },
      )
    }
    // 404 → ok to create
  }

  try {
    const result = await commitFile(auth, {
      repo: 'site',
      path: `${def.dir}/${slug}/index.yaml`,
      content: serializeEntry(def, data as never),
      message: `admin: cria ${def.label} ${slug}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slug, data }, { status: 201 })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar no GitHub.', {
      detail: String(err),
    })
  }
}
