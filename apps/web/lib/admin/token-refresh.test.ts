/** @jest-environment node */
import { ensureFreshToken } from './token-refresh'
import type { GithubTokenResponse } from './github-oauth'

const NOW = 1_700_000_000_000
const mkRefresh = (resp: GithubTokenResponse) => async () => resp

describe('ensureFreshToken', () => {
  it('token sem expiresAt (não-expirável) → não renova', async () => {
    const tok = { token: 'a', login: 'x' }
    const r = await ensureFreshToken(
      tok,
      mkRefresh({ access_token: 'new' }),
      NOW,
    )
    expect(r.refreshed).toBe(false)
    expect(r.token).toBe(tok)
  })

  it('token ainda válido (longe de expirar) → não renova', async () => {
    const tok = {
      token: 'a',
      login: 'x',
      refreshToken: 'r',
      expiresAt: NOW + 10 * 60_000,
    }
    const r = await ensureFreshToken(
      tok,
      mkRefresh({ access_token: 'new' }),
      NOW,
    )
    expect(r.refreshed).toBe(false)
    expect(r.token.token).toBe('a')
  })

  it('token expirado com refreshToken → renova e devolve o novo', async () => {
    const tok = {
      token: 'old',
      login: 'paulo',
      refreshToken: 'r1',
      expiresAt: NOW - 1000,
    }
    const r = await ensureFreshToken(
      tok,
      mkRefresh({
        access_token: 'new',
        refresh_token: 'r2',
        expires_in: 28800,
      }),
      NOW,
    )
    expect(r.refreshed).toBe(true)
    expect(r.token.token).toBe('new')
    expect(r.token.refreshToken).toBe('r2')
    expect(r.token.login).toBe('paulo')
    expect(r.token.expiresAt).toBe(NOW + 28800 * 1000)
  })

  it('renova quando está dentro da margem (perto de expirar)', async () => {
    const tok = {
      token: 'old',
      login: 'x',
      refreshToken: 'r1',
      expiresAt: NOW + 30_000, // 30s < margem de 60s
    }
    const r = await ensureFreshToken(
      tok,
      mkRefresh({ access_token: 'new' }),
      NOW,
    )
    expect(r.refreshed).toBe(true)
    expect(r.token.token).toBe('new')
  })

  it('refresh sem access_token (ex.: refresh token vencido) → mantém o antigo', async () => {
    const tok = {
      token: 'old',
      login: 'x',
      refreshToken: 'r1',
      expiresAt: NOW - 1000,
    }
    const r = await ensureFreshToken(
      tok,
      mkRefresh({ error: 'bad_refresh_token' }),
      NOW,
    )
    expect(r.refreshed).toBe(false)
    expect(r.token).toBe(tok)
  })
})
