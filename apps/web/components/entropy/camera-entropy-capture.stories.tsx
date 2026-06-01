import type { Meta, StoryObj } from '@storybook/nextjs'
import { CameraEntropyCapture } from './camera-entropy-capture'

const meta: Meta<typeof CameraEntropyCapture> = {
  title: 'Entropy/CameraEntropyCapture',
  component: CameraEntropyCapture,
}
export default meta
type Story = StoryObj<typeof CameraEntropyCapture>

export const Default: Story = {
  args: {
    onEntropy: (r) => console.log('entropy', r.source, r.digestHex.slice(0, 8)),
  },
}
