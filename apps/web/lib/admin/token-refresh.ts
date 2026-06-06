import type { AdminGithubToken } from './token-cookie'
import type { GithubTokenResponse } from './github-oauth'

/** Renova o token alguns segundos ANTES de expirar (evita corrida no limite). */
export const REFRESH_MARGIN_MS = 60_000

export type RefreshFn = (refreshToken: string) => Promise<GithubTokenResponse>

/**
 * Decide se o token GitHub linkado precisa renovar e, se sim, troca pelo novo
 * usando o `refreshToken`. Pura: recebe `now` + a função de refresh injetada.
 * Tokens user-to-server de GitHub App expiram (~8h); sem isso, as LEITURAS do
 * admin (listar posts/conteúdo/mídia) passam a falhar com 401 depois de ocioso.
 *
 * Retorna `{ token, refreshed }` — quando `refreshed` é true o chamador deve
 * re-selar o cookie com o token novo. Em qualquer falha de renovação devolve o
 * token atual (degrada pro fluxo de reconectar).
 */
export async function ensureFreshToken(
  tok: AdminGithubToken,
  refresh: RefreshFn,
  now: number,
): Promise<{ token: AdminGithubToken; refreshed: boolean }> {
  // Sem expiração (token não-expirável) ou sem refresh token, ou ainda longe de
  // expirar → usa como está.
  if (
    !tok.expiresAt ||
    !tok.refreshToken ||
    now < tok.expiresAt - REFRESH_MARGIN_MS
  ) {
    return { token: tok, refreshed: false }
  }

  const r = await refresh(tok.refreshToken)
  if (!r.access_token) return { token: tok, refreshed: false }

  return {
    token: {
      token: r.access_token,
      login: tok.login,
      // GitHub roda o refresh token (single-use); guarda o novo se vier.
      refreshToken: r.refresh_token ?? tok.refreshToken,
      expiresAt: r.expires_in ? now + r.expires_in * 1000 : undefined,
    },
    refreshed: true,
  }
}
