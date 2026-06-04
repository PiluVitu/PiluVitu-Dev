/** Client-safe: maps a stored `/media/<file>` path to a raw GitHub URL for immediate
 * preview (before the Vercel redeploy serves it at /media/<file>). External URLs and
 * legacy paths pass through unchanged. Repo slug is public; override via NEXT_PUBLIC_GITHUB_REPO. */
const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? 'PiluVitu/PiluVitu-Dev'

export function mediaRawUrl(value: string): string {
  if (!value) return value
  if (value.startsWith('/media/')) {
    return `https://raw.githubusercontent.com/${REPO}/main/public${value}`
  }
  return value
}
