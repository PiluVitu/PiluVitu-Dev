import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { afterEach, describe, expect, test, vi } from 'vitest'
import wranglerJsonc from '../../wrangler.jsonc?raw'
import { app, type Bindings } from '../index'
import { CHAVE_SEM_IP, PERIODO_S } from './limite'

// O limitador real do miniflare não entra aqui: cada teste injeta um falso no
// env, que registra as chaves e decide se há vaga (mesmo jeito do ramielle).

type Falso = { chaves: string[]; binding: RateLimit }

function limitador(decisao: 'passa' | 'barra' | 'lanca'): Falso {
  const chaves: string[] = []
  return {
    chaves,
    binding: {
      limit: async ({ key }: { key: string }) => {
        chaves.push(key)
        if (decisao === 'lanca') throw new Error('binding fora do ar')
        return { success: decisao === 'passa' }
      },
    },
  }
}

function envCom(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB: env.DB,
    BETTER_AUTH_URL: 'http://localhost:8787',
    BETTER_AUTH_SECRET: 'a'.repeat(32),
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ALLOWED_EMAIL: 'dono@exemplo.com',
    ...extra,
  }
}

function pedir(
  metodo: string,
  caminho: string,
  e: Bindings,
  headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.50' },
) {
  return app.request(
    caminho,
    {
      method: metodo,
      headers: { 'content-type': 'application/json', ...headers },
      ...(metodo === 'GET' || metodo === 'HEAD' ? {} : { body: '{}' }),
    },
    e,
  )
}

type Corpo = {
  ok: boolean
  data: unknown
  notifications: Array<{ type: string; code: string; message: string }>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('limite de taxa nas escritas: estourou', () => {
  test.each([
    ['POST', '/api/transactions'],
    ['PUT', '/api/settings'],
    ['PATCH', '/api/transactions/tx-1'],
    ['DELETE', '/api/goals/meta-1'],
  ])(
    '%s %s sem vaga: 429 rate_limited no envelope, com Retry-After de 10 s',
    async (metodo, caminho) => {
      const escritas = limitador('barra')
      const importacao = limitador('passa')
      const res = await pedir(
        metodo,
        caminho,
        envCom({
          ESCRITAS_LIMITE: escritas.binding,
          IMPORTACAO_LIMITE: importacao.binding,
        }),
      )
      expect(res.status).toBe(429)
      expect(res.headers.get('retry-after')).toBe('10')
      expect(res.headers.get('content-type')).toBe(
        'application/json; charset=utf-8',
      )
      expect(await res.json()).toEqual({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'rate_limited',
            message:
              'Muitas gravações em pouco tempo. Espere 10 segundos e tente de novo.',
          },
        ],
      })
      expect(escritas.chaves).toEqual(['203.0.113.50'])
      expect(importacao.chaves).toEqual([])
    },
  )

  test('o 429 também leva os cabeçalhos de segurança', async () => {
    const res = await pedir(
      'POST',
      '/api/transactions',
      envCom({ ESCRITAS_LIMITE: limitador('barra').binding }),
    )
    expect(res.status).toBe(429)
    expect(res.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    )
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})

describe('o balde do import é outro', () => {
  test.each([
    ['POST', '/api/transactions/import'],
    ['POST', '/api/pluggy/connect'],
  ])(
    '%s %s usa IMPORTACAO_LIMITE, com Retry-After de 60 s',
    async (metodo, caminho) => {
      const escritas = limitador('passa')
      const importacao = limitador('barra')
      const res = await pedir(
        metodo,
        caminho,
        envCom({
          ESCRITAS_LIMITE: escritas.binding,
          IMPORTACAO_LIMITE: importacao.binding,
        }),
      )
      expect(res.status).toBe(429)
      expect(res.headers.get('retry-after')).toBe('60')
      expect(((await res.json()) as Corpo).notifications[0]?.message).toBe(
        'Muitas gravações em pouco tempo. Espere 60 segundos e tente de novo.',
      )
      expect(importacao.chaves).toEqual(['203.0.113.50'])
      expect(escritas.chaves).toEqual([])
    },
  )

  test('escrita comum com vaga segue para a guarda (401 sem sessão) e não toca o balde do import', async () => {
    const escritas = limitador('passa')
    const importacao = limitador('barra')
    const res = await pedir(
      'POST',
      '/api/transactions',
      envCom({
        ESCRITAS_LIMITE: escritas.binding,
        IMPORTACAO_LIMITE: importacao.binding,
      }),
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as Corpo).notifications[0]?.code).toBe(
      'not_authenticated',
    )
    expect(escritas.chaves).toHaveLength(1)
    expect(importacao.chaves).toEqual([])
  })
})

describe('o que nunca é limitado', () => {
  test.each([
    ['GET', '/api/accounts'],
    ['GET', '/api/pluggy/accounts'],
    ['GET', '/api/transactions/import'],
    ['HEAD', '/api/accounts'],
    ['OPTIONS', '/api/accounts'],
  ])('%s %s: leitura não passa pelo limitador', async (metodo, caminho) => {
    const escritas = limitador('barra')
    const importacao = limitador('barra')
    const res = await pedir(
      metodo,
      caminho,
      envCom({
        ESCRITAS_LIMITE: escritas.binding,
        IMPORTACAO_LIMITE: importacao.binding,
      }),
    )
    expect(res.status).toBe(401)
    expect(escritas.chaves).toEqual([])
    expect(importacao.chaves).toEqual([])
  })

  // IP próprio por caso: o limite do Better Auth (3 a cada 10 s no /sign-in)
  // também responde 429, e um IP repetido confundiria os dois.
  test.each([
    ['POST', '/api/auth/sign-in/social', '203.0.113.71'],
    ['POST', '/api/auth/passkey/verify-authentication', '203.0.113.72'],
    ['POST', '/api/auth/sign-out', '203.0.113.73'],
    ['POST', '/api/auth', '203.0.113.74'],
  ])(
    '%s %s: o login fica só com o limite do Better Auth',
    async (metodo, caminho, ip) => {
      const escritas = limitador('barra')
      const importacao = limitador('barra')
      const res = await pedir(
        metodo,
        caminho,
        envCom({
          ESCRITAS_LIMITE: escritas.binding,
          IMPORTACAO_LIMITE: importacao.binding,
        }),
        { 'cf-connecting-ip': ip },
      )
      expect(res.status).not.toBe(429)
      expect(escritas.chaves).toEqual([])
      expect(importacao.chaves).toEqual([])
    },
  )

  test('POST /api/health: segue para o catch-all (404), sem passar pelo limitador', async () => {
    const escritas = limitador('barra')
    const res = await pedir(
      'POST',
      '/api/health',
      envCom({ ESCRITAS_LIMITE: escritas.binding }),
    )
    expect(res.status).toBe(404)
    expect(escritas.chaves).toEqual([])
  })
})

describe('chave do limite', () => {
  test('é o cf-connecting-ip, que a borda da Cloudflare preenche', async () => {
    const escritas = limitador('passa')
    await pedir(
      'POST',
      '/api/transactions',
      envCom({ ESCRITAS_LIMITE: escritas.binding }),
      { 'cf-connecting-ip': '2001:db8::7' },
    )
    expect(escritas.chaves).toEqual(['2001:db8::7'])
  })

  test('sem o cabeçalho, todo mundo cai numa chave fixa', async () => {
    const escritas = limitador('passa')
    await pedir(
      'POST',
      '/api/transactions',
      envCom({ ESCRITAS_LIMITE: escritas.binding }),
      {},
    )
    expect(escritas.chaves).toEqual([CHAVE_SEM_IP])
    expect(CHAVE_SEM_IP).toBe('sem-ip')
  })
})

describe('falha aberta', () => {
  test('limitador que lança deixa passar, com console.error sem o IP', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedir(
      'POST',
      '/api/transactions',
      envCom({ ESCRITAS_LIMITE: limitador('lanca').binding }),
      { 'cf-connecting-ip': '203.0.113.99' },
    )
    expect(res.status).toBe(401)
    expect(erro).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(erro.mock.calls)).not.toContain('203.0.113.99')
    expect(String(erro.mock.calls[0]?.[0])).toContain('ESCRITAS_LIMITE')
  })

  test('binding ausente deixa passar, com console.error sem o IP', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await pedir('POST', '/api/transactions/import', envCom(), {
      'cf-connecting-ip': '203.0.113.98',
    })
    expect(res.status).toBe(401)
    expect(erro).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(erro.mock.calls)).not.toContain('203.0.113.98')
    expect(String(erro.mock.calls[0]?.[0])).toContain('IMPORTACAO_LIMITE')
  })
})

describe('roda antes da guarda de sessão', () => {
  async function cookieDeSessaoValida(): Promise<string> {
    const auth = betterAuth({
      database: env.DB,
      baseURL: 'http://localhost:8787',
      secret: 'a'.repeat(32),
      emailAndPassword: { enabled: true },
    })
    const cadastro = await auth.api.signUpEmail({
      body: {
        email: 'dono@exemplo.com',
        password: 'senha-forte-123',
        name: 'Dono',
      },
      asResponse: true,
    })
    const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
    if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')
    return cookie
  }

  function dbQueConta(): { db: D1Database; consultas: string[] } {
    const consultas: string[] = []
    const db = new Proxy(env.DB, {
      get(alvo, prop) {
        const valor = Reflect.get(alvo, prop)
        if (typeof valor !== 'function') return valor
        return (...args: unknown[]) => {
          consultas.push(String(prop))
          return valor.apply(alvo, args)
        }
      },
    })
    return { db, consultas }
  }

  test('com cookie válido e sem vaga: 429 e nenhuma consulta de sessão no D1', async () => {
    const cookie = await cookieDeSessaoValida()
    const { db, consultas } = dbQueConta()
    const res = await pedir(
      'POST',
      '/api/payees',
      envCom({ DB: db, ESCRITAS_LIMITE: limitador('barra').binding }),
      { 'cf-connecting-ip': '203.0.113.60', cookie },
    )
    expect(res.status).toBe(429)
    expect(consultas).toEqual([])
  })

  test('controle: o mesmo cookie com vaga consulta a sessão no D1', async () => {
    const cookie = await cookieDeSessaoValida()
    const { db, consultas } = dbQueConta()
    const res = await pedir(
      'POST',
      '/api/payees',
      envCom({ DB: db, ESCRITAS_LIMITE: limitador('passa').binding }),
      { 'cf-connecting-ip': '203.0.113.61', cookie },
    )
    expect(res.status).not.toBe(429)
    expect(consultas.length).toBeGreaterThan(0)
  })
})

describe('wrangler.jsonc', () => {
  type Declarado = {
    name: string
    namespace_id: string
    limit: number
    period: number
  }

  function declarados(): Declarado[] {
    const bloco = /"ratelimits":\s*\[([\s\S]*?)\]/.exec(wranglerJsonc)?.[1]
    if (!bloco) return []
    const re =
      /"name":\s*"([A-Z_]+)",\s*"namespace_id":\s*"(\d+)",\s*"simple":\s*\{\s*"limit":\s*(\d+),\s*"period":\s*(\d+)\s*\}/g
    return [...bloco.matchAll(re)].map((m) => ({
      name: m[1]!,
      namespace_id: m[2]!,
      limit: Number(m[3]),
      period: Number(m[4]),
    }))
  }

  test('declara os dois baldes com os números medidos', () => {
    const porNome = Object.fromEntries(declarados().map((d) => [d.name, d]))
    expect(porNome.ESCRITAS_LIMITE).toMatchObject({ limit: 30, period: 10 })
    expect(porNome.IMPORTACAO_LIMITE).toMatchObject({ limit: 120, period: 60 })
  })

  test('o Retry-After do código usa o mesmo período do binding', () => {
    for (const d of declarados()) {
      expect(PERIODO_S[d.name as keyof typeof PERIODO_S]).toBe(d.period)
    }
    expect(Object.keys(PERIODO_S).sort()).toEqual(
      declarados()
        .map((d) => d.name)
        .sort(),
    )
  })

  test('namespace_id é da conta: diferente do 1001 do ramielle e um do outro', () => {
    const ids = declarados().map((d) => d.namespace_id)
    expect(ids).toHaveLength(2)
    expect(ids).not.toContain('1001')
    expect(new Set(ids).size).toBe(2)
  })
})
