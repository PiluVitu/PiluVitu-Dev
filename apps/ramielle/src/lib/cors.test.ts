import { env } from 'cloudflare:test'
import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import type { Bindings } from '../index'
import realApp from '../index'
import { allowedOrigins, corsMiddleware, DEFAULT_ALLOWED_ORIGINS } from './cors'

type TestBindings = { CORS_ALLOWED_ORIGINS?: string }

function appDeTeste() {
  const app = new Hono<{ Bindings: TestBindings }>()
  app.use('*', corsMiddleware<TestBindings>())
  app.get('/echo', (c) => c.json({ ok: true }))
  return app
}

describe('allowedOrigins — CSV, mesmo contrato do Go (apps/api/internal/router/router.go#allowedOrigins)', () => {
  test.each([
    [undefined, DEFAULT_ALLOWED_ORIGINS],
    ['', DEFAULT_ALLOWED_ORIGINS],
    ['   ', DEFAULT_ALLOWED_ORIGINS],
    [',,,', DEFAULT_ALLOWED_ORIGINS],
    ['https://a.example.com', ['https://a.example.com']],
    [
      'https://a.example.com, https://b.example.com ,',
      ['https://a.example.com', 'https://b.example.com'],
    ],
  ])('allowedOrigins(%p) === %p', (csv, esperado) => {
    expect(allowedOrigins(csv)).toEqual(esperado)
  })

  test('DEFAULT_ALLOWED_ORIGINS inclui https://piluvitu.com.br (apps/web em produção)', () => {
    expect(DEFAULT_ALLOWED_ORIGINS).toContain('https://piluvitu.com.br')
  })

  // Asserção negativa exigida pelo brief: nenhum caminho deste módulo pode
  // emitir '*' — o default nem deveria conter o literal.
  test('DEFAULT_ALLOWED_ORIGINS nunca contém o wildcard "*"', () => {
    expect(DEFAULT_ALLOWED_ORIGINS).not.toContain('*')
  })
})

describe('preflight OPTIONS — origem permitida devolve Access-Control-Allow-Origin com AQUELA origem (nunca "*") + Allow-Credentials', () => {
  test('CORS_ALLOWED_ORIGINS ausente (default) + Origin https://piluvitu.com.br', async () => {
    const res = await appDeTeste().request(
      '/echo',
      { method: 'OPTIONS', headers: { origin: 'https://piluvitu.com.br' } },
      {} as TestBindings,
    )

    expect(res.status).toBe(204)
    const allowOrigin = res.headers.get('Access-Control-Allow-Origin')
    expect(allowOrigin).toBe('https://piluvitu.com.br')
    // A asserção negativa: nunca o wildcard, mesmo quando a origem bate.
    expect(allowOrigin).not.toBe('*')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  test('CORS_ALLOWED_ORIGINS configurado (CSV custom) + origem dentro da lista', async () => {
    const res = await appDeTeste().request(
      '/echo',
      { method: 'OPTIONS', headers: { origin: 'https://custom.example.com' } },
      { CORS_ALLOWED_ORIGINS: 'https://custom.example.com' } as TestBindings,
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://custom.example.com',
    )
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })
})

describe('preflight OPTIONS — origem NÃO permitida não recebe Access-Control-Allow-Origin', () => {
  test('Origin fora do default (e fora de qualquer CSV configurado)', async () => {
    const res = await appDeTeste().request(
      '/echo',
      {
        method: 'OPTIONS',
        headers: { origin: 'https://site-estranho.example.com' },
      },
      {} as TestBindings,
    )

    // O hono/cors ainda responde 204 ao preflight (é uma resposta válida de
    // CORS, só sem o header que autorizaria o browser a prosseguir) — o que
    // importa é a AUSÊNCIA do header, não o status.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  // Se CORS_ALLOWED_ORIGINS for configurado errado como '*' (o próprio
  // literal, não uma lista), o resolver de array do hono/cors compara o
  // header Origin recebido contra o array ['*'] — nenhum browser real manda
  // `Origin: *`, então nunca bate, e o header nunca sai. Prova de que o
  // módulo não tem NENHUM caminho que produza '*' de volta, nem por
  // misconfiguração.
  test('CORS_ALLOWED_ORIGINS="*" (misconfiguração) nunca reflete o wildcard de volta', async () => {
    const res = await appDeTeste().request(
      '/echo',
      {
        method: 'OPTIONS',
        headers: { origin: 'https://qualquer.example.com' },
      },
      { CORS_ALLOWED_ORIGINS: '*' } as TestBindings,
    )

    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('requisição normal (não-preflight) também recebe os headers — não é só o OPTIONS', () => {
  test('GET com origem permitida', async () => {
    const res = await appDeTeste().request(
      '/echo',
      { headers: { origin: 'https://piluvitu.com.br' } },
      {} as TestBindings,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://piluvitu.com.br',
    )
  })

  test('GET com origem não permitida não recebe o header', async () => {
    const res = await appDeTeste().request(
      '/echo',
      { headers: { origin: 'https://site-estranho.example.com' } },
      {} as TestBindings,
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('CORS_ALLOWED_ORIGINS vazio/ausente cai no default (e o default inclui https://piluvitu.com.br)', () => {
  test('binding ausente', async () => {
    const res = await appDeTeste().request(
      '/echo',
      { method: 'OPTIONS', headers: { origin: 'https://piluvitu.com.br' } },
      {} as TestBindings,
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://piluvitu.com.br',
    )
  })

  test('binding presente mas vazia', async () => {
    const res = await appDeTeste().request(
      '/echo',
      { method: 'OPTIONS', headers: { origin: 'http://localhost:3333' } },
      { CORS_ALLOWED_ORIGINS: '' } as TestBindings,
    )
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:3333',
    )
  })
})

// Prova de que o mount em index.ts está na ordem certa: CORS acima de TUDO,
// inclusive do handler /api/auth/* (Better Auth) e do catch-all. Um
// preflight OPTIONS pra /api/auth/* NUNCA deveria cair no 404 do catch-all —
// se caísse, o login quebraria em produção sem mensagem útil nenhuma
// (só "CORS error" genérico no console do browser).
describe('montagem em index.ts — CORS entra ANTES do handler /api/auth/* e do catch-all', () => {
  test('preflight OPTIONS para /api/auth/sign-in/social (origem permitida) é respondido pelo CORS, não pelo catch-all 404', async () => {
    const res = await realApp.request(
      '/api/auth/sign-in/social',
      { method: 'OPTIONS', headers: { origin: 'https://piluvitu.com.br' } },
      {} as unknown as Bindings,
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://piluvitu.com.br',
    )
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  test('preflight OPTIONS para /api/auth/* com origem não permitida: ainda 204 (nunca 404), sem o header', async () => {
    const res = await realApp.request(
      '/api/auth/get-session',
      {
        method: 'OPTIONS',
        headers: { origin: 'https://site-estranho.example.com' },
      },
      {} as unknown as Bindings,
    )

    // 204, não 404: prova que o CORS intercepta antes do catch-all, mesmo
    // pra uma origem que ele vai recusar.
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  test('preflight OPTIONS para uma rota qualquer (catch-all) também é respondido pelo CORS', async () => {
    const res = await realApp.request(
      '/nao-existe',
      { method: 'OPTIONS', headers: { origin: 'https://piluvitu.com.br' } },
      {} as unknown as Bindings,
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://piluvitu.com.br',
    )
  })
})

// I3 (revisão final): os 19 testes acima cobrem preflight OPTIONS (que o
// hono/cors CURTO-CIRCUITA, respondendo direto) e um GET num app DE TESTE
// cuja rota usa c.json(...). Nenhum prova que uma resposta NÃO-preflight de
// uma rota REAL carrega o header — as rotas reais (/health, /auth/me,
// /auth/logout, e as 10 da fatia ②) devolvem Response CRU via okJson/errJson
// (lib/envelope.ts), não c.json(...). Que o header sobreviva depende de um
// detalhe interno do Hono (o setter `set res()` copiar os headers do `#res`
// anterior, onde o middleware de CORS já tinha escrito) — funciona hoje
// (provado abaixo), mas é a classe de falha que este módulo declara temer
// ("CORS só quebra em produção") num caminho que nenhum teste fixava.
describe('I3 — GET não-preflight numa rota REAL que devolve Response cru (okJson), não c.json(...)', () => {
  test('GET /health com origem permitida responde 200 E carrega Access-Control-Allow-Origin', async () => {
    const bindingsDeTeste: Bindings = {
      DB: env.DB,
      BETTER_AUTH_URL: 'http://localhost:8787',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      GOOGLE_CLIENT_ID: 'client-id-de-teste',
      GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
      ADMIN_EMAILS: '',
    }

    const res = await realApp.request(
      '/health',
      { headers: { origin: 'https://piluvitu.com.br' } },
      bindingsDeTeste,
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://piluvitu.com.br',
    )
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })
})
