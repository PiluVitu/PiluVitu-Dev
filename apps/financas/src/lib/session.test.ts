// apps/financas/src/lib/session.test.ts
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import type { AuthBindings } from './auth'
import { decidirAcesso, isRotaDeAuth, requireSession } from './session'

const PERMITIDO = 'dono@exemplo.com'

describe('decidirAcesso — matriz pura', () => {
  test('sessão nula é 401 not_authenticated', () => {
    expect(decidirAcesso(null, PERMITIDO)).toMatchObject({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    })
  })

  test('sessão sem user é 401 not_authenticated', () => {
    expect(decidirAcesso({}, PERMITIDO)).toMatchObject({
      ok: false,
      status: 401,
      code: 'not_authenticated',
    })
  })

  test('e-mail fora da allowlist é 403 email_not_allowed', () => {
    expect(
      decidirAcesso({ user: { email: 'invasor@gmail.com' } }, PERMITIDO),
    ).toMatchObject({ ok: false, status: 403, code: 'email_not_allowed' })
  })

  test('e-mail permitido, caixa e espaço não importam', () => {
    expect(
      decidirAcesso({ user: { email: ' Dono@Exemplo.COM ' } }, PERMITIDO),
    ).toEqual({ ok: true })
  })

  test('ALLOWED_EMAIL vazio barra até o próprio dono (fail closed)', () => {
    expect(decidirAcesso({ user: { email: PERMITIDO } }, '')).toMatchObject({
      ok: false,
      status: 403,
      code: 'email_not_allowed',
    })
  })
})

describe('isRotaDeAuth', () => {
  test('casa o path exato e qualquer sub-rota de /api/auth', () => {
    expect(isRotaDeAuth('/api/auth')).toBe(true)
    expect(isRotaDeAuth('/api/auth/callback/google')).toBe(true)
    expect(isRotaDeAuth('/api/auth/get-session')).toBe(true)
  })

  test('não casa outras rotas de /api', () => {
    expect(isRotaDeAuth('/api/accounts')).toBe(false)
    expect(isRotaDeAuth('/api/authx')).toBe(false)
  })
})

const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

function appProtegido() {
  const app = new Hono<{ Bindings: AuthBindings }>()
  app.use('*', requireSession())
  app.get('/protegido', (c) => c.json({ visto: true }))
  return app
}

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string; type: string }>
}

describe('requireSession — integração HTTP', () => {
  test('sem cookie responde 401 not_authenticated com envelope', async () => {
    const testEnv: AuthBindings = {
      DB: env.DB,
      BETTER_AUTH_URL: BASE_URL_TESTE,
      BETTER_AUTH_SECRET: SECRET_TESTE,
      GOOGLE_CLIENT_ID: 'x',
      GOOGLE_CLIENT_SECRET: 'y',
      ALLOWED_EMAIL: PERMITIDO,
    }

    const res = await appProtegido().request('/protegido', {}, testEnv)
    expect(res.status).toBe(401)
    const body = (await res.json()) as CorpoErro
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('not_authenticated')
  })

  test('sessão válida: e-mail FORA da allowlist barra com 403, o MESMO e-mail dentro dela chega na rota (200) — camada 2, independente do hook de criação', async () => {
    // Instância SÓ deste teste, com emailAndPassword ligado e SEM o hook
    // de allowlist — simula um usuário que entrou por QUALQUER caminho
    // fora do hook de criação (seed manual, bug futuro, config trocada
    // temporariamente). Produção mantém emailAndPassword desligado
    // (ver auth.ts); isto é técnica de teste, medida funcionando no
    // spike S6a (signUpEmail devolve um set-cookie real e assinado).
    const authDeTeste = betterAuth({
      database: env.DB,
      baseURL: BASE_URL_TESTE,
      secret: SECRET_TESTE,
      emailAndPassword: { enabled: true },
    })

    const cadastro = await authDeTeste.api.signUpEmail({
      body: {
        email: 'invasor@gmail.com',
        password: 'senha-forte-123',
        name: 'Invasor',
      },
      asResponse: true,
    })
    const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
    if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')

    const testEnv: AuthBindings = {
      DB: env.DB,
      BETTER_AUTH_URL: BASE_URL_TESTE,
      BETTER_AUTH_SECRET: SECRET_TESTE,
      GOOGLE_CLIENT_ID: 'client-id-de-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
      ALLOWED_EMAIL: PERMITIDO, // dono, NÃO invasor@gmail.com
    }

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnv,
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as CorpoErro
    expect(body.notifications[0].code).toBe('email_not_allowed')

    // Controle positivo (fix round 1): sem isto, NENHUM teste da suíte prova
    // que uma sessão permitida efetivamente atravessa a guarda e chega na
    // rota — toda asserção HTTP acima é rejeição (401/403) ou rota isenta
    // (/api/health, /api/auth/*). Um `await next()` trocado por
    // `return errJson(500, 'x', 'y')` em requireSession passaria pelos 401
    // e pelo 403 acima igualzinho e só quebraria aqui. Reusar o MESMO cookie
    // (mesma sessão real, gerada uma vez acima) e só trocar ALLOWED_EMAIL
    // pro e-mail dela também prova que decidirAcesso está de fato LENDO e
    // COMPARANDO o e-mail da sessão — não só rejeitando por padrão sempre
    // que existe um `user` (o que o 403 acima, sozinho, não descarta).
    const testEnvPermitido: AuthBindings = {
      ...testEnv,
      ALLOWED_EMAIL: 'invasor@gmail.com', // mesmo e-mail do cookie acima
    }
    const resPermitido = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnvPermitido,
    )
    expect(resPermitido.status).toBe(200)
    expect(await resPermitido.json()).toEqual({ visto: true })
  })

  test('D1 indisponível durante getSession responde 503 auth_unavailable, não 500 sem envelope', async () => {
    // MEDIDO ao construir este teste: um cookie com assinatura que não bate
    // (ex.: 'token-que-nao-existe.assinatura-que-nao-bate', usado no teste
    // 'sem cookie'/index.test.ts) é rejeitado LOCALMENTE, por HMAC, ANTES de
    // qualquer tentativa de consulta ao D1 — com um DB quebrado, esse cookie
    // ainda dá 401, não 503, porque o DB nunca chega a ser tocado. Pra
    // exercitar de verdade o `catch` de `getSession()`, o cookie precisa ter
    // assinatura VÁLIDA (mesmo `secret`) — só assim o código passa da
    // verificação local e tenta de fato buscar a linha de `session` no D1,
    // que é onde o `dbQuebrado` abaixo estoura.
    const authDeTeste = betterAuth({
      database: env.DB, // D1 saudável só pra CRIAR a sessão com assinatura real
      baseURL: BASE_URL_TESTE,
      secret: SECRET_TESTE,
      emailAndPassword: { enabled: true },
    })
    const cadastro = await authDeTeste.api.signUpEmail({
      body: {
        email: 'qualquer@exemplo.com',
        password: 'senha-forte-123',
        name: 'Qualquer',
      },
      asResponse: true,
    })
    const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
    if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')

    // Duck-typing do adapter Kysely só olha 'batch'/'exec'/'prepare' em
    // db (ver auth.ts) — um objeto com essas três chaves já passa. `prepare`
    // lança na primeira chamada: qualquer statement que o Better Auth tente
    // montar pra consultar `session` estoura antes de devolver linha alguma.
    const dbQuebrado = {
      prepare: () => {
        throw new Error('D1 indisponível (simulado)')
      },
      batch: async () => {
        throw new Error('D1 indisponível (simulado)')
      },
      exec: async () => {
        throw new Error('D1 indisponível (simulado)')
      },
    } as unknown as AuthBindings['DB']

    const testEnv: AuthBindings = {
      DB: dbQuebrado,
      BETTER_AUTH_URL: BASE_URL_TESTE,
      BETTER_AUTH_SECRET: SECRET_TESTE, // MESMO secret: a assinatura do cookie bate
      GOOGLE_CLIENT_ID: 'x',
      GOOGLE_CLIENT_SECRET: 'y',
      ALLOWED_EMAIL: PERMITIDO,
    }

    const res = await appProtegido().request(
      '/protegido',
      { headers: { cookie } },
      testEnv,
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as CorpoErro
    expect(body.notifications[0].code).toBe('auth_unavailable')
  })
})
