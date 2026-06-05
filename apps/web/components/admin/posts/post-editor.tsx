'use client'

import { useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { PageTopBar } from '@/components/page-top-bar'
import { TagArrayInput } from '@/components/admin/content/tag-array-input'
import {
  postFrontmatterSchema,
  type PostFrontmatter,
} from '@/lib/admin/post-schema'
import { slugify } from '@/lib/admin/slugify'
import { estimateReadingTime } from '@/lib/admin/reading-time'
import { MdxEditor } from './mdx-editor'
import { MdxPreview } from './mdx-preview'
import { MdxToolbar } from './mdx-toolbar'
import { EditorTabs, type EditorTab } from './editor-tabs'
import { SidebarCard } from './sidebar-card'
import { PostPublishCard } from './post-publish-card'
import { PostMetaCard } from './post-meta-card'
import { CoverImageCard } from './cover-image-card'

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
  const [tab, setTab] = useState<EditorTab>('edit')
  const editorRef = useRef<EditorView | null>(null)
  const isCreate = props.mode === 'create'

  // On create, o slug auto-deriva do título até o usuário editá-lo manualmente.
  const displaySlug = isCreate && !slugTouched ? slugify(fm.title) : fm.slug

  const handleFm = (next: PostFrontmatter) => {
    if (isCreate && !slugTouched && next.slug !== displaySlug) {
      setSlugTouched(true)
      setFm(next)
      return
    }
    setFm({ ...next, slug: !isCreate || slugTouched ? next.slug : '' })
  }

  const save = () => {
    const finalSlug = isCreate && !slugTouched ? slugify(fm.title) : fm.slug
    const reading = fm.readingTimeMinutes || estimateReadingTime(body)
    const parsed = postFrontmatterSchema.safeParse({
      ...fm,
      slug: finalSlug,
      readingTimeMinutes: reading,
    })
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
    <div className="flex flex-col gap-5">
      <PageTopBar backHref="/admin/posts" backLabel="Posts" />

      <input
        aria-label="Título"
        className="border-border bg-card text-foreground focus:border-primary w-full rounded-[var(--radius)] border px-5 py-4 text-3xl font-bold outline-none"
        placeholder="Título do post"
        value={fm.title}
        onChange={(e) => handleFm({ ...fm, title: e.target.value })}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px] xl:items-start">
        {/* Conteúdo */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
              Conteúdo
            </span>
            <EditorTabs value={tab} onChange={setTab} />
          </div>

          {tab === 'preview' ? (
            <div className="border-border h-[60vh] overflow-hidden rounded-[var(--radius)] border">
              <MdxPreview mdx={body} />
            </div>
          ) : (
            <div className="border-border overflow-hidden rounded-[var(--radius)] border">
              <MdxToolbar editorRef={editorRef} />
              <div
                className={
                  tab === 'split'
                    ? 'border-border grid h-[60vh] grid-cols-2 divide-x'
                    : 'h-[60vh]'
                }
              >
                <MdxEditor
                  value={body}
                  onChange={setBody}
                  onReady={(v) => (editorRef.current = v)}
                />
                {tab === 'split' ? <MdxPreview mdx={body} /> : null}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <PostPublishCard
            value={fm}
            onChange={setFm}
            onSave={save}
            pending={props.pending}
            errors={errors}
          />
          <PostMetaCard
            value={{ ...fm, slug: displaySlug }}
            onChange={handleFm}
            slugEditable={isCreate}
            errors={errors}
          />
          <SidebarCard title="Tags">
            <TagArrayInput
              label=""
              values={fm.tags}
              onChange={(v) => setFm({ ...fm, tags: v })}
            />
          </SidebarCard>
          <CoverImageCard
            value={fm.coverImage}
            onChange={(v) => setFm({ ...fm, coverImage: v })}
          />
        </div>
      </div>
    </div>
  )
}
