import { ArticleSection } from '@/components/article-section'
import { JobCard } from '@/components/job-card'
import { ProjectCard } from '@/components/project-card'
import type { ArticleCardView } from '@/lib/article-feed'
import type { Carreira } from '@/mocks/carreira'
import type { Project } from '@/mocks/projects'

type HomeBentoLayoutProps = {
  carreiraList: Carreira[]
  projectList: Project[]
  initialBlogPosts: ArticleCardView[]
}

/**
 * Arranjo estilo “bento” (referência tipo Kasbu): grelha com células de tamanhos
 * combinados, cantos muito arredondados e secções claras (Carreira → Projetos → Artigos).
 */
export function HomeBentoLayout({
  carreiraList,
  projectList,
  initialBlogPosts,
}: HomeBentoLayoutProps) {
  return (
    <div className="flex min-h-0 flex-col gap-10 xl:gap-12">
      <section
        aria-labelledby="carreira-heading"
        className="flex flex-col gap-4"
        suppressHydrationWarning
      >
        <h2
          id="carreira-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Carreira
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {carreiraList.map((carreira) => (
            <JobCard key={carreira.id} {...carreira} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="projetos-heading"
        className="flex flex-col gap-4"
        suppressHydrationWarning
      >
        <h2
          id="projetos-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Projetos
        </h2>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {projectList.map((project) => (
            <ProjectCard
              key={project.id}
              className="w-full xl:w-full"
              {...project}
            />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="artigos-heading"
        className="flex flex-col gap-4"
        suppressHydrationWarning
      >
        <h2
          id="artigos-heading"
          className="text-xl font-semibold tracking-tight"
        >
          Artigos
        </h2>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ArticleSection initialBlogPosts={initialBlogPosts} />
        </div>
      </section>
    </div>
  )
}
