'use client'

import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { projectSchema, type ProjectEntry } from '@/lib/admin/content-schemas'
import { slugify } from '@/lib/admin/slugify'
import { TextField, TextareaField } from './fields'
import { ImageField } from '@/components/admin/content/image-field'
import { TagArrayInput } from './tag-array-input'

const EMPTY: ProjectEntry = {
  projectSlug: '',
  order: 0,
  projectName: '',
  subtitle: '',
  projectLogo: '',
  description: '',
  tags: [],
  deployLink: '',
  repoLink: '',
  image: '',
  altImage: '',
}

export function ProjectForm(props: {
  initial?: ProjectEntry
  onSubmit: (data: ProjectEntry) => void
  pending?: boolean
  nextOrder?: number
}) {
  const isEdit = !!props.initial
  const [d, setD] = useState<ProjectEntry>(
    props.initial ?? { ...EMPTY, order: props.nextOrder ?? 0 },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof ProjectEntry>(k: K, v: ProjectEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const candidate = isEdit
      ? d
      : { ...d, projectSlug: d.projectSlug || slugify(d.projectName) }
    const parsed = projectSchema.safeParse(candidate)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      )
      return
    }
    setErrors({})
    props.onSubmit(parsed.data)
  }

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      <TextField
        label="Nome"
        value={d.projectName}
        onChange={(v) => set('projectName', v)}
        error={errors.projectName}
      />
      <TextField
        label="Slug"
        value={isEdit ? d.projectSlug : d.projectSlug || slugify(d.projectName)}
        onChange={(v) => set('projectSlug', v)}
        error={errors.projectSlug}
      />
      <TextField
        label="Subtítulo"
        value={d.subtitle}
        onChange={(v) => set('subtitle', v)}
      />
      <ImageField
        label="Logo (path)"
        value={d.projectLogo}
        onChange={(v) => set('projectLogo', v)}
      />
      <TextareaField
        label="Descrição"
        value={d.description}
        onChange={(v) => set('description', v)}
      />
      <TagArrayInput
        label="Tags"
        values={d.tags}
        onChange={(v) => set('tags', v)}
      />
      <TextField
        label="Deploy (URL)"
        value={d.deployLink}
        onChange={(v) => set('deployLink', v)}
      />
      <TextField
        label="Repo (URL)"
        value={d.repoLink}
        onChange={(v) => set('repoLink', v)}
      />
      <ImageField
        label="Imagem de capa (path)"
        value={d.image}
        onChange={(v) => set('image', v)}
      />
      <TextField
        label="Alt / abrev."
        value={d.altImage}
        onChange={(v) => set('altImage', v)}
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
