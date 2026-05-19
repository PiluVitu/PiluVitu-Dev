'use client'

import { useEffect, useReducer } from 'react'
import { nanoid } from 'nanoid'
import {
  Card,
  CardLink,
  INITIAL_STATE,
  KanbanState,
  KanbanStateSchema,
  Tag,
} from '@/lib/kanban-schema'

export type Action =
  | { type: 'ADD_COLUMN'; title: string }
  | { type: 'UPDATE_COLUMN_TITLE'; columnId: string; title: string }
  | { type: 'DELETE_COLUMN'; columnId: string }
  | { type: 'REORDER_COLUMNS'; columnOrder: string[] }
  | {
      type: 'ADD_CARD'
      columnId: string
      title: string
      description?: string
      links: CardLink[]
      tagIds: string[]
    }
  | { type: 'UPDATE_CARD'; card: Card }
  | { type: 'DELETE_CARD'; cardId: string; columnId: string }
  | {
      type: 'MOVE_CARD'
      cardId: string
      fromColumnId: string
      toColumnId: string
      toIndex: number
    }
  | { type: 'ADD_TAG'; label: string; color: string }
  | { type: 'UPDATE_TAG'; tag: Tag }
  | { type: 'DELETE_TAG'; tagId: string }
  | { type: 'IMPORT_STATE'; state: KanbanState }
  | { type: 'RESET_STATE' }

const STORAGE_KEY = 'kanban-state'

function reducer(state: KanbanState, action: Action): KanbanState {
  switch (action.type) {
    case 'ADD_COLUMN': {
      const id = nanoid()
      return {
        ...state,
        columnOrder: [...state.columnOrder, id],
        columns: {
          ...state.columns,
          [id]: { id, title: action.title, cardIds: [] },
        },
      }
    }

    case 'UPDATE_COLUMN_TITLE': {
      return {
        ...state,
        columns: {
          ...state.columns,
          [action.columnId]: {
            ...state.columns[action.columnId],
            title: action.title,
          },
        },
      }
    }

    case 'DELETE_COLUMN': {
      const column = state.columns[action.columnId]
      const newCards = { ...state.cards }
      column.cardIds.forEach((id) => delete newCards[id])
      const newColumns = { ...state.columns }
      delete newColumns[action.columnId]
      return {
        ...state,
        columnOrder: state.columnOrder.filter((id) => id !== action.columnId),
        columns: newColumns,
        cards: newCards,
      }
    }

    case 'REORDER_COLUMNS': {
      return { ...state, columnOrder: action.columnOrder }
    }

    case 'ADD_CARD': {
      const id = nanoid()
      const card: Card = {
        id,
        title: action.title,
        description: action.description,
        links: action.links,
        tagIds: action.tagIds,
        createdAt: new Date().toISOString(),
      }
      return {
        ...state,
        cards: { ...state.cards, [id]: card },
        columns: {
          ...state.columns,
          [action.columnId]: {
            ...state.columns[action.columnId],
            cardIds: [...state.columns[action.columnId].cardIds, id],
          },
        },
      }
    }

    case 'UPDATE_CARD': {
      return {
        ...state,
        cards: { ...state.cards, [action.card.id]: action.card },
      }
    }

    case 'DELETE_CARD': {
      const newCards = { ...state.cards }
      delete newCards[action.cardId]
      return {
        ...state,
        cards: newCards,
        columns: {
          ...state.columns,
          [action.columnId]: {
            ...state.columns[action.columnId],
            cardIds: state.columns[action.columnId].cardIds.filter(
              (id) => id !== action.cardId,
            ),
          },
        },
      }
    }

    case 'MOVE_CARD': {
      const { cardId, fromColumnId, toColumnId, toIndex } = action
      const fromCardIds = state.columns[fromColumnId].cardIds.filter(
        (id) => id !== cardId,
      )

      if (fromColumnId === toColumnId) {
        const newCardIds = [...fromCardIds]
        newCardIds.splice(toIndex, 0, cardId)
        return {
          ...state,
          columns: {
            ...state.columns,
            [fromColumnId]: {
              ...state.columns[fromColumnId],
              cardIds: newCardIds,
            },
          },
        }
      }

      const toCardIds = [...state.columns[toColumnId].cardIds]
      toCardIds.splice(toIndex, 0, cardId)
      return {
        ...state,
        columns: {
          ...state.columns,
          [fromColumnId]: {
            ...state.columns[fromColumnId],
            cardIds: fromCardIds,
          },
          [toColumnId]: {
            ...state.columns[toColumnId],
            cardIds: toCardIds,
          },
        },
      }
    }

    case 'ADD_TAG': {
      const id = nanoid()
      return {
        ...state,
        tags: {
          ...state.tags,
          [id]: { id, label: action.label, color: action.color },
        },
      }
    }

    case 'UPDATE_TAG': {
      return {
        ...state,
        tags: { ...state.tags, [action.tag.id]: action.tag },
      }
    }

    case 'DELETE_TAG': {
      const newTags = { ...state.tags }
      delete newTags[action.tagId]
      const newCards = Object.fromEntries(
        Object.entries(state.cards).map(([id, card]) => [
          id,
          {
            ...card,
            tagIds: card.tagIds.filter((tid) => tid !== action.tagId),
          },
        ]),
      )
      return { ...state, tags: newTags, cards: newCards }
    }

    case 'IMPORT_STATE': {
      return action.state
    }

    case 'RESET_STATE': {
      return INITIAL_STATE
    }

    default:
      return state
  }
}

function loadState(): KanbanState {
  if (typeof window === 'undefined') return INITIAL_STATE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL_STATE
    const result = KanbanStateSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : INITIAL_STATE
  } catch {
    return INITIAL_STATE
  }
}

export function useKanbanStore() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  return { state, dispatch }
}
