import type { Meta, StoryObj } from '@storybook/nextjs'
import type { Project } from '@/mocks/projects'
import { SecaoPiluLabs } from './secao-pilulabs'

const BOTAI: Project = {
  id: 'pilulabs-botai',
  projectName: 'Botaí',
  subtitle: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  projectLogo: '/pilulabs/botai/icone-128.png',
  image: '/pilulabs/botai/icone-128.png',
  description:
    'Extensão para Chrome, Edge, Opera e Firefox que gera uma pessoa brasileira de teste e preenche o formulário da página com um atalho.',
  tags: ['Extensão', 'Formulários', 'QA'],
  deployLink: 'https://botai.pilutech.com.br',
  deployLabel: 'Acessar',
  altImage: 'BO',
}

const SOMBRAI: Project = {
  id: 'pilulabs-sombrai',
  projectName: 'Sombraí',
  subtitle: 'Plante sombra em Teresina',
  projectLogo: '/pilulabs/sombrai/icone.png',
  image: '/pilulabs/sombrai/icone.png',
  description:
    'App para iPhone e Android que mostra quais árvores e plantas nativas do Piauí cabem no seu quintal.',
  tags: ['Swift', 'Kotlin'],
  deployLink: 'https://sombrai.pilutech.com.br',
  deployLabel: 'Acessar',
  altImage: 'SO',
}

const LIVE_PRS: Project = {
  id: 'pilulabs-live-prs',
  projectName: 'Live PRs',
  subtitle: 'agregador de pull requests',
  projectLogo: '/pr-live-dark.svg',
  image: '/pr-live-dark.svg',
  description: 'Reúne os PRs em que sua revisão foi pedida.',
  tags: ['React', 'Go'],
  deployLink: 'https://pr-live-folder-front.vercel.app/',
  deployLabel: 'Acessar',
  altImage: 'LPR',
}

const meta = {
  title: 'Home/SecaoPiluLabs',
  component: SecaoPiluLabs,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof SecaoPiluLabs>

export default meta
type Story = StoryObj<typeof meta>

export const TresItens: Story = {
  args: {
    itens: [BOTAI, SOMBRAI, LIVE_PRS],
    total: 3,
    hrefVitrine: '/pilulabs',
  },
}

export const SeisItens: Story = {
  args: {
    itens: [
      BOTAI,
      SOMBRAI,
      LIVE_PRS,
      { ...LIVE_PRS, id: 'pilulabs-zap', projectName: 'Zap', altImage: 'ZP' },
    ],
    total: 6,
    hrefVitrine: '/pilulabs',
  },
}

export const ComSubdominios: Story = {
  args: {
    itens: [{ ...BOTAI, deployLink: 'https://botai.pilutech.com.br' }],
    total: 1,
    hrefVitrine: 'https://pilutech.com.br/',
  },
}
