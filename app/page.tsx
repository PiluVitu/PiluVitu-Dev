import { ArticleCard } from '@/components/article-card'
import { EmailCard } from '@/components/email-card'
import { JobCard } from '@/components/job-card'
import { ModeToggle } from '@/components/mode-toggle'
import { PageSection } from '@/components/page-section'
import { ProjectCard } from '@/components/project-card'
import { SocialCard } from '@/components/social-card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Carreira, Carreiras } from '@/mocks/carreira'
import { Project, Projects } from '@/mocks/projects'
import { Social, Socials } from '@/mocks/social'
export default function Home() {
  return (
    <div className="max-h-screen items-start gap-24 p-2 md:p-20 lg:p-20 lg:pb-4 lg:pt-10 xl:grid xl:grid-cols-3">
      <main
        id="left side"
        className="col-span-1 flex flex-col items-start justify-between"
      >
        <header className="flex flex-col gap-6">
          <Avatar className="mb-2 flex h-24 w-24 flex-shrink-0 rounded-xl">
            <AvatarImage src="/profile-2.jpg" alt="Paulo Victor Profile Pic" />
            <AvatarFallback className="rounded-xl">PV</AvatarFallback>
          </Avatar>
          <section>
            <ModeToggle />
          </section>
          <h1 className="text-4xl font-semibold tracking-tight">
            Paulo Victor Torres Silva
          </h1>

          <section className="flex flex-col gap-2">
            <p>Desenvolvedor Fullstack na Devhatt</p>
            <p className="text-pretty text-muted-foreground">
              Desenvolvedor Web Full Stack com foco em TypeScript, React e
              NodeJS, determinado a criar aplicações inovadoras que aprimorem a
              qualidade de vida das pessoas. Ativamente em busca de
              oportunidades profissionais para contribuir com minha paixão pelo
              desenvolvimento web
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="my-3 text-xl">Carreira</h2>
            {Carreiras.map((carreira: Carreira) => (
              <JobCard key={carreira.id} {...carreira} />
            ))}

            <div className="flex items-start gap-5 p-4"></div>
          </section>
        </header>
        <div className="mb-32 grid text-center lg:mb-0 lg:grid-cols-4 lg:text-left"></div>
      </main>
      <aside
        id="left side"
        className="flex flex-col gap-14 pb-4 xl:col-span-2 xl:max-h-[calc(100vh-64px)] xl:overflow-y-auto xl:pb-0"
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
          <ArticleCard />
        </PageSection>
      </aside>
    </div>
  )
}
