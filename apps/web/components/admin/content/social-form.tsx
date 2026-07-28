'use client'

import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { socialSchema, type SocialEntry } from '@/lib/admin/content-schemas'
import { slugify } from '@/lib/admin/slugify'
import { TextField, SelectField } from './fields'
import { ImageField } from '@/components/admin/content/image-field'
import { FaIconSelect } from './fa-icon-select'

const EMPTY: SocialEntry = {
  key: '',
  order: 0,
  socialDescription: '',
  socialLink: '',
  iconMode: 'fontawesome',
  fontawesomeIcon: 'brands__github',
  image: '',
  altImage: '',
}

export function SocialForm(props: {
  initial?: SocialEntry
  nextOrder?: number
  onSubmit: (d: SocialEntry) => void
  pending?: boolean
}) {
  const isEdit = !!props.initial
  const [d, setD] = useState<SocialEntry>(
    props.initial ?? { ...EMPTY, order: props.nextOrder ?? 0 },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof SocialEntry>(k: K, v: SocialEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const candidate = isEdit
      ? d
      : { ...d, key: d.key || slugify(d.socialDescription) }
    const parsed = socialSchema.safeParse(candidate)
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
    <div className="flex flex-col gap-4">
      <TextField
        label="Identificador (slug)"
        value={isEdit ? d.key : d.key || slugify(d.socialDescription)}
        onChange={(v) => set('key', v)}
        error={errors.key}
      />
      <TextField
        label="Descrição / CTA"
        value={d.socialDescription}
        onChange={(v) => set('socialDescription', v)}
      />
      <TextField
        label="URL"
        value={d.socialLink}
        onChange={(v) => set('socialLink', v)}
      />
      <SelectField
        label="Tipo de ícone"
        value={d.iconMode}
        onChange={(v) => set('iconMode', v as SocialEntry['iconMode'])}
        options={[
          { label: 'Font Awesome', value: 'fontawesome' },
          { label: 'Imagem', value: 'image' },
        ]}
      />
      {d.iconMode === 'fontawesome' ? (
        <FaIconSelect
          label="Ícone"
          value={d.fontawesomeIcon}
          onChange={(v) => set('fontawesomeIcon', v)}
        />
      ) : (
        <ImageField
          label="Imagem (path)"
          value={d.image}
          onChange={(v) => set('image', v)}
        />
      )}
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
