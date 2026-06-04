'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { useContentList } from '@/hooks/admin/content/use-content-list'
import { useContentMutations } from '@/hooks/admin/content/use-content-mutations'
import { ProjectForm } from '@/components/admin/content/project-form'
import { ProjectList } from '@/components/admin/content/project-list'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'
import type { ProjectEntry } from '@/lib/admin/content-schemas'

export default function ProjetosPage() {
  const list = useContentList<ProjectEntry>('projects')
  const { create, update, remove, reorder } = useContentMutations('projects')
  const [editing, setEditing] = useState<{
    slug: string
    data: ProjectEntry
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const entries = list.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Projetos" count={entries.length} />
        <Button onClick={() => setCreating(true)}>+ Novo projeto</Button>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <ProjectList
          entries={entries}
          onReorder={(slugs) =>
            reorder.mutate(slugs, {
              onError: (e) => toast.error((e as Error).message),
            })
          }
          onEdit={(slug) => {
            const e = entries.find((x) => x.slug === slug)
            if (e) setEditing(e)
          }}
          onDelete={(slug) => setDeleting(slug)}
        />
      )}

      <Dialog
        open={creating || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false)
            setEditing(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar projeto' : 'Novo projeto'}
            </DialogTitle>
          </DialogHeader>
          <ProjectForm
            initial={editing?.data}
            nextOrder={entries.length}
            pending={create.isPending || update.isPending}
            onSubmit={(data) => {
              const onDone = {
                onSuccess: () => {
                  toast.success('Salvo')
                  setCreating(false)
                  setEditing(null)
                },
                onError: (e: unknown) => toast.error((e as Error).message),
              }
              if (editing) update.mutate({ slug: editing.slug, data }, onDone)
              else create.mutate(data, onDone)
            }}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        itemLabel={
          entries.find((e) => e.slug === deleting)?.data.projectName ??
          deleting ??
          ''
        }
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return
          remove.mutate(deleting, {
            onSuccess: () => {
              toast.success('Removido')
              setDeleting(null)
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }}
      />
    </div>
  )
}
