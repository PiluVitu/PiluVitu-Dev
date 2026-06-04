import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { listPosts, getPost, serializePost } from '@/lib/admin/post-io'
import { postFrontmatterSchema } from '@/lib/admin/post-schema'
import { commitFile } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    return NextResponse.json({ posts: await listPosts(auth.token) })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao listar posts.', {
      detail: String(err),
    })
  }
}

export async function POST(req: Request) {
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
  try {
    if (await getPost(fm.slug, auth.token)) {
      return jsonError(
        409,
        'slug_exists',
        `Já existe um post com o slug "${fm.slug}".`,
      )
    }
    const result = await commitFile(auth, {
      repo: 'blog',
      path: `content/posts/${fm.slug}.mdx`,
      content: serializePost(fm, body.body as string, {}),
      message: `admin: cria post ${fm.slug}`,
    })
    await resealIfRefreshed(result)
    revalidateTag('blog-posts', 'max')
    return NextResponse.json({ slug: fm.slug }, { status: 201 })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar o post.', {
      detail: String(err),
    })
  }
}
