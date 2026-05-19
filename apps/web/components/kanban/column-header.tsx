'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TrashIcon } from '@radix-ui/react-icons'

interface ColumnHeaderProps {
  title: string
  onTitleChange: (title: string) => void
  onDelete: () => void
}

export function ColumnHeader({
  title,
  onTitleChange,
  onDelete,
}: ColumnHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function commit() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== title) onTitleChange(trimmed)
    else setValue(title)
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2">
      {editing ? (
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setValue(title)
              setEditing(false)
            }
          }}
          className="h-7 text-sm font-semibold"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 truncate text-left text-sm font-semibold transition-opacity hover:opacity-70"
        >
          {title}
        </button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive h-7 w-7 shrink-0"
        onClick={onDelete}
        aria-label={`Deletar coluna ${title}`}
      >
        <TrashIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
