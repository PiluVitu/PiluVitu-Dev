import { Bio } from '@/components/bio'
import { HomeBentoLayout } from '@/components/home-bento-layout'
import { HomeFooter } from '@/components/home-footer'
import { getLatestDevToArticleUrl } from '@/lib/dev-to'
import {
  getCarreiras,
  getProjects,
  getSiteProfile,
  getSocials,
  getVisitCard,
  VISIT_CARD_FALLBACK,
  type SiteProfileContent,
} from '@/lib/site-content'
import { getBlogPosts } from '@/lib/blog-posts'
import { blogPostToView } from '@/lib/article-feed'
import type { Carreira } from '@/mocks/carreira'
import type { Project } from '@/mocks/projects'
import type { Social } from '@/mocks/social'

const fallbackProfile: SiteProfileContent = {
  displayName: 'Paulo Victor Torres Silva',
  avatarSrc: '/profile-2.jpg',
  avatarAlt: 'Paulo Victor Profile Pic',
  roleHighlight: 'Site Reliability Engineer (SRE)',
  companyName: 'ViralizePlus',
  companyLink: 'https://www.viralizeplus.com.br/',
  companyLinkColor: '#4a65fc',
  bio: 'DevOps Engineer com 3 anos de experiência focado em garantir que sistemas em nuvem operem com alta disponibilidade e custo eficiente. Especialista em transformar operações manuais em processos automatizados e seguros, utilizando ferramentas de mercado para monitorar a saúde das aplicações em tempo real e antecipar falhas antes que afetem o usuário final.',
  availabilityOpen: true,
  availabilityLabel: 'Disponível para oportunidades',
  location: 'Brasil · Remoto',
  disciplines: ['SRE', 'DevOps', 'Cloud'],
}

export default async function Home() {
  const [
    profile,
    socials,
    carreiras,
    projects,
    latestDevArticleUrl,
    visitCardRaw,
    blogPosts,
  ] = await Promise.all([
    getSiteProfile(),
    getSocials(),
    getCarreiras(),
    getProjects(),
    getLatestDevToArticleUrl(),
    getVisitCard(),
    getBlogPosts(),
  ])

  const siteProfile = profile ?? fallbackProfile
  const visitCard = visitCardRaw ?? VISIT_CARD_FALLBACK
  const socialList: Social[] = socials
  const carreiraList: Carreira[] = carreiras
  const projectList: Project[] = projects
  const initialBlogPosts = blogPosts.map(blogPostToView)

  return (
    <div className="min-h-screen px-6 pt-2 pb-4 sm:px-8 xl:px-14 xl:pt-10 xl:pb-4 2xl:mx-auto 2xl:max-w-[1180px]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-accent-soft),transparent)]"
      />

      {/*
        Scroll da página inteira. A coluna esquerda é `sticky` (mais baixa que a
        viewport → fica fixa por todo o scroll). A direita flui normalmente e é o
        que "rola". O footer (abaixo do grid) é full-width e só aparece no fim.
      */}
      <div className="mx-auto flex w-full max-w-md flex-col gap-16 xl:mx-0 xl:grid xl:max-w-none xl:grid-cols-12 xl:items-start xl:gap-10">
        <main
          id="profile"
          className="flex flex-col items-start xl:sticky xl:top-10 xl:col-span-4 xl:self-start"
          suppressHydrationWarning
        >
          <Bio
            profile={siteProfile}
            socials={socialList}
            latestDevArticleUrl={latestDevArticleUrl}
            visitCard={visitCard}
          />
        </main>
        <aside
          id="content"
          className="flex flex-col xl:col-span-8 xl:pb-6"
          suppressHydrationWarning
        >
          <HomeBentoLayout
            carreiraList={carreiraList}
            projectList={projectList}
            initialBlogPosts={initialBlogPosts}
          />
        </aside>
      </div>

      {/* Footer full-width (cobre as duas colunas), no fim do scroll */}
      <div className="mx-auto w-full max-w-md xl:max-w-none">
        <HomeFooter name={siteProfile.displayName} />
      </div>
    </div>
  )
}
