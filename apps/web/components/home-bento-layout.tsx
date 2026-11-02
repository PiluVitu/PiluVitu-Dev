import { ArticleSection } from '@/components/article-section'
import { HomeContato, HomePiluTech, HomeStack } from '@/components/home-cards'
import { JobCard } from '@/components/job-card'
import { SectionHeader } from '@/components/section-header'
import type { ArticleCardView } from '@/lib/article-feed'
import type { Carreira } from '@/mocks/carreira'

type HomeBentoLayoutProps = {
  carreiraList: Carreira[]
  initialBlogPosts: ArticleCardView[]
}

// No celular a ordem é PiluTech, carreira, blog, stack, contato; no grid do
// desktop o stack sobe para o lado da carreira.
export function HomeBentoLayout({
  carreiraList,
  initialBlogPosts,
}: HomeBentoLayoutProps) {
  return (
    <div className="flex min-h-0 flex-col gap-4 xl:grid xl:grid-cols-6">
      <HomePiluTech className="xl:col-span-6" />

      <section
        id="carreira"
        aria-labelledby="carreira-heading"
        className="flex flex-col gap-5 xl:col-span-4"
        suppressHydrationWarning
      >
        <SectionHeader
          id="carreira-heading"
          label="Carreira"
          count={carreiraList.length}
        />
        <div className="grid grid-cols-1 gap-3.5">
          {carreiraList.map((carreira) => (
            <JobCard key={carreira.id} {...carreira} />
          ))}
        </div>
      </section>

      <HomeStack className="order-1 xl:order-none xl:col-span-2 xl:self-start" />

      <section
        id="artigos"
        aria-labelledby="artigos-heading"
        className="flex flex-col gap-5 xl:col-span-6"
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

      <HomeContato className="order-2 xl:order-none xl:col-span-6" />
    </div>
  )
}
