/** @jest-environment node */
import { listEntries, type ReadDeps } from './content-read'
import { COLLECTIONS } from './content-registry'

function b64(s: string) {
  return Buffer.from(s, 'utf8').toString('base64')
}

describe('listEntries', () => {
  it('lists dir, fetches each index.yaml, parses + sorts by order', async () => {
    const fakeOctokit = {
      repos: {
        async getContent(p: { path: string }) {
          if (p.path === 'content/projects') {
            return {
              data: [
                { name: 'b', type: 'dir' },
                { name: 'a', type: 'dir' },
              ],
            }
          }
          const slug = p.path.includes('/a/') ? 'a' : 'b'
          const order = slug === 'a' ? 1 : 0
          const yaml = `projectSlug: ${slug}\norder: ${order}\nprojectName: ${slug.toUpperCase()}\nsubtitle: ''\nprojectLogo: ''\ndescription: ''\ntags: []\ndeployLink: ''\nrepoLink: ''\nimage: ''\naltImage: ''`
          return { data: { content: b64(yaml), encoding: 'base64' } }
        },
      },
    }
    const deps: ReadDeps = { makeOctokit: () => fakeOctokit as never }
    const entries = await listEntries(COLLECTIONS.projects, 'token', deps)
    expect(entries.map((e) => e.slug)).toEqual(['b', 'a']) // sorted by order 0,1
    expect(entries[0].data.projectName).toBe('B')
  })
})
