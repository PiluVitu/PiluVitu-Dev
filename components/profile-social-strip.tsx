import { EmailContactDialog } from '@/components/email-contact-dialog'
import { getVisitCardFaIcon } from '@/lib/visit-card-fontawesome'
import { cn } from '@/lib/utils'
import type { Social } from '@/mocks/social'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Image from 'next/image'
import Link from 'next/link'

const squircleClass =
  'inline-flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

function StripGlyph({ social }: { social: Social }) {
  if (social.iconMode === 'image' && social.image?.trim()) {
    return (
      <span className="relative block size-7">
        <Image
          src={social.image.trim()}
          alt=""
          fill
          className="object-contain"
          sizes="28px"
        />
      </span>
    )
  }

  const def =
    getVisitCardFaIcon(social.fontawesomeIcon) ??
    getVisitCardFaIcon('solid__link')
  if (!def) {
    return (
      <span className="text-xs font-bold text-muted-foreground">
        {social.altImage}
      </span>
    )
  }

  return (
    <FontAwesomeIcon
      icon={def}
      className="size-7 text-foreground"
      aria-hidden
    />
  )
}

type ProfileSocialStripProps = {
  socials: Social[]
}

export function ProfileSocialStrip({ socials }: ProfileSocialStripProps) {
  const emailIcon =
    getVisitCardFaIcon('solid__envelope') ?? getVisitCardFaIcon('solid__link')

  return (
    <nav
      aria-label="Redes sociais e contato"
      className="flex flex-wrap gap-2 pt-4"
    >
      {socials.map((social) => (
        <Link
          key={social.id}
          href={social.socialLink}
          rel="noopener noreferrer"
          target="_blank"
          className={squircleClass}
          aria-label={social.socialDescription}
        >
          <StripGlyph social={social} />
        </Link>
      ))}
      <EmailContactDialog>
        <button
          type="button"
          className={cn(squircleClass, 'cursor-pointer')}
          aria-label="Enviar mensagem por email"
        >
          {emailIcon ? (
            <FontAwesomeIcon
              icon={emailIcon}
              className="size-7 text-foreground"
              aria-hidden
            />
          ) : null}
        </button>
      </EmailContactDialog>
    </nav>
  )
}
