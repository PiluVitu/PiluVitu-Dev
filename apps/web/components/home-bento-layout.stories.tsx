import type { Meta, StoryObj } from '@storybook/nextjs'
import { HomeBentoLayout } from './home-bento-layout'

const meta = {
  title: 'Home/HomeBentoLayout',
  component: HomeBentoLayout,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof HomeBentoLayout>

export default meta
type Story = StoryObj<typeof meta>

export const SoPiluLabs: Story = {
  args: {
    carreiraList: [],
    initialBlogPosts: [],
    piluLabs: {
      itens: [
        {
          id: 'pilulabs-botai',
          projectName: 'Botaí',
          subtitle: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
          projectLogo: '/pilulabs/botai/icone-128.png',
          image: '/pilulabs/botai/icone-128.png',
          description:
            'Extensão que gera uma pessoa brasileira de teste e preenche o formulário.',
          tags: ['Extensão', 'QA'],
          deployLink: '/pilulabs/botai',
          deployLabel: 'Acessar',
          repoLink:
            'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
          altImage: 'BO',
        },
      ],
      total: 3,
      hrefVitrine: '/pilulabs',
    },
  },
}
