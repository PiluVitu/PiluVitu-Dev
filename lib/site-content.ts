import 'server-only'

import { createReader } from '@keystatic/core/reader'
import keystaticConfig from '../keystatic.config'
import type { Carreira } from '@/mocks/carreira'
import type { Project } from '@/mocks/projects'
import type { Social } from '@/mocks/social'
import { draftMode } from 'next/headers'
import { unstable_noStore as noStore } from 'next/cache'

const reader = createReader(process.cwd(), keystaticConfig)

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

function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

export async function getSiteProfile(): Promise<SiteProfileContent | null> {
  await skipCacheWhenDraft()
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

export async function getSocials(): Promise<Social[]> {
  await skipCacheWhenDraft()
  const items = await reader.collections.socials.all()
  const mapped = items.map(({ slug, entry }) => {
    const image = (entry.image ?? '').trim()
    return {
      id: slug,
      socialDescription: entry.socialDescription,
      socialLink: entry.socialLink,
      image: image ? image : undefined,
      altImage: entry.altImage,
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
    }),
  )
}

export async function getCarreiras(): Promise<Carreira[]> {
  await skipCacheWhenDraft()
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
