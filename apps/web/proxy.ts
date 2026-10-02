import { NextResponse, type NextRequest } from 'next/server'
import { rotearPorHost, subdominiosAtivos } from '@/lib/pilutech-dominios'

export function proxy(request: NextRequest) {
  const rota = rotearPorHost({
    host: request.headers.get('host') ?? request.nextUrl.host,
    caminho: request.nextUrl.pathname,
    busca: request.nextUrl.search,
    subdominiosAtivos: subdominiosAtivos(),
  })
  if (rota.acao === 'redirecionar') return NextResponse.redirect(rota.url, 308)
  if (rota.acao === 'reescrever') {
    const url = request.nextUrl.clone()
    url.pathname = rota.caminho
    return NextResponse.rewrite(url)
  }
  return NextResponse.next()
}

// Literal porque o Next lê o matcher no build e ignora variáveis: o host aqui
// repete as BASES de lib/pilutech-dominios.ts.
export const config = {
  matcher: [
    {
      source: '/((?!_next/|__nextjs|_vercel/|api/).*)',
      has: [
        {
          type: 'host',
          value: '(?:[a-z0-9-]+\\.)?pilutech\\.(?:com\\.br|localhost)',
        },
      ],
    },
    '/pilulabs/:path*',
  ],
}
