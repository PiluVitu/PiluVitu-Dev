import 'server-only'

import { getPublishedBlogPosts } from '@/lib/blog-posts'
import { lerConteudoPublico } from '@/lib/conteudo-publico'
import type { DadosPublicos } from '@/lib/llms'
import { PERFIL_PADRAO } from '@/lib/perfil-padrao'

export async function lerDadosPublicos(): Promise<DadosPublicos> {
  const [{ perfil, ...conteudo }, posts] = await Promise.all([
    lerConteudoPublico(),
    getPublishedBlogPosts(),
  ])
  return { perfil: perfil ?? PERFIL_PADRAO, ...conteudo, posts }
}
