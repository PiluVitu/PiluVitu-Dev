import Link from 'next/link'
import type { SiteProfileContent, VisitCardContent } from '@/lib/site-content'
import type { Social } from '@/mocks/social'
import { ModeToggle } from './mode-toggle'
import { ProfileVisitCard } from './profile-visit-card'
import { ProfileSocialStrip } from './profile-social-strip'
import { Button } from './ui/button'

type BioProps = {
  profile: SiteProfileContent
  socials: Social[]
  latestDevArticleUrl: string | null
  visitCard: VisitCardContent
}

export function Bio({
  profile,
  socials,
  latestDevArticleUrl,
  visitCard,
}: BioProps) {
  const companyHref = profile.companyLink.trim()

  return (
    <>
      <ProfileVisitCard
        profile={profile}
        visitCard={visitCard}
        latestDevArticleUrl={latestDevArticleUrl}
      />
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
                  className="h-fit p-0"
                  style={{ color: profile.companyLinkColor }}
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
                <span style={{ color: profile.companyLinkColor }}>
                  {profile.companyName}
                </span>
              )}
            </>
          ) : null}
        </p>
        <p className="text-muted-foreground text-pretty">{profile.bio}</p>
        <ProfileSocialStrip socials={socials} />
      </section>
    </>
  )
}
