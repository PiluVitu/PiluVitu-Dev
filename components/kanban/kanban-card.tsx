'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { TagBadge } from './tag-badge'
import { Card as CardType, Tag } from '@/lib/kanban-schema'
import { Link2Icon } from '@radix-ui/react-icons'
import { cn } from '@/lib/utils'

interface KanbanCardProps {
  card: CardType
  columnId: string
  tags: Record<string, Tag>
  onClick: () => void
  isDragOverlay?: boolean
}

export function KanbanCard({
  card,
  columnId,
  tags,
  onClick,
  isDragOverlay = false,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', columnId },
  })

  const style = isDragOverlay
    ? undefined
    : { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      data-card-id={card.id}
      {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
    >
      <Card
        className={cn(
          'cursor-grab select-none',
          isDragging && 'opacity-40',
          isDragOverlay && 'rotate-2 cursor-grabbing shadow-lg',
        )}
        onClick={isDragOverlay ? undefined : onClick}
      >
        <CardContent className="space-y-2 p-3">
          <p className="line-clamp-3 text-sm font-medium">{card.title}</p>
          {card.links.length > 0 && (
            <div
              className="flex items-center gap-1 text-muted-foreground"
              data-testid="card-link-indicator"
            >
              <Link2Icon className="h-3 w-3" />
              <span className="text-xs">{card.links.length}</span>
            </div>
          )}
          {card.tagIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {card.tagIds.map(
                (tid) => tags[tid] && <TagBadge key={tid} tag={tags[tid]} />,
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
