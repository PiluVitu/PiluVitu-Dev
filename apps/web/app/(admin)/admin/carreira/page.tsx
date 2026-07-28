'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@piluvitu/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@piluvitu/ui/dialog'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { useContentList } from '@/hooks/admin/content/use-content-list'
import { useContentMutations } from '@/hooks/admin/content/use-content-mutations'
import { CarreiraForm } from '@/components/admin/content/carreira-form'
import { CarreiraList } from '@/components/admin/content/carreira-list'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'
import type { CarreiraEntry } from '@/lib/admin/content-schemas'

export default function CarreiraPage() {
  const list = useContentList<CarreiraEntry>('carreiras')
  const { create, update, remove, reorder } = useContentMutations('carreiras')
  const [editing, setEditing] = useState<{
    slug: string
    data: CarreiraEntry
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const entries = list.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Carreira" count={entries.length} />
        <Button onClick={() => setCreating(true)}>+ Nova experiência</Button>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <CarreiraList
          entries={entries}
          onReorder={(s) =>
            reorder.mutate(s, {
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
              {editing ? 'Editar experiência' : 'Nova experiência'}
            </DialogTitle>
          </DialogHeader>
          <CarreiraForm
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
          entries.find((e) => e.slug === deleting)?.data.orgName ??
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
