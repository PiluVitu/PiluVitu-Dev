import 'server-only'

import { getKeystaticReader } from '@/lib/keystatic-reader'
import type { Carreira } from '@/mocks/carreira'
import type { Project } from '@/mocks/projects'
import { SOCIAL_SLUG_DEFAULT_FA } from '@/lib/social-default-fa'
import type { Social, SocialIconMode } from '@/mocks/social'
import { draftMode } from 'next/headers'
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
  const { isEnabled } = await draftMode()
  if (isEnabled) {
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
  if (!data) return null
  const entry = data as typeof data & { companyLinkColor?: string }
  return {
    displayName: entry.displayName,
    avatarSrc: entry.avatarSrc,
    avatarAlt: entry.avatarAlt,
    roleHighlight: entry.roleHighlight,
    companyName: entry.companyName,
    companyLink: entry.companyLink,
    companyLinkColor: normalizeHexColor(entry.companyLinkColor, '#4a65fc'),
    bio: entry.bio,
  }
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
  const items = await reader.collections.socials.all()
  const mapped = items.map(({ slug, entry }) => {
    const image = (entry.image ?? '').trim()
    const iconMode = (
      entry.iconMode === 'image' ? 'image' : 'fontawesome'
    ) as SocialIconMode
    const faRaw = (entry.fontawesomeIcon ?? '').trim()
    const fontawesomeIcon =
      faRaw || SOCIAL_SLUG_DEFAULT_FA[slug] || 'solid__link'
    return {
      id: slug,
      socialDescription: entry.socialDescription,
      socialLink: entry.socialLink,
      image: image ? image : undefined,
      altImage: entry.altImage,
      iconMode,
      fontawesomeIcon,
      order: entry.order ?? 0,
    }
  })
  return sortByOrder(mapped).map(
    (row): Social => ({
      id: row.id,
      socialDescription: row.socialDescription,
      socialLink: row.socialLink,
      image: row.image,
      altImage: row.altImage,
      iconMode: row.iconMode,
      fontawesomeIcon: row.fontawesomeIcon,
    }),
  )
}

export async function getCarreiras(): Promise<Carreira[]> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  const items = await reader.collections.carreiras.all()
  const mapped = items.map(({ slug, entry }) => {
    const image = (entry.image ?? '').trim()
    return {
      id: slug,
      orgName: entry.orgName,
      orgDescription: entry.orgDescription,
      orgLink: entry.orgLink,
      image: image ? image : undefined,
      altImage: entry.altImage,
      title: entry.title,
      role: entry.role,
      location: entry.location,
      date: entry.date,
      atribuitions: [...entry.atribuitions],
      order: entry.order ?? 0,
    }
  })
  return sortByOrder(mapped).map(
    (row): Carreira => ({
      id: row.id,
      orgName: row.orgName,
      orgDescription: row.orgDescription,
      orgLink: row.orgLink,
      image: row.image,
      altImage: row.altImage,
      title: row.title,
      role: row.role,
      location: row.location,
      date: row.date,
      atribuitions: row.atribuitions,
    }),
  )
}

export async function getProjects(): Promise<Project[]> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  const items = await reader.collections.projects.all()
  const mapped = items.map(({ slug, entry }) => {
    const image = (entry.image ?? '').trim()
    return {
      id: slug,
      projectName: entry.projectName,
      projectLogo: entry.projectLogo,
      description: entry.description,
      tags: [...entry.tags],
      deployLink: (entry.deployLink ?? '').trim(),
      repoLink: (entry.repoLink ?? '').trim(),
      image: image ? image : undefined,
      altImage: entry.altImage,
      order: entry.order ?? 0,
    }
  })
  return sortByOrder(mapped).map(
    (row): Project => ({
      id: row.id,
      projectName: row.projectName,
      projectLogo: row.projectLogo,
      description: row.description,
      tags: row.tags,
      deployLink: row.deployLink,
      repoLink: row.repoLink,
      image: row.image,
      altImage: row.altImage,
    }),
  )
}
