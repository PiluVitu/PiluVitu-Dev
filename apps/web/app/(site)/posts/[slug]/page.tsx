import { getBlogPost, getBlogPostSlugs } from '@/lib/blog-posts'
import { mdxComponents } from '@/lib/mdx/mdx-components'
import { MDX_REMARK_PLUGINS, MDX_REHYPE_PLUGINS } from '@/lib/mdx/mdx-plugins'
import { PageTopBar } from '@/components/page-top-bar'
import { Button } from '@/components/ui/button'
import { MDXRemote } from 'next-mdx-remote/rsc'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

type PostPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const slugs = await getBlogPostSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getBlogPost(slug)
  if (!post) return {}

  const ogImage = post.coverImage ?? undefined

  return {
    title: post.title,
    description: post.excerpt || undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt || undefined,
      type: 'article',
      publishedTime: post.publishedAt,
      tags: post.tags,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt || undefined,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params
  const post = await getBlogPost(slug)
  if (!post) notFound()

  const publishedDate = new Date(post.publishedAt).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 xl:py-10">
      <PageTopBar backHref="/#artigos-heading" backLabel="Artigos" />

      <article className="mt-10">
        <header className="border-border flex flex-col gap-4 border-b pb-8">
          <p className="text-primary font-mono text-sm break-all">
            ~/blog/{slug}
          </p>
          <h1 className="text-4xl leading-tight font-bold tracking-tight">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="text-muted-foreground text-xl text-pretty">
              {post.excerpt}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-muted-foreground flex items-center gap-3 font-mono text-xs">
              <time dateTime={post.publishedAt}>{publishedDate}</time>
              <span aria-hidden>·</span>
              <span>{post.readingTimeMinutes} min de leitura</span>
            </div>
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border-border text-muted-foreground rounded-full border px-2.5 py-0.5 font-mono text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          {post.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImage}
              alt={post.title}
              className="mt-2 w-full rounded-2xl object-cover"
              width={1200}
              height={630}
            />
          )}
        </header>

        <div className="prose prose-invert post-prose mt-10 max-w-none">
          <MDXRemote
            source={post.bodyMdx}
            components={mdxComponents}
            options={{
              mdxOptions: {
                remarkPlugins: MDX_REMARK_PLUGINS,
                rehypePlugins: MDX_REHYPE_PLUGINS,
              },
            }}
          />
        </div>

        <footer className="border-border mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <div className="flex items-center gap-3">
            <span className="bg-accent-soft text-primary flex size-10 items-center justify-center rounded-lg font-bold">
              PV
            </span>
            <div className="flex flex-col">
              <span className="font-semibold">Paulo Victor Torres Silva</span>
              <span className="text-muted-foreground font-mono text-xs">
                Site Reliability Engineer
              </span>
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/#artigos-heading">
              <FontAwesomeIcon icon={faArrowLeft} className="size-3.5" />
              Voltar aos artigos
            </Link>
          </Button>
        </footer>
      </article>
    </div>
  )
}
