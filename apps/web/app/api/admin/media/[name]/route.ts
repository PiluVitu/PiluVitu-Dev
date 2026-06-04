import { NextResponse } from 'next/server'
import { deleteFile } from '@/lib/admin/git-write'
import { MEDIA_DIR } from '@/lib/admin/media-io'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'
const NAME_RE = /^[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp|svg|gif)$/i

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  if (!NAME_RE.test(name))
    return jsonError(400, 'validation', 'Nome de arquivo inválido.')
  try {
    const result = await deleteFile(auth, {
      repo: 'site',
      path: `${MEDIA_DIR}/${name}`,
      message: `admin: remove ${name}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ name, deleted: true })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao remover a imagem.', {
      detail: String(err),
    })
  }
}
