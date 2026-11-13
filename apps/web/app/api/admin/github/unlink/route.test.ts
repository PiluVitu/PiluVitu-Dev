/** @jest-environment node */
import { nextHeadersFalso } from '@/lib/next-headers-falso'
import { sealToken } from '@/lib/admin/token-cookie'

jest.mock('server-only', () => ({}))
jest.mock(
  'next/headers',
  () => jest.requireActual('@/lib/next-headers-falso').modulo,
)

import { POST } from './route'

beforeEach(() => {
  process.env.ADMIN_TOKEN_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
  nextHeadersFalso.reiniciar()
})

describe('POST /api/admin/github/unlink', () => {
  it('apaga o cookie do GitHub linkado e responde linked: false', async () => {
    nextHeadersFalso.reiniciar({
      piluvitu_admin_gh: sealToken({ token: 'token-de-teste', login: 'dona' }),
    })

    const res = await POST()

    expect(await res.json()).toEqual({ linked: false })
    expect(nextHeadersFalso.final('piluvitu_admin_gh')?.apagado).toBe(true)
  })

  // Revisão de 2026-11-12: desconectar o GitHub deixava o preview aberto por até 1 hora no
  // navegador, e num navegador compartilhado quem viesse depois via os rascunhos.
  it('desliga também o preview do navegador', async () => {
    nextHeadersFalso.reiniciar(
      {
        piluvitu_admin_gh: sealToken({
          token: 'token-de-teste',
          login: 'dona',
        }),
        __prerender_bypass: 'id-do-preview-do-build',
        piluvitu_preview: 'selado',
        'ks-branch': 'main',
      },
      true,
    )

    await POST()

    expect(nextHeadersFalso.draftLigado).toBe(false)
    expect(nextHeadersFalso.final('__prerender_bypass')?.apagado).toBe(true)
    expect(nextHeadersFalso.final('piluvitu_preview')?.apagado).toBe(true)
    expect(nextHeadersFalso.final('ks-branch')?.apagado).toBe(true)
  })
})
