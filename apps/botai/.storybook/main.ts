import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
  async viteFinal(configuracao) {
    configuracao.plugins = [...(configuracao.plugins ?? []), tailwindcss()]
    return configuracao
  },
}

export default config
