import { ArticleSection } from '@/components/article-section'
import { JobCard } from '@/components/job-card'
import {
  SecaoPiluLabs,
  type SecaoPiluLabsProps,
} from '@/components/secao-pilulabs'
import { SectionHeader } from '@/components/section-header'
import type { ArticleCardView } from '@/lib/article-feed'
import type { Carreira } from '@/mocks/carreira'

type HomeBentoLayoutProps = {
  carreiraList: Carreira[]
  piluLabs: SecaoPiluLabsProps
  initialBlogPosts: ArticleCardView[]
}

export function HomeBentoLayout({
  carreiraList,
  piluLabs,
  initialBlogPosts,
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

      <SecaoPiluLabs {...piluLabs} />

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
    </div>
  )
}
