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

it.each(
  TOOLS.flatMap(({ slug, modos = [] }) =>
    modos.map((modo) => [slug, modo.slug]),
  ),
)(
  '/tools/%s/%s: página do modo com a metadata do modo no registro',
  (slug, modo) => {
    const arquivo = join(__dirname, slug, modo, 'page.tsx')
    expect(existsSync(arquivo)).toBe(true)
    const fonte = readFileSync(arquivo, 'utf8')
    expect(fonte).toContain(`TOOLS.find((t) => t.slug === '${slug}')`)
    expect(fonte).toContain(`tool.modos!.find((m) => m.slug === '${modo}')`)
    expect(fonte).toContain('metadata: Metadata = metadataDoModo(tool, modo)')
  },
)

it('o Editor de PDF tem os modos mesclar e organizar', () => {
  const pdf = TOOLS.find(({ slug }) => slug === 'pdf')
  expect(pdf?.modos?.map(({ slug }) => slug)).toEqual(['mesclar', 'organizar'])
})

// O caminho antigo responde pelo redirects() do next.config (308), conferido no E2E.
it('/tools/mesclar-pdf não tem mais página própria', () => {
  expect(existsSync(join(__dirname, 'mesclar-pdf'))).toBe(false)
})
