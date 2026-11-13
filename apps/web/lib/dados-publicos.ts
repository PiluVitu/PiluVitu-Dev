import 'server-only'

import { getPublishedBlogPosts } from '@/lib/blog-posts'
import type { DadosPublicos } from '@/lib/llms'
import { PERFIL_PADRAO } from '@/lib/perfil-padrao'
import {
  getCarreiras,
  getPiluLabs,
  getSiteProfile,
  getSocials,
} from '@/lib/site-content'

export async function lerDadosPublicos(): Promise<DadosPublicos> {
  const [perfil, socials, carreiras, piluLabs, posts] = await Promise.all([
    getSiteProfile(),
    getSocials(),
    getCarreiras(),
    getPiluLabs(),
    getPublishedBlogPosts(),
  ])
  return {
    perfil: perfil ?? PERFIL_PADRAO,
    socials,
    carreiras,
    piluLabs,
    posts,
  }
}
