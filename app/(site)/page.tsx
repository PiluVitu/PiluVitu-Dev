import { Bio } from '@/components/bio'
import { HomeBentoLayout } from '@/components/home-bento-layout'
import {
  getCarreiras,
  getProjects,
  getSiteProfile,
  getSocials,
  type SiteProfileContent,
} from '@/lib/site-content'
import type { Carreira } from '@/mocks/carreira'
import type { Project } from '@/mocks/projects'
import type { Social } from '@/mocks/social'

const fallbackProfile: SiteProfileContent = {
  displayName: 'Paulo Victor Torres Silva',
  avatarSrc: '/profile-2.jpg',
  avatarAlt: 'Paulo Victor Profile Pic',
  roleHighlight: 'FullStackOps',
  companyName: 'ViralizePlus',
  companyLink: 'https://www.viralizeplus.com.br/',
  companyLinkColor: '#4a65fc',
  bio: 'Desenvolvedor FullStack com foco em DevOps, apaixonado por tecnologia e automação. Trabalho com desenvolvimento de aplicações web modernas, CI/CD, infraestrutura como código e soluções em nuvem. Sempre buscando aprender e compartilhar conhecimento com a comunidade. Vamos conversar sobre tecnologia e projetos interessantes!',
}

export default async function Home() {
  const [profile, socials, carreiras, projects] = await Promise.all([
    getSiteProfile(),
    getSocials(),
    getCarreiras(),
    getProjects(),
  ])

  const siteProfile = profile ?? fallbackProfile
  const socialList: Social[] = socials
  const carreiraList: Carreira[] = carreiras
  const projectList: Project[] = projects

  return (
    <div className="min-h-screen pt-2 pr-4 pb-2 pl-6 sm:pr-4 sm:pl-8 xl:grid xl:h-screen xl:max-h-screen xl:min-h-0 xl:grid-cols-12 xl:grid-rows-1 xl:items-stretch xl:gap-10 xl:overflow-hidden xl:pt-10 xl:pr-8 xl:pb-4 xl:pl-14 2xl:mx-auto 2xl:max-w-[1920px]">
      <div className="mx-auto flex w-full max-w-md flex-col gap-16 pb-4 xl:contents xl:max-w-none">
        <main
          id="profile"
          className="col-span-12 flex min-h-0 flex-col items-start xl:col-span-4 xl:overflow-y-auto xl:overscroll-y-contain xl:pr-2"
          suppressHydrationWarning
        >
          <header className="flex flex-col gap-6">
            <Bio profile={siteProfile} />
          </header>
        </main>
        <aside
          id="left-side"
          className="flex min-h-0 flex-col pb-4 xl:col-span-8 xl:overflow-y-auto xl:overscroll-y-contain xl:pr-1 xl:pb-4"
          suppressHydrationWarning
        >
          <HomeBentoLayout
            carreiraList={carreiraList}
            socialList={socialList}
            projectList={projectList}
          />
        </aside>
      </div>
    </div>
  )
}
