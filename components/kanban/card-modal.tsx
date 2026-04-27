'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { TagBadge } from './tag-badge'
import { Card, CardLink, Tag } from '@/lib/kanban-schema'
import { Cross2Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'

export type CardFormData = {
  title: string
  description: string
  links: CardLink[]
  tagIds: string[]
}

type CardModalProps =
  | {
      mode: 'create'
      tags: Record<string, Tag>
      onSave: (data: CardFormData) => void
      onClose: () => void
      card?: never
      onDelete?: never
    }
  | {
      mode: 'edit'
      card: Card
      tags: Record<string, Tag>
      onSave: (data: CardFormData) => void
      onDelete: (cardId: string) => void
      onClose: () => void
    }

export function CardModal({
  mode,
  card,
  tags,
  onSave,
  onDelete,
  onClose,
}: CardModalProps) {
  const [title, setTitle] = useState(mode === 'edit' ? card.title : '')
  const [description, setDescription] = useState(
    mode === 'edit' ? (card.description ?? '') : '',
  )
  const [links, setLinks] = useState<CardLink[]>(
    mode === 'edit' ? card.links : [],
  )
  const [tagIds, setTagIds] = useState<string[]>(
    mode === 'edit' ? card.tagIds : [],
  )
  const [confirmDelete, setConfirmDelete] = useState(false)

  const tagList = Object.values(tags)

  function handleSave() {
    if (!title.trim()) return
    onSave({ title: title.trim(), description: description.trim(), links, tagIds })
  }

  function addLink() {
    setLinks((prev) => [...prev, { url: '', label: '' }])
  }

  function updateLink(index: number, field: 'url' | 'label', value: string) {
    setLinks((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)),
    )
  }

  function removeLink(index: number) {
    setLinks((prev) => prev.filter((_, i) => i !== index))
  }

  function toggleTag(tagId: string) {
    setTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Novo card' : 'Editar card'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-title">Título *</Label>
            <Input
              id="card-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Título do card"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="card-desc">Descrição</Label>
            <Textarea
              id="card-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição opcional"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Links</Label>
            {links.map((link, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 space-y-1">
                  <Input
                    value={link.url}
                    onChange={(e) => updateLink(i, 'url', e.target.value)}
                    placeholder="URL (https://...)"
                  />
                  <Input
                    value={link.label ?? ''}
                    onChange={(e) => updateLink(i, 'label', e.target.value)}
                    placeholder="Texto de exibição (opcional)"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLink(i)}
                >
                  <Cross2Icon className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addLink}
              className="w-full"
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Adicionar link
            </Button>
          </div>

          {tagList.length > 0 && (
            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2">
                {tagList.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`rounded-full transition-opacity ${
                      tagIds.includes(tag.id)
                        ? 'opacity-100 ring-2 ring-ring ring-offset-2'
                        : 'opacity-40'
                    }`}
                  >
                    <TagBadge tag={tag} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {mode === 'edit' && (
            <>
              {confirmDelete ? (
                <div className="mr-auto flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(card.id)}
                  >
                    Confirmar exclusão
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mr-auto text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <TrashIcon className="mr-2 h-3.5 w-3.5" />
                  Excluir
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
