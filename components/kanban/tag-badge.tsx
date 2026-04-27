import { Badge } from '@/components/ui/badge'
import { Tag } from '@/lib/kanban-schema'
import { cn } from '@/lib/utils'

interface TagBadgeProps {
  tag: Tag
  className?: string
}

export function TagBadge({ tag, className }: TagBadgeProps) {
  return (
    <Badge
      className={cn('border-0 text-white', className)}
      style={{ backgroundColor: tag.color }}
    >
      {tag.label}
    </Badge>
  )
}
