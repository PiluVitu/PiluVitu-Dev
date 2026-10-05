import { icoDePngs } from '@piluvitu/tools/ico'
import { imagemDoIcone } from '@/lib/imagem-do-icone'
import { LADOS_DO_FAVICON } from '@/lib/marca'

export const dynamic = 'force-static'

export async function GET() {
  const pngs = await Promise.all(
    LADOS_DO_FAVICON.map(
      async (lado) =>
        new Uint8Array(
          await imagemDoIcone(lado, { arredondado: true }).arrayBuffer(),
        ),
    ),
  )
  return new Response(icoDePngs(pngs), {
    headers: { 'Content-Type': 'image/x-icon' },
  })
}
