import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, userEvent } from 'storybook/test'
import { AdminLoginScreen } from './admin-login-screen'

const meta: Meta<typeof AdminLoginScreen> = {
  title: 'Admin/AdminLoginScreen',
  component: AdminLoginScreen,
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj<typeof AdminLoginScreen>

export const Default: Story = { args: { onLogin: () => {} } }

// M4 (fix round 1, Task 2 do cutover ramielle): o clique deixou de ser uma
// navegação <a href> (sem estado nenhum pra mostrar) e passou a ter
// carregando/erro (este componente mostra o erro inline, role="alert") —
// nenhuma story cobria os dois estados novos.
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
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      /não foi possível iniciar o login/i,
    )
  },
}
