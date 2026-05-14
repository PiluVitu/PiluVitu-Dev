import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { FeedFilters } from '@/components/feed/feed-filters'

const FEEDS = [
  { id: 'devto', name: 'DEV.to', accentColor: '#3b82f6', category: 'tech' },
  {
    id: 'css-tricks',
    name: 'CSS Tricks',
    accentColor: '#f97316',
    category: 'design',
  },
  {
    id: 'blog-pessoal',
    name: 'Blog Pessoal',
    accentColor: '#a855f7',
    category: 'carreira',
  },
]

const CATEGORIES = ['tech', 'design', 'carreira']

const meta = {
  title: 'Feed/FeedFilters',
  component: FeedFilters,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    feeds: FEEDS,
    categories: CATEGORIES,
    selectedFeeds: [],
    selectedCategories: [],
    onToggleFeed: fn(),
    onToggleCategory: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof FeedFilters>

export default meta
type Story = StoryObj<typeof meta>

export const SemFiltros: Story = {}

export const ComCategoriaSelecionada: Story = {
  args: {
    selectedCategories: ['tech'],
  },
}

export const ComFeedSelecionado: Story = {
  args: {
    selectedFeeds: ['css-tricks'],
  },
}

export const MultiplosFiltros: Story = {
  args: {
    selectedCategories: ['design'],
    selectedFeeds: ['devto', 'blog-pessoal'],
  },
}

export const SemCategorias: Story = {
  args: {
    categories: [],
    feeds: FEEDS,
  },
}
