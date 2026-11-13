/** @jest-environment node */
import type {
  EntradaDeCarreira,
  EntradaDeSocial,
  EntradaDoPerfil,
  ItemDaColecao,
} from './conteudo-do-cms'
import type { EntradaItem } from './pilulabs'

// Entradas com as bordas que a normalização trata: cor fora do padrão, rótulo e
// local em branco, disciplina e tag vazias, ícone ausente, ordem fora de ordem,
// item fora da vitrine.
const PERFIL: EntradaDoPerfil = {
  displayName: 'Paulo Victor Torres Silva',
  avatarSrc: '/profile-2.jpg',
  avatarAlt: 'Foto',
  roleHighlight: 'Site Reliability Engineering',
  companyName: 'Reapho',
  companyLink: 'https://reapho.app/en',
  companyLinkColor: 'azul',
  bio: 'A bio.',
  availabilityOpen: null,
  availabilityLabel: '   ',
  location: '  Brasil · Remoto  ',
  disciplines: ['SRE', '  ', 'DevOps'],
}

const SOCIALS: ItemDaColecao<EntradaDeSocial>[] = [
  {
    slug: 'linkedin',
    entry: {
      socialDescription: 'Vamos nos conectar',
      socialLink: 'https://www.linkedin.com/in/pilu-vitu/',
      altImage: 'IN',
      iconMode: 'fontawesome',
      fontawesomeIcon: '',
      order: 2,
    },
  },
  {
    slug: 'site',
    entry: {
      socialDescription: 'Meu site',
      socialLink: 'https://exemplo.com.br',
      image: ' /site.png ',
      altImage: 'S',
      iconMode: 'image',
      order: null,
    },
  },
  {
    slug: 'github',
    entry: {
      socialDescription: 'Acesse o meu Github',
      socialLink: 'https://github.com/PiluVitu',
      altImage: 'GH',
      iconMode: 'fontawesome',
      fontawesomeIcon: 'brands__github',
      order: 1,
    },
  },
]

const CARREIRAS: ItemDaColecao<EntradaDeCarreira>[] = [
  {
    slug: 'antiga',
    entry: {
      orgName: 'Antiga',
      orgDescription: 'A primeira.',
      orgLink: 'https://antiga.com.br',
      image: '',
      altImage: 'A',
      title: 'Estagiário',
      location: 'Teresina',
      date: '2021',
      atribuitions: ['Suporte'],
      current: null,
      tags: ['Presencial', ' '],
      order: 3,
    },
  },
  {
    slug: 'atual',
    entry: {
      orgName: 'Atual',
      orgDescription: 'A de agora.',
      orgLink: 'https://atual.com.br',
      image: '/atual.png',
      altImage: 'AT',
      title: 'SRE',
      location: 'Remoto',
      date: '2025 - Atualmente',
      atribuitions: ['Plantão', 'Observabilidade'],
      current: true,
      tags: null,
      order: 0,
    },
  },
]

const PILULABS: ItemDaColecao<EntradaItem>[] = [
  { slug: 'sombrai', entry: { order: 2, nome: 'Sombraí', listado: true } },
  { slug: 'botai', entry: { order: 1, nome: 'Botaí', listado: true } },
  { slug: 'escondido', entry: { order: 0, nome: 'Escondido' } },
]

const mockLeitor = {
  singletons: { siteProfile: { read: async () => PERFIL } },
  collections: {
    socials: { all: async () => SOCIALS },
    carreiras: { all: async () => CARREIRAS },
    pilulabs: { all: async () => PILULABS },
  },
}

jest.mock('server-only', () => ({}))
jest.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: false }),
  cookies: async () => ({ get: () => undefined }),
}))
jest.mock('next/cache', () => ({ unstable_noStore: () => undefined }))
jest.mock('@/lib/keystatic-reader', () => ({
  getKeystaticReader: async () => mockLeitor,
}))

import {
  carreirasDoCms,
  perfilDoCms,
  piluLabsDoCms,
  socialsDoCms,
} from './conteudo-do-cms'
import {
  getCarreiras,
  getPiluLabs,
  getSiteProfile,
  getSocials,
} from './site-content'

// As páginas leem pelo site-content.ts e as saídas de SEO, pelo conteudo-publico.ts:
// a mesma entrada tem de sair igual nos dois, senão o sitemap e o llms.txt
// descrevem outra coisa que a página.
describe('a normalização do CMS é a mesma das páginas (site-content.ts)', () => {
  it('perfil', async () => {
    expect(perfilDoCms(PERFIL)).toEqual(await getSiteProfile())
  })

  it('redes', async () => {
    expect(socialsDoCms(SOCIALS)).toEqual(await getSocials())
  })

  it('carreira', async () => {
    expect(carreirasDoCms(CARREIRAS)).toEqual(await getCarreiras())
  })

  it('PiluLabs', async () => {
    expect(piluLabsDoCms(PILULABS)).toEqual(await getPiluLabs())
  })
})

describe('perfilDoCms', () => {
  it('cor fora do padrão, rótulo vazio, local com espaço e disciplina vazia', () => {
    expect(perfilDoCms(PERFIL)).toMatchObject({
      companyLinkColor: '#4a65fc',
      availabilityOpen: true,
      availabilityLabel: 'Disponível para oportunidades',
      location: 'Brasil · Remoto',
      disciplines: ['SRE', 'DevOps'],
    })
  })
})

describe('socialsDoCms', () => {
  it('ordena pela ordem, sem ordem vale 0, ícone ausente vem do slug e imagem sem espaço', () => {
    expect(
      socialsDoCms(SOCIALS).map(({ id, fontawesomeIcon, image }) => ({
        id,
        fontawesomeIcon,
        image,
      })),
    ).toEqual([
      { id: 'site', fontawesomeIcon: 'solid__link', image: '/site.png' },
      { id: 'github', fontawesomeIcon: 'brands__github', image: undefined },
      {
        id: 'linkedin',
        fontawesomeIcon: 'brands__linkedinIn',
        image: undefined,
      },
    ])
  })
})

describe('carreirasDoCms', () => {
  it('ordena pela ordem, sem tag vazia e sem imagem vazia', () => {
    const [atual, antiga] = carreirasDoCms(CARREIRAS)
    expect(atual).toMatchObject({ id: 'atual', current: true, tags: [] })
    expect(antiga).toMatchObject({
      id: 'antiga',
      current: false,
      tags: ['Presencial'],
      image: undefined,
    })
  })
})

describe('piluLabsDoCms', () => {
  it('normaliza e ordena todos; quem filtra os listados é quem lê', () => {
    expect(piluLabsDoCms(PILULABS).map(({ slug }) => slug)).toEqual([
      'escondido',
      'botai',
      'sombrai',
    ])
  })
})
