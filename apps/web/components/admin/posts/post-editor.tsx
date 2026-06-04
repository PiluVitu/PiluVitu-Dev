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
  const [slugTouched, setSlugTouched] = useState(props.mode === 'edit')
  const isCreate = props.mode === 'create'

  // On create, the slug auto-derives from the title until the user edits it manually.
  const displaySlug = isCreate && !slugTouched ? slugify(fm.title) : fm.slug

  const handleChange = (next: PostFrontmatter) => {
    if (isCreate && !slugTouched && next.slug !== displaySlug) {
      // user edited the slug field → stop auto-deriving
      setSlugTouched(true)
      setFm(next)
      return
    }
    setFm({ ...next, slug: !isCreate || slugTouched ? next.slug : '' })
  }

  const save = () => {
    const finalSlug = isCreate && !slugTouched ? slugify(fm.title) : fm.slug
    const parsed = postFrontmatterSchema.safeParse({ ...fm, slug: finalSlug })
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
            value={{ ...fm, slug: displaySlug }}
            onChange={handleChange}
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
