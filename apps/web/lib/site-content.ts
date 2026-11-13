import 'server-only'

import { getKeystaticReader } from '@/lib/keystatic-reader'
import type { Carreira } from '@/mocks/carreira'
import type { ItemPiluLabs } from '@/lib/pilulabs'
import type { FeedSource } from '@/mocks/feeds'
import type { Social } from '@/mocks/social'
import {
  carreirasDoCms,
  perfilDoCms,
  piluLabsDoCms,
  socialsDoCms,
} from '@/lib/conteudo-do-cms'
import { previewAtivo } from '@/lib/preview'
import { unstable_noStore as noStore } from 'next/cache'

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalizeHexColor(
  raw: string | undefined | null,
  fallback: string,
): string {
  const s = (raw ?? '').trim()
  return HEX_COLOR.test(s) ? s : fallback
}

async function skipCacheWhenDraft(): Promise<void> {
  if (await previewAtivo()) {
    noStore()
  }
}

export type SiteProfileContent = {
  displayName: string
  avatarSrc: string
  avatarAlt: string
  roleHighlight: string
  companyName: string
  companyLink: string
  /** Cor do nome da empresa (hex), ex. #4a65fc */
  companyLinkColor: string
  bio: string
  availabilityOpen: boolean
  availabilityLabel: string
  location: string
  disciplines: string[]
}

export type VisitCardLinkType = 'manual' | 'latestDevArticle' | 'emailContact'

export type VisitCardIconMode = 'fontawesome' | 'image'

export type VisitCardItem = {
  ariaLabel: string
  linkType: VisitCardLinkType
  url: string
  iconMode: VisitCardIconMode
  /** Chave do mapa em `lib/visit-card-fontawesome.ts` */
  fontawesomeIcon: string
  image?: string
}

export type VisitCardContent = {
  handle: string
  items: VisitCardItem[]
}

/** Se o singleton `visitCard` não existir no CMS. */
export const VISIT_CARD_FALLBACK: VisitCardContent = {
  handle: 'piluvitu',
  items: [
    {
      ariaLabel: 'Último artigo no DEV',
      linkType: 'latestDevArticle',
      url: '',
      iconMode: 'fontawesome',
      fontawesomeIcon: 'brands__dev',
    },
  ],
}

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

export async function getSiteProfile(): Promise<SiteProfileContent | null> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  const data = await reader.singletons.siteProfile.read()
  return data ? perfilDoCms(data) : null
}

export async function getVisitCard(): Promise<VisitCardContent | null> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  const data = await reader.singletons.visitCard.read()
  if (!data) return null

  const rawItems = [...data.items]
  const items: VisitCardItem[] = rawItems.slice(0, 8).map((row) => {
    const linkType = row.linkType as VisitCardLinkType
    const iconMode = row.iconMode as VisitCardIconMode
    const image = (row.image ?? '').trim()
    return {
      ariaLabel: (row.ariaLabel ?? '').trim(),
      linkType:
        linkType === 'latestDevArticle' ||
        linkType === 'emailContact' ||
        linkType === 'manual'
          ? linkType
          : 'manual',
      url: (row.url ?? '').trim(),
      iconMode: iconMode === 'image' ? 'image' : 'fontawesome',
      fontawesomeIcon: (row.fontawesomeIcon ?? 'brands__github').trim(),
      image: image ? image : undefined,
    }
  })

  return {
    handle: (data.handle ?? '').trim() || 'piluvitu',
    items,
  }
}

export async function getSocials(): Promise<Social[]> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  return socialsDoCms(await reader.collections.socials.all())
}

export async function getCarreiras(): Promise<Carreira[]> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  return carreirasDoCms(await reader.collections.carreiras.all())
}

export async function getFeeds(): Promise<FeedSource[]> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  const items = await reader.collections.feeds.all()
  const mapped = items.map(({ slug, entry }) => ({
    id: slug,
    name: entry.name,
    url: (entry.url ?? '').trim(),
    siteUrl: (entry.siteUrl ?? '').trim() || undefined,
    category: (entry.category ?? '').trim() || undefined,
    accentColor: normalizeHexColor(entry.accentColor, '#64748b'),
    order: entry.order ?? 0,
    enabled: entry.enabled ?? true,
  }))
  return sortByOrder(mapped)
}

export async function getPiluLabs(): Promise<ItemPiluLabs[]> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  return piluLabsDoCms(await reader.collections.pilulabs.all())
}
