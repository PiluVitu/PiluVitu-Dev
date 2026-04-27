'use client'

import { useState } from 'react'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Column, Card as CardType, Tag } from '@/lib/kanban-schema'
import { CardFormData } from './card-modal'
import { KanbanCard } from './kanban-card'
import { ColumnHeader } from './column-header'
import { AddCardButton } from './add-card-button'
import { CardModal } from './card-modal'
import { cn } from '@/lib/utils'

interface KanbanColumnProps {
  column: Column
  cards: CardType[]
  tags: Record<string, Tag>
  onTitleChange: (title: string) => void
  onDelete: () => void
  onAddCard: (data: CardFormData) => void
  onUpdateCard: (card: CardType) => void
  onDeleteCard: (cardId: string) => void
}

export function KanbanColumn({
  column,
  cards,
  tags,
  onTitleChange,
  onDelete,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
}: KanbanColumnProps) {
  const [editingCard, setEditingCard] = useState<CardType | null>(null)
  const [creatingCard, setCreatingCard] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <>
      <div
        ref={setSortableRef}
        style={style}
        className={cn(
          'bg-muted/50 flex w-72 shrink-0 flex-col rounded-lg border',
          isDragging && 'opacity-50',
        )}
      >
        <div {...attributes} {...listeners} className="cursor-grab">
          <ColumnHeader
            title={column.title}
            onTitleChange={onTitleChange}
            onDelete={onDelete}
          />
        </div>

        <div
          ref={setDropRef}
          className={cn(
            'flex min-h-[100px] flex-1 flex-col gap-2 p-2',
            isOver && 'bg-muted/80 rounded-b-lg',
          )}
        >
          <SortableContext
            items={column.cardIds}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                columnId={column.id}
                tags={tags}
                onClick={() => setEditingCard(card)}
              />
            ))}
          </SortableContext>
        </div>

        <div className="p-2">
          <AddCardButton onClick={() => setCreatingCard(true)} />
        </div>
      </div>

      {creatingCard && (
        <CardModal
          mode="create"
          tags={tags}
          onSave={(data) => {
            onAddCard(data)
            setCreatingCard(false)
          }}
          onClose={() => setCreatingCard(false)}
        />
      )}

      {editingCard && (
        <CardModal
          mode="edit"
          card={editingCard}
          tags={tags}
          onSave={(data) => {
            onUpdateCard({ ...editingCard, ...data })
            setEditingCard(null)
          }}
          onDelete={(cardId) => {
            onDeleteCard(cardId)
            setEditingCard(null)
          }}
          onClose={() => setEditingCard(null)}
        />
      )}
    </>
  )
}
