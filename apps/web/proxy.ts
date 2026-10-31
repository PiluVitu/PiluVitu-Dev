import { NextResponse, type NextRequest } from 'next/server'
import { decidirRota } from '@/lib/votai'

export function proxy(request: NextRequest) {
  const host = request.headers.get('host') ?? request.nextUrl.host
  const decisao = decidirRota({
    hostname: host.replace(/:\d+$/, ''),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  })
  if (decisao.tipo === 'reescrever') {
    const destino = request.nextUrl.clone()
    destino.pathname = decisao.caminho
    return NextResponse.rewrite(destino)
  }
  if (decisao.tipo === 'redirecionar')
    return NextResponse.redirect(decisao.url, 308)
  if (decisao.tipo === 'nao-encontrado') {
    const destino = request.nextUrl.clone()
    destino.pathname = '/_votai/fora-do-votai'
    return NextResponse.rewrite(destino)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
