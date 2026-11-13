import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PAGINA_FERRAMENTAS } from '@/lib/rotas-publicas'
import { TOOLS } from '@/lib/tools-registry'
import { metadata } from './page'

it('/tools: a descrição das ferramentas e o canonical', () => {
  expect(metadata).toEqual({
    description: PAGINA_FERRAMENTAS.descricao,
    alternates: { canonical: '/tools' },
  })
})

// As páginas importam a UI de cada ferramenta (câmera, QR), pesada para o Jest:
// a fonte basta para saber que a metadata sai do registro. O E2E de SEO confere o HTML.
it.each(TOOLS.map(({ slug }) => [slug]))(
  '/tools/%s: página com a metadata da ferramenta do registro',
  (slug) => {
    const arquivo = join(__dirname, slug, 'page.tsx')
    expect(existsSync(arquivo)).toBe(true)
    const fonte = readFileSync(arquivo, 'utf8')
    expect(fonte).toContain(`TOOLS.find((t) => t.slug === '${slug}')`)
    expect(fonte).toContain('metadata: Metadata = metadataDaFerramenta(tool)')
  },
)
