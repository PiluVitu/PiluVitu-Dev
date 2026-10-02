'use client'

import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { pilulabsSchema, type PiluLabsEntry } from '@/lib/admin/content-schemas'
import { slugify } from '@/lib/admin/slugify'
import { TIPOS, type TipoItem } from '@/lib/pilulabs-regras'
import { SelectField, TextField, TextareaField, ToggleField } from './fields'
import { ImageField } from './image-field'
import { TagArrayInput } from './tag-array-input'

const ROTULO_DO_TIPO: Record<TipoItem, string> = {
  extensao: 'Extensão de navegador',
  mobile: 'App mobile',
  web: 'App web',
  cli: 'CLI',
}

const OPCOES_DE_TIPO = TIPOS.map((tipo) => ({
  value: tipo,
  label: ROTULO_DO_TIPO[tipo],
}))

const EMPTY: PiluLabsEntry = {
  slug: '',
  order: 0,
  nome: '',
  subtitulo: '',
  descricao: '',
  tipo: 'web',
  tags: [],
  logo: '',
  sigla: '',
  site: '',
  repo: '',
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  destaque: false,
  data: '',
  listado: false,
  paginaPropria: false,
}

export function PiluLabsForm(props: {
  initial?: PiluLabsEntry
  onSubmit: (data: PiluLabsEntry) => void
  pending?: boolean
  nextOrder?: number
}) {
  const isEdit = !!props.initial
  const [d, setD] = useState<PiluLabsEntry>(
    props.initial ?? { ...EMPTY, order: props.nextOrder ?? 0 },
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof PiluLabsEntry>(k: K, v: PiluLabsEntry[K]) =>
    setD((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const candidate = isEdit ? d : { ...d, slug: d.slug || slugify(d.nome) }
    const parsed = pilulabsSchema.safeParse(candidate)
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
        value={d.nome}
        onChange={(v) => set('nome', v)}
        error={errors.nome}
      />
      <TextField
        label="Slug"
        value={isEdit ? d.slug : d.slug || slugify(d.nome)}
        onChange={(v) => set('slug', v)}
        error={errors.slug}
      />
      <TextField
        label="Subtítulo"
        value={d.subtitulo}
        onChange={(v) => set('subtitulo', v)}
      />
      <TextareaField
        label="Descrição"
        value={d.descricao}
        onChange={(v) => set('descricao', v)}
      />
      <SelectField
        label="Tipo"
        value={d.tipo}
        onChange={(v) => set('tipo', v as TipoItem)}
        options={OPCOES_DE_TIPO}
        error={errors.tipo}
      />
      <TagArrayInput
        label="Tags"
        values={d.tags}
        onChange={(v) => set('tags', v)}
      />
      <ImageField
        label="Logo (path ou URL)"
        value={d.logo}
        onChange={(v) => set('logo', v)}
      />
      <TextField
        label="Sigla"
        value={d.sigla}
        placeholder="Vazio = as 2 primeiras letras do nome"
        onChange={(v) => set('sigla', v)}
      />
      <TextField
        label="Site"
        value={d.site}
        placeholder="https://<slug>.pilutech.com.br"
        onChange={(v) => set('site', v)}
        error={errors.site}
      />
      <TextField
        label="Código-fonte"
        value={d.repo}
        onChange={(v) => set('repo', v)}
        error={errors.repo}
      />
      <TextField
        label="Chrome Web Store"
        value={d.chromeUrl}
        onChange={(v) => set('chromeUrl', v)}
        error={errors.chromeUrl}
      />
      <TextField
        label="Firefox Add-ons"
        value={d.firefoxUrl}
        onChange={(v) => set('firefoxUrl', v)}
        error={errors.firefoxUrl}
      />
      <TextField
        label="Microsoft Edge Add-ons"
        value={d.edgeUrl}
        onChange={(v) => set('edgeUrl', v)}
        error={errors.edgeUrl}
      />
      <TextField
        label="Opera add-ons"
        value={d.operaUrl}
        onChange={(v) => set('operaUrl', v)}
        error={errors.operaUrl}
      />
      <TextField
        label="Lançamento"
        type="date"
        value={d.data}
        onChange={(v) => set('data', v)}
        error={errors.data}
      />
      <ToggleField
        label="Destaque na home"
        checked={d.destaque}
        onChange={(v) => set('destaque', v)}
      />
      <ToggleField
        label="Listado"
        checked={d.listado}
        onChange={(v) => set('listado', v)}
      />
      <ToggleField
        label="Página própria no site"
        checked={d.paginaPropria}
        onChange={(v) => set('paginaPropria', v)}
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
