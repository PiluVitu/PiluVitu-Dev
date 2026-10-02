import type { ZodType } from 'zod'
import { sitePath } from './site-paths'
import {
  carreiraSchema,
  socialSchema,
  pilulabsSchema,
  type CarreiraEntry,
  type SocialEntry,
  type PiluLabsEntry,
} from './content-schemas'

export type CollectionKey = 'pilulabs' | 'carreiras' | 'socials'

export interface CollectionDef<T extends Record<string, unknown>> {
  key: CollectionKey
  label: string
  dir: string
  slugField: keyof T & string
  schema: ZodType<T>
  keyOrder: (keyof T & string)[]
  multiline: (keyof T & string)[]
  omitirSeVazio?: (keyof T & string)[]
}

export const COLLECTIONS = {
  pilulabs: {
    key: 'pilulabs',
    label: 'PiluLabs',
    dir: sitePath('content/pilulabs'),
    slugField: 'slug',
    schema: pilulabsSchema,
    keyOrder: [
      'slug',
      'order',
      'nome',
      'subtitulo',
      'descricao',
      'tipo',
      'tags',
      'logo',
      'sigla',
      'site',
      'repo',
      'chromeUrl',
      'firefoxUrl',
      'edgeUrl',
      'operaUrl',
      'destaque',
      'data',
      'listado',
      'paginaPropria',
    ],
    multiline: ['descricao'],
    // O fields.date do Keystatic recusa `data: ''`, e um item que não abre
    // derruba o build do site: vazia, a chave sai do YAML.
    omitirSeVazio: ['data'],
  } as CollectionDef<PiluLabsEntry>,
  carreiras: {
    key: 'carreiras',
    label: 'Carreira',
    dir: sitePath('content/carreiras'),
    slugField: 'orgSlug',
    schema: carreiraSchema,
    keyOrder: [
      'orgSlug',
      'order',
      'orgName',
      'orgDescription',
      'orgLink',
      'image',
      'altImage',
      'title',
      'location',
      'date',
      'atribuitions',
      'current',
      'tags',
    ],
    multiline: ['orgDescription'],
  } as CollectionDef<CarreiraEntry>,
  socials: {
    key: 'socials',
    label: 'Redes sociais',
    dir: sitePath('content/socials'),
    slugField: 'key',
    schema: socialSchema,
    keyOrder: [
      'key',
      'order',
      'socialDescription',
      'socialLink',
      'iconMode',
      'fontawesomeIcon',
      'image',
      'altImage',
    ],
    multiline: [],
  } as CollectionDef<SocialEntry>,
} satisfies Record<CollectionKey, unknown>

export function getCollection(
  key: string,
): CollectionDef<Record<string, unknown>> | null {
  return (
    (
      COLLECTIONS as unknown as Record<
        string,
        CollectionDef<Record<string, unknown>>
      >
    )[key] ?? null
  )
}
