import { pilulabsSchema } from '@/lib/admin/content-schemas'
import { renderEstatico } from '@/lib/render-estatico'
import { PiluLabsList } from './pilulabs-list'

const nada = () => {}

function entrada(slug: string, campos: Record<string, unknown>) {
  return { slug, data: pilulabsSchema.parse({ slug, nome: slug, ...campos }) }
}

describe('PiluLabsList', () => {
  it('mostra nome, subtítulo (ou o slug) e as marcas de tipo, visibilidade e destaque', () => {
    const raiz = renderEstatico(
      <PiluLabsList
        entries={[
          entrada('botai', {
            nome: 'Botaí',
            subtitulo: 'Gerador de dados fake',
            tipo: 'extensao',
            listado: true,
            destaque: true,
          }),
          entrada('rascunho', { tipo: 'cli' }),
        ]}
        onReorder={nada}
        onEdit={nada}
        onDelete={nada}
      />,
    )
    expect(
      [...raiz.querySelectorAll('p.font-semibold')].map((p) => p.textContent),
    ).toEqual(['Botaí', 'rascunho'])
    expect(raiz.textContent).toContain('Gerador de dados fake')
    expect(
      [...raiz.querySelectorAll('[data-testid="marcas"]')].map((m) =>
        [...m.children].map((c) => c.textContent),
      ),
    ).toEqual([
      ['Extensão', 'Listado', 'Destaque'],
      ['CLI', 'Oculto'],
    ])
  })
})
