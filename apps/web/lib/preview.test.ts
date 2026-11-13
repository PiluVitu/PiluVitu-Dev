/** @jest-environment node */
import { nextHeadersFalso } from '@/lib/next-headers-falso'
import { sealToken, selar } from '@/lib/admin/token-cookie'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)

import {
  PRAZO_DO_PREVIEW,
  PREVIEW_COOKIE,
  abrirPreview,
  branchValido,
  destinoDoPreview,
  previewAtivo,
  selarPreview,
} from './preview'

const AGORA = Date.UTC(2026, 10, 12, 12, 0, 0)

beforeEach(() => {
  process.env.ADMIN_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
  nextHeadersFalso.reiniciar()
})

describe('selarPreview / abrirPreview', () => {
  it('o cookie se chama piluvitu_preview e dura no máximo 1 hora', () => {
    expect(PREVIEW_COOKIE).toBe('piluvitu_preview')
    expect(PRAZO_DO_PREVIEW).toBe(3600)
  })

  it('ida e volta, com exp de 1 hora', () => {
    const selado = selarPreview({ branch: 'main', login: 'dona' }, AGORA)
    expect(selado).not.toContain('main')
    expect(abrirPreview(selado, AGORA)).toEqual({
      branch: 'main',
      login: 'dona',
      exp: AGORA + 3600 * 1000,
    })
  })

  it('expirado não abre', () => {
    const selado = selarPreview({ branch: 'main', login: 'dona' }, AGORA)
    expect(abrirPreview(selado, AGORA + 3600 * 1000)).toBeNull()
    expect(abrirPreview(selado, AGORA + 3600 * 1000 - 1)).not.toBeNull()
  })

  it('adulterado, lixo ou vazio não abre', () => {
    const selado = selarPreview({ branch: 'main', login: 'dona' }, AGORA)
    const adulterado =
      selado.slice(0, -2) +
      (selado.endsWith('A') ? 'B' : 'A') +
      selado.slice(-1)
    expect(abrirPreview(adulterado, AGORA)).toBeNull()
    expect(abrirPreview('lixo!!', AGORA)).toBeNull()
    expect(abrirPreview('', AGORA)).toBeNull()
  })

  it('selado com outra chave não abre', () => {
    const selado = selarPreview({ branch: 'main', login: 'dona' }, AGORA)
    process.env.ADMIN_TOKEN_SECRET =
      'outra-chave-tambem-com-mais-de-32-caracteres'
    expect(abrirPreview(selado, AGORA)).toBeNull()
  })

  it('o cookie do GitHub linkado (mesma chave) não serve de preview', () => {
    const doGithub = sealToken({ token: 'token-de-teste', login: 'dona' })
    expect(abrirPreview(doGithub, AGORA)).toBeNull()
  })

  it('selado de ramo inválido ou fora do formato não abre', () => {
    const exp = AGORA + 1000
    const comContexto = (dados: unknown) => selar(dados, PREVIEW_COOKIE)
    expect(
      abrirPreview(comContexto({ branch: '../x', login: 'd', exp }), AGORA),
    ).toBeNull()
    expect(abrirPreview(comContexto({ branch: 'main', exp }), AGORA)).toBeNull()
    expect(
      abrirPreview(
        comContexto({ branch: 'main', login: 'd', exp: String(exp) }),
        AGORA,
      ),
    ).toBeNull()
    expect(abrirPreview(comContexto(null), AGORA)).toBeNull()
  })

  it('selado sem o contexto do preview não abre', () => {
    const exp = AGORA + 1000
    expect(
      abrirPreview(selar({ branch: 'main', login: 'd', exp }), AGORA),
    ).toBeNull()
  })

  it('exp além do prazo de 1 hora não abre', () => {
    const exp = AGORA + 3600 * 1000 + 1
    expect(
      abrirPreview(
        selar({ branch: 'main', login: 'd', exp }, PREVIEW_COOKIE),
        AGORA,
      ),
    ).toBeNull()
  })

  it('não sela ramo inválido', () => {
    expect(() =>
      selarPreview({ branch: '../x', login: 'dona' }, AGORA),
    ).toThrow()
  })
})

describe('branchValido', () => {
  it.each([
    'main',
    'feat/novo-post',
    'release-1.2',
    'a_b',
    'a'.repeat(100),
    'deadbeef',
    'pull-request-fix',
    'feat/refs/x',
    'feat/pull/1',
  ])('aceita %s', (branch) => expect(branchValido(branch)).toBe(true))

  // Revisão de 2026-11-12: o reader do Keystatic passa o ramo ao GitHub como ref, e o git resolve
  // `pull/N/head` como `refs/pull/N/head`, o ramo de um PR de fork, com conteúdo de fora.
  it.each([
    'refs/heads/main',
    'refs/pull/1/head',
    'pull/1/head',
    'pull/1/merge',
    '0123456789abcdef0123456789abcdef01234567',
    '0123456789ABCDEF0123456789ABCDEF01234567',
    '0123456789abcdef'.repeat(4),
  ])('recusa a ref %j, que não é nome de ramo', (branch) =>
    expect(branchValido(branch)).toBe(false),
  )

  it.each([
    '',
    'a'.repeat(101),
    '../main',
    'main/../x',
    'a..b',
    '/main',
    '-main',
    'a b',
    'main;x',
    'main\n',
    'ramo%2f',
  ])('recusa %j', (branch) => expect(branchValido(branch)).toBe(false))
})

describe('destinoDoPreview', () => {
  const ORIGEM = 'https://piluvitu.com.br'

  it.each([
    ['/', `${ORIGEM}/`],
    ['/posts/rascunho', `${ORIGEM}/posts/rascunho`],
    ['/pilulabs?x=1#y', `${ORIGEM}/pilulabs?x=1#y`],
  ])('aceita %s', (to, esperado) => {
    expect(destinoDoPreview(to, ORIGEM)?.toString()).toBe(esperado)
  })

  it.each([
    '',
    'posts',
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    '/\t/evil.example/',
    '/\n/evil.example/',
    'javascript:alert(1)',
  ])('recusa %j', (to) => {
    expect(destinoDoPreview(to, ORIGEM)).toBeNull()
  })
})

describe('previewAtivo', () => {
  it('sem draft mode é null, mesmo com selado válido', async () => {
    nextHeadersFalso.reiniciar({
      piluvitu_preview: selarPreview(
        { branch: 'main', login: 'd' },
        Date.now(),
      ),
    })
    expect(await previewAtivo()).toBeNull()
  })

  it('draft mode sem selado é null', async () => {
    nextHeadersFalso.reiniciar({ 'ks-branch': 'main' }, true)
    expect(await previewAtivo()).toBeNull()
  })

  it('draft mode com selado forjado é null', async () => {
    nextHeadersFalso.reiniciar({ piluvitu_preview: 'forjado' }, true)
    expect(await previewAtivo()).toBeNull()
  })

  it('draft mode com selado expirado é null', async () => {
    const umaHoraAtras = Date.now() - 3600 * 1000 - 1
    nextHeadersFalso.reiniciar(
      {
        piluvitu_preview: selarPreview(
          { branch: 'main', login: 'd' },
          umaHoraAtras,
        ),
      },
      true,
    )
    expect(await previewAtivo()).toBeNull()
  })

  it('draft mode com selado de ramo inválido é null', async () => {
    nextHeadersFalso.reiniciar(
      {
        piluvitu_preview: selar(
          { branch: '-x', login: 'd', exp: Date.now() + 60_000 },
          PREVIEW_COOKIE,
        ),
      },
      true,
    )
    expect(await previewAtivo()).toBeNull()
  })

  it('draft mode com selado válido devolve o ramo', async () => {
    nextHeadersFalso.reiniciar(
      {
        piluvitu_preview: selarPreview(
          { branch: 'feat/x', login: 'd' },
          Date.now(),
        ),
      },
      true,
    )
    expect(await previewAtivo()).toEqual({ branch: 'feat/x' })
  })
})
