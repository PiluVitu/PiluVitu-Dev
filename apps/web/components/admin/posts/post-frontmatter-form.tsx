'use client'

import {
  TextField,
  TextareaField,
  ToggleField,
} from '@/components/admin/content/fields'
import { ImageField } from '@/components/admin/content/image-field'
import { TagArrayInput } from '@/components/admin/content/tag-array-input'
import type { PostFrontmatter } from '@/lib/admin/post-schema'

export function PostFrontmatterForm(props: {
  value: PostFrontmatter
  onChange: (v: PostFrontmatter) => void
  slugEditable: boolean
  errors?: Record<string, string>
}) {
  const set = <K extends keyof PostFrontmatter>(k: K, v: PostFrontmatter[K]) =>
    props.onChange({ ...props.value, [k]: v })
  const d = props.value
  const e = props.errors ?? {}
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Título"
        value={d.title}
        onChange={(v) => set('title', v)}
        error={e.title}
      />
      <TextField
        label="Slug"
        value={d.slug}
        onChange={(v) => props.slugEditable && set('slug', v)}
        error={e.slug}
      />
      <TextareaField
        label="Resumo"
        value={d.excerpt}
        onChange={(v) => set('excerpt', v)}
        rows={3}
      />
      <ImageField
        label="Imagem de capa (path)"
        value={d.coverImage}
        onChange={(v) => set('coverImage', v)}
      />
      <TagArrayInput
        label="Tags"
        values={d.tags}
        onChange={(v) => set('tags', v)}
      />
      <TextField
        label="Data de publicação (ISO)"
        value={d.publishedAt}
        onChange={(v) => set('publishedAt', v)}
        placeholder="2025-04-28"
      />
      <ToggleField
        label="Rascunho"
        checked={d.draft}
        onChange={(v) => set('draft', v)}
      />
    </div>
  )
}
