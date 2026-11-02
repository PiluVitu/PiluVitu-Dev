import { z } from 'zod'

export const CATALOGO_URL = 'https://pilutech.com.br/apps.json'

const PILUTECH = 'https://pilutech.com.br'

export type EstadoApp = 'ativo' | 'revisao' | 'desenvolvimento'

export type AppPiluTech = {
  slug: string
  nome: string
  status: string
  estado: EstadoApp
  url: string
  icone: string | null
}

const https = z.string().refine((v) => {
  try {
    return new URL(v).protocol === 'https:'
  } catch {
    return false
  }
})

const catalogo = z.object({
  versao: z.literal(1),
  apps: z
    .array(
      z.object({
        slug: z.string().min(1),
        nome: z.string().min(1),
        status: z.string(),
        estado: z.enum(['ativo', 'revisao', 'desenvolvimento']),
        url: https,
        icone: z.string().nullable(),
      }),
    )
    .min(1),
})

// Só o host liberado no `images.remotePatterns` do next.config pode ir para o
// next/image; outro host derrubaria a imagem em produção.
function iconeAceito(icone: string | null): string | null {
  if (!icone) return null
  try {
    const u = new URL(icone)
    return u.protocol === 'https:' && u.hostname === 'pilutech.com.br'
      ? icone
      : null
  } catch {
    return null
  }
}

export function lerCatalogo(corpo: unknown): AppPiluTech[] | null {
  const r = catalogo.safeParse(corpo)
  if (!r.success) return null
  return r.data.apps.map((app) => ({ ...app, icone: iconeAceito(app.icone) }))
}

const app = (
  slug: string,
  nome: string,
  status: string,
  estado: EstadoApp,
  icone: boolean,
): AppPiluTech => ({
  slug,
  nome,
  status,
  estado,
  url: `${PILUTECH}/apps/${slug}`,
  icone: icone ? `/pilutech/apps/${slug}.png` : null,
})

/** A lista de antes do catálogo: vale enquanto o apps.json não responder. */
export const APPS_PILUTECH: AppPiluTech[] = [
  app('orai', 'Oraí', 'teste aberto', 'ativo', true),
  app('listai', 'Listaí', 'em revisão', 'revisao', true),
  app('sombrai', 'Sombraí', 'beta no Android', 'ativo', true),
  app('apurai', 'Apuraí', 'no ar', 'ativo', true),
  app('botai', 'Botaí', 'publicada', 'ativo', true),
  app('toolkit', 'Toolkit', 'em desenvolvimento', 'desenvolvimento', false),
]

export async function buscarAppsPiluTech(
  f: typeof fetch = fetch,
): Promise<AppPiluTech[]> {
  try {
    const r = await f(CATALOGO_URL, { next: { revalidate: 3600 } })
    if (!r.ok) return APPS_PILUTECH
    return lerCatalogo(await r.json()) ?? APPS_PILUTECH
  } catch {
    return APPS_PILUTECH
  }
}
