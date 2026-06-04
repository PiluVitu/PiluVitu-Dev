/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { commitFile, AdminAuthError, type OctokitLike } from './git-write'
import { deleteFile, commitFiles } from './git-write'

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

describe('deleteFile', () => {
  it('throws AdminAuthError when not linked', async () => {
    await expect(
      deleteFile(null, {
        repo: 'site',
        path: 'content/x/i.yaml',
        message: 'm',
      }),
    ).rejects.toBeInstanceOf(AdminAuthError)
  })
  it('looks up the sha then deletes', async () => {
    const calls: { del: any[] } = { del: [] }
    const octokit: OctokitLike = {
      repos: {
        async getContent() {
          return { data: { sha: 'sha1' } }
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: 'x' } } }
        },
        async deleteFile(p) {
          calls.del.push(p)
          return { data: { commit: { sha: 'del-commit' } } }
        },
      },
    }
    const res = await deleteFile(
      { token: 't', login: 'me' },
      { repo: 'site', path: 'content/projects/x/index.yaml', message: 'rm' },
      { makeOctokit: () => octokit },
    )
    expect(res.commitSha).toBe('del-commit')
    expect(calls.del[0]).toMatchObject({
      owner: 'PiluVitu',
      repo: 'PiluVitu-Dev',
      sha: 'sha1',
      path: 'content/projects/x/index.yaml',
    })
  })

  it('refreshes once on 401 and retries', async () => {
    const { deleteFile } = await import('./git-write')
    let first = true
    const octokit: OctokitLike = {
      repos: {
        async getContent() {
          return { data: { sha: 's' } }
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: 'x' } } }
        },
        async deleteFile() {
          if (first) {
            first = false
            throw Object.assign(new Error('bad creds'), { status: 401 })
          }
          return { data: { commit: { sha: 'after-refresh' } } }
        },
      },
    }
    const res = await deleteFile(
      { token: 'old', login: 'me', refreshToken: 'r' },
      { repo: 'site', path: 'content/x/index.yaml', message: 'm' },
      {
        makeOctokit: () => octokit,
        refresh: async () => ({ access_token: 'new' }),
      },
    )
    expect(res.commitSha).toBe('after-refresh')
    expect(res.refreshed?.token).toBe('new')
  })
})

describe('commitFiles', () => {
  it('creates a tree commit and updates the ref', async () => {
    const seen: Record<string, unknown> = {}
    const octokit = {
      repos: {
        async getContent() {
          return { data: {} }
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: 'x' } } }
        },
      },
      git: {
        async getRef(p: unknown) {
          seen.getRef = p
          return { data: { object: { sha: 'base-commit' } } }
        },
        async getCommit(p: unknown) {
          seen.getCommit = p
          return { data: { tree: { sha: 'base-tree' } } }
        },
        async createTree(p: unknown) {
          seen.createTree = p
          return { data: { sha: 'new-tree' } }
        },
        async createCommit(p: unknown) {
          seen.createCommit = p
          return { data: { sha: 'new-commit' } }
        },
        async updateRef(p: unknown) {
          seen.updateRef = p
          return { data: {} }
        },
      },
    }
    const res = await commitFiles(
      { token: 't', login: 'me' },
      {
        repo: 'site',
        message: 'reorder',
        files: [
          { path: 'content/projects/a/index.yaml', content: 'order: 0' },
          { path: 'content/projects/b/index.yaml', content: 'order: 1' },
        ],
      },
      { makeOctokit: () => octokit as unknown as OctokitLike },
    )
    expect(res.commitSha).toBe('new-commit')
    expect((seen.createTree as { tree: unknown[] }).tree).toHaveLength(2)
    expect((seen.createTree as { base_tree: string }).base_tree).toBe(
      'base-tree',
    )
    expect((seen.createCommit as { parents: string[] }).parents).toEqual([
      'base-commit',
    ])
    expect((seen.updateRef as { sha: string }).sha).toBe('new-commit')
  })

  it('throws AdminAuthError when not linked', async () => {
    const { commitFiles } = await import('./git-write')
    await expect(
      commitFiles(null, { repo: 'site', message: 'm', files: [] }),
    ).rejects.toBeInstanceOf(AdminAuthError)
  })

  it('refreshes once on 401 and retries', async () => {
    const { commitFiles } = await import('./git-write')
    let first = true
    const octokit = {
      repos: {
        async getContent() {
          return { data: {} }
        },
        async createOrUpdateFileContents() {
          return { data: { commit: { sha: 'x' } } }
        },
      },
      git: {
        async getRef() {
          return { data: { object: { sha: 'base-commit' } } }
        },
        async getCommit() {
          return { data: { tree: { sha: 'base-tree' } } }
        },
        async createTree() {
          return { data: { sha: 'new-tree' } }
        },
        async createCommit() {
          if (first) {
            first = false
            throw Object.assign(new Error('bad creds'), { status: 401 })
          }
          return { data: { sha: 'after-refresh' } }
        },
        async updateRef() {
          return { data: {} }
        },
      },
    }
    const res = await commitFiles(
      { token: 'old', login: 'me', refreshToken: 'r' },
      { repo: 'site', message: 'm', files: [{ path: 'a', content: 'x' }] },
      {
        makeOctokit: () => octokit as unknown as OctokitLike,
        refresh: async () => ({ access_token: 'new' }),
      },
    )
    expect(res.commitSha).toBe('after-refresh')
    expect(res.refreshed?.token).toBe('new')
  })
})
