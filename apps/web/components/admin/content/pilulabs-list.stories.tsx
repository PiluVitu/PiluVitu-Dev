import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { pilulabsSchema } from '@/lib/admin/content-schemas'
import { PiluLabsList } from './pilulabs-list'

const meta: Meta<typeof PiluLabsList> = {
  title: 'Admin/Content/PiluLabsList',
  component: PiluLabsList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onReorder: fn(), onEdit: fn(), onDelete: fn() },
}
export default meta
type Story = StoryObj<typeof PiluLabsList>

const entrada = (slug: string, campos: Record<string, unknown>) => ({
  slug,
  data: pilulabsSchema.parse({ slug, nome: slug, ...campos }),
})

export const CatalogoInicial: Story = {
  args: {
    entries: [
      entrada('botai', {
        nome: 'Botaí',
        subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
        tipo: 'extensao',
        listado: true,
        destaque: true,
      }),
      entrada('sombrai', {
        nome: 'Sombraí',
        subtitulo: 'Plante sombra em Teresina',
        tipo: 'mobile',
        listado: true,
        destaque: true,
      }),
      entrada('live-prs', {
        nome: 'Live PRs',
        subtitulo: 'agregador de pull requests',
        tipo: 'web',
        listado: true,
      }),
    ],
  },
}
