'use client'

import { TextField, ToggleField } from '@/components/admin/content/fields'
import { Button } from '@piluvitu/ui/button'
import type { PostFrontmatter } from '@/lib/admin/post-schema'
import { SidebarCard } from './sidebar-card'

export function PostPublishCard(props: {
  value: PostFrontmatter
  onChange: (v: PostFrontmatter) => void
  onSave: () => void
  pending?: boolean
  errors?: Record<string, string>
}) {
  const d = props.value
  const set = <K extends keyof PostFrontmatter>(k: K, v: PostFrontmatter[K]) =>
    props.onChange({ ...d, [k]: v })
  return (
    <SidebarCard title="Publicação">
      <ToggleField
        label="Publicado"
        checked={!d.draft}
        onChange={(v) => set('draft', !v)}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Data"
          value={d.publishedAt}
          onChange={(v) => set('publishedAt', v)}
          placeholder="2025-04-28"
          error={props.errors?.publishedAt}
        />
        <TextField
          label="Leitura (min)"
          value={d.readingTimeMinutes ? String(d.readingTimeMinutes) : ''}
          onChange={(v) =>
            set('readingTimeMinutes', Number(v.replace(/\D/g, '')) || 0)
          }
          placeholder="5"
        />
      </div>
      <Button
        onClick={props.onSave}
        disabled={props.pending}
        className="w-full"
      >
        {props.pending ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </SidebarCard>
  )
}
