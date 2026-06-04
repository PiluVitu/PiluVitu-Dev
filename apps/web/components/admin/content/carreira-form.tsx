'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { carreiraSchema, type CarreiraEntry } from '@/lib/admin/content-schemas'
import { slugify } from '@/lib/admin/slugify'
import { TextField, TextareaField, ToggleField } from './fields'
import { TagArrayInput } from './tag-array-input'

const EMPTY: CarreiraEntry = {
  orgSlug: '',
  order: 0,
  orgName: '',
  orgDescription: '',
  orgLink: '',
  image: '',
  altImage: '',
  title: '',
  location: '',
  date: '',
  atribuitions: [],
  current: false,
  tags: [],
}

export function CarreiraForm(props: {
  initial?: CarreiraEntry
  nextOrder?: number
  onSubmit: (d: CarreiraEntry) => void
  pending?: boolean
}) {
  const isEdit = !!props.initial
  const [d, setD] = useState<CarreiraEntry>(
    props.initial ?? { ...EMPTY, order: props.nextOrder ?? 0 },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof CarreiraEntry>(k: K, v: CarreiraEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const candidate = isEdit
      ? d
      : { ...d, orgSlug: d.orgSlug || slugify(d.orgName) }
    const parsed = carreiraSchema.safeParse(candidate)
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
        label="Organização"
        value={d.orgName}
        onChange={(v) => set('orgName', v)}
        error={errors.orgName}
      />
      <TextField
        label="Slug"
        value={isEdit ? d.orgSlug : d.orgSlug || slugify(d.orgName)}
        onChange={(v) => set('orgSlug', v)}
        error={errors.orgSlug}
      />
      <TextField
        label="Cargo"
        value={d.title}
        onChange={(v) => set('title', v)}
      />
      <TextField
        label="Período"
        value={d.date}
        onChange={(v) => set('date', v)}
      />
      <TextField
        label="Localização"
        value={d.location}
        onChange={(v) => set('location', v)}
      />
      <TextareaField
        label="Descrição"
        value={d.orgDescription}
        onChange={(v) => set('orgDescription', v)}
      />
      <TextField
        label="Link"
        value={d.orgLink}
        onChange={(v) => set('orgLink', v)}
      />
      <TextField
        label="Logo (URL)"
        value={d.image}
        onChange={(v) => set('image', v)}
      />
      <TextField
        label="Alt / iniciais"
        value={d.altImage}
        onChange={(v) => set('altImage', v)}
      />
      <TagArrayInput
        label="Atribuições"
        values={d.atribuitions}
        onChange={(v) => set('atribuitions', v)}
        placeholder="Adicionar atribuição…"
      />
      <TagArrayInput
        label="Tags"
        values={d.tags}
        onChange={(v) => set('tags', v)}
      />
      <ToggleField
        label="Cargo atual"
        checked={d.current}
        onChange={(v) => set('current', v)}
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
