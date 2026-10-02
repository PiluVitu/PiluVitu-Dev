/** @jest-environment node */
import {
  projectSchema,
  carreiraSchema,
  socialSchema,
  profileSchema,
  pilulabsSchema,
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

// Regressão: o Keystatic omite campos opcionais vazios no YAML, então a leitura
// do admin precisa tolerar a ausência (default) em vez de estourar ZodError →
// 502 (caso real: "seven-consulting" sem `image`).
describe('content-schemas toleram campos opcionais ausentes', () => {
  it('carreira sem `image` parseia com image=""', () => {
    const parsed = carreiraSchema.parse({
      orgSlug: 'seven-consulting',
      order: 2,
      orgName: 'Seven',
      // image (e demais opcionais) OMITIDOS
    })
    expect(parsed.image).toBe('')
    expect(parsed.current).toBe(false)
    expect(parsed.tags).toEqual([])
  })

  it('social em modo imagem sem `fontawesomeIcon` parseia com ""', () => {
    const parsed = socialSchema.parse({
      key: 'logo',
      order: 0,
      iconMode: 'image',
      image: '/x.png',
      // fontawesomeIcon OMITIDO
    })
    expect(parsed.fontawesomeIcon).toBe('')
  })

  it('profile sem os opcionais do Home V2 parseia com defaults', () => {
    const parsed = profileSchema.parse({
      displayName: 'Paulo',
      companyLinkColor: '#14b8a6',
      // availabilityOpen / disciplines / location OMITIDOS
    })
    expect(parsed.availabilityOpen).toBe(false)
    expect(parsed.disciplines).toEqual([])
    expect(parsed.avatarSrc).toBe('')
  })

  it('project só com slug + nome parseia (resto default)', () => {
    const parsed = projectSchema.parse({
      projectSlug: 'p',
      projectName: 'P',
    })
    expect(parsed.order).toBe(0)
    expect(parsed.image).toBe('')
    expect(parsed.tags).toEqual([])
  })
})

const botai = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao: 'Extensão que preenche formulários.',
  tipo: 'extensao' as const,
  tags: ['QA'],
  logo: '/pilulabs/botai/icone-128.png',
  sigla: '',
  site: 'https://botai.pilutech.com.br',
  repo: 'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  destaque: true,
  data: '2026-10-01',
  listado: true,
  paginaPropria: true,
}

describe('pilulabsSchema', () => {
  it('aceita o Botaí do conteúdo inicial', () => {
    expect(pilulabsSchema.parse(botai)).toEqual(botai)
  })

  // O Keystatic e o próprio admin (data vazia) omitem chaves: só slug e nome
  // são obrigatórios, o resto vira o vazio do tipo.
  it('só slug e nome: o resto vira o vazio do tipo', () => {
    expect(pilulabsSchema.parse({ slug: 'x', nome: 'X' })).toEqual({
      slug: 'x',
      order: 0,
      nome: 'X',
      subtitulo: '',
      descricao: '',
      tipo: 'web',
      tags: [],
      logo: '',
      sigla: '',
      site: '',
      repo: '',
      chromeUrl: '',
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
      destaque: false,
      data: '',
      listado: false,
      paginaPropria: false,
    })
  })

  it.each([
    ['slug com espaço', { slug: 'Bad Slug' }],
    ['slug www (é o host da vitrine)', { slug: 'www' }],
    ['nome vazio', { nome: '' }],
    ['tipo fora da lista', { tipo: 'desktop' }],
    ['site em http', { site: 'http://botai.pilutech.com.br' }],
    ['repo javascript:', { repo: 'javascript:alert(1)' }],
    ['loja de outro host', { chromeUrl: 'https://addons.mozilla.org/x' }],
    ['data que não existe', { data: '2026-02-30' }],
    ['data em outro formato', { data: '01/10/2026' }],
    ['order negativo', { order: -1 }],
  ])('recusa %s', (_caso, parcial) => {
    expect(pilulabsSchema.safeParse({ ...botai, ...parcial }).success).toBe(
      false,
    )
  })

  it('a URL de loja errada acusa o campo dela', () => {
    const resultado = pilulabsSchema.safeParse({
      ...botai,
      operaUrl: 'https://example.com/botai',
    })
    expect(
      resultado.success
        ? []
        : resultado.error.issues.map((i) => [i.path.join('.'), i.message]),
    ).toEqual([['operaUrl', 'Use a URL https:// da própria loja']])
  })
})
