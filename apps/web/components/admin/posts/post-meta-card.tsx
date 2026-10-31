'use client'

import { TextField, TextareaField } from '@/components/admin/content/fields'
import {
  META_DESCRIPTION_MAX,
  type PostFrontmatter,
} from '@/lib/admin/post-schema'
import { cn } from '@/lib/utils'
import { SidebarCard } from './sidebar-card'
import { ResumoButton } from './resumo-button'

export function PostMetaCard(props: {
  value: PostFrontmatter
  body: string
  onChange: (v: PostFrontmatter) => void
  slugEditable: boolean
  errors?: Record<string, string>
}) {
  const d = props.value
  const set = <K extends keyof PostFrontmatter>(k: K, v: PostFrontmatter[K]) =>
    props.onChange({ ...d, [k]: v })
  const metaLen = d.metaDescription.length
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
      <ResumoButton
        title={d.title}
        body={props.body}
        tags={d.tags}
        onAplicar={(r) =>
          props.onChange({
            ...d,
            tldr: r.tldr,
            metaDescription: r.metaDescription,
            tags: r.tags,
          })
        }
      />
      <TextareaField
        label="TL;DR"
        value={d.tldr}
        onChange={(v) => set('tldr', v)}
        rows={3}
        error={props.errors?.tldr}
      />
      <div className="flex flex-col gap-1">
        <TextareaField
          label="Meta description"
          value={d.metaDescription}
          onChange={(v) => set('metaDescription', v)}
          rows={3}
          error={props.errors?.metaDescription}
        />
        <span
          className={cn(
            'self-end font-mono text-xs',
            metaLen > META_DESCRIPTION_MAX
              ? 'text-warn'
              : 'text-muted-foreground',
          )}
        >
          {metaLen}/{META_DESCRIPTION_MAX}
        </span>
      </div>
    </SidebarCard>
  )
}
