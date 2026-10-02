import type { Meta, StoryObj } from '@storybook/nextjs'
import { Vitrine, type ItemVitrine } from './vitrine'

const BOTAI: ItemVitrine = {
  item: {
    slug: 'botai',
    tipo: 'extensao',
    nome: 'Botaí',
    subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    descricao:
      'Extensão que gera uma pessoa brasileira de teste e preenche o formulário da página com um atalho.',
    logo: '/pilulabs/botai/icone-128.png',
    sigla: 'BO',
    tags: ['Extensão', 'QA'],
  },
  href: 'https://botai.pilutech.com.br',
  fase: 'em-breve',
  lojas: [],
}

const SOMBRAI: ItemVitrine = {
  item: {
    slug: 'sombrai',
    tipo: 'mobile',
    nome: 'Sombraí',
    subtitulo: 'Plante sombra em Teresina',
    descricao:
      'App que mostra quais árvores nativas do Piauí cabem no seu quintal e como cuidar delas.',
    logo: '/pilulabs/sombrai/icone.png',
    sigla: 'SO',
    tags: ['Swift', 'Kotlin'],
  },
  href: 'https://sombrai.pilutech.com.br',
  fase: 'em-breve',
  lojas: [],
}

const LIVE_PRS: ItemVitrine = {
  item: {
    slug: 'live-prs',
    tipo: 'web',
    nome: 'Live PRs',
    subtitulo: 'agregador de pull requests',
    descricao: 'Reúne os PRs em que sua revisão foi pedida.',
    logo: '/pr-live-dark.svg',
    sigla: 'LPR',
    tags: ['React', 'Go'],
  },
  href: 'https://pr-live-folder-front.vercel.app/',
  fase: 'em-breve',
  lojas: [],
}

const meta = {
  title: 'PiluLabs/Vitrine',
  component: Vitrine,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Vitrine>

export default meta
type Story = StoryObj<typeof meta>

export const Vazia: Story = { args: { itens: [], hrefAutor: '/' } }

export const CatalogoInicial: Story = {
  args: { itens: [BOTAI, SOMBRAI, LIVE_PRS], hrefAutor: '/' },
}

export const ComLojasESubdominios: Story = {
  args: {
    itens: [
      {
        ...BOTAI,
        href: 'https://botai.pilutech.com.br',
        fase: 'disponivel',
        lojas: ['chrome', 'firefox', 'edge'],
      },
      SOMBRAI,
    ],
    hrefAutor: 'https://piluvitu.com.br/',
  },
}
