import type {
  VisitCardIconMode,
  VisitCardItem,
} from '@/lib/site-content'

export type ResolvedCell =
  | { kind: 'empty' }
  | {
      kind: 'email'
      ariaLabel: string
      iconMode: VisitCardIconMode
      fontawesomeIcon: string
      image?: string
    }
  | {
      kind: 'link'
      href: string
      ariaLabel: string
      iconMode: VisitCardIconMode
      fontawesomeIcon: string
      image?: string
    }

/** Resolve até 8 células do cartão (mesma lógica que na UI). */
export function resolveVisitCardCells(
  items: VisitCardItem[],
  latestClient: string | undefined,
  latestServer: string | null,
  devProfileFallback: string,
): ResolvedCell[] {
  const devUrl = latestClient ?? latestServer ?? devProfileFallback
  const out: ResolvedCell[] = []
  for (const item of items.slice(0, 8)) {
    if (item.linkType === 'emailContact') {
      out.push({
        kind: 'email',
        ariaLabel: item.ariaLabel || 'Email',
        iconMode: item.iconMode,
        fontawesomeIcon: item.fontawesomeIcon,
        image: item.image,
      })
      continue
    }
    if (item.linkType === 'latestDevArticle') {
      out.push({
        kind: 'link',
        href: devUrl,
        ariaLabel: item.ariaLabel || 'DEV',
        iconMode: item.iconMode,
        fontawesomeIcon: item.fontawesomeIcon,
        image: item.image,
      })
      continue
    }
    const href = item.url.trim()
    if (!href) {
      out.push({ kind: 'empty' })
      continue
    }
    out.push({
      kind: 'link',
      href,
      ariaLabel: item.ariaLabel || 'Link',
      iconMode: item.iconMode,
      fontawesomeIcon: item.fontawesomeIcon,
      image: item.image,
    })
  }
  while (out.length < 8) {
    out.push({ kind: 'empty' })
  }
  return out.slice(0, 8)
}
