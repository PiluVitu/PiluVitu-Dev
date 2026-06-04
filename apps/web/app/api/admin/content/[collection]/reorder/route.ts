import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listEntries } from '@/lib/admin/content-read'
import { serializeEntry } from '@/lib/admin/content-yaml'
import { commitFiles } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  resolveCollection,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ slugs: z.array(z.string()).min(1) })

export async function POST(
  req: Request,
  ctx: { params: Promise<{ collection: string }> },
) {
  const { collection } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const def = resolveCollection(collection)
  if (!def) return jsonError(404, 'unknown_collection', 'Coleção desconhecida.')

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return jsonError(400, 'validation', 'Lista de slugs inválida.')
  const { slugs } = parsed.data

  try {
    const current = await listEntries(def, auth.token)
    const bySlug = new Map(current.map((e) => [e.slug, e.data]))
    const files = slugs
      .map((slug, i) => {
        const data = bySlug.get(slug)
        if (!data) return null
        const next = { ...data, order: i }
        return {
          path: `${def.dir}/${slug}/index.yaml`,
          content: serializeEntry(def, next as never),
        }
      })
      .filter((f): f is { path: string; content: string } => f !== null)

    // The client sends the full ordered slug list, so `files` normally covers every
    // entry. If it's empty (all slugs unknown — e.g. a concurrent delete), skip the
    // commit to avoid a no-op commit that would still trigger a Vercel deploy.
    if (files.length === 0) {
      return NextResponse.json({ slugs })
    }

    const result = await commitFiles(auth, {
      repo: 'site',
      message: `admin: reordena ${def.label}`,
      files,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ slugs })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao reordenar no GitHub.', {
      detail: String(err),
    })
  }
}
