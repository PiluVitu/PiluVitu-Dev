import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent } from 'storybook/test'
import { BarraDeFerramentas } from './barra-de-ferramentas'
import { FERRAMENTAS_DO_MODO } from './objetos'

const meta = {
  title: 'Tools/PDF/BarraDeFerramentas',
  component: BarraDeFerramentas,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { ativa: 'selecionar', aoEscolher: fn() },
} satisfies Meta<typeof BarraDeFerramentas>

export default meta
type Story = StoryObj<typeof meta>

export const Selecionar: Story = {}

export const DesenhoLigado: Story = { args: { ativa: 'desenho' } }

export const SetasEntreOsBotoes: Story = {
  play: async ({ canvas, args }) => {
    const selecionar = canvas.getByRole('button', {
      name: 'Selecionar e mover',
    })
    await expect(selecionar).toHaveAttribute('aria-pressed', 'true')
    selecionar.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(canvas.getByRole('button', { name: 'Texto' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.aoEscolher).toHaveBeenCalledWith('texto')
  },
}

export const Desabilitada: Story = { args: { desabilitada: true } }

export const ModoAssinar: Story = {
  args: { ferramentas: FERRAMENTAS_DO_MODO.assinar },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('button')).toHaveLength(2)
    canvas.getByRole('button', { name: 'Selecionar e mover' }).focus()
    await userEvent.keyboard('{End}')
    await expect(canvas.getByRole('button', { name: 'Texto' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(
      canvas.getByRole('button', { name: 'Selecionar e mover' }),
    ).toHaveFocus()
  },
}
