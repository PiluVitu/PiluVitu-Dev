import { ArticleSection } from '@/components/article-section'
import { Bio } from '@/components/bio'
import { EmailCard } from '@/components/email-card'
import { JobCard } from '@/components/job-card'
import { PageSection } from '@/components/page-section'
import { ProjectCard } from '@/components/project-card'
import { SocialCard } from '@/components/social-card'
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
    <div className="max-h-screen items-start gap-24 p-2 md:p-20 lg:p-20 lg:pt-10 lg:pb-4 xl:grid xl:grid-cols-3 xl:overflow-hidden 2xl:mx-auto 2xl:max-w-[1920px]">
      <main
        id="left side"
        className="col-span-1 flex h-full flex-col items-start"
      >
        <header className="flex flex-col gap-6">
          <Bio profile={siteProfile} />
          <section className="flex h-full flex-col justify-start gap-4 overflow-hidden">
            <h2 className="my-3 text-xl">Carreira</h2>
            <section className="flex flex-col gap-4 overflow-y-auto xl:h-80 xl:overflow-y-scroll 2xl:h-[calc(100vh-80%)] 2xl:overflow-y-auto">
              {carreiraList.map((carreira: Carreira) => (
                <JobCard key={carreira.id} {...carreira} />
              ))}
              <div className="h-32"></div>
            </section>
          </section>
        </header>
      </main>
      <aside
        id="left side"
        className="mt-14 flex flex-col gap-14 pb-4 xl:col-span-2 xl:mt-0 xl:max-h-[calc(100vh-64px)] xl:overflow-y-auto xl:pb-0"
      >
        <PageSection>
          {socialList.map((social: Social) => (
            <SocialCard key={social.id} {...social} />
          ))}
          <EmailCard />
        </PageSection>
        <PageSection title="Projetos">
          {projectList.map((project: Project) => (
            <ProjectCard key={project.id} {...project} />
          ))}
        </PageSection>
        <PageSection title="Artigos">
          <ArticleSection />
        </PageSection>
      </aside>
    </div>
  )
}
