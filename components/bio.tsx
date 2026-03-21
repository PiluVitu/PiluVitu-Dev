import Link from 'next/link'
import type { SiteProfileContent } from '@/lib/site-content'
import { ModeToggle } from './mode-toggle'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Button } from './ui/button'

type BioProps = {
  profile: SiteProfileContent
}

export function Bio({ profile }: BioProps) {
  const companyHref = profile.companyLink.trim()

  return (
    <>
      <Avatar className="mb-2 flex h-24 w-24 shrink-0 rounded-xl">
        <AvatarImage src={profile.avatarSrc} alt={profile.avatarAlt} />
        <AvatarFallback className="rounded-xl">PV</AvatarFallback>
      </Avatar>
      <section>
        <ModeToggle />
      </section>
      <h1 className="text-4xl font-semibold tracking-tight">
        {profile.displayName}
      </h1>

      <section className="flex flex-col gap-2">
        <p>
          <strong className="text-lime-500">{profile.roleHighlight}</strong>
          {profile.companyName.trim() ? (
            <>
              {' na '}
              {companyHref ? (
                <Button
                  asChild
                  variant="link"
                  className="h-fit p-0 text-[#4a65fc]"
                >
                  <Link
                    href={companyHref}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                  >
                    {profile.companyName}
                  </Link>
                </Button>
              ) : (
                <span className="text-[#4a65fc]">{profile.companyName}</span>
              )}
            </>
          ) : null}
        </p>
        <p className="text-muted-foreground text-pretty">{profile.bio}</p>
      </section>
    </>
  )
}
