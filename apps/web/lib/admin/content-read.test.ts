/** @jest-environment node */
import {
  listEntries,
  getEntry,
  readProfile,
  type ReadDeps,
} from './content-read'
import { COLLECTIONS } from './content-registry'

function b64(s: string) {
  return Buffer.from(s, 'utf8').toString('base64')
}

describe('listEntries', () => {
  it('lists dir, fetches each index.yaml, parses + sorts by order', async () => {
    const fakeOctokit = {
      repos: {
        async getContent(p: { path: string }) {
          if (p.path === 'apps/web/content/projects') {
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

  it('getEntry reads a single index.yaml and parses it', async () => {
    const fakeOctokit = {
      repos: {
        async getContent(p: { path: string }) {
          expect(p.path).toBe('apps/web/content/projects/live-prs/index.yaml')
          const yaml = `projectSlug: live-prs\norder: 0\nprojectName: Live PRs\nsubtitle: ''\nprojectLogo: ''\ndescription: ''\ntags: []\ndeployLink: ''\nrepoLink: ''\nimage: ''\naltImage: ''`
          return { data: { content: b64(yaml), encoding: 'base64' } }
        },
      },
    }
    const entry = await getEntry(COLLECTIONS.projects, 'live-prs', 'token', {
      makeOctokit: () => fakeOctokit as never,
    })
    expect(entry.slug).toBe('live-prs')
    expect(entry.data.projectName).toBe('Live PRs')
  })

  it('readProfile reads the profile singleton', async () => {
    let path = ''
    const fakeOctokit = {
      repos: {
        async getContent(p: { path: string }) {
          path = p.path
          const yaml = `displayName: Paulo\navatarSrc: '/a.jpg'\navatarAlt: alt\nroleHighlight: SRE\ncompanyName: Reapho\ncompanyLink: ''\ncompanyLinkColor: '#14b8a6'\nbio: b\navailabilityOpen: true\navailabilityLabel: Disponível\nlocation: Brasil\ndisciplines: []`
          return { data: { content: b64(yaml), encoding: 'base64' } }
        },
      },
    }
    const data = await readProfile('token', {
      makeOctokit: () => fakeOctokit as never,
    })
    expect(path).toBe('apps/web/content/site/profile/index.yaml')
    expect(data.displayName).toBe('Paulo')
  })
})
