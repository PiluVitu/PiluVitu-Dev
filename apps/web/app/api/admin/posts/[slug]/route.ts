import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getPost, serializePost } from '@/lib/admin/post-io'
import { postFrontmatterSchema } from '@/lib/admin/post-schema'
import { commitFile, deleteFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ slug: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const post = await getPost(slug, auth.token)
    if (!post) return jsonError(404, 'not_found', 'Post não encontrado.')
    return NextResponse.json({ post })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao ler o post.', {
      detail: String(err),
    })
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const { slug } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const body = (await req.json().catch(() => null)) as {
    frontmatter?: unknown
    body?: unknown
  } | null
  const parsed = postFrontmatterSchema.safeParse(body?.frontmatter)
  if (!parsed.success || typeof body?.body !== 'string') {
    const fields = parsed.success
      ? { body: 'Corpo ausente' }
      : Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  const fm = parsed.data
  if (fm.slug !== slug)
    return jsonError(
      400,
      'slug_immutable',
      'O slug não pode ser alterado ao editar.',
    )
  try {
    const existing = await getPost(slug, auth.token)
    if (!existing) return jsonError(404, 'not_found', 'Post não encontrado.')
    const result = await commitFile(auth, {
      repo: 'blog',
      path: `content/posts/${existing.filename}`,
      content: serializePost(fm, body.body as string, existing.frontmatter),
      message: `admin: edita post ${slug}`,
    })
    await resealIfRefreshed(result)
    revalidateTag('blog-posts', 'max')
    return NextResponse.json({ slug })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar o post.', {
      detail: String(err),
    })
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    const existing = await getPost(slug, auth.token)
    if (!existing) return jsonError(404, 'not_found', 'Post não encontrado.')
    const result = await deleteFile(auth, {
      repo: 'blog',
      path: `content/posts/${existing.filename}`,
      message: `admin: remove post ${slug}`,
    })
    await resealIfRefreshed(result)
    revalidateTag('blog-posts', 'max')
    return NextResponse.json({ slug, deleted: true })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao remover o post.', {
      detail: String(err),
    })
  }
}
