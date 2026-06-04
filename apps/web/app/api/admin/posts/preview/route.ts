import { NextResponse } from 'next/server'
import { serialize } from 'next-mdx-remote/serialize'
import { MDX_REMARK_PLUGINS, MDX_REHYPE_PLUGINS } from '@/lib/mdx/mdx-plugins'
import { getLinkedToken, jsonError } from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const body = (await req.json().catch(() => null)) as { mdx?: string } | null
  if (typeof body?.mdx !== 'string')
    return jsonError(400, 'validation', 'Corpo MDX ausente.')
  try {
    const serialized = await serialize(body.mdx, {
      mdxOptions: {
        remarkPlugins: MDX_REMARK_PLUGINS,
        rehypePlugins: MDX_REHYPE_PLUGINS,
      },
    })
    return NextResponse.json({ serialized })
  } catch (err) {
    return jsonError(502, 'preview_error', 'Falha ao renderizar o preview.', {
      detail: String(err),
    })
  }
}
