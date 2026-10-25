/**
 * Passkey (WebAuthn) como segundo jeito de o ADMIN do site entrar, ao lado do
 * Google. A votação continua livre; a passkey não. Ver "Passkey" no
 * apps/ramielle/CLAUDE.md.
 */
import { passkey } from '@better-auth/passkey'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { errJson } from './envelope'

export type PasskeyAmbiente = { rpID: string; origin: string }

const PRODUCAO: PasskeyAmbiente = {
  rpID: 'piluvitu.com.br',
  origin: 'https://piluvitu.com.br',
}

const DESENVOLVIMENTO: PasskeyAmbiente = {
  rpID: 'localhost',
  origin: 'http://localhost:3333',
}

/**
 * Decide o ambiente pela config (`BETTER_AUTH_URL`), nunca pelo pedido.
 * Desconhecido devolve `null` e a passkey fica desligada: sem `origin`
 * explícito o plugin aceitaria o header Origin do próprio pedido.
 */
export function passkeyAmbiente(
  betterAuthUrl: string | undefined,
): PasskeyAmbiente | null {
  let url: URL
  try {
    url = new URL(betterAuthUrl ?? '')
  } catch {
    return null
  }
  if (
    url.protocol === 'https:' &&
    url.hostname === 'ramielle.piluvitu.com.br'
  ) {
    return PRODUCAO
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol === 'http:' && local) return DESENVOLVIMENTO
  return null
}

type EhAdmin = (email: string | null | undefined) => boolean

const ROTAS_DE_CADASTRO = new Set([
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
])

const ROTAS_SO_ADMIN = new Set([
  '/passkey/generate-register-options',
  '/passkey/verify-registration',
  '/passkey/list-user-passkeys',
  '/passkey/delete-passkey',
  '/passkey/update-passkey',
])

/**
 * `hooks.before` do Better Auth: casa pelo `ctx.path` da rota já resolvida
 * pelo router dele, não pela URL crua, então barra igual ao `requireAdmin`
 * (mesmo envelope e códigos) sem depender de como o path foi escrito.
 */
export function passkeySoAdmin(ehAdmin: EhAdmin) {
  return createAuthMiddleware(async (ctx) => {
    if (!ROTAS_SO_ADMIN.has(ctx.path)) return
    const sessao = await getSessionFromCtx(ctx)
    if (!sessao) {
      return errJson(401, 'not_authenticated', 'Você precisa estar logado.')
    }
    if (!ehAdmin(sessao.user.email)) {
      return errJson(403, 'admin_only', 'Acesso restrito a administradores.')
    }
    const { metodoLogin } = sessao.session as { metodoLogin?: string | null }
    if (ROTAS_DE_CADASTRO.has(ctx.path) && !sessaoDoGoogle(metodoLogin)) {
      return errJson(
        403,
        'PASSKEY_EXIGE_LOGIN_GOOGLE',
        'Para cadastrar uma passkey, entre pelo Google',
      )
    }
  })
}

/** NULL é sessão anterior à coluna, quando o Google era o único login. */
function sessaoDoGoogle(metodoLogin: string | null | undefined) {
  return metodoLogin == null || metodoLogin === 'google'
}

type ContextoDoLogin = {
  path?: string
  params?: Record<string, string>
  body?: { provider?: unknown }
} | null

/**
 * Como a sessão foi aberta, para `databaseHooks.session.create.before`.
 * Qualquer caminho que não seja o Google sai diferente de 'google' e não
 * cadastra passkey.
 */
export function metodoLoginDaSessao(ctx: ContextoDoLogin): string {
  if (ctx?.path === '/passkey/verify-authentication') return 'passkey'
  const google =
    ctx?.path === '/callback/:id'
      ? ctx.params?.id === 'google'
      : ctx?.path === '/sign-in/social' && ctx.body?.provider === 'google'
  if (google) return 'google'
  return ctx?.path ?? 'desconhecido'
}

/**
 * `hooks.after`: o plugin fixa `userVerification: 'preferred'` nas opções de
 * login, e `authenticatorSelection` só vale no cadastro. Sem isto o aparelho
 * pode assinar sem biometria/PIN e o `afterVerification` recusaria depois.
 */
export function passkeyLoginPedeVerificacao() {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== '/passkey/generate-authenticate-options') return
    const opcoes = ctx.context.returned
    if (!opcoes || typeof opcoes !== 'object' || opcoes instanceof APIError) {
      return
    }
    return ctx.json({ ...opcoes, userVerification: 'required' })
  })
}

function exigirVerificacaoDoUsuario(verificou: boolean | undefined) {
  if (!verificou) {
    throw new APIError('UNAUTHORIZED', {
      code: 'USER_VERIFICATION_REQUIRED',
      message: 'Confirme com biometria ou PIN do aparelho para usar a passkey.',
    })
  }
}

export function passkeyDoAdmin(ambiente: PasskeyAmbiente, ehAdmin: EhAdmin) {
  return passkey({
    rpID: ambiente.rpID,
    rpName: 'PiluVitu',
    origin: ambiente.origin,
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
    },
    registration: {
      afterVerification: ({ verification }) => {
        exigirVerificacaoDoUsuario(verification.registrationInfo?.userVerified)
      },
    },
    authentication: {
      // Roda depois da assinatura conferida e antes de a sessão ser criada.
      afterVerification: async ({ ctx, verification, clientData }) => {
        exigirVerificacaoDoUsuario(verification.authenticationInfo.userVerified)
        const registro = await ctx.context.adapter.findOne<{ userId: string }>({
          model: 'passkey',
          where: [{ field: 'credentialID', value: clientData.id }],
        })
        const usuario = registro
          ? await ctx.context.internalAdapter.findUserById(registro.userId)
          : null
        if (!ehAdmin(usuario?.email)) {
          throw new APIError('FORBIDDEN', {
            code: 'admin_only',
            message: 'Acesso restrito a administradores.',
          })
        }
      },
    },
  })
}
