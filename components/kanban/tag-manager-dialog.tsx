'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { TagBadge } from './tag-badge'
import { Tag, TAG_COLORS } from '@/lib/kanban-schema'
import { TrashIcon } from '@radix-ui/react-icons'

interface TagManagerDialogProps {
  tags: Record<string, Tag>
  onAddTag: (label: string, color: string) => void
  onDeleteTag: (tagId: string) => void
  onClose: () => void
}

export function TagManagerDialog({
  tags,
  onAddTag,
  onDeleteTag,
  onClose,
}: TagManagerDialogProps) {
  const [label, setLabel] = useState('')
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0])

  const tagList = Object.values(tags)

  function handleAdd() {
    const trimmed = label.trim()
    if (!trimmed) return
    onAddTag(trimmed, selectedColor)
    setLabel('')
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Gerenciar tags</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {tagList.length > 0 && (
            <div className="space-y-2">
              {tagList.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between">
                  <TagBadge tag={tag} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive h-7 w-7"
                    onClick={() => onDeleteTag(tag.id)}
                    aria-label={`Deletar tag ${tag.label}`}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Separator />
            </div>
          )}

          <div className="space-y-3">
            <Label>Nova tag</Label>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Nome da tag"
            />
            <div className="flex flex-wrap gap-2">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`h-6 w-6 rounded-full transition-transform ${
                    selectedColor === color
                      ? 'ring-ring scale-125 ring-2 ring-offset-1'
                      : ''
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Cor ${color}`}
                />
              ))}
            </div>
            {label.trim() && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Preview:</span>
                <TagBadge
                  tag={{
                    id: 'preview',
                    label: label.trim(),
                    color: selectedColor,
                  }}
                />
              </div>
            )}
            <Button
              onClick={handleAdd}
              disabled={!label.trim()}
              className="w-full"
            >
              Criar tag
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
