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
import { SocialForm } from '@/components/admin/content/social-form'
import { SocialList } from '@/components/admin/content/social-list'
import { DeleteConfirmDialog } from '@/components/admin/content/delete-confirm-dialog'
import type { SocialEntry } from '@/lib/admin/content-schemas'

export default function SocialsPage() {
  const list = useContentList<SocialEntry>('socials')
  const { create, update, remove, reorder } = useContentMutations('socials')
  const [editing, setEditing] = useState<{
    slug: string
    data: SocialEntry
  } | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const entries = list.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader label="Redes sociais" count={entries.length} />
        <Button onClick={() => setCreating(true)}>+ Nova rede</Button>
      </div>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full rounded-[var(--radius)]" />
      ) : list.isError ? (
        <p className="text-warn text-sm">{(list.error as Error).message}</p>
      ) : (
        <SocialList
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
            <DialogTitle>{editing ? 'Editar rede' : 'Nova rede'}</DialogTitle>
          </DialogHeader>
          <SocialForm
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
          entries.find((e) => e.slug === deleting)?.data.socialDescription ??
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
