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
    <main className="min-h-screen items-start gap-24 p-20 2xl:grid 2xl:grid-cols-3">
      <div
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
      </div>
      <div id="left side" className="flex flex-col gap-14 2xl:col-span-2">
        <PageSection>
          {Socials.map((social: Social) => (
            <SocialCard key={social.id} {...social} />
          ))}
        </PageSection>
        <PageSection title="Projects">
          {Projects.map((project: Project) => (
            <ProjectCard key={project.id} {...project} />
          ))}
        </PageSection>
        <PageSection title="Artigos">
          <p>Em breve</p>
        </PageSection>
      </div>
    </main>
  )
}
