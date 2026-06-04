import type { Octokit } from '@octokit/rest'
import { slugify } from './slugify'

export const MEDIA_DIR = 'public/media'
const IMAGE_EXT = /\.(png|jpe?g|webp|svg|gif)$/i

export interface MediaItem {
  filename: string
  path: string
  size: number
  sha: string
}
export interface ReadDeps {
  makeOctokit?: (token: string) => {
    repos: {
      getContent(p: {
        owner: string
        repo: string
        path: string
        ref?: string
      }): Promise<{ data: unknown }>
    }
  }
}

function siteRepo(): { owner: string; repo: string } {
  const raw =
    process.env.KEYSTATIC_GITHUB_REPO?.trim() || 'PiluVitu/PiluVitu-Dev'
  const [owner, repo] = raw.split('/').map((s) => s.trim())
  return { owner, repo }
}

async function makeOctokitDefault(
  token: string,
): Promise<InstanceType<typeof Octokit>> {
  const { Octokit: O } = await import('@octokit/rest')
  return new O({ auth: token })
}

export function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  const safeBase = slugify(base) || 'arquivo'
  return ext ? `${safeBase}.${ext}` : safeBase
}

export function uniqueFilename(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let n = 1
  while (existing.includes(`${base}-${n}${ext}`)) n++
  return `${base}-${n}${ext}`
}

export async function listMedia(
  token: string,
  deps: ReadDeps = {},
): Promise<MediaItem[]> {
  const make =
    deps.makeOctokit ??
    (makeOctokitDefault as unknown as NonNullable<ReadDeps['makeOctokit']>)
  const octokit = await Promise.resolve(make(token))
  const { owner, repo } = siteRepo()
  let entries: { name: string; type: string; size: number; sha: string }[]
  try {
    const res = await octokit.repos.getContent({
      owner,
      repo,
      path: MEDIA_DIR,
      ref: 'main',
    })
    entries = res.data as {
      name: string
      type: string
      size: number
      sha: string
    }[]
  } catch {
    return []
  }
  return entries
    .filter((e) => e.type === 'file' && IMAGE_EXT.test(e.name))
    .map((e) => ({
      filename: e.name,
      path: `/media/${e.name}`,
      size: e.size,
      sha: e.sha,
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename))
}
