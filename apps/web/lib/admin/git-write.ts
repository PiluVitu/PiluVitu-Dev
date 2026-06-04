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
    deleteFile?(params: {
      owner: string
      repo: string
      path: string
      message: string
      sha: string
      branch?: string
    }): Promise<{ data: { commit: { sha?: string } } }>
  }
  git?: {
    getRef(p: {
      owner: string
      repo: string
      ref: string
    }): Promise<{ data: { object: { sha: string } } }>
    getCommit(p: {
      owner: string
      repo: string
      commit_sha: string
    }): Promise<{ data: { tree: { sha: string } } }>
    createTree(p: {
      owner: string
      repo: string
      base_tree: string
      tree: { path: string; mode: '100644'; type: 'blob'; content: string }[]
    }): Promise<{ data: { sha: string } }>
    createCommit(p: {
      owner: string
      repo: string
      message: string
      tree: string
      parents: string[]
    }): Promise<{ data: { sha: string } }>
    updateRef(p: {
      owner: string
      repo: string
      ref: string
      sha: string
    }): Promise<{ data: unknown }>
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
    const parts = raw.split('/').map((s) => s.trim())
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(
        `KEYSTATIC_GITHUB_REPO must be "owner/repo", got: "${raw}"`,
      )
    }
    return { owner: parts[0], repo: parts[1] }
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
    const commitSha = res.data.commit.sha
    if (!commitSha) throw new Error('GitHub API returned no commit sha')
    return commitSha
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

export async function deleteFile(
  auth: AdminGithubToken | null,
  opts: { repo: Repo; path: string; message: string; branch?: string },
  deps: CommitDeps = {},
): Promise<CommitResult> {
  if (!auth) throw new AdminAuthError()
  const makeOctokit = deps.makeOctokit ?? defaultMakeOctokit
  const refresh = deps.refresh ?? ghRefresh
  const { owner, repo } = repoSlug(opts.repo)
  const branch = opts.branch ?? 'main'

  const run = async (token: string): Promise<string> => {
    const octokit = await Promise.resolve(makeOctokit(token))
    const existing = await octokit.repos.getContent({
      owner,
      repo,
      path: opts.path,
      ref: branch,
    })
    const data = existing.data as { sha?: string } | unknown[]
    if (
      Array.isArray(data) ||
      !data ||
      typeof data !== 'object' ||
      !('sha' in data)
    ) {
      throw new Error(`Cannot resolve sha for ${opts.path}`)
    }
    if (!octokit.repos.deleteFile)
      throw new Error('deleteFile not supported by this Octokit instance')
    const res = await octokit.repos.deleteFile({
      owner,
      repo,
      path: opts.path,
      branch,
      message: opts.message,
      sha: (data as { sha: string }).sha,
    })
    const sha = res.data.commit.sha
    if (!sha) throw new Error('GitHub API returned no commit sha')
    return sha
  }

  try {
    return { commitSha: await run(auth.token) }
  } catch (err) {
    if (statusOf(err) === 401 && auth.refreshToken) {
      const r = await refresh(auth.refreshToken)
      if (r.access_token) {
        const commitSha = await run(r.access_token)
        return {
          commitSha,
          refreshed: {
            token: r.access_token,
            login: auth.login,
            refreshToken: r.refresh_token ?? auth.refreshToken,
            expiresAt: r.expires_in
              ? Date.now() + r.expires_in * 1000
              : undefined,
          },
        }
      }
    }
    throw err
  }
}

export async function commitFiles(
  auth: AdminGithubToken | null,
  opts: {
    repo: Repo
    message: string
    files: { path: string; content: string }[]
    branch?: string
  },
  deps: CommitDeps = {},
): Promise<CommitResult> {
  if (!auth) throw new AdminAuthError()
  const makeOctokit = deps.makeOctokit ?? defaultMakeOctokit
  const refresh = deps.refresh ?? ghRefresh
  const { owner, repo } = repoSlug(opts.repo)
  const branch = opts.branch ?? 'main'
  const ref = `heads/${branch}`

  const run = async (token: string): Promise<string> => {
    const octokit = await Promise.resolve(makeOctokit(token))
    if (!octokit.git)
      throw new Error('git namespace not supported by this Octokit instance')
    const baseRef = await octokit.git.getRef({ owner, repo, ref })
    const baseCommit = baseRef.data.object.sha
    const base = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: baseCommit,
    })
    const tree = await octokit.git.createTree({
      owner,
      repo,
      base_tree: base.data.tree.sha,
      tree: opts.files.map((f) => ({
        path: f.path,
        mode: '100644' as const,
        type: 'blob' as const,
        content: f.content,
      })),
    })
    const commit = await octokit.git.createCommit({
      owner,
      repo,
      message: opts.message,
      tree: tree.data.sha,
      parents: [baseCommit],
    })
    await octokit.git.updateRef({ owner, repo, ref, sha: commit.data.sha })
    return commit.data.sha
  }

  try {
    return { commitSha: await run(auth.token) }
  } catch (err) {
    if (statusOf(err) === 401 && auth.refreshToken) {
      const r = await refresh(auth.refreshToken)
      if (r.access_token) {
        const commitSha = await run(r.access_token)
        return {
          commitSha,
          refreshed: {
            token: r.access_token,
            login: auth.login,
            refreshToken: r.refresh_token ?? auth.refreshToken,
            expiresAt: r.expires_in
              ? Date.now() + r.expires_in * 1000
              : undefined,
          },
        }
      }
    }
    throw err
  }
}
