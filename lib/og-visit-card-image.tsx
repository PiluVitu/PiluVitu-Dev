/* eslint-disable @next/next/no-img-element -- ImageResponse (Satori) só suporta <img> */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { getLatestDevToArticleUrl } from '@/lib/dev-to'
import {
  getSiteProfile,
  getVisitCard,
  VISIT_CARD_FALLBACK,
  type SiteProfileContent,
} from '@/lib/site-content'
import {
  resolveVisitCardCells,
  type ResolvedCell,
} from '@/lib/visit-card-cells'

export const alt =
  'Cartão de visita — foto, grelha de links e @piluvitu | piluvitu.dev'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

/** Alinhado a `app/(site)/page.tsx` — avatar quando o CMS não devolve perfil. */
const FALLBACK_PROFILE: Pick<
  SiteProfileContent,
  'avatarSrc' | 'avatarAlt' | 'displayName'
> = {
  displayName: 'Paulo Victor Torres Silva',
  avatarSrc: '/profile-2.jpg',
  avatarAlt: 'Paulo Victor Profile Pic',
}

const BRAND_BG_BY_FA: Record<string, string> = {
  brands__instagram: '#E4405F',
  brands__github: '#24292f',
  brands__gitlab: '#fc6d26',
  brands__dev: '#0a0a0a',
  brands__linkedin: '#0A66C2',
  brands__linkedinIn: '#0A66C2',
  brands__xTwitter: '#000000',
  brands__twitter: '#1d9bf0',
  brands__tiktok: '#000000',
  brands__youtube: '#ff0000',
  brands__discord: '#5865F2',
  brands__reddit: '#ff4500',
  brands__slack: '#4a154b',
  brands__twitch: '#9146ff',
  brands__whatsapp: '#25d366',
  brands__telegram: '#26a5e4',
  brands__facebook: '#1877f2',
  brands__docker: '#2496ed',
  brands__stackOverflow: '#f48024',
  brands__medium: '#000000',
  brands__google: '#4285f4',
  brands__apple: '#000000',
  brands__mastodon: '#6364ff',
  brands__pinterest: '#bd081c',
  brands__threads: '#000000',
  solid__envelope: '#f4f4f5',
  solid__link: '#fafafa',
  solid__globe: '#fafafa',
  solid__rss: '#f97316',
  solid__house: '#fafafa',
  solid__briefcase: '#fafafa',
  solid__code: '#fafafa',
}

function getMetadataBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, '')}`
  return 'https://piluvitu.dev'
}

function absolutizeAsset(path: string, base: string): string {
  const p = path.trim()
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  return new URL(p.startsWith('/') ? p : `/${p}`, `${base}/`).href
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

function extFromPath(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

/** Paths em `/public` viram data URL no build (evita depender de fetch ao domínio de produção). */
async function resolveOgAssetUrl(path: string, base: string): Promise<string> {
  const p = path.trim()
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  if (p.startsWith('/')) {
    try {
      const full = join(process.cwd(), 'public', p.replace(/^\//, ''))
      const buf = await readFile(full)
      const ext = extFromPath(p)
      const mime = MIME_BY_EXT[ext] ?? 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return absolutizeAsset(p, base)
    }
  }
  return absolutizeAsset(p, base)
}

function faviconUrlForHostname(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`
}

function resolveHostnameForCell(cell: ResolvedCell): string | null {
  if (cell.kind === 'empty') return null
  if (cell.iconMode === 'image' && cell.image?.trim()) {
    try {
      return new URL(cell.image.trim()).hostname
    } catch {
      return null
    }
  }
  if (cell.kind === 'link') {
    try {
      return new URL(cell.href).hostname
    } catch {
      return null
    }
  }
  if (cell.kind === 'email') {
    return 'mail.google.com'
  }
  return null
}

function brandBackgroundForFa(faKey: string): string {
  return BRAND_BG_BY_FA[faKey] ?? '#fafafa'
}

function OgGridCell({
  cell,
  baseUrl,
  resolvedImageSrc,
}: {
  cell: ResolvedCell
  baseUrl: string
  resolvedImageSrc: string | null
}) {
  const dim = 80
  if (cell.kind === 'empty') {
    return (
      <div
        style={{
          width: dim,
          height: dim,
          borderRadius: 16,
          backgroundColor: '#d4d4d8',
        }}
      />
    )
  }

  const bg = brandBackgroundForFa(cell.fontawesomeIcon)

  if (cell.iconMode === 'image' && cell.image?.trim()) {
    const src = resolvedImageSrc ?? absolutizeAsset(cell.image.trim(), baseUrl)
    return (
      <div
        style={{
          width: dim,
          height: dim,
          borderRadius: 16,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#e4e4e7',
          backgroundColor: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img src={src} width={48} height={48} alt="" />
      </div>
    )
  }

  const host = resolveHostnameForCell(cell)
  const fav = host ? faviconUrlForHostname(host) : null

  return (
    <div
      style={{
        width: dim,
        height: dim,
        borderRadius: 16,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: '#00000014',
        backgroundColor: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {fav ? (
        <img src={fav} width={40} height={40} alt="" />
      ) : (
        <span style={{ color: '#52525b', fontSize: 22 }}>·</span>
      )}
    </div>
  )
}

function VisitCardLogoOg() {
  return (
    <svg width="28" height="28" viewBox="0 0 22 22" aria-hidden>
      <rect x="1" y="9" width="7" height="7" rx="1" fill="#0a0a0a" />
      <rect x="9" y="9" width="7" height="7" rx="1" fill="#0a0a0a" />
      <rect x="9" y="1" width="7" height="7" rx="1" fill="#0a0a0a" />
    </svg>
  )
}

export default async function Image() {
  const baseUrl = getMetadataBaseUrl()
  const [siteProfile, visitCardRaw, latestArticle] = await Promise.all([
    getSiteProfile(),
    getVisitCard(),
    getLatestDevToArticleUrl(),
  ])

  const profile: Pick<SiteProfileContent, 'avatarSrc' | 'avatarAlt'> =
    siteProfile ?? FALLBACK_PROFILE
  const visitCard = visitCardRaw ?? VISIT_CARD_FALLBACK
  const devToUsername =
    process.env.NEXT_PUBLIC_DEVTO_USERNAME?.trim() || 'piluvitu'
  const devProfileFallback = `https://dev.to/${devToUsername}`

  const cells = resolveVisitCardCells(
    visitCard.items,
    undefined,
    latestArticle,
    devProfileFallback,
  )

  const handleText =
    visitCard.handle.trim() ||
    process.env.NEXT_PUBLIC_VISIT_CARD_HANDLE?.trim() ||
    devToUsername

  const avatarSrc = await resolveOgAssetUrl(profile.avatarSrc, baseUrl)

  const resolvedCellImages = await Promise.all(
    cells.map(async (cell) => {
      if (
        cell.kind !== 'empty' &&
        cell.iconMode === 'image' &&
        cell.image?.trim()
      ) {
        return resolveOgAssetUrl(cell.image.trim(), baseUrl)
      }
      return null
    }),
  )

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#062c1e',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRadius: 28,
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: '#e4e4e7',
          padding: 40,
          width: 920,
          boxShadow:
            '0 25px 50px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0,0,0,0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            width: '100%',
          }}
        >
          <img
            src={avatarSrc}
            width={192}
            height={192}
            alt=""
            style={{
              borderRadius: 9999,
              flexShrink: 0,
              objectFit: 'cover',
            }}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginLeft: 28,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 12,
              }}
            >
              {cells.slice(0, 4).map((cell, i) => (
                <OgGridCell
                  key={i}
                  cell={cell}
                  baseUrl={baseUrl}
                  resolvedImageSrc={resolvedCellImages[i] ?? null}
                />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: 12,
              }}
            >
              {cells.slice(4, 8).map((cell, i) => (
                <OgGridCell
                  key={i + 4}
                  cell={cell}
                  baseUrl={baseUrl}
                  resolvedImageSrc={resolvedCellImages[i + 4] ?? null}
                />
              ))}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 32,
            width: '100%',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 40,
              fontWeight: 700,
              color: '#0a0a0a',
              letterSpacing: -0.5,
            }}
          >
            {handleText}
          </p>
          <VisitCardLogoOg />
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  )
}
