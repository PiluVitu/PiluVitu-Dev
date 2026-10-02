import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import type { PiluLabsEntry } from '@/lib/admin/content-schemas'
import { PiluLabsForm } from './pilulabs-form'

const BOTAI: PiluLabsEntry = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao:
    'Extensão para Chrome, Edge, Opera e Firefox que gera uma pessoa brasileira de teste e preenche o formulário da página com um atalho.',
  tipo: 'extensao',
  tags: ['Extensão', 'Formulários', 'QA'],
  logo: '/pilulabs/botai/icone-128.png',
  sigla: '',
  site: 'https://botai.pilutech.com.br',
  repo: 'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  destaque: true,
  data: '2026-10-01',
  listado: true,
  paginaPropria: true,
}

const meta: Meta<typeof PiluLabsForm> = {
  title: 'Admin/Content/PiluLabsForm',
  component: PiluLabsForm,
  tags: ['autodocs'],
  args: { onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof PiluLabsForm>

export const Novo: Story = {}

export const EditandoBotai: Story = { args: { initial: BOTAI } }

export const Salvando: Story = { args: { initial: BOTAI, pending: true } }
