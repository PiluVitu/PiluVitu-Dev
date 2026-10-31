import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import type { JobTranscricao } from '@/lib/admin/atelier/types'
import { TranscricaoJob } from './transcricao-job'

const base: JobTranscricao = {
  id: '0123456789abcdef0123456789abcdef',
  status: 'na_fila',
  posicao: 1,
  parte_atual: 0,
  total_partes: 3,
  nome_atual: null,
  modelo: 'mlx-community/whisper-large-v3-mlx',
  criado_em: '2026-10-31T12:00:00Z',
  atualizado_em: '2026-10-31T12:00:00Z',
  resultado: null,
  erro: null,
}

const meta: Meta<typeof TranscricaoJob> = {
  title: 'Admin/TranscricaoJob',
  component: TranscricaoJob,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onCopiar: fn(), onNova: fn() },
}
export default meta
type Story = StoryObj<typeof TranscricaoJob>

export const NaFila: Story = {
  args: { job: { ...base, posicao: 2 } },
}

export const Transcrevendo: Story = {
  args: {
    job: {
      ...base,
      status: 'transcrevendo',
      posicao: null,
      parte_atual: 1,
      nome_atual: 'reuniao-parte-2.ogg',
    },
  },
}

export const TranscrevendoSemResposta: Story = {
  args: {
    ...Transcrevendo.args,
    aviso: 'Sem resposta do servidor — tentando de novo…',
  },
}

export const Pronto: Story = {
  args: {
    job: {
      ...base,
      status: 'pronto',
      posicao: null,
      parte_atual: 2,
      total_partes: 2,
      resultado: {
        modelo: 'mlx-community/whisper-large-v3-mlx',
        partes: [
          { nome: 'reuniao-parte-1.ogg', texto: 'Começamos pelo ramielle.' },
          { nome: 'reuniao-parte-2.ogg', texto: 'Depois o promeia.' },
        ],
        texto:
          '===== ÁUDIO 1 de 2 — reuniao-parte-1.ogg =====\n\nComeçamos pelo ramielle.\n\n===== ÁUDIO 2 de 2 — reuniao-parte-2.ogg =====\n\nDepois o promeia.',
      },
    },
  },
}

export const Erro: Story = {
  args: {
    job: {
      ...base,
      status: 'falhou',
      posicao: null,
      erro: {
        code: 'promeia_reiniciado',
        message:
          'O promeia reiniciou no meio da transcrição. Envie os áudios de novo.',
      },
    },
  },
}

export const ErroNaoEncontrada: Story = {
  args: {
    job: null,
    erro: 'Transcrição não encontrada — ela pode ter expirado.',
  },
}
