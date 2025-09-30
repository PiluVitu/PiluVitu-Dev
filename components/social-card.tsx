import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Social } from '@/mocks/social'
import Link from 'next/link'

export function SocialCard(props: Social) {
  return (
    <Button
      variant="outline"
      className="flex h-fit items-center justify-start gap-5 p-4 xl:h-48 xl:w-48 xl:flex-col xl:items-start xl:py-8"
      asChild
    >
      <Link href={props.socialLink} rel="noopener noreferrer" target="_blank">
        <Avatar className="flex h-10 w-10 shrink-0 rounded-xl">
          {props.image && (
            <AvatarImage src={props.image} alt={props.altImage} />
          )}
          <AvatarFallback className="rounded-xl">
            {props.altImage}
          </AvatarFallback>
        </Avatar>
        <p className="xl:h-20 xl:w-full xl:text-left xl:text-wrap">
          {props.socialDescription}
        </p>
      </Link>
    </Button>
  )
}
