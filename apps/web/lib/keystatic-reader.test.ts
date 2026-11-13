/** @jest-environment node */
import { nextHeadersFalso, selarPreviewDeTeste } from '@/lib/next-headers-falso'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)
jest.mock('@keystatic/core/reader', () => ({
  createReader: () => ({ fonte: 'arquivos-do-deploy' }),
}))
jest.mock('@keystatic/core/reader/github', () => ({
  createGitHubReader: (_config: unknown, opcoes: { ref: string }) => ({
    fonte: 'github',
    ref: opcoes.ref,
  }),
}))
jest.mock('../keystatic.config', () => ({
  __esModule: true,
  default: {},
  getGithubRepoSlash: () => 'dono/repo-do-site',
}))

import { getKeystaticReader } from './keystatic-reader'

type LeitorFalso = { fonte: string; ref?: string }

async function leitor(): Promise<LeitorFalso> {
  return (await getKeystaticReader()) as unknown as LeitorFalso
}

beforeEach(() => {
  process.env.ADMIN_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
  nextHeadersFalso.reiniciar()
})

describe('getKeystaticReader', () => {
  it('sem draft mode, lê os arquivos do deploy', async () => {
    expect(await leitor()).toEqual({ fonte: 'arquivos-do-deploy' })
  })

  it('o ks-branch antigo, mesmo com draft mode, não troca a fonte', async () => {
    nextHeadersFalso.reiniciar({ 'ks-branch': 'ramo-de-alguem' }, true)
    expect(await leitor()).toEqual({ fonte: 'arquivos-do-deploy' })
  })

  it('draft mode com selado forjado lê os arquivos do deploy', async () => {
    nextHeadersFalso.reiniciar({ piluvitu_preview: 'forjado' }, true)
    expect(await leitor()).toEqual({ fonte: 'arquivos-do-deploy' })
  })

  it('com o preview selado e válido, lê do GitHub no ramo selado', async () => {
    nextHeadersFalso.reiniciar(
      {
        piluvitu_preview: selarPreviewDeTeste('feat/perfil-novo'),
        'ks-branch': 'outro-ramo',
      },
      true,
    )
    expect(await leitor()).toEqual({ fonte: 'github', ref: 'feat/perfil-novo' })
  })
})
