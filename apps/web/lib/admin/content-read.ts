import { parse as yamlParse } from 'yaml'
import { sitePath } from './site-paths'
import { profileSchema, type ProfileEntry } from './content-schemas'
import type { CollectionDef } from './content-registry'

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

function decode(data: unknown): string {
  const d = data as { content?: string; encoding?: string }
  if (typeof d.content !== 'string') throw new Error('No file content')
  return Buffer.from(
    d.content,
    d.encoding === 'base64' ? 'base64' : 'utf8',
  ).toString('utf8')
}

export interface ListedEntry<T> {
  slug: string
  data: T
}

async function defaultMakeOctokit(
  token: string,
): Promise<ReturnType<NonNullable<ReadDeps['makeOctokit']>>> {
  const { Octokit } = await import('@octokit/rest')
  return new Octokit({ auth: token }) as never
}

export async function listEntries<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  token: string,
  deps: ReadDeps = {},
): Promise<ListedEntry<T>[]> {
  const make = deps.makeOctokit ?? defaultMakeOctokit
  const octokit = await Promise.resolve(make(token))
  const { owner, repo } = siteRepo()
  const dirRes = await octokit.repos.getContent({
    owner,
    repo,
    path: def.dir,
    ref: 'main',
  })
  const dirs = (dirRes.data as { name: string; type: string }[]).filter(
    (d) => d.type === 'dir',
  )
  const entries = await Promise.all(
    dirs.map(async (d) => {
      const fileRes = await octokit.repos.getContent({
        owner,
        repo,
        path: `${def.dir}/${d.name}/index.yaml`,
        ref: 'main',
      })
      const data = def.schema.parse(yamlParse(decode(fileRes.data)))
      return { slug: d.name, data }
    }),
  )
  return entries.sort((a, b) => Number(a.data.order) - Number(b.data.order))
}

export async function getEntry<T extends Record<string, unknown>>(
  def: CollectionDef<T>,
  slug: string,
  token: string,
  deps: ReadDeps = {},
): Promise<ListedEntry<T>> {
  const make = deps.makeOctokit ?? defaultMakeOctokit
  const octokit = await Promise.resolve(make(token))
  const { owner, repo } = siteRepo()
  const fileRes = await octokit.repos.getContent({
    owner,
    repo,
    path: `${def.dir}/${slug}/index.yaml`,
    ref: 'main',
  })
  return { slug, data: def.schema.parse(yamlParse(decode(fileRes.data))) }
}

export async function readProfile(
  token: string,
  deps: ReadDeps = {},
): Promise<ProfileEntry> {
  const make = deps.makeOctokit ?? defaultMakeOctokit
  const octokit = await Promise.resolve(make(token))
  const { owner, repo } = siteRepo()
  const fileRes = await octokit.repos.getContent({
    owner,
    repo,
    path: sitePath('content/site/profile/index.yaml'),
    ref: 'main',
  })
  return profileSchema.parse(yamlParse(decode(fileRes.data)))
}
