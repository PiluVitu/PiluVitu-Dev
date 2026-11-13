import { exigirAdmin } from '@/lib/admin/exigir-admin'
import { ramoDoSiteExiste } from '@/lib/admin/ramo-do-site'
import {
  COOKIE_ANTIGO_DO_PREVIEW,
  COOKIE_DO_DRAFT_MODE,
  PREVIEW_COOKIE,
  branchValido,
  destinoDoPreview,
  navegacaoDoProprioSite,
  opcoesDosCookiesDoPreview,
  selarPreview,
} from '@/lib/preview'
import { cookies, draftMode } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const admin = await exigirAdmin()
  if (!admin) return new Response('Não autorizado', { status: 401 })
  if (!navegacaoDoProprioSite(request.headers)) {
    return new Response('Pedido de outro site', { status: 403 })
  }

  const url = new URL(request.url)
  const branch = url.searchParams.get('branch') ?? ''
  const destino = destinoDoPreview(url.searchParams.get('to') ?? '', url.origin)
  if (!destino || !branchValido(branch)) {
    return new Response('Parâmetros inválidos', { status: 400 })
  }
  if (!(await ramoDoSiteExiste(branch))) {
    return new Response('Ramo não encontrado no repo do site', { status: 400 })
  }

  ;(await draftMode()).enable()
  const jar = await cookies()
  const opcoes = opcoesDosCookiesDoPreview()
  // O Next grava o __prerender_bypass sem prazo e com SameSite=None; regravar dá a ele o
  // mesmo prazo curto e o Lax do selado.
  const bypass = jar.get(COOKIE_DO_DRAFT_MODE)?.value
  if (bypass) jar.set(COOKIE_DO_DRAFT_MODE, bypass, opcoes)
  jar.set(
    PREVIEW_COOKIE,
    selarPreview({ branch, login: admin.login }, Date.now()),
    opcoes,
  )
  jar.delete(COOKIE_ANTIGO_DO_PREVIEW)

  const res = NextResponse.redirect(destino, 307)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
