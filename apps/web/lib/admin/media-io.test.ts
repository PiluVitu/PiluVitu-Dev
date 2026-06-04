/** @jest-environment node */
import {
  listMedia,
  sanitizeFilename,
  uniqueFilename,
  type ReadDeps,
} from './media-io'

describe('sanitizeFilename', () => {
  it('slugifies the base, lowercases, keeps the extension', () => {
    expect(sanitizeFilename('Capa Husky.PNG')).toBe('capa-husky.png')
    expect(sanitizeFilename('Olá Mundo!.JPEG')).toBe('ola-mundo.jpeg')
  })
})
describe('uniqueFilename', () => {
  it('returns the name when free', () => {
    expect(uniqueFilename('a.png', ['b.png'])).toBe('a.png')
  })
  it('auto-suffixes on collision', () => {
    expect(uniqueFilename('a.png', ['a.png'])).toBe('a-1.png')
    expect(uniqueFilename('a.png', ['a.png', 'a-1.png'])).toBe('a-2.png')
  })
})
describe('listMedia', () => {
  it('lists image files in apps/web/public/media as { filename, path, size, sha }', async () => {
    let calledPath = ''
    const octokit = {
      repos: {
        async getContent(p: { path: string }) {
          calledPath = p.path
          return {
            data: [
              { name: 'capa.png', type: 'file', size: 100, sha: 's1' },
              { name: 'notes.txt', type: 'file', size: 5, sha: 's2' },
            ],
          }
        },
      },
    }
    const deps: ReadDeps = { makeOctokit: () => octokit as never }
    expect(await listMedia('token', deps)).toEqual([
      { filename: 'capa.png', path: '/media/capa.png', size: 100, sha: 's1' },
    ])
    // monorepo: o GitHub path leva o prefixo apps/web; o valor salvo fica /media/...
    expect(calledPath).toBe('apps/web/public/media')
  })
  it('returns [] when the folder does not exist', async () => {
    const octokit = {
      repos: {
        async getContent() {
          throw Object.assign(new Error('Not Found'), { status: 404 })
        },
      },
    }
    expect(
      await listMedia('token', { makeOctokit: () => octokit as never }),
    ).toEqual([])
  })
})
