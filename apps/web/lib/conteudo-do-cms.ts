import type { Carreira } from '@/mocks/carreira'
import type { Social, SocialIconMode } from '@/mocks/social'
import { normalizarItem, type EntradaItem, type ItemPiluLabs } from './pilulabs'
import type { SiteProfileContent } from './site-content'
import { SOCIAL_SLUG_DEFAULT_FA } from './social-default-fa'

export type EntradaDoPerfil = {
  displayName: string
  avatarSrc: string
  avatarAlt: string
  roleHighlight: string
  companyName: string
  companyLink: string
  companyLinkColor?: string | null
  bio: string
  availabilityOpen?: boolean | null
  availabilityLabel?: string | null
  location?: string | null
  disciplines?: readonly string[] | null
}

export type EntradaDeSocial = {
  socialDescription: string
  socialLink: string
  image?: string | null
  altImage: string
  iconMode?: string | null
  fontawesomeIcon?: string | null
  order?: number | null
}

export type EntradaDeCarreira = {
  orgName: string
  orgDescription: string
  orgLink: string
  image?: string | null
  altImage: string
  title: string
  location: string
  date: string
  atribuitions: readonly string[]
  current?: boolean | null
  tags?: readonly string[] | null
  order?: number | null
}

export type ItemDaColecao<T> = { slug: string; entry: T }

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function corHex(valor: string | undefined | null, padrao: string): string {
  const cor = (valor ?? '').trim()
  return HEX_COLOR.test(cor) ? cor : padrao
}

function porOrdem<T extends { order: number }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.order - b.order)
}

export function perfilDoCms(entrada: EntradaDoPerfil): SiteProfileContent {
  return {
    displayName: entrada.displayName,
    avatarSrc: entrada.avatarSrc,
    avatarAlt: entrada.avatarAlt,
    roleHighlight: entrada.roleHighlight,
    companyName: entrada.companyName,
    companyLink: entrada.companyLink,
    companyLinkColor: corHex(entrada.companyLinkColor, '#4a65fc'),
    bio: entrada.bio,
    availabilityOpen: entrada.availabilityOpen ?? true,
    availabilityLabel:
      (entrada.availabilityLabel ?? '').trim() ||
      'Disponível para oportunidades',
    location: (entrada.location ?? '').trim(),
    disciplines: [...(entrada.disciplines ?? [])].filter((d) => d.trim()),
  }
}

export function socialsDoCms(
  itens: readonly ItemDaColecao<EntradaDeSocial>[],
): Social[] {
  return porOrdem(
    itens.map(({ slug, entry }) => {
      const image = (entry.image ?? '').trim()
      const fontawesome = (entry.fontawesomeIcon ?? '').trim()
      return {
        social: {
          id: slug,
          socialDescription: entry.socialDescription,
          socialLink: entry.socialLink,
          image: image ? image : undefined,
          altImage: entry.altImage,
          iconMode: (entry.iconMode === 'image'
            ? 'image'
            : 'fontawesome') as SocialIconMode,
          fontawesomeIcon:
            fontawesome || SOCIAL_SLUG_DEFAULT_FA[slug] || 'solid__link',
        },
        order: entry.order ?? 0,
      }
    }),
  ).map(({ social }) => social)
}

export function carreirasDoCms(
  itens: readonly ItemDaColecao<EntradaDeCarreira>[],
): Carreira[] {
  return porOrdem(
    itens.map(({ slug, entry }) => {
      const image = (entry.image ?? '').trim()
      return {
        carreira: {
          id: slug,
          orgName: entry.orgName,
          orgDescription: entry.orgDescription,
          orgLink: entry.orgLink,
          image: image ? image : undefined,
          altImage: entry.altImage,
          title: entry.title,
          location: entry.location,
          date: entry.date,
          atribuitions: [...entry.atribuitions],
          current: entry.current ?? false,
          tags: [...(entry.tags ?? [])].filter((t) => t.trim()),
        },
        order: entry.order ?? 0,
      }
    }),
  ).map(({ carreira }) => carreira)
}

export function piluLabsDoCms(
  itens: readonly ItemDaColecao<EntradaItem>[],
): ItemPiluLabs[] {
  return porOrdem(itens.map(({ slug, entry }) => normalizarItem(slug, entry)))
}
