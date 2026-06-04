/** @jest-environment node */
import {
  projectSchema,
  carreiraSchema,
  socialSchema,
  profileSchema,
  SLUG_RE,
} from './content-schemas'

const project = {
  projectSlug: 'live-prs',
  order: 0,
  projectName: 'Live PRs',
  subtitle: '',
  projectLogo: '/x.svg',
  description: 'desc',
  tags: ['Go'],
  deployLink: '',
  repoLink: '',
  image: '/i.png',
  altImage: 'LPR',
}

describe('content-schemas', () => {
  it('accepts a valid project', () => {
    expect(projectSchema.parse(project)).toEqual(project)
  })
  it('rejects an invalid slug', () => {
    expect(
      projectSchema.safeParse({ ...project, projectSlug: 'Bad Slug' }).success,
    ).toBe(false)
  })
  it('rejects a negative order', () => {
    expect(projectSchema.safeParse({ ...project, order: -1 }).success).toBe(
      false,
    )
  })
  it('accepts a valid carreira', () => {
    expect(
      carreiraSchema.safeParse({
        orgSlug: 'aride',
        order: 1,
        orgName: 'Aride',
        orgDescription: 'd',
        orgLink: '',
        image: '',
        altImage: 'AR',
        title: 'Dev',
        location: 'Remoto',
        date: 'Mar 2024',
        atribuitions: ['x'],
        current: true,
        tags: ['Remoto'],
      }).success,
    ).toBe(true)
  })
  it('rejects an unknown social icon and accepts a known one', () => {
    const base = {
      key: 'github',
      order: 0,
      socialDescription: 'd',
      socialLink: 'https://x',
      iconMode: 'fontawesome' as const,
      fontawesomeIcon: 'brands__github',
      image: '',
      altImage: 'GH',
    }
    expect(socialSchema.safeParse(base).success).toBe(true)
    expect(
      socialSchema.safeParse({ ...base, fontawesomeIcon: 'nope__x' }).success,
    ).toBe(false)
  })
  it('accepts a valid profile and rejects an unknown color', () => {
    const base = {
      displayName: 'Paulo',
      avatarSrc: '/a.jpg',
      avatarAlt: 'alt',
      roleHighlight: 'SRE',
      companyName: 'Reapho',
      companyLink: '',
      companyLinkColor: '#14b8a6',
      bio: 'b',
      availabilityOpen: true,
      availabilityLabel: 'Disponível',
      location: 'Brasil',
      disciplines: ['SRE'],
    }
    expect(profileSchema.safeParse(base).success).toBe(true)
    expect(
      profileSchema.safeParse({ ...base, companyLinkColor: '#000000' }).success,
    ).toBe(false)
  })
  it('exposes a slug regex', () => {
    expect(SLUG_RE.test('live-prs')).toBe(true)
    expect(SLUG_RE.test('Bad')).toBe(false)
  })
})
