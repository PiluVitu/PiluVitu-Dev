'use client'

import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import {
  profileSchema,
  COMPANY_LINK_COLORS,
  type ProfileEntry,
} from '@/lib/admin/content-schemas'
import { TextField, TextareaField, SelectField, ToggleField } from './fields'
import { ImageField } from '@/components/admin/content/image-field'
import { TagArrayInput } from './tag-array-input'

export function ProfileForm(props: {
  initial: ProfileEntry
  onSubmit: (d: ProfileEntry) => void
  pending?: boolean
}) {
  const [d, setD] = useState<ProfileEntry>(props.initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof ProfileEntry>(k: K, v: ProfileEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const parsed = profileSchema.safeParse(d)
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
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <TextField
        label="Nome"
        value={d.displayName}
        onChange={(v) => set('displayName', v)}
        error={errors.displayName}
      />
      <TextField
        label="Cargo em destaque"
        value={d.roleHighlight}
        onChange={(v) => set('roleHighlight', v)}
      />
      <TextField
        label="Empresa"
        value={d.companyName}
        onChange={(v) => set('companyName', v)}
      />
      <TextField
        label="Link da empresa"
        value={d.companyLink}
        onChange={(v) => set('companyLink', v)}
      />
      <SelectField
        label="Cor do nome da empresa"
        value={d.companyLinkColor}
        onChange={(v) => set('companyLinkColor', v)}
        options={COMPANY_LINK_COLORS}
      />
      <TextField
        label="Localização"
        value={d.location}
        onChange={(v) => set('location', v)}
      />
      <ImageField
        label="Avatar (path)"
        value={d.avatarSrc}
        onChange={(v) => set('avatarSrc', v)}
      />
      <TextField
        label="Alt do avatar"
        value={d.avatarAlt}
        onChange={(v) => set('avatarAlt', v)}
      />
      <div className="md:col-span-2">
        <TextareaField
          label="Bio"
          value={d.bio}
          onChange={(v) => set('bio', v)}
        />
      </div>
      <TextField
        label="Texto de disponibilidade"
        value={d.availabilityLabel}
        onChange={(v) => set('availabilityLabel', v)}
      />
      <div className="md:col-span-2">
        <TagArrayInput
          label="Disciplinas"
          values={d.disciplines}
          onChange={(v) => set('disciplines', v)}
        />
      </div>
      <div className="md:col-span-2">
        <ToggleField
          label="Disponível para oportunidades"
          checked={d.availabilityOpen}
          onChange={(v) => set('availabilityOpen', v)}
        />
      </div>
      <div className="flex justify-end md:col-span-2">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar perfil'}
        </Button>
      </div>
    </div>
  )
}
