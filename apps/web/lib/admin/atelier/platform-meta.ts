export interface PlatformMeta {
  label: string
  charLimit?: number // só p/ social_hook
}

export const PLATFORM_META: Record<string, PlatformMeta> = {
  devto: { label: 'dev.to' },
  hashnode: { label: 'Hashnode' },
  bluesky: { label: 'Bluesky', charLimit: 300 },
  mastodon: { label: 'Mastodon', charLimit: 500 },
}

export function platformLabel(platform: string): string {
  return PLATFORM_META[platform]?.label ?? platform
}
