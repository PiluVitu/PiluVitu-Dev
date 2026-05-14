import { z } from 'zod'

export type Tag = {
  id: string
  label: string
  color: string
}

export type CardLink = {
  url: string
  label?: string
}

export type Card = {
  id: string
  title: string
  description?: string
  links: CardLink[]
  tagIds: string[]
  createdAt: string
}

export type Column = {
  id: string
  title: string
  cardIds: string[]
}

export type KanbanState = {
  columnOrder: string[]
  columns: Record<string, Column>
  cards: Record<string, Card>
  tags: Record<string, Tag>
}

const CardLinkSchema = z.object({
  url: z.string(),
  label: z.string().optional(),
})

const CardSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  links: z.array(CardLinkSchema),
  tagIds: z.array(z.string()),
  createdAt: z.string(),
})

const ColumnSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  cardIds: z.array(z.string()),
})

const TagSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  color: z.string(),
})

export const KanbanStateSchema = z.object({
  columnOrder: z.array(z.string()),
  columns: z.record(z.string(), ColumnSchema),
  cards: z.record(z.string(), CardSchema),
  tags: z.record(z.string(), TagSchema),
})

export const INITIAL_STATE: KanbanState = {
  columnOrder: [],
  columns: {},
  cards: {},
  tags: {},
}

export const TAG_COLORS: string[] = [
  'hsl(220 70% 50%)',
  'hsl(142 70% 45%)',
  'hsl(38 92% 50%)',
  'hsl(0 72% 51%)',
  'hsl(270 70% 60%)',
  'hsl(186 64% 49%)',
  'hsl(24 75% 55%)',
  'hsl(330 65% 55%)',
  'hsl(160 60% 45%)',
  'hsl(55 80% 50%)',
]
