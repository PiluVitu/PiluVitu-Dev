import type { Meta, StoryObj } from '@storybook/nextjs'
import { ProdutoCard, type ItemDoCard } from './produto-card'

const BOTAI: ItemDoCard = {
  slug: 'botai',
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao:
    'Extensão para Chrome, Edge, Opera e Firefox que gera uma pessoa brasileira de teste, com CPF, CNPJ, RG e CEP válidos, e preenche o formulário da página com um atalho.',
  logo: '/pilulabs/botai/icone-128.png',
  sigla: 'BO',
  tags: ['Extensão', 'Formulários', 'QA', 'CPF', 'CEP'],
  tipo: 'extensao',
}

const SOMBRAI: ItemDoCard = {
  slug: 'sombrai',
  nome: 'Sombraí',
  subtitulo: 'Plante sombra em Teresina',
  descricao:
    'App para iPhone e Android que mostra quais árvores e plantas nativas do Piauí cabem no seu quintal, na calçada, na varanda ou no vaso, como cuidar delas no calor de Teresina e quais são seguras para cães e gatos.',
  logo: '/pilulabs/sombrai/icone.png',
  sigla: 'SO',
  tags: ['Swift', 'SwiftUI', 'Kotlin', 'Jetpack Compose', 'Next.js'],
  tipo: 'mobile',
}

const LIVE_PRS: ItemDoCard = {
  slug: 'live-prs',
  nome: 'Live PRs',
  subtitulo: 'agregador de pull requests',
  descricao:
    'Agrega os pull requests em que sua revisão foi solicitada, com estado do PR, checks de CI e assignees.',
  logo: '/pr-live-dark.svg',
  sigla: 'LPR',
  tags: ['React', 'Next', 'Go'],
  tipo: 'web',
}

const meta = {
  title: 'PiluLabs/ProdutoCard',
  component: ProdutoCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProdutoCard>

export default meta
type Story = StoryObj<typeof meta>

export const ExtensaoEmBreve: Story = {
  args: {
    item: BOTAI,
    href: 'https://botai.pilutech.com.br',
    fase: 'em-breve',
    lojas: [],
  },
}

export const ExtensaoDisponivel: Story = {
  args: {
    item: BOTAI,
    href: 'https://botai.pilutech.com.br',
    fase: 'disponivel',
    lojas: ['chrome', 'firefox'],
  },
}

export const AppMobile: Story = {
  args: {
    item: SOMBRAI,
    href: 'https://sombrai.pilutech.com.br',
    fase: 'em-breve',
    lojas: [],
  },
}

export const AppWeb: Story = {
  args: {
    item: LIVE_PRS,
    href: 'https://pr-live-folder-front.vercel.app/',
    fase: 'em-breve',
    lojas: [],
  },
}

export const CliSemLinkNemLogo: Story = {
  args: {
    item: {
      slug: 'zap',
      nome: 'Zap',
      subtitulo: 'CLI de exemplo',
      descricao: 'Um item sem site, sem página e sem repo, só para a story.',
      logo: '',
      sigla: 'ZP',
      tags: ['Go'],
      tipo: 'cli',
    },
    href: null,
    fase: 'em-breve',
    lojas: [],
  },
}
