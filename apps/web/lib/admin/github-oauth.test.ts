/** @jest-environment node */
import { authorizeUrl } from './github-oauth'

describe('authorizeUrl', () => {
  beforeAll(() => {
    process.env.KEYSTATIC_GITHUB_CLIENT_ID = 'Iv1.testclientid'
  })

  it('builds a GitHub authorize URL with client_id, state and redirect_uri', () => {
    const url = new URL(
      authorizeUrl(
        'xyz-state',
        'https://piluvitu.com.br/api/admin/github/callback',
      ),
    )
    expect(url.origin + url.pathname).toBe(
      'https://github.com/login/oauth/authorize',
    )
    expect(url.searchParams.get('client_id')).toBe('Iv1.testclientid')
    expect(url.searchParams.get('state')).toBe('xyz-state')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://piluvitu.com.br/api/admin/github/callback',
    )
  })

  it('throws if the client id is missing', () => {
    const prev = process.env.KEYSTATIC_GITHUB_CLIENT_ID
    delete process.env.KEYSTATIC_GITHUB_CLIENT_ID
    expect(() => authorizeUrl('s', 'https://x/cb')).toThrow(
      /KEYSTATIC_GITHUB_CLIENT_ID/,
    )
    process.env.KEYSTATIC_GITHUB_CLIENT_ID = prev
  })
})
