import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, userEvent } from 'storybook/test'
import { LoginButton } from './login-button'

const meta: Meta<typeof LoginButton> = {
  title: 'Votacao/LoginButton',
  component: LoginButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj<typeof LoginButton>

export const Default: Story = {}

// M4 (fix round 1, Task 2 do cutover ramielle): o clique deixou de ser uma
// navegação <a href> (que não tinha estado nenhum pra mostrar) e passou a
// ter carregando/erro — nenhuma story cobria os dois. `onLogin` injetável
// permite exercitar os dois sem depender de rede/fetch real.
export const Loading: Story = {
  args: { onLogin: () => new Promise(() => {}) },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: /entrar com google/i }),
    )
    await expect(
      canvas.getByRole('button', { name: /entrando/i }),
    ).toBeDisabled()
  },
}

export const LoginError: Story = {
  args: {
    onLogin: () =>
      Promise.reject(
        new Error(
          'Não foi possível iniciar o login com Google. Tente novamente.',
        ),
      ),
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: /entrar com google/i }),
    )
    // O erro do LoginButton é um toast (sonner) — sem <Toaster/> no
    // canvas isolado deste componente não há como asserir o texto. O
    // observável aqui é o botão voltar ao estado ocioso (reabilitado, sem
    // travar em "Entrando…") depois da rejeição.
    await expect(
      canvas.getByRole('button', { name: /^entrar com google$/i }),
    ).toBeEnabled()
  },
}
