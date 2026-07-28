import Link from 'next/link'
import { faBriefcase, faLocationDot } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { SiteProfileContent, VisitCardContent } from '@/lib/site-content'
import type { Social } from '@/mocks/social'
import { ModeToggle } from './mode-toggle'
import { ProfileVisitCard } from './profile-visit-card'
import { ProfileSocialStrip } from './profile-social-strip'
import { Button } from '@piluvitu/ui/button'

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
  const hasMeta = Boolean(profile.location) || profile.disciplines.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <ProfileVisitCard
          profile={profile}
          visitCard={visitCard}
          latestDevArticleUrl={latestDevArticleUrl}
        />
        <ModeToggle />
      </div>

      {profile.availabilityOpen ? (
        <p className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
          <span className="bg-ok size-2 rounded-full" aria-hidden />
          {profile.availabilityLabel}
        </p>
      ) : null}

      <h1 className="text-4xl font-bold tracking-tight xl:text-5xl">
        {profile.displayName}
      </h1>

      <div className="flex flex-col gap-4">
        <p>
          <strong className="text-primary font-semibold">
            {profile.roleHighlight}
          </strong>
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
        {hasMeta ? (
          <div className="text-muted-foreground flex flex-col gap-2 pt-2 font-mono text-sm">
            {profile.location ? (
              <span className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faLocationDot}
                  className="size-3.5"
                  aria-hidden
                />
                {profile.location}
              </span>
            ) : null}
            {profile.disciplines.length > 0 ? (
              <span className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faBriefcase}
                  className="size-3.5"
                  aria-hidden
                />
                {profile.disciplines.join(' · ')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
