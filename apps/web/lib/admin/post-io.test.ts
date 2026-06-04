/** @jest-environment node */
import { listPosts, getPost, serializePost, type ReadDeps } from './post-io'

function b64(s: string) {
  return Buffer.from(s, 'utf8').toString('base64')
}

const file = (slug: string, draft = false) =>
  `---\ntitle: ${slug.toUpperCase()}\nslug: ${slug}\npublishedAt: '2025-01-0${draft ? 2 : 1}'\ndraft: ${draft}\ntags: []\n---\n\n# ${slug}\n\nbody`

function fakeOctokit() {
  return {
    repos: {
      async getContent(p: { path: string }) {
        if (p.path === 'content/posts') {
          return {
            data: [
              { name: 'a.mdx', type: 'file' },
              { name: 'b.mdx', type: 'file' },
              { name: 'readme.txt', type: 'file' },
            ],
          }
        }
        const slug = p.path.includes('/a.mdx') ? 'a' : 'b'
        return {
          data: {
            content: b64(file(slug, slug === 'b')),
            encoding: 'base64',
            type: 'file',
          },
        }
      },
    },
  }
}

describe('post-io', () => {
  const deps: ReadDeps = { makeOctokit: () => fakeOctokit() as never }

  it('lists .mdx posts (skips non-mdx), newest publishedAt first', async () => {
    const posts = await listPosts('token', deps)
    // b.mdx has publishedAt 2025-01-02 (newer) → comes first; readme.txt skipped
    expect(posts.map((p) => p.slug)).toEqual(['b', 'a'])
  })

  it('getPost returns filename + full frontmatter + body', async () => {
    const post = await getPost('a', 'token', deps)
    expect(post?.filename).toBe('a.mdx')
    expect(post?.slug).toBe('a')
    expect(post?.body.trim().startsWith('# a')).toBe(true)
    expect(post?.frontmatter.title).toBe('A')
  })

  it('getPost matches by parsed slug even when the filename differs, and returns the real filename', async () => {
    const oct = {
      repos: {
        async getContent(p: { path: string }) {
          if (p.path === 'content/posts') {
            return { data: [{ name: 'x.mdx', type: 'file' }] }
          }
          // file named x.mdx but its frontmatter slug is 'y'
          const content = `---\ntitle: X\nslug: y\npublishedAt: '2025-01-01'\ndraft: false\ntags: []\n---\n\nbody`
          return {
            data: { content: b64(content), encoding: 'base64', type: 'file' },
          }
        },
      },
    }
    const d: ReadDeps = { makeOctokit: () => oct as never }
    const found = await getPost('y', 'token', d)
    expect(found?.filename).toBe('x.mdx')
    expect(found?.slug).toBe('y')
    const missing = await getPost('x', 'token', d)
    expect(missing).toBeNull()
  })

  it('serializePost round-trips and preserves unknown keys', () => {
    const raw = {
      title: 'T',
      slug: 't',
      publishedAt: '2025-01-01',
      draft: false,
      tags: ['x'],
      readingTimeMinutes: 7,
    }
    const known = {
      title: 'T2',
      slug: 't',
      excerpt: '',
      coverImage: '',
      tags: ['x'],
      publishedAt: '2025-01-01',
      draft: true,
    }
    const out = serializePost(known, '# body', raw)
    expect(out).toContain('title: T2')
    expect(out).toContain('readingTimeMinutes: 7')
    expect(out).toContain('# body')
  })
})
