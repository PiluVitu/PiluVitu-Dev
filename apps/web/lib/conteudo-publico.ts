import 'server-only'

import { createReader } from '@keystatic/core/reader'
import keystaticConfig from '@/keystatic.config'
import {
  carreirasDoCms,
  perfilDoCms,
  piluLabsDoCms,
  socialsDoCms,
} from '@/lib/conteudo-do-cms'
import { itensListados } from '@/lib/pilulabs'

// Sem draftMode nem cookies, de propósito: ver "SEO" no apps/web/CLAUDE.md.
export async function lerConteudoPublico() {
  const reader = createReader(process.cwd(), keystaticConfig)
  const [perfil, socials, carreiras, piluLabs] = await Promise.all([
    reader.singletons.siteProfile.read(),
    reader.collections.socials.all(),
    reader.collections.carreiras.all(),
    reader.collections.pilulabs.all(),
  ])
  return {
    perfil: perfil ? perfilDoCms(perfil) : null,
    socials: socialsDoCms(socials),
    carreiras: carreirasDoCms(carreiras),
    piluLabs: itensListados(piluLabsDoCms(piluLabs)),
  }
}
