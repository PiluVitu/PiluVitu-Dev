import { NextResponse } from 'next/server'
import { readProfile } from '@/lib/admin/content-read'
import { profileSchema } from '@/lib/admin/content-schemas'
import { commitFile } from '@/lib/admin/git-write'
import { sitePath } from '@/lib/admin/site-paths'
import {
  getLinkedToken,
  jsonError,
  resealIfRefreshed,
} from '@/lib/admin/content-api'
import { Document } from 'yaml'

export const dynamic = 'force-dynamic'

const KEY_ORDER = [
  'displayName',
  'avatarSrc',
  'avatarAlt',
  'roleHighlight',
  'companyName',
  'companyLink',
  'companyLinkColor',
  'bio',
  'availabilityOpen',
  'availabilityLabel',
  'location',
  'disciplines',
] as const

function serializeProfile(data: Record<string, unknown>): string {
  const doc = new Document({})
  doc.contents = doc.createNode({}) as never
  for (const key of KEY_ORDER) {
    // @ts-expect-error YAMLMap.set accepts (key, node)
    doc.contents.set(key, doc.createNode(data[key]))
  }
  return doc.toString({ lineWidth: 80 })
}

export async function GET() {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  try {
    return NextResponse.json({ data: await readProfile(auth.token) })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao ler o perfil.', {
      detail: String(err),
    })
  }
}

export async function PUT(req: Request) {
  const auth = await getLinkedToken()
  if (!auth) return jsonError(401, 'not_linked', 'Conecte sua conta GitHub.')
  const parsed = profileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
    )
    return jsonError(400, 'validation', 'Dados inválidos.', fields)
  }
  try {
    const result = await commitFile(auth, {
      repo: 'site',
      path: sitePath('content/site/profile/index.yaml'),
      content: serializeProfile(parsed.data as Record<string, unknown>),
      message: 'admin: edita perfil',
    })
    await resealIfRefreshed(result)
    return NextResponse.json({ data: parsed.data })
  } catch (err) {
    return jsonError(502, 'github_error', 'Falha ao gravar o perfil.', {
      detail: String(err),
    })
  }
}
