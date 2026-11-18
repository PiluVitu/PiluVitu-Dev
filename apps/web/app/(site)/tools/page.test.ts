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

// P5: as rotas antigas do editor não têm pasta; caem nele pelo redirects() do next.config (308 para /tools/pdf).
it.each([['pdf/mesclar'], ['pdf/organizar'], ['pdf/editar'], ['mesclar-pdf']])(
  '/tools/%s não tem pasta',
  (caminho) => {
    expect(existsSync(join(__dirname, ...caminho.split('/')))).toBe(false)
  },
)

it('/tools/pdf não tem layout próprio: o editor guarda o arquivo dele', () => {
  expect(existsSync(join(__dirname, 'pdf', 'layout.tsx'))).toBe(false)
})

// O Assinar saiu a pedido do dono; o caminho antigo responde pelo redirects() do next.config (308 para /tools/pdf), conferido no E2E.
it('/tools/pdf/assinar não tem mais página própria', () => {
  expect(existsSync(join(__dirname, 'pdf', 'assinar'))).toBe(false)
})
