import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faApple,
  faDiscord,
  faDocker,
  faDev,
  faFacebook,
  faGithub,
  faGitlab,
  faGoogle,
  faInstagram,
  faLinkedin,
  faLinkedinIn,
  faMastodon,
  faMedium,
  faPinterest,
  faReddit,
  faSlack,
  faStackOverflow,
  faTelegram,
  faThreads,
  faTiktok,
  faTwitch,
  faTwitter,
  faWhatsapp,
  faXTwitter,
  faYoutube,
} from '@fortawesome/free-brands-svg-icons'
import {
  faBriefcase,
  faCode,
  faEnvelope,
  faGlobe,
  faHouse,
  faLink,
  faRss,
} from '@fortawesome/free-solid-svg-icons'

/** Chave estável para o Keystatic e YAML: `brands__` ou `solid__` + nome do ícone exportado em camelCase (sem prefixo fa). */
export const VISIT_CARD_FA_ICON_MAP: Record<string, IconDefinition> = {
  brands__github: faGithub,
  brands__gitlab: faGitlab,
  brands__dev: faDev,
  brands__linkedin: faLinkedin,
  brands__linkedinIn: faLinkedinIn,
  brands__twitter: faTwitter,
  brands__xTwitter: faXTwitter,
  brands__instagram: faInstagram,
  brands__tiktok: faTiktok,
  brands__youtube: faYoutube,
  brands__discord: faDiscord,
  brands__mastodon: faMastodon,
  brands__google: faGoogle,
  brands__facebook: faFacebook,
  brands__reddit: faReddit,
  brands__stackOverflow: faStackOverflow,
  brands__medium: faMedium,
  brands__twitch: faTwitch,
  brands__slack: faSlack,
  brands__docker: faDocker,
  brands__apple: faApple,
  brands__threads: faThreads,
  brands__pinterest: faPinterest,
  brands__whatsapp: faWhatsapp,
  brands__telegram: faTelegram,
  solid__envelope: faEnvelope,
  solid__link: faLink,
  solid__globe: faGlobe,
  solid__rss: faRss,
  solid__house: faHouse,
  solid__briefcase: faBriefcase,
  solid__code: faCode,
}

/** Legenda técnica da chave YAML (ex.: `brands__github` → `brands / github`). */
export function faStorageKeyToPathLabel(key: string): string {
  const parts = key.split('__')
  if (parts.length < 2) return key
  return `${parts[0]} / ${parts[1]}`
}

/** Opções do picker no Keystatic: `label` curto; o caminho técnico aparece na linha secundária do item. */
export const VISIT_CARD_FA_SELECT_OPTIONS: { label: string; value: string }[] =
  [
    { label: 'DEV (dev.to)', value: 'brands__dev' },
    { label: 'GitHub', value: 'brands__github' },
    { label: 'GitLab', value: 'brands__gitlab' },
    { label: 'LinkedIn (quadrado)', value: 'brands__linkedin' },
    { label: 'LinkedIn (in)', value: 'brands__linkedinIn' },
    { label: 'X (Twitter)', value: 'brands__xTwitter' },
    { label: 'Twitter', value: 'brands__twitter' },
    { label: 'Instagram', value: 'brands__instagram' },
    { label: 'TikTok', value: 'brands__tiktok' },
    { label: 'YouTube', value: 'brands__youtube' },
    { label: 'Discord', value: 'brands__discord' },
    { label: 'Mastodon', value: 'brands__mastodon' },
    { label: 'Google', value: 'brands__google' },
    { label: 'Facebook', value: 'brands__facebook' },
    { label: 'Reddit', value: 'brands__reddit' },
    { label: 'Stack Overflow', value: 'brands__stackOverflow' },
    { label: 'Medium', value: 'brands__medium' },
    { label: 'Twitch', value: 'brands__twitch' },
    { label: 'Slack', value: 'brands__slack' },
    { label: 'Docker', value: 'brands__docker' },
    { label: 'Apple', value: 'brands__apple' },
    { label: 'Threads', value: 'brands__threads' },
    { label: 'Pinterest', value: 'brands__pinterest' },
    { label: 'WhatsApp', value: 'brands__whatsapp' },
    { label: 'Telegram', value: 'brands__telegram' },
    { label: 'Envelope', value: 'solid__envelope' },
    { label: 'Link', value: 'solid__link' },
    { label: 'Globo', value: 'solid__globe' },
    { label: 'RSS', value: 'solid__rss' },
    { label: 'Casa', value: 'solid__house' },
    { label: 'Pasta / trabalho', value: 'solid__briefcase' },
    { label: 'Código', value: 'solid__code' },
  ]

export function getVisitCardFaIcon(
  key: string | undefined | null,
): IconDefinition | undefined {
  if (!key?.trim()) return undefined
  return VISIT_CARD_FA_ICON_MAP[key.trim()]
}
