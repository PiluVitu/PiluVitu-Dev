import Link from 'next/link'
import { HomeContato, HomePiluTech, HomeStack } from '@/components/home-cards'
import { JobCard } from '@/components/job-card'
import type { ArticleCardView } from '@/lib/article-feed'
import type { AppPiluTech } from '@/lib/home/catalogo-pilutech'
import type { Carreira } from '@/mocks/carreira'

type HomeBentoLayoutProps = {
  appsPiluTech: AppPiluTech[]
  carreiraList: Carreira[]
  initialBlogPosts: ArticleCardView[]
}

const dois = (n: number) => String(n).padStart(2, '0')

function Cabecalho({
  id,
  titulo,
  comando,
  total,
}: {
  id: string
  titulo: string
  comando: string
  total: number
}) {
  return (
    <div className="mb-2 flex items-center gap-3 font-mono text-[11px]">
      <h2
        id={id}
        className="text-muted-foreground font-semibold tracking-[.2em]"
      >
        {titulo} <span className="tracking-normal">· {comando}</span>
      </h2>
      <span className="text-primary">{dois(total)}</span>
      <span aria-hidden className="bg-border h-px flex-1" />
    </div>
  )
}

const card = 'border-border bg-card flex flex-col gap-1 rounded-3xl border p-6'

// No celular a ordem é PiluTech, carreira, blog, stack, contato; no grid do
// desktop o stack sobe para o lado da carreira.
export function HomeBentoLayout({
  appsPiluTech,
  carreiraList,
  initialBlogPosts,
}: HomeBentoLayoutProps) {
  const posts = initialBlogPosts.slice(0, 6)
  return (
    <div className="flex min-h-0 flex-col gap-4 xl:grid xl:grid-cols-6">
      <HomePiluTech apps={appsPiluTech} className="xl:col-span-6" />

      <section
        id="carreira"
        aria-labelledby="carreira-heading"
        className={`${card} xl:col-span-4`}
        suppressHydrationWarning
      >
        <Cabecalho
          id="carreira-heading"
          titulo="CARREIRA"
          comando="git log"
          total={carreiraList.length}
        />
        {carreiraList.map((carreira, i) => (
          <JobCard
            key={carreira.id}
            {...carreira}
            variante="log"
            head={i === 0}
          />
        ))}
      </section>

      <HomeStack className="order-1 xl:order-none xl:col-span-2 xl:self-start" />

      <section
        id="artigos"
        aria-labelledby="artigos-heading"
        className={`${card} xl:col-span-6`}
      >
        <Cabecalho
          id="artigos-heading"
          titulo="~/blog"
          comando="ls -t"
          total={posts.length}
        />
        <ol className="grid grid-cols-1 gap-x-4 gap-y-1 md:grid-cols-2">
          {posts.map((post, i) => (
            <li key={post.id}>
              <Link
                href={post.href}
                className="hover:bg-accent flex min-h-11 items-baseline gap-3 rounded-xl p-2.5 transition-colors"
              >
                <span className="text-muted-foreground font-mono text-xs">
                  {dois(i + 1)}
                </span>
                <span className="flex-1 text-[15px] font-semibold">
                  {post.title}
                </span>
                <span className="text-primary font-mono text-xs whitespace-nowrap">
                  {post.readingTimeMinutes} min · ler →
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <HomeContato className="order-2 xl:order-none xl:col-span-6" />
    </div>
  )
}
