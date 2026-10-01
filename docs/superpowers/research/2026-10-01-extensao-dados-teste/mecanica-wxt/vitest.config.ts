import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.output', 'e2e'],
  },
})
