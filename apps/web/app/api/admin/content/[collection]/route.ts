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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ collection: string }> },
) {
  const { collection } = await ctx.params
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const entries = await listEntries(def, auth.token)
    return NextResponse.json({ entries })
  } catch (err) {
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
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')

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
  } catch {
    // not found → ok to create
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
