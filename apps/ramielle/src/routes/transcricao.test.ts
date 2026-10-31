/**
 * Testes de `POST /admin/transcrever` contra o app REAL (`../index`), mesmo
 * padrão de `atelier.test.ts`: cookie genuíno via uma segunda instância
 * `betterAuth()` e `fetch` global trocado — nenhum teste alcança o Mac.
 */
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { afterEach, describe, expect, test, vi } from 'vitest'
import app, { type Bindings } from '../index'
import type { Envelope } from '../lib/envelope'
import { MAX_AUDIOS, MAX_BYTES_TOTAL, TIMEOUT_STATUS_MS } from './transcricao'

const DB = env.DB
const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)
const ADMIN = 'dono@exemplo.test'
const TOKEN_MARCADOR = 'TOKEN-PROMEIA-NAO-PODE-VAZAR-2d8e'

function testEnv(extra: Partial<Bindings> = {}): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: ADMIN,
    PROMEIA_URL: 'https://promeia.exemplo.test',
    PROMEIA_TOKEN: TOKEN_MARCADOR,
    ...extra,
  }
}

async function cookieDe(email: string): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })
  const cadastro = await authDeTeste.api.signUpEmail({
    body: { email, password: 'senha-forte-123', name: 'Alguém' },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie')
  return cookie
}

const fetchOriginal = globalThis.fetch
afterEach(() => {
  globalThis.fetch = fetchOriginal
  vi.useRealTimers()
})

type Visto = { url: string; init: RequestInit; form: FormData }

function mockarPromeia(responder: () => Response) {
  const vistos: Visto[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    if (!String(url).startsWith('https://promeia.exemplo.test/transcrever')) {
      throw new Error(`promeia chamado sem mock: ${url}`)
    }
    vistos.push({ url: String(url), init, form: init.body as FormData })
    return responder()
  }) as unknown as typeof fetch
  return vistos
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function audio(nome: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], nome, { type: 'audio/ogg' })
}

async function enviar(
  form: FormData,
  cookie: string,
  ambiente = testEnv(),
): Promise<Response> {
  return app.request(
    '/admin/transcrever',
    { method: 'POST', headers: { cookie }, body: form },
    ambiente,
  )
}

const ID_OK = '0123456789abcdef0123456789abcdef'

const JOB_NA_FILA = {
  id: ID_OK,
  status: 'na_fila',
  posicao: 1,
  parte_atual: 0,
  total_partes: 1,
  nome_atual: null,
  modelo: 'mlx-community/whisper-large-v3-mlx',
  criado_em: '2026-10-31T12:00:00+00:00',
  atualizado_em: '2026-10-31T12:00:00+00:00',
  resultado: null,
  erro: null,
}

const RESPOSTA_OK = { ok: true, data: JOB_NA_FILA }

describe('POST /admin/transcrever', () => {
  // A única barreira entre qualquer conta Google e a GPU do dono.
  test('não-admin responde 403 admin_only, sem chamar o promeia', async () => {
    const cookie = await cookieDe('votante@exemplo.test')
    const vistos = mockarPromeia(() => json(200, RESPOSTA_OK))
    const form = new FormData()
    form.append('audios', audio('a.ogg'))
    const res = await enviar(form, cookie)
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
    expect(vistos).toHaveLength(0)
  })

  test('sem PROMEIA_URL/TOKEN responde 503 promeia_disabled', async () => {
    const cookie = await cookieDe(ADMIN)
    const form = new FormData()
    form.append('audios', audio('a.ogg'))
    const res = await enviar(
      form,
      cookie,
      testEnv({ PROMEIA_URL: '', PROMEIA_TOKEN: '' }),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('promeia_disabled')
  })

  test('repassa os áudios NA ORDEM, com os campos, e devolve 202 com o JOB no envelope', async () => {
    const cookie = await cookieDe(ADMIN)
    const vistos = mockarPromeia(() => json(200, RESPOSTA_OK))
    const form = new FormData()
    form.append('audios', audio('a.ogg'))
    form.append('audios', audio('b.ogg'))
    form.append('termos', 'ramielle, promeia')
    form.append('modo', 'rapido')
    form.append('idioma', 'pt')

    const res = await enviar(form, cookie)

    expect(res.status).toBe(202)
    const body = (await res.json()) as Envelope<typeof RESPOSTA_OK.data>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(RESPOSTA_OK.data)

    expect(vistos).toHaveLength(1)
    const enviado = vistos[0]!
    const nomes = enviado.form.getAll('audios').map((f) => (f as File).name)
    expect(nomes).toEqual(['a.ogg', 'b.ogg'])
    expect(enviado.form.get('termos')).toBe('ramielle, promeia')
    expect(enviado.form.get('modo')).toBe('rapido')
    expect(enviado.form.get('idioma')).toBe('pt')
    const headers = enviado.init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${TOKEN_MARCADOR}`)
  })

  test('campo ausente não vira string vazia — o promeia aplica o próprio default', async () => {
    const cookie = await cookieDe(ADMIN)
    const vistos = mockarPromeia(() => json(200, RESPOSTA_OK))
    const form = new FormData()
    form.append('audios', audio('a.ogg'))
    await enviar(form, cookie)
    expect(vistos[0]!.form.has('idioma')).toBe(false)
    expect(vistos[0]!.form.has('modo')).toBe(false)
  })

  test('sem áudio responde 400 invalid_body, sem chamar o promeia', async () => {
    const cookie = await cookieDe(ADMIN)
    const vistos = mockarPromeia(() => json(200, RESPOSTA_OK))
    const form = new FormData()
    form.append('termos', 'só texto')
    const res = await enviar(form, cookie)
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_body')
    expect(vistos).toHaveLength(0)
  })

  test('corpo que não é multipart responde 400 invalid_body', async () => {
    const cookie = await cookieDe(ADMIN)
    const res = await app.request(
      '/admin/transcrever',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{"audios":[]}',
      },
      testEnv(),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_body')
  })

  // Barrar aqui economiza subir o áudio inteiro pelo túnel só para o
  // promeia recusar do outro lado.
  test('acima de MAX_AUDIOS responde 400 too_many_files, sem chamar o promeia', async () => {
    const cookie = await cookieDe(ADMIN)
    const vistos = mockarPromeia(() => json(200, RESPOSTA_OK))
    const form = new FormData()
    for (let i = 0; i <= MAX_AUDIOS; i++)
      form.append('audios', audio(`${i}.ogg`))
    const res = await enviar(form, cookie)
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('too_many_files')
    expect(vistos).toHaveLength(0)
  })

  test('soma acima de MAX_BYTES_TOTAL responde 413 audio_too_large, sem chamar o promeia', async () => {
    const cookie = await cookieDe(ADMIN)
    const vistos = mockarPromeia(() => json(200, RESPOSTA_OK))
    const form = new FormData()
    const metade = MAX_BYTES_TOTAL / 2
    form.append('audios', audio('a.ogg', metade))
    form.append('audios', audio('b.ogg', metade + 1))
    const res = await enviar(form, cookie)
    expect(res.status).toBe(413)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('audio_too_large')
    expect(vistos).toHaveLength(0)
  })

  test('Whisper ausente no Mac: repassa 503 whisper_indisponivel com a mensagem do promeia', async () => {
    const cookie = await cookieDe(ADMIN)
    mockarPromeia(() =>
      json(503, {
        ok: false,
        code: 'whisper_indisponivel',
        message: 'Instale com `uv tool install mlx-whisper`.',
      }),
    )
    const form = new FormData()
    form.append('audios', audio('a.ogg'))
    const res = await enviar(form, cookie)
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('whisper_indisponivel')
    expect(body.notifications[0]?.message).toContain('mlx-whisper')
  })

  // O promeia responde 503 (nunca 502, que o túnel engole) quando o Whisper
  // roda e falha; a mensagem dele é o que o dono lê no toast.
  test('Whisper falhou no áudio: repassa 503 transcricao_falhou com a mensagem', async () => {
    const cookie = await cookieDe(ADMIN)
    mockarPromeia(() =>
      json(503, {
        ok: false,
        code: 'transcricao_falhou',
        message: "O Whisper terminou sem gerar texto para 'a.ogg': End of file",
      }),
    )
    const form = new FormData()
    form.append('audios', audio('a.ogg'))
    const res = await enviar(form, cookie)
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('transcricao_falhou')
    expect(body.notifications[0]?.message).toContain('End of file')
  })

  test('Mac desligado (túnel 530) vira 503 promeia_unreachable, sem vazar o token', async () => {
    const cookie = await cookieDe(ADMIN)
    mockarPromeia(() => new Response('<html>530</html>', { status: 530 }))
    const form = new FormData()
    form.append('audios', audio('a.ogg'))
    const res = await enviar(form, cookie)
    expect(res.status).toBe(503)
    const texto = await res.text()
    expect(texto).toContain('promeia_unreachable')
    expect(texto).not.toContain(TOKEN_MARCADOR)
  })
})

// O bug: 9 min de áudio no modo Preciso levam mais que o corte de ~100 s da
// Cloudflare; com a chamada síncrona, o request morria no meio e o dono lia
// "Suba o promeia no Mac" com o promeia de pé. O conserto é o job assíncrono:
// o promeia aceita na hora (202) e a tela consulta o andamento depois.
const CORTE_CLOUDFLARE_MS = 100_000

function promeiaQueSoSoltaNoAbort() {
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('abortado', 'AbortError')),
      )
    })) as unknown as typeof fetch
}

describe('transcrição longa não passa do corte da Cloudflare (bug do áudio de 9 min)', () => {
  test('o promeia aceita o job na hora: o ramielle devolve 202 com o JOB', async () => {
    const cookie = await cookieDe(ADMIN)
    mockarPromeia(() => json(202, RESPOSTA_OK))
    const form = new FormData()
    form.append('audios', audio('nove-minutos.ogg'))
    const res = await enviar(form, cookie)
    expect(res.status).toBe(202)
    const body = (await res.json()) as Envelope<typeof JOB_NA_FILA>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual(JOB_NA_FILA)
  })

  test('promeia travado: o ramielle desiste ANTES do corte de ~100 s da Cloudflare', async () => {
    const cookie = await cookieDe(ADMIN)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    promeiaQueSoSoltaNoAbort()
    const form = new FormData()
    form.append('audios', audio('nove-minutos.ogg'))
    let resolvida: Response | null = null
    const pendente = enviar(form, cookie).then((r) => (resolvida = r))
    await vi.advanceTimersByTimeAsync(CORTE_CLOUDFLARE_MS - 1)
    expect(resolvida).not.toBeNull()
    const res = await pendente
    expect(res.status).toBe(503)
    const texto = await res.text()
    expect(texto).toContain('promeia_unreachable')
    expect(texto).not.toContain(TOKEN_MARCADOR)
  })
})

async function consultar(
  id: string,
  cookie: string | null,
  ambiente = testEnv(),
): Promise<Response> {
  return app.request(
    `/admin/transcrever/${id}`,
    { method: 'GET', headers: cookie ? { cookie } : {} },
    ambiente,
  )
}

const JOB_PRONTO = {
  ...JOB_NA_FILA,
  status: 'pronto',
  posicao: null,
  parte_atual: 1,
  resultado: {
    partes: [{ nome: 'a.ogg', texto: 'um' }],
    texto: 'um',
    modelo: JOB_NA_FILA.modelo,
  },
}

describe('GET /admin/transcrever/:id', () => {
  test('devolve 200 com o JOB do promeia, por GET autenticado', async () => {
    const cookie = await cookieDe(ADMIN)
    const vistos = mockarPromeia(() =>
      json(200, { ok: true, data: JOB_PRONTO }),
    )
    const res = await consultar(ID_OK, cookie)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<typeof JOB_PRONTO>
    expect(body.data).toEqual(JOB_PRONTO)
    expect(vistos).toHaveLength(1)
    expect(vistos[0]!.url).toBe(
      `https://promeia.exemplo.test/transcrever/${ID_OK}`,
    )
    expect(vistos[0]!.init.method).toBe('GET')
    const headers = vistos[0]!.init.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${TOKEN_MARCADOR}`)
  })

  // Um 502 aqui faria a tela achar que o promeia quebrou, quando o job só
  // expirou ou o promeia reiniciou e o perdeu.
  test('job_not_found do promeia passa como 404, não 502', async () => {
    const cookie = await cookieDe(ADMIN)
    mockarPromeia(() =>
      json(404, {
        ok: false,
        code: 'job_not_found',
        message: 'Transcrição não encontrada — ela pode ter expirado.',
      }),
    )
    const res = await consultar(ID_OK, cookie)
    expect(res.status).toBe(404)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('job_not_found')
    expect(body.notifications[0]?.message).toContain('expirado')
  })

  test.each([
    ['curto', 'abc123'],
    ['maiúsculo', '0123456789ABCDEF0123456789ABCDEF'],
    ['path traversal', '..%2F..%2Fetc%2Fpasswd'],
    ['33 chars', `${ID_OK}0`],
  ])(
    'id malformado (%s) responde 404 job_not_found sem chamar o promeia',
    async (_nome, id) => {
      const cookie = await cookieDe(ADMIN)
      const vistos = mockarPromeia(() =>
        json(200, { ok: true, data: JOB_PRONTO }),
      )
      const res = await consultar(id, cookie)
      expect(res.status).toBe(404)
      const body = (await res.json()) as Envelope<null>
      expect(body.notifications[0]?.code).toBe('job_not_found')
      expect(vistos).toHaveLength(0)
    },
  )

  test('sem sessão responde 401, sem chamar o promeia', async () => {
    const vistos = mockarPromeia(() =>
      json(200, { ok: true, data: JOB_PRONTO }),
    )
    const res = await consultar(ID_OK, null)
    expect(res.status).toBe(401)
    expect(vistos).toHaveLength(0)
  })

  test('não-admin responde 403 admin_only, sem chamar o promeia', async () => {
    const cookie = await cookieDe('votante@exemplo.test')
    const vistos = mockarPromeia(() =>
      json(200, { ok: true, data: JOB_PRONTO }),
    )
    const res = await consultar(ID_OK, cookie)
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
    expect(vistos).toHaveLength(0)
  })

  test('sem PROMEIA_URL/TOKEN responde 503 promeia_disabled', async () => {
    const cookie = await cookieDe(ADMIN)
    const res = await consultar(
      ID_OK,
      cookie,
      testEnv({ PROMEIA_URL: '', PROMEIA_TOKEN: '' }),
    )
    expect(res.status).toBe(503)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('promeia_disabled')
  })

  test('Mac desligado (túnel 530) vira 503 promeia_unreachable, sem vazar o token', async () => {
    const cookie = await cookieDe(ADMIN)
    mockarPromeia(() => new Response('<html>530</html>', { status: 530 }))
    const res = await consultar(ID_OK, cookie)
    expect(res.status).toBe(503)
    const texto = await res.text()
    expect(texto).toContain('promeia_unreachable')
    expect(texto).not.toContain(TOKEN_MARCADOR)
  })

  test('promeia travado: a consulta desiste em segundos, como promeia_unreachable', async () => {
    const cookie = await cookieDe(ADMIN)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    promeiaQueSoSoltaNoAbort()
    let resolvida: Response | null = null
    const pendente = consultar(ID_OK, cookie).then((r) => (resolvida = r))
    await vi.advanceTimersByTimeAsync(TIMEOUT_STATUS_MS)
    expect(resolvida).not.toBeNull()
    const res = await pendente
    expect(res.status).toBe(503)
    const texto = await res.text()
    expect(texto).toContain('promeia_unreachable')
    expect(texto).not.toContain(TOKEN_MARCADOR)
  })
})
