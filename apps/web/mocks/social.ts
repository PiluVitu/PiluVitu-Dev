export type SocialIconMode = 'fontawesome' | 'image'

export type Social = {
  id: string
  socialDescription: string
  socialLink: string
  image?: string
  altImage: string
  /** Preferência de renderização no strip e cartões. */
  iconMode: SocialIconMode
  /** Chave em `lib/visit-card-fontawesome.ts` (ex.: brands__github). */
  fontawesomeIcon: string
}
