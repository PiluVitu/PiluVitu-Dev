import { ArticleSection } from '@/components/article-section'
import { HomeFooter } from '@/components/home-footer'
import { JobCard } from '@/components/job-card'
import { ProjectCard } from '@/components/project-card'
import { SectionHeader } from '@/components/section-header'
import type { ArticleCardView } from '@/lib/article-feed'
import type { Carreira } from '@/mocks/carreira'
import type { Project } from '@/mocks/projects'

type HomeBentoLayoutProps = {
  carreiraList: Carreira[]
  projectList: Project[]
  initialBlogPosts: ArticleCardView[]
  profileName: string
}

export function HomeBentoLayout({
  carreiraList,
  projectList,
  initialBlogPosts,
  profileName,
}: HomeBentoLayoutProps) {
  return (
    <div className="flex min-h-0 flex-col gap-10 xl:gap-12">
      <section
        aria-labelledby="carreira-heading"
        className="flex flex-col gap-5"
        suppressHydrationWarning
      >
        <SectionHeader
          id="carreira-heading"
          label="Carreira"
          count={carreiraList.length}
        />
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
          {carreiraList.map((carreira) => (
            <JobCard key={carreira.id} {...carreira} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="projetos-heading"
        className="flex flex-col gap-5"
        suppressHydrationWarning
      >
        <SectionHeader
          id="projetos-heading"
          label="Projetos"
          count={projectList.length}
        />
        <div className="grid grid-cols-1 gap-6">
          {projectList.map((project) => (
            <ProjectCard key={project.id} {...project} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="artigos-heading"
        className="flex flex-col gap-5"
        suppressHydrationWarning
      >
        <SectionHeader
          id="artigos-heading"
          label="Artigos"
          count={initialBlogPosts.length}
        />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ArticleSection initialBlogPosts={initialBlogPosts} />
        </div>
      </section>

      <HomeFooter name={profileName} />
    </div>
  )
}
