import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROTAS = [
  '/',
  '/icon',
  '/apple-icon',
  '/opengraph-image',
  '/twitter-image',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
]

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rotasNaoEstaticas(rotasDoManifesto, rotas) {
  const chaves = Object.keys(rotasDoManifesto)
  return rotas.filter((rota) => {
    const padrao = new RegExp(`^${escaparRegex(rota)}(-[a-z0-9]+)?$`)
    const chave = chaves.find((k) => padrao.test(k))
    return (
      chave === undefined ||
      rotasDoManifesto[chave].initialRevalidateSeconds !== false
    )
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifesto = JSON.parse(
    readFileSync(
      join(process.cwd(), '.next', 'prerender-manifest.json'),
      'utf8',
    ),
  )
  const falhas = rotasNaoEstaticas(manifesto.routes, ROTAS)
  if (falhas.length > 0) {
    console.error(
      `Rota que deixou de ser estática (ou sumiu do build): ${falhas.join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`Rotas estáticas: ${ROTAS.join(', ')}`)
}
