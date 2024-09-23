import { ArticleSection } from '@/components/article-section'
import { EmailCard } from '@/components/email-card'
import { JobCard } from '@/components/job-card'
import { PageSection } from '@/components/page-section'
import { ProjectCard } from '@/components/project-card'
import { SocialCard } from '@/components/social-card'
import { Carreira, Carreiras } from '@/mocks/carreira'
import { Project, Projects } from '@/mocks/projects'
import { Social, Socials } from '@/mocks/social'
import { Bio } from '@/components/bio'
export default function Home() {
  return (
    <div className="max-h-screen items-start gap-24 p-2 md:p-20 lg:p-20 lg:pb-4 lg:pt-10 xl:grid xl:grid-cols-3 xl:overflow-hidden 2xl:mx-auto 2xl:max-w-[1920px]">
      <main
        id="left side"
        className="col-span-1 flex h-full flex-col items-start"
      >
        <header className="flex flex-col gap-6">
          <Bio />
          <section className="flex h-full flex-col justify-start gap-4 overflow-hidden">
            <h2 className="my-3 text-xl">Carreira</h2>
            <section className=" flex flex-col gap-4 overflow-y-auto xl:h-80 xl:overflow-y-scroll 2xl:h-[calc(100vh-80%)] 2xl:overflow-y-auto">
              {Carreiras.map((carreira: Carreira) => (
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
          {Socials.map((social: Social) => (
            <SocialCard key={social.id} {...social} />
          ))}
          <EmailCard />
        </PageSection>
        <PageSection title="Projetos">
          {Projects.map((project: Project) => (
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
