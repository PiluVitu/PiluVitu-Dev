import { z } from 'zod'
import { VISIT_CARD_FA_SELECT_OPTIONS } from '@/lib/visit-card-fontawesome'

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const COMPANY_LINK_COLORS: { label: string; value: string }[] = [
  { label: 'Azul índigo (padrão)', value: '#4a65fc' },
  { label: 'Azul vivo', value: '#3b82f6' },
  { label: 'Azul royal', value: '#2563eb' },
  { label: 'Ciano', value: '#06b6d4' },
  { label: 'Verde água', value: '#14b8a6' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Verde lima', value: '#84cc16' },
  { label: 'Amarelo ouro', value: '#eab308' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Roxo', value: '#a855f7' },
  { label: 'Violeta', value: '#8b5cf6' },
  { label: 'Índigo', value: '#6366f1' },
  { label: 'Branco suave (destaca no fundo escuro)', value: '#f8fafc' },
  { label: 'Cinza claro', value: '#94a3b8' },
]

const COLOR_VALUES = new Set(COMPANY_LINK_COLORS.map((c) => c.value))
const FA_VALUES = new Set(VISIT_CARD_FA_SELECT_OPTIONS.map((o) => o.value))

// O Keystatic OMITE campos opcionais vazios ao gravar o YAML (ex.: um `image`
// em branco some do arquivo). Por isso os campos opcionais aqui usam `.default()`
// — um campo ausente vira o vazio do seu tipo em vez de estourar ZodError (que
// viraria 502 na leitura do admin). Só os campos de identidade (slug) e nomes
// (`reqStr`) permanecem obrigatórios.
const slug = z
  .string()
  .regex(SLUG_RE, 'Slug inválido (use minúsculas, números e hífens)')
const order = z.number().int().min(0).default(0)
const str = z.string().default('')
const reqStr = z.string().min(1, 'Obrigatório')
const strArray = z.array(z.string()).default([])
const bool = z.boolean().default(false)
const faIcon = z
  .string()
  .default('')
  .refine((v) => v === '' || FA_VALUES.has(v), 'Ícone Font Awesome inválido')
const linkColor = z
  .string()
  .default('#4a65fc')
  .refine((v) => COLOR_VALUES.has(v), 'Cor inválida')

export const projectSchema = z.object({
  projectSlug: slug,
  order,
  projectName: reqStr,
  subtitle: str,
  projectLogo: str,
  description: str,
  tags: strArray,
  deployLink: str,
  repoLink: str,
  image: str,
  altImage: str,
})
export const carreiraSchema = z.object({
  orgSlug: slug,
  order,
  orgName: reqStr,
  orgDescription: str,
  orgLink: str,
  image: str,
  altImage: str,
  title: str,
  location: str,
  date: str,
  atribuitions: strArray,
  current: bool,
  tags: strArray,
})
export const socialSchema = z.object({
  key: slug,
  order,
  socialDescription: str,
  socialLink: str,
  iconMode: z.enum(['fontawesome', 'image']).default('fontawesome'),
  fontawesomeIcon: faIcon,
  image: str,
  altImage: str,
})
export const profileSchema = z.object({
  displayName: reqStr,
  avatarSrc: str,
  avatarAlt: str,
  roleHighlight: str,
  companyName: str,
  companyLink: str,
  companyLinkColor: linkColor,
  bio: str,
  availabilityOpen: bool,
  availabilityLabel: str,
  location: str,
  disciplines: strArray,
})

export type ProjectEntry = z.infer<typeof projectSchema>
export type CarreiraEntry = z.infer<typeof carreiraSchema>
export type SocialEntry = z.infer<typeof socialSchema>
export type ProfileEntry = z.infer<typeof profileSchema>
