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
    <div className="min-h-screen items-start gap-16 pt-2 pr-4 pb-2 pl-6 sm:pr-4 sm:pl-8 md:gap-20 md:pt-20 md:pr-4 md:pb-20 md:pl-20 lg:pt-10 lg:pb-4 xl:grid xl:h-screen xl:max-h-screen xl:min-h-0 xl:grid-cols-12 xl:grid-rows-1 xl:items-stretch xl:gap-10 xl:overflow-hidden 2xl:mx-auto 2xl:max-w-[1920px]">
      <main
        id="profile"
        className="col-span-12 flex min-h-0 flex-col items-start xl:col-span-3 xl:overflow-y-auto xl:overscroll-y-contain xl:pr-2"
        suppressHydrationWarning
      >
        <header className="flex flex-col gap-6">
          <Bio profile={siteProfile} />
        </header>
      </main>
      <aside
        id="left-side"
        className="mt-14 flex min-h-0 flex-col pb-4 xl:col-span-9 xl:mt-0 xl:overflow-y-auto xl:overscroll-y-contain xl:pr-1 xl:pb-4"
        suppressHydrationWarning
      >
        <HomeBentoLayout
          carreiraList={carreiraList}
          socialList={socialList}
          projectList={projectList}
        />
      </aside>
    </div>
  )
}
