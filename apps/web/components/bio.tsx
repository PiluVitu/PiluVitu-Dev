import Image from 'next/image'
import Link from 'next/link'
import type { SiteProfileContent } from '@/lib/site-content'
import type { Social } from '@/mocks/social'
import { HomeKubectl } from './home-kubectl'
import { ModeToggle } from './mode-toggle'
import { ProfileSocialStrip } from './profile-social-strip'

type BioProps = {
  profile: SiteProfileContent
  socials: Social[]
}

export function Bio({ profile, socials }: BioProps) {
  const companyHref = profile.companyLink.trim()
  const meta = [profile.location, ...profile.disciplines]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-3 [@media(max-height:820px)]:gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Image
            src={profile.avatarSrc}
            alt={profile.avatarAlt}
            width={56}
            height={56}
            className="border-border size-14 shrink-0 rounded-full border object-cover"
            priority
          />
          <p className="text-muted-foreground font-mono text-xs">
            <span className="text-ok">$</span>{' '}
            <span className="home-digitando text-foreground">
              whoami --role
            </span>
            <span className="home-cursor text-primary" aria-hidden>
              ▍
            </span>
          </p>
        </div>
        <ModeToggle />
      </div>

      <h1 className="text-[32px] leading-tight font-extrabold tracking-tight [@media(max-height:820px)]:text-[28px]">
        {profile.displayName}
      </h1>

      <p className="font-semibold">
        {profile.roleHighlight}
        {profile.companyName.trim() ? (
          <>
            {' na '}
            {companyHref ? (
              <Link
                href={companyHref}
                rel="noopener noreferrer nofollow"
                target="_blank"
                className="text-primary hover:underline"
              >
                {profile.companyName}
              </Link>
            ) : (
              <span className="text-primary">{profile.companyName}</span>
            )}
          </>
        ) : null}
      </p>

      <HomeKubectl />

      <p className="text-muted-foreground text-sm leading-relaxed text-pretty [@media(max-height:820px)]:text-[13px]">
        {profile.bio}
      </p>

      {meta ? (
        <p className="text-muted-foreground font-mono text-xs">{meta}</p>
      ) : null}

      <ProfileSocialStrip socials={socials} />
    </div>
  )
}
