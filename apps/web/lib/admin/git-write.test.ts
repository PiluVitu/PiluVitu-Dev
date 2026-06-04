/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { commitFile, AdminAuthError, type OctokitLike } from './git-write'

beforeAll(() => {
  process.env.KEYSTATIC_GITHUB_REPO = 'PiluVitu/PiluVitu-Dev'
  process.env.BLOG_REPO_OWNER = 'PiluVitu'
  process.env.BLOG_REPO_NAME = 'piluvitu-blog'
})

function fakeOctokit(over: Partial<OctokitLike['repos']> = {}): {
  octokit: OctokitLike
  calls: { create: any[]; get: any[] }
} {
  const calls = { create: [] as any[], get: [] as any[] }
  const octokit: OctokitLike = {
    repos: {
      async getContent(p) {
        calls.get.push(p)
        return { data: { sha: 'existing-sha' } }
      },
      async createOrUpdateFileContents(p) {
        calls.create.push(p)
        return { data: { commit: { sha: 'new-commit' } } }
      },
      ...over,
    },
  }
  return { octokit, calls }
}

describe('commitFile', () => {
  it('throws AdminAuthError when not linked', async () => {
    await expect(
      commitFile(null, {
        repo: 'site',
        path: 'a.yaml',
        content: 'x',
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(AdminAuthError)
  })

  it('updates an existing file with its sha (site repo)', async () => {
    const { octokit, calls } = fakeOctokit()
    const res = await commitFile(
      { token: 't', login: 'me' },
      {
        repo: 'site',
        path: 'content/x.yaml',
        content: 'hello',
        message: 'msg',
      },
      { makeOctokit: () => octokit },
    )
    expect(res.commitSha).toBe('new-commit')
    expect(calls.get[0]).toMatchObject({
      owner: 'PiluVitu',
      repo: 'PiluVitu-Dev',
      path: 'content/x.yaml',
    })
    expect(calls.create[0]).toMatchObject({
      sha: 'existing-sha',
      branch: 'main',
    })
    expect(
      Buffer.from(calls.create[0].content, 'base64').toString('utf8'),
    ).toBe('hello')
  })

  it('creates a new file (404 on getContent → no sha) in the blog repo', async () => {
    const { octokit, calls } = fakeOctokit({
      async getContent() {
        throw Object.assign(new Error('Not Found'), { status: 404 })
      },
    })
    await commitFile(
      { token: 't', login: 'me' },
      {
        repo: 'blog',
        path: 'content/posts/new.mdx',
        content: '# hi',
        message: 'msg',
      },
      { makeOctokit: () => octokit },
    )
    expect(calls.create[0]).toMatchObject({
      owner: 'PiluVitu',
      repo: 'piluvitu-blog',
      sha: undefined,
    })
  })

  it('refreshes once on 401 and retries, returning the refreshed token', async () => {
    let firstCall = true
    const octokit: OctokitLike = {
      repos: {
        async getContent() {
          return { data: { sha: 's' } }
        },
        async createOrUpdateFileContents() {
          if (firstCall) {
            firstCall = false
            throw Object.assign(new Error('Bad credentials'), { status: 401 })
          }
          return { data: { commit: { sha: 'after-refresh' } } }
        },
      },
    }
    const res = await commitFile(
      { token: 'old', login: 'me', refreshToken: 'r' },
      { repo: 'site', path: 'x.yaml', content: 'y', message: 'm' },
      {
        makeOctokit: () => octokit,
        refresh: async () => ({
          access_token: 'new',
          refresh_token: 'r2',
          expires_in: 28800,
        }),
      },
    )
    expect(res.commitSha).toBe('after-refresh')
    expect(res.refreshed?.token).toBe('new')
    expect(res.refreshed?.login).toBe('me')
  })

  it('refreshes when getContent returns 401, then retries', async () => {
    let firstGet = true
    const octokit: OctokitLike = {
      repos: {
        async getContent() {
          if (firstGet) {
            firstGet = false
            throw Object.assign(new Error('Bad credentials'), { status: 401 })
          }
          return { data: { sha: 's' } }
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: 'committed' } } }
        },
      },
    }
    const res = await commitFile(
      { token: 'old', login: 'me', refreshToken: 'r' },
      { repo: 'site', path: 'x.yaml', content: 'y', message: 'm' },
      {
        makeOctokit: () => octokit,
        refresh: async () => ({ access_token: 'new' }),
      },
    )
    expect(res.commitSha).toBe('committed')
    expect(res.refreshed?.token).toBe('new')
  })
})
