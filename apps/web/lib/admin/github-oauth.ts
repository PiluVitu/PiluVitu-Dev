const GH_AUTHORIZE = 'https://github.com/login/oauth/authorize'
const GH_TOKEN = 'https://github.com/login/oauth/access_token'

export interface GithubTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

function clientId(): string {
  const id = process.env.KEYSTATIC_GITHUB_CLIENT_ID
  if (!id) throw new Error('KEYSTATIC_GITHUB_CLIENT_ID is not set')
  return id
}

function clientSecret(): string {
  const s = process.env.KEYSTATIC_GITHUB_CLIENT_SECRET
  if (!s) throw new Error('KEYSTATIC_GITHUB_CLIENT_SECRET is not set')
  return s
}

/** Builds the GitHub App user-to-server authorize URL. */
export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    state,
  })
  return `${GH_AUTHORIZE}?${params.toString()}`
}

async function postToken(
  body: Record<string, string>,
): Promise<GithubTokenResponse> {
  const res = await fetch(GH_TOKEN, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`GitHub token endpoint failed: ${res.status}`)
  return (await res.json()) as GithubTokenResponse
}

/**
 * Exchanges an authorization code for a user access token.
 * Always check `response.error` — GitHub returns HTTP 200 even for logical errors.
 */
export function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<GithubTokenResponse> {
  return postToken({
    client_id: clientId(),
    client_secret: clientSecret(),
    code,
    redirect_uri: redirectUri,
  })
}

/**
 * Refreshes an expiring user token (only when the App issues refresh tokens).
 * Always check `response.error` — GitHub returns HTTP 200 even for logical errors.
 */
export function refreshToken(refresh: string): Promise<GithubTokenResponse> {
  return postToken({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
    refresh_token: refresh,
  })
}

/** Reads the authenticated user's GitHub login (for display + cookie). */
export async function fetchGithubLogin(token: string): Promise<string> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`)
  const data = (await res.json()) as { login: string }
  return data.login
}
