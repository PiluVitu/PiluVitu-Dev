import { refreshToken as ghRefresh } from './github-oauth'
import type { AdminGithubToken } from './token-cookie'

export class AdminAuthError extends Error {
  constructor(message = 'GitHub not linked') {
    super(message)
    this.name = 'AdminAuthError'
  }
}

export type Repo = 'site' | 'blog'

/** Minimal structural subset of Octokit used here — keeps tests free of the real client. */
export interface OctokitLike {
  repos: {
    getContent(params: {
      owner: string
      repo: string
      path: string
      ref?: string
    }): Promise<{ data: unknown }>
    createOrUpdateFileContents(params: {
      owner: string
      repo: string
      path: string
      branch?: string
      message: string
      content: string
      sha?: string
    }): Promise<{ data: { commit: { sha?: string } } }>
  }
}

export interface CommitFileOptions {
  repo: Repo
  path: string
  content: string
  message: string
  branch?: string
}

export interface CommitDeps {
  makeOctokit?: (token: string) => OctokitLike | Promise<OctokitLike>
  refresh?: (refreshToken: string) => Promise<{
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }>
}

export interface CommitResult {
  commitSha: string
  /** Present only when a 401 triggered a token refresh; caller should re-seal the cookie. */
  refreshed?: AdminGithubToken
}

function repoSlug(repo: Repo): { owner: string; repo: string } {
  if (repo === 'site') {
    const raw =
      process.env.KEYSTATIC_GITHUB_REPO?.trim() || 'PiluVitu/PiluVitu-Dev'
    const [owner, name] = raw.split('/').map((s) => s.trim())
    return { owner, repo: name }
  }
  return {
    owner: process.env.BLOG_REPO_OWNER ?? 'PiluVitu',
    repo: process.env.BLOG_REPO_NAME ?? 'piluvitu-blog',
  }
}

function statusOf(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status
}

async function defaultMakeOctokit(token: string): Promise<OctokitLike> {
  const { Octokit } = await import('@octokit/rest')
  return new Octokit({ auth: token }) as unknown as OctokitLike
}

export async function commitFile(
  auth: AdminGithubToken | null,
  opts: CommitFileOptions,
  deps: CommitDeps = {},
): Promise<CommitResult> {
  if (!auth) throw new AdminAuthError()

  const makeOctokit = deps.makeOctokit ?? defaultMakeOctokit
  const refresh = deps.refresh ?? ghRefresh
  const { owner, repo } = repoSlug(opts.repo)
  const branch = opts.branch ?? 'main'

  const runWith = async (token: string): Promise<string> => {
    const octokit = await Promise.resolve(makeOctokit(token))
    let sha: string | undefined
    try {
      const existing = await octokit.repos.getContent({
        owner,
        repo,
        path: opts.path,
        ref: branch,
      })
      const data = existing.data as { sha?: string } | unknown[]
      if (
        !Array.isArray(data) &&
        data &&
        typeof data === 'object' &&
        'sha' in data
      ) {
        sha = (data as { sha: string }).sha
      }
    } catch (err) {
      if (statusOf(err) !== 404) throw err // 404 = file doesn't exist yet → create
    }
    const res = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: opts.path,
      branch,
      message: opts.message,
      content: Buffer.from(opts.content, 'utf8').toString('base64'),
      sha,
    })
    return res.data.commit.sha ?? ''
  }

  try {
    return { commitSha: await runWith(auth.token) }
  } catch (err) {
    if (statusOf(err) === 401 && auth.refreshToken) {
      const r = await refresh(auth.refreshToken)
      if (r.access_token) {
        const commitSha = await runWith(r.access_token)
        const refreshed: AdminGithubToken = {
          token: r.access_token,
          login: auth.login,
          refreshToken: r.refresh_token ?? auth.refreshToken,
          expiresAt: r.expires_in
            ? Date.now() + r.expires_in * 1000
            : undefined,
        }
        return { commitSha, refreshed }
      }
    }
    throw err
  }
}
