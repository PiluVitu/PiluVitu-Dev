import { desligarPreview } from '@/lib/preview'
import { NextResponse } from 'next/server'

function voltaPara(referer: string, origem: string): URL {
  try {
    const destino = new URL(referer)
    if (destino.origin === origem) return destino
  } catch {}
  return new URL('/', origem)
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin !== url.origin) {
    return new Response('Invalid origin', { status: 400 })
  }

  const referrer = request.headers.get('Referer')
  if (!referrer) {
    return new Response('Missing Referer', { status: 400 })
  }

  // Sem exigirAdmin de propósito: desligar só apaga os cookies de quem pede, e exigir admin
  // prendia o preview no navegador depois do unlink ou com o GitHub fora do ar.
  await desligarPreview()

  const res = NextResponse.redirect(voltaPara(referrer, url.origin), 303)
  res.headers.set('Cache-Control', 'private, no-store')
  return res
}
