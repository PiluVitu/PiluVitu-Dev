import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// O sitemap e os llms listam os posts, que vêm com o ISR do blog: ver "SEO" no CLAUDE.md.
export const ROTAS = {
  '/robots.txt': 'estatica',
  '/sitemap.xml': 'prerenderizada',
  '/llms.txt': 'prerenderizada',
  '/llms-full.txt': 'prerenderizada',
}

export function problemasDasRotas(rotasDoManifesto, rotas = ROTAS) {
  return Object.entries(rotas).flatMap(([rota, exigencia]) => {
    const entrada = rotasDoManifesto[rota]
    if (!entrada)
      return [`${rota}: fora do prerender-manifest (dinâmica ou sumiu)`]
    const revalidate = entrada.initialRevalidateSeconds
    if (exigencia === 'estatica' && revalidate !== false)
      return [`${rota}: tem revalidate ${revalidate}, devia ser estática`]
    return []
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { routes } = JSON.parse(
    readFileSync(
      join(process.cwd(), '.next', 'prerender-manifest.json'),
      'utf8',
    ),
  )
  const problemas = problemasDasRotas(routes)
  if (problemas.length > 0) {
    console.error(`Rotas de SEO fora do esperado:\n${problemas.join('\n')}`)
    process.exit(1)
  }
  console.log(
    `Rotas de SEO pré-renderizadas: ${Object.keys(ROTAS)
      .map(
        (rota) =>
          `${rota} (revalidate ${routes[rota].initialRevalidateSeconds})`,
      )
      .join(', ')}`,
  )
}
