import type { ZodType } from 'zod'
import { sitePath } from './site-paths'
import {
  projectSchema,
  carreiraSchema,
  socialSchema,
  type ProjectEntry,
  type CarreiraEntry,
  type SocialEntry,
} from './content-schemas'

export type CollectionKey = 'projects' | 'carreiras' | 'socials'

export interface CollectionDef<T extends Record<string, unknown>> {
  key: CollectionKey
  label: string
  dir: string
  slugField: keyof T & string
  schema: ZodType<T>
  keyOrder: (keyof T & string)[]
  multiline: (keyof T & string)[]
}

export const COLLECTIONS = {
  projects: {
    key: 'projects',
    label: 'Projetos',
    dir: sitePath('content/projects'),
    slugField: 'projectSlug',
    schema: projectSchema,
    keyOrder: [
      'projectSlug',
      'order',
      'projectName',
      'subtitle',
      'projectLogo',
      'description',
      'tags',
      'deployLink',
      'repoLink',
      'image',
      'altImage',
    ],
    multiline: ['description'],
  } as CollectionDef<ProjectEntry>,
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
