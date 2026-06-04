import { NextResponse } from 'next/server'
import { serializeEntry } from '@/lib/admin/content-yaml'
import { commitFile, deleteFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  resolveCollection,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ collection: string; slug: string }> }

export async function PUT(req: Request, ctx: Ctx) {
  const { collection, slug } = await ctx.params
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
  if (String(data[def.slugField]) !== slug) {
    return jsonError(
      400,
      'slug_immutable',
      'O slug não pode ser alterado ao editar.',
    )
  }
  try {
    const result = await commitFile(auth, {
      repo: 'site',
      path: `${def.dir}/${slug}/index.yaml`,
      content: serializeEntry(def, data as never),
      message: `admin: edita ${def.label} ${slug}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slug, data })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar no GitHub.', {
      detail: String(err),
    })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { collection, slug } = await ctx.params
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const result = await deleteFile(auth, {
      repo: 'site',
      path: `${def.dir}/${slug}/index.yaml`,
      message: `admin: remove ${def.label} ${slug}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slug, deleted: true })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao remover no GitHub.', {
      detail: String(err),
    })
  }
}
