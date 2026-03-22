'use client'

import { EmailContactDialog } from '@/components/email-contact-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { UseArticleData } from '@/hooks/useArticleData'
import { getVisitCardFaIcon } from '@/lib/visit-card-fontawesome'
import type {
  SiteProfileContent,
  VisitCardContent,
  VisitCardIconMode,
} from '@/lib/site-content'
import {
  resolveVisitCardCells,
  type ResolvedCell,
} from '@/lib/visit-card-cells'
import { cn } from '@/lib/utils'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useMemo, useRef, useState } from 'react'

const squircleBase =
  'inline-flex shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function CellGlyph({
  iconMode,
  fontawesomeIcon,
  image,
  sizeClass,
}: {
  iconMode: VisitCardIconMode
  fontawesomeIcon: string
  image?: string
  sizeClass: string
}) {
  if (iconMode === 'image' && image?.trim()) {
    return (
      <span className="relative block size-7">
        <Image
          src={image.trim()}
          alt=""
          fill
          className="object-contain"
          sizes="28px"
        />
      </span>
    )
  }

  const def =
    getVisitCardFaIcon(fontawesomeIcon) ?? getVisitCardFaIcon('solid__link')
  if (!def) return null
  return (
    <FontAwesomeIcon
      icon={def}
      className={cn('text-foreground', sizeClass)}
      aria-hidden
    />
  )
}

function VisitCardLogo({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      className={className}
      aria-hidden
    >
      <rect x="1" y="9" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="9" y="1" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  )
}

function GridCellButton({
  cell,
  sizeClass,
}: {
  cell: ResolvedCell
  sizeClass: string
}) {
  const cellClass = cn(squircleBase, sizeClass)

  if (cell.kind === 'empty') {
    return (
      <div
        className={cn(
          cellClass,
          'bg-muted/70 pointer-events-none border-transparent',
        )}
        aria-hidden
      />
    )
  }

  if (cell.kind === 'email') {
    return (
      <EmailContactDialog>
        <button
          type="button"
          className={cn(cellClass, 'cursor-pointer')}
          aria-label={cell.ariaLabel}
        >
          <CellGlyph
            iconMode={cell.iconMode}
            fontawesomeIcon={cell.fontawesomeIcon}
            image={cell.image}
            sizeClass="size-7"
          />
        </button>
      </EmailContactDialog>
    )
  }

  const { href, ariaLabel, iconMode, fontawesomeIcon, image } = cell
  return (
    <Link
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      className={cellClass}
      aria-label={ariaLabel}
    >
      <CellGlyph
        iconMode={iconMode}
        fontawesomeIcon={fontawesomeIcon}
        image={image}
        sizeClass="size-7"
      />
    </Link>
  )
}

function VisitCardSurface({
  profile,
  cells,
  handleText,
}: {
  profile: SiteProfileContent
  cells: ResolvedCell[]
  handleText: string
}) {
  return (
    <div
      className={cn(
        'border-border bg-card text-card-foreground w-full rounded-3xl border p-6 shadow-md sm:p-8',
      )}
    >
      <div className="flex flex-row items-start gap-3 sm:gap-4">
        <Avatar className="h-28 w-28 shrink-0 rounded-full">
          <AvatarImage src={profile.avatarSrc} alt={profile.avatarAlt} />
          <AvatarFallback className="rounded-full">PV</AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 grid-cols-4 grid-rows-2 gap-1.5 sm:gap-2">
          {cells.map((cell, i) => (
            <GridCellButton key={i} cell={cell} sizeClass="size-12" />
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-foreground text-lg font-semibold tracking-tight">
          {handleText}
        </p>
        <VisitCardLogo className="text-foreground shrink-0" />
      </div>
    </div>
  )
}

type ProfileVisitCardProps = {
  profile: SiteProfileContent
  visitCard: VisitCardContent
  latestDevArticleUrl: string | null
}

/** Avatar da bio (estilo original) + triplo clique abre o cartão de visita em 3D. */
export function ProfileVisitCard({
  profile,
  visitCard,
  latestDevArticleUrl,
}: ProfileVisitCardProps) {
  const devToUsername =
    process.env.NEXT_PUBLIC_DEVTO_USERNAME?.trim() || 'piluvitu'
  const { data: articles } = UseArticleData()
  const articleUrl = articles?.[0]?.url
  const devProfileFallback = `https://dev.to/${devToUsername}`

  const cells = useMemo(
    () =>
      resolveVisitCardCells(
        visitCard.items,
        articleUrl,
        latestDevArticleUrl,
        devProfileFallback,
      ),
    [visitCard.items, articleUrl, latestDevArticleUrl, devProfileFallback],
  )

  const handleText =
    visitCard.handle.trim() ||
    process.env.NEXT_PUBLIC_VISIT_CARD_HANDLE?.trim() ||
    devToUsername

  const [open3d, setOpen3d] = useState(false)
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onAvatarClick = useCallback(() => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickCountRef.current += 1
    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0
      setOpen3d(true)
      return
    }
    clickTimerRef.current = setTimeout(() => {
      clickCountRef.current = 0
    }, 650)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={onAvatarClick}
        className="ring-offset-background focus-visible:ring-ring mb-2 shrink-0 cursor-pointer rounded-xl transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Foto de perfil — triplo clique para abrir o cartão de visita"
      >
        <Avatar className="flex h-24 w-24 rounded-xl">
          <AvatarImage src={profile.avatarSrc} alt={profile.avatarAlt} />
          <AvatarFallback className="rounded-xl">PV</AvatarFallback>
        </Avatar>
      </button>

      <Dialog open={open3d} onOpenChange={setOpen3d}>
        <DialogContent className="max-w-[min(92vw,460px)] border-0 bg-transparent p-6 shadow-none sm:p-8">
          <DialogTitle className="sr-only">Cartão de visita em 3D</DialogTitle>
          <div className="w-full perspective-[1400px]">
            <div
              className="animate-visit-card-3d mx-auto w-full max-w-[400px] will-change-transform [transform-style:preserve-3d]"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <VisitCardSurface
                profile={profile}
                cells={cells}
                handleText={handleText}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
