import { z } from 'zod'
import { SLUG_RE } from './content-schemas'

export const postFrontmatterSchema = z.object({
  title: z.string().min(1, 'Obrigatório'),
  slug: z
    .string()
    .regex(SLUG_RE, 'Slug inválido (use minúsculas, números e hífens)'),
  excerpt: z.string().default(''),
  coverImage: z.string().default(''),
  tags: z.array(z.string()).default([]),
  publishedAt: z.string().default(''),
  draft: z.boolean().default(false),
})

export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>

const KNOWN_KEYS: (keyof PostFrontmatter)[] = [
  'title',
  'slug',
  'excerpt',
  'coverImage',
  'tags',
  'publishedAt',
  'draft',
]

/** Pulls the known fields out of a raw frontmatter object (drops extras). */
export function extractKnownFrontmatter(
  raw: Record<string, unknown>,
): PostFrontmatter {
  const picked: Record<string, unknown> = {}
  for (const k of KNOWN_KEYS) if (k in raw) picked[k] = raw[k]
  return postFrontmatterSchema.parse(picked)
}

export { KNOWN_KEYS }
