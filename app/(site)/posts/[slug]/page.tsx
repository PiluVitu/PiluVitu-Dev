import { getBlogPost, getBlogPostSlugs } from '@/lib/blog-posts'
import { MermaidBlock } from '@/components/mdx/mermaid-block'
import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypePrettyCode from 'rehype-pretty-code'
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

/** MDX custom components — maps code blocks with lang="mermaid" to <MermaidBlock>. */
const mdxComponents = {
  // Intercept <code> blocks so mermaid fences render as diagrams.
  pre: ({
    children,
    ...props
  }: React.ComponentProps<'pre'> & { 'data-language'?: string }) => {
    const lang = props['data-language']
    if (lang === 'mermaid') {
      const code =
        typeof children === 'object' && children !== null && 'props' in children
          ? String(
              (children as React.ReactElement<{ children?: string }>).props
                .children ?? '',
            )
          : String(children ?? '')
      return <MermaidBlock chart={code} />
    }
    return <pre {...props}>{children}</pre>
  },
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
    <article className="mx-auto w-full max-w-3xl px-4 py-12">
      <header className="mb-10 flex flex-col gap-4">
        <Link
          href="/#artigos-heading"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-2 text-sm transition-colors"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" aria-hidden />
          Artigos
        </Link>
        <h1 className="text-4xl leading-tight font-bold tracking-tight">
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="text-muted-foreground text-xl">{post.excerpt}</p>
        )}
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <time dateTime={post.publishedAt}>{publishedDate}</time>
          <span>·</span>
          <span>{post.readingTimeMinutes} min de leitura</span>
        </div>
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="bg-muted text-muted-foreground rounded-full px-3 py-1 text-xs font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        {post.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            alt={post.title}
            className="w-full rounded-2xl object-cover"
            width={1200}
            height={630}
          />
        )}
      </header>

      <div className="prose prose-slate dark:prose-invert max-w-none">
        <MDXRemote
          source={post.bodyMdx}
          components={mdxComponents}
          options={{
            mdxOptions: {
              remarkPlugins: [remarkGfm],
              rehypePlugins: [
                rehypeSlug,
                [rehypeAutolinkHeadings, { behavior: 'wrap' }],
                [
                  rehypePrettyCode,
                  {
                    theme: { dark: 'github-dark', light: 'github-light' },
                    keepBackground: false,
                  },
                ],
              ],
            },
          }}
        />
      </div>
    </article>
  )
}
