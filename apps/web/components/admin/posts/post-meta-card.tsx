'use client'

import { TextField, TextareaField } from '@/components/admin/content/fields'
import type { PostFrontmatter } from '@/lib/admin/post-schema'
import { SidebarCard } from './sidebar-card'

export function PostMetaCard(props: {
  value: PostFrontmatter
  onChange: (v: PostFrontmatter) => void
  slugEditable: boolean
  errors?: Record<string, string>
}) {
  const d = props.value
  const set = <K extends keyof PostFrontmatter>(k: K, v: PostFrontmatter[K]) =>
    props.onChange({ ...d, [k]: v })
  return (
    <SidebarCard title="Metadados">
      <TextField
        label="Slug"
        value={d.slug}
        onChange={(v) => props.slugEditable && set('slug', v)}
        error={props.errors?.slug}
      />
      <TextareaField
        label="Resumo"
        value={d.excerpt}
        onChange={(v) => set('excerpt', v)}
        rows={3}
      />
    </SidebarCard>
  )
}
