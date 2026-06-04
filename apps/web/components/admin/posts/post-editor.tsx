'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PageTopBar } from '@/components/page-top-bar'
import {
  postFrontmatterSchema,
  type PostFrontmatter,
} from '@/lib/admin/post-schema'
import { slugify } from '@/lib/admin/slugify'
import { PostFrontmatterForm } from './post-frontmatter-form'
import { MdxEditor } from './mdx-editor'
import { MdxPreview } from './mdx-preview'

export function PostEditor(props: {
  mode: 'create' | 'edit'
  initialFrontmatter: PostFrontmatter
  initialBody: string
  pending?: boolean
  onSave: (fm: PostFrontmatter, body: string) => void
}) {
  const [fm, setFm] = useState<PostFrontmatter>(props.initialFrontmatter)
  const [body, setBody] = useState(props.initialBody)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isCreate = props.mode === 'create'

  const save = () => {
    const candidate =
      isCreate && !fm.slug ? { ...fm, slug: slugify(fm.title) } : fm
    const parsed = postFrontmatterSchema.safeParse(candidate)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      )
      return
    }
    setErrors({})
    props.onSave(parsed.data, body)
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <PageTopBar backHref="/admin/posts" backLabel="Posts" />
        <Button onClick={save} disabled={props.pending}>
          {props.pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[300px_1fr_1fr]">
        <div className="overflow-y-auto pr-1">
          <PostFrontmatterForm
            value={
              isCreate ? { ...fm, slug: fm.slug || slugify(fm.title) } : fm
            }
            onChange={setFm}
            slugEditable={isCreate}
            errors={errors}
          />
        </div>
        <MdxEditor value={body} onChange={setBody} />
        <MdxPreview mdx={body} />
      </div>
    </div>
  )
}
