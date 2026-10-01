import type { Preview } from '@storybook/react-vite'
import '../src/styles.css'

const preview: Preview = {
  decorators: [
    (Story) => (
      <div className="dark bg-background text-foreground p-4">
        <Story />
      </div>
    ),
  ],
}
export default preview
