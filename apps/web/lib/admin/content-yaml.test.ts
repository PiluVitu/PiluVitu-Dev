/** @jest-environment node */
import { serializeEntry, parseEntry } from './content-yaml'
import { COLLECTIONS } from './content-registry'

const project = {
  projectSlug: 'live-prs',
  order: 0,
  projectName: 'Live PRs',
  subtitle: 'agregador',
  projectLogo: '/x.svg',
  description:
    'uma descrição razoavelmente longa que pode ser dobrada em múltiplas linhas pelo serializador',
  tags: ['React', 'Go'],
  deployLink: 'https://x',
  repoLink: '',
  image: '/i.png',
  altImage: 'LPR',
}

describe('content-yaml', () => {
  it('round-trips a project through serialize → parse', () => {
    const yaml = serializeEntry(COLLECTIONS.projects, project)
    expect(typeof yaml).toBe('string')
    expect(parseEntry(COLLECTIONS.projects, yaml)).toEqual(project)
  })
  it('emits keys in registry order', () => {
    const yaml = serializeEntry(COLLECTIONS.projects, project)
    const keys = yaml
      .split('\n')
      .map((l) => l.match(/^([a-zA-Z]+):/)?.[1])
      .filter(Boolean)
    expect(keys.slice(0, 3)).toEqual(['projectSlug', 'order', 'projectName'])
  })
  it('rejects content that fails the schema on parse', () => {
    expect(() =>
      parseEntry(
        COLLECTIONS.projects,
        'projectSlug: Bad Slug\norder: 0\nprojectName: x',
      ),
    ).toThrow()
  })
})
