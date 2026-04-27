'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useKanbanStore } from '@/hooks/use-kanban-store'
import { Card } from '@/lib/kanban-schema'
import { BoardHeader } from './board-header'
import { KanbanColumn } from './kanban-column'
import { KanbanCard } from './kanban-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlusIcon } from '@radix-ui/react-icons'

export function KanbanBoard() {
  const { state, dispatch } = useKanbanStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnTitle, setNewColumnTitle] = useState('')

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
    }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  const activeCard: Card | null =
    activeId && state.cards[activeId] ? state.cards[activeId] : null

  const activeCardColumnId = useMemo(() => {
    if (!activeCard) return null
    return (
      Object.entries(state.columns).find(([, col]) =>
        col.cardIds.includes(activeCard.id),
      )?.[0] ?? null
    )
  }, [activeCard, state.columns])

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null)
    if (!over) return

    const activeData = active.data.current as {
      type: 'column' | 'card'
      columnId?: string
    }
    const overData = over.data.current as {
      type?: 'column' | 'card'
      columnId?: string
    }

    if (activeData.type === 'column') {
      if (active.id === over.id) return
      const oldIndex = state.columnOrder.indexOf(active.id as string)
      const newIndex = state.columnOrder.indexOf(over.id as string)
      if (oldIndex !== newIndex) {
        dispatch({
          type: 'REORDER_COLUMNS',
          columnOrder: arrayMove(state.columnOrder, oldIndex, newIndex),
        })
      }
      return
    }

    if (activeData.type === 'card') {
      const fromColumnId = activeData.columnId!
      let toColumnId: string
      let toIndex: number

      if (overData?.type === 'card') {
        toColumnId = overData.columnId!
        toIndex = state.columns[toColumnId].cardIds.indexOf(over.id as string)
      } else if (overData?.type === 'column') {
        toColumnId = over.id as string
        toIndex = state.columns[toColumnId].cardIds.length
      } else {
        return
      }

      const currentIndex = state.columns[fromColumnId].cardIds.indexOf(
        active.id as string,
      )
      if (fromColumnId === toColumnId && currentIndex === toIndex) return

      dispatch({
        type: 'MOVE_CARD',
        cardId: active.id as string,
        fromColumnId,
        toColumnId,
        toIndex,
      })
    }
  }

  function handleAddColumn() {
    const title = newColumnTitle.trim()
    if (!title) return
    dispatch({ type: 'ADD_COLUMN', title })
    setNewColumnTitle('')
    setAddingColumn(false)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <BoardHeader state={state} dispatch={dispatch} />

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        <SortableContext
          items={state.columnOrder}
          strategy={horizontalListSortingStrategy}
        >
          {state.columnOrder.map((columnId) => {
            const column = state.columns[columnId]
            if (!column) return null
            const cards = column.cardIds
              .map((id) => state.cards[id])
              .filter(Boolean)
            return (
              <KanbanColumn
                key={columnId}
                column={column}
                cards={cards}
                tags={state.tags}
                onTitleChange={(title) =>
                  dispatch({ type: 'UPDATE_COLUMN_TITLE', columnId, title })
                }
                onDelete={() => dispatch({ type: 'DELETE_COLUMN', columnId })}
                onAddCard={(data) =>
                  dispatch({ type: 'ADD_CARD', columnId, ...data })
                }
                onUpdateCard={(card) => dispatch({ type: 'UPDATE_CARD', card })}
                onDeleteCard={(cardId) =>
                  dispatch({ type: 'DELETE_CARD', cardId, columnId })
                }
              />
            )
          })}
        </SortableContext>

        <div className="w-72 shrink-0">
          {addingColumn ? (
            <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-3">
              <Input
                autoFocus
                placeholder="Título da coluna"
                value={newColumnTitle}
                onChange={(e) => setNewColumnTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddColumn()
                  if (e.key === 'Escape') setAddingColumn(false)
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddColumn}>
                  Adicionar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingColumn(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="text-muted-foreground w-full border-dashed"
              onClick={() => setAddingColumn(true)}
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Nova coluna
            </Button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeCard && activeCardColumnId && (
          <KanbanCard
            card={activeCard}
            columnId={activeCardColumnId}
            tags={state.tags}
            onClick={() => {}}
            isDragOverlay
          />
        )}
        {activeId && state.columns[activeId] && (
          <div className="bg-muted/50 h-16 w-72 rounded-lg border opacity-80" />
        )}
      </DragOverlay>
    </DndContext>
  )
}
