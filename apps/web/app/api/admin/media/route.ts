import { NextResponse } from 'next/server'
import {
  listMedia,
  sanitizeFilename,
  uniqueFilename,
  MEDIA_DIR,
} from '@/lib/admin/media-io'
import { commitBinary } from '@/lib/admin/git-write'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'

export const dynamic = 'force-dynamic'

const ALLOWED = /\.(png|jpe?g|webp|svg|gif)$/i
const MAX_BYTES = 4 * 1024 * 1024

export async function GET() {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    return NextResponse.json({ items: await listMedia(auth.token) })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao listar a mídia.', {
      detail: String(err),
    })
  }
}

export async function POST(req: Request) {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const body = (await req.json().catch(() => null)) as {
    filename?: string
    base64?: string
  } | null
  if (
    !body ||
    typeof body.filename !== 'string' ||
    typeof body.base64 !== 'string'
  ) {
    return jsonError(400, 'validation', 'Envie filename + base64.')
  }
  if (!ALLOWED.test(body.filename)) {
    return jsonError(
      400,
      'invalid_type',
      'Tipo de arquivo não permitido (png/jpg/webp/svg/gif).',
    )
  }
  const bytes = Buffer.from(body.base64, 'base64').length
  if (bytes > MAX_BYTES) {
    return jsonError(400, 'too_large', 'Imagem maior que 4 MB.')
  }
  try {
    const existing = (await listMedia(auth.token)).map((m) => m.filename)
    const name = uniqueFilename(sanitizeFilename(body.filename), existing)
    const result = await commitBinary(auth, {
      repo: 'site',
      path: `${MEDIA_DIR}/${name}`,
      base64: body.base64,
      message: `admin: upload ${name}`,
    })
    await resealIfRefreshed(result)
    return NextResponse.json(
      { path: `/media/${name}`, filename: name },
      { status: 201 },
    )
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao enviar a imagem.', {
      detail: String(err),
    })
  }
}
