import type { Meta, StoryObj } from '@storybook/nextjs'
import { CameraEntropyCapture } from './camera-entropy-capture'
import type { EntropyResult } from '@/hooks/use-camera-entropy'

const meta: Meta<typeof CameraEntropyCapture> = {
  title: 'Entropy/CameraEntropyCapture',
  component: CameraEntropyCapture,
}
export default meta
type Story = StoryObj<typeof CameraEntropyCapture>

export const Default: Story = {
  args: {
    onEntropy: (r: EntropyResult) =>
      console.log('entropy', r.source, r.digestHex.slice(0, 8)),
  },
}
