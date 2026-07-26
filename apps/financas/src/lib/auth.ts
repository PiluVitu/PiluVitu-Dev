/**
 * Factory do Better Auth para o Worker de finanças. Login social Google,
 * D1 nativo (env.DB, sem adapter de terceiro — o adapter Kysely embutido
 * detecta o binding por duck-typing e monta seu próprio D1SqliteDialect).
 * Single-user: databaseHooks.user.create.before é a 1ª de duas camadas de
 * allowlist (a 2ª, sobre sessão já existente, é decidirAcesso em
 * session.ts, Task 3).
 */
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'

export type AuthBindings = {
  DB: D1Database
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  ALLOWED_EMAIL: string
}

/**
 * DESVIO DELIBERADO do brief: `ReturnType<typeof betterAuth>` cru resolve
 * para `Auth<BetterAuthOptions>` (o genérico na sua constraint mais larga,
 * já que `betterAuth` não está aplicado a nenhum argumento ali). O objeto
 * de config passado dentro de `createAuth` é um literal mais específico que
 * `BetterAuthOptions`, e `Auth<T>` usa `T` em posição contravariante (via
 * `DBAdapter<T>`) — então `Auth<{...literal...}>` NÃO é atribuível a
 * `Auth<BetterAuthOptions>` (MEDIDO: `tsc --noEmit` acusa
 * "Types of property '$context' are incompatible" nessa direção exata).
 * `ReturnType<typeof createAuth>`, declarado abaixo da função (hoisting de
 * tipo cobre a referência), captura o tipo específico que `betterAuth`
 * realmente infere para ESTA config — sem essa troca o arquivo não compila.
 */
export type Auth = ReturnType<typeof createAuth>

/**
 * A mensagem do APIError VIRA o código de erro na URL: o callback faz
 * result.error.split(' ').join('_') e redireciona para
 * <errorCallbackURL>?error=<mensagem>. Por isso é slug: minúsculo, sem
 * acento, sem espaço.
 */
export const CODIGO_BARRADO = 'nao_autorizado'

/** Fail closed, igual ao requireAccess que saiu: allowlist vazia barra todo mundo. */
export function isAllowedEmail(email: unknown, permitido: string): boolean {
  const alvo = (permitido ?? '').trim().toLowerCase()
  if (alvo.length === 0) return false
  return typeof email === 'string' && email.trim().toLowerCase() === alvo
}

export function assertEmailPermitido(email: unknown, permitido: string): void {
  if (!isAllowedEmail(email, permitido)) {
    throw new APIError('FORBIDDEN', { message: CODIGO_BARRADO })
  }
}

/**
 * Memoização por identidade do objeto `env`. Motivo: o teto do free tier é
 * 10 ms de CPU por invocação, e construir a instância envolve montar
 * schemas zod e o pipeline de plugins. WeakMap (e não variável solta)
 * porque o env do teste é um objeto diferente do env de produção: chaveado
 * pelo objeto, um não envenena o outro, e nada vaza quando o isolate morre.
 * env tem identidade estável entre requests do mesmo isolate — medido
 * (spike S6b) contra um Worker real via SELF.fetch.
 */
const instancias = new WeakMap<AuthBindings, Auth>()

export function getAuth(env: AuthBindings): Auth {
  const quente = instancias.get(env)
  if (quente) return quente
  const nova = createAuth(env)
  instancias.set(env, nova)
  return nova
}

// Sem anotação de retorno de propósito: ver o comentário de `Auth` acima.
// Anotar `: Auth` aqui criaria uma referência circular (`Auth` é definido a
// partir do retorno INFERIDO desta função).
export function createAuth(env: AuthBindings) {
  return betterAuth({
    // Binding cru: o adapter Kysely detecta D1 por duck-typing
    // ('batch' in db && 'exec' in db && 'prepare' in db) e monta o
    // D1SqliteDialect interno. Não existe adapter para instalar.
    database: env.DB,

    // OBRIGATÓRIOS e EXPLÍCITOS. @better-auth/core procura o segredo em
    // process.env/Deno.env/globalThis.__env__ — nenhum existe no Worker,
    // e a falta lança BetterAuthError no boot. Não há fallback.
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,

    // O secure/prefixo __Secure- do cookie sai do baseURL começar com
    // https:// — isProduction é SEMPRE falso no Worker (não há NODE_ENV).
    // Por isso baseURL não é opcional aqui.

    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
      },
    },

    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            assertEmailPermitido(user.email, env.ALLOWED_EMAIL)
            return { data: user }
          },
        },
      },
    },
  })
}
