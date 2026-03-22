import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getVisitCardFaIcon } from '@/lib/visit-card-fontawesome'
import { cn } from '@/lib/utils'
import { Social } from '@/mocks/social'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'

type SocialCardProps = Social & {
  /** Cartão quadrado na grelha bento (estilo Kasbu / link-in-bio). */
  variant?: 'default' | 'bento'
}

export function SocialCard(props: SocialCardProps) {
  const { variant = 'default', ...social } = props

  const useImage = social.iconMode === 'image' && Boolean(social.image?.trim())
  const faDef = !useImage
    ? (getVisitCardFaIcon(social.fontawesomeIcon) ??
      getVisitCardFaIcon('solid__link'))
    : undefined

  return (
    <Button
      variant="outline"
      className={cn(
        'flex items-center justify-start gap-5 p-4',
        variant === 'bento'
          ? 'h-full min-h-[132px] w-full flex-col items-center justify-center gap-3 rounded-3xl text-center text-sm leading-snug xl:min-h-[148px]'
          : 'h-fit xl:h-48 xl:w-48 xl:flex-col xl:items-start xl:py-8',
      )}
      asChild
    >
      <Link href={social.socialLink} rel="noopener noreferrer" target="_blank">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          {useImage ? (
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarImage src={social.image!} alt={social.altImage} />
              <AvatarFallback className="rounded-xl">
                {social.altImage}
              </AvatarFallback>
            </Avatar>
          ) : faDef ? (
            <FontAwesomeIcon
              icon={faDef}
              className="h-8 w-8 text-foreground"
              aria-hidden
            />
          ) : (
            <Avatar className="h-10 w-10 rounded-xl">
              <AvatarFallback className="rounded-xl">
                {social.altImage}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <p
          className={cn(
            variant === 'bento'
              ? 'line-clamp-3 w-full'
              : 'xl:h-20 xl:w-full xl:text-left xl:text-wrap',
          )}
        >
          {social.socialDescription}
        </p>
      </Link>
    </Button>
  )
}
