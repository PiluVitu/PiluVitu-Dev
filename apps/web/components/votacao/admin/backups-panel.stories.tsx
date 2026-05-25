import type { Meta, StoryObj } from '@storybook/nextjs'
import { BackupsPanel } from './backups-panel'
import type { Backup } from '@/lib/votacao/types'

const meta: Meta<typeof BackupsPanel> = {
  title: 'Votacao/Admin/BackupsPanel',
  component: BackupsPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof BackupsPanel>

const backups: Backup[] = [
  {
    ID: 3,
    DriveFileID: 'f3',
    DriveFileName: 'votacao-2026-05-25.db',
    SizeBytes: 1_258_291,
    TriggerType: 'cron',
    CreatedAt: '2026-05-25T03:00:00Z',
  },
  {
    ID: 2,
    DriveFileID: 'f2',
    DriveFileName: 'votacao-2026-05-24b.db',
    SizeBytes: 1_153_433,
    TriggerType: 'manual',
    CreatedAt: '2026-05-24T18:30:00Z',
  },
]

export const Default: Story = { args: { backups } }
export const BackingUp: Story = { args: { backups, backingUp: true } }
export const Loading: Story = { args: { backups: [], isLoading: true } }
export const Empty: Story = { args: { backups: [] } }
