import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { registrarEnvio } from '../domain/alertas-envio'
import { app } from '../index'
import { settingsRoutes } from './settings'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Monta só o router, sem o middleware do Better Auth — mesmo padrão de
// routes/reports.test.ts: o que está sob teste aqui é o contrato HTTP +
// envelope, não autenticação.
function router() {
  const hono = new Hono()
  hono.route('/api', settingsRoutes)
  return hono
}

function get() {
  return router().request('/api/settings', {}, { DB: env.DB })
}

function put(body: unknown) {
  return router().request(
    '/api/settings',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

function getKey(key: string) {
  return router().request(`/api/settings/${key}`, {}, { DB: env.DB })
}

function putKey(key: string, body: unknown) {
  return router().request(
    `/api/settings/${key}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

type Envelope<T> = {
  ok: boolean
  data: T
  notifications: Array<{
    type: string
    code: string
    message: string
    field?: string
  }>
}

describe('settingsRoutes — montagem', () => {
  it('está montado ACIMA do catch-all /api/*', () => {
    const primeiro = app.routes.findIndex((r) =>
      r.path.startsWith('/api/settings'),
    )
    const catchAll = app.routes.reduce(
      (last, r, i) => (r.path === '/api/*' ? i : last),
      -1,
    )
    expect(primeiro).toBeGreaterThanOrEqual(0)
    expect(catchAll).toBeGreaterThanOrEqual(0)
    expect(primeiro).toBeLessThan(catchAll)
  })
})

describe('GET /api/settings', () => {
  it('devolve o default (R$ 3.600 = 360000 centavos) quando nada foi salvo', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.fixed_net_cents).toBe(360000)
  })

  it('devolve o valor salvo por um PUT anterior', async () => {
    await put({ fixed_net_cents: 548000 })

    const res = await get()
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(548000)
  })

  // CRITICAL C2 (fix final): esta é a tela `#/configuracoes` — uma das TRÊS
  // que dependiam do mesmo `getFixedNetCents` sem proteção contra a tabela
  // `settings` faltando (as outras duas são o bloco Comprometido da home e
  // `#/comprometido`, cobertas em `routes/reports.test.ts`). Prova que a
  // degradação é da ROTA, não só do domínio.
  it('tabela settings ausente: continua 200 com o default, nunca 500', async () => {
    await env.DB.prepare('DROP TABLE settings').run()

    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.ok).toBe(true)
    expect(body.data.fixed_net_cents).toBe(360000)
  })
})

describe('PUT /api/settings', () => {
  it('salva e devolve 200 com o valor salvo no envelope', async () => {
    const res = await put({ fixed_net_cents: 420000 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.fixed_net_cents).toBe(420000)
  })

  it.each([
    ['zero', 0],
    ['negativo', -100000],
    ['não inteiro', 360000.5],
    ['absurdamente grande', 100_000_001],
  ])(
    '%s devolve 422 invalid_setting com field fixed_net_cents',
    async (_label, value) => {
      const res = await put({ fixed_net_cents: value })
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope<null>
      expect(body.ok).toBe(false)
      expect(body.notifications[0].code).toBe('invalid_setting')
      expect(body.notifications[0].field).toBe('fixed_net_cents')
    },
  )

  it('fixed_net_cents ausente/não numérico (string) devolve 422', async () => {
    const res = await put({ fixed_net_cents: '3600,00' })
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_setting')
  })

  it('corpo malformado (não é JSON) devolve 400 invalid_json', async () => {
    const res = await router().request(
      '/api/settings',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{nao-e-json',
      },
      { DB: env.DB },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('valor inválido não sobrescreve um valor salvo anteriormente válido', async () => {
    await put({ fixed_net_cents: 250000 })
    await put({ fixed_net_cents: -1 })

    const res = await get()
    const body = (await res.json()) as Envelope<{ fixed_net_cents: number }>
    expect(body.data.fixed_net_cents).toBe(250000)
  })
})

// GET/PUT /api/settings/:key — chave-valor genérico (fatia ②, Tasks 4-5: o
// mapa de colunas de import por conta, `import_map:<account_id>`). Rota
// NOVA, `/api/settings` (sem parâmetro) acima continua intocada.
describe('GET/PUT /api/settings/:key — genérico', () => {
  it('chave nunca salva devolve { key, value: null }', async () => {
    const res = await getKey('import_map:conta-1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{
      key: string
      value: string | null
    }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ key: 'import_map:conta-1', value: null })
  })

  it('salva e relê pela mesma chave', async () => {
    const put1 = await putKey('import_map:conta-1', { value: '{"data":0}' })
    expect(put1.status).toBe(200)

    const res = await getKey('import_map:conta-1')
    const body = (await res.json()) as Envelope<{
      key: string
      value: string | null
    }>
    expect(body.data.value).toBe('{"data":0}')
  })

  it('chaves diferentes não colidem', async () => {
    await putKey('import_map:conta-1', { value: 'A' })
    await putKey('import_map:conta-2', { value: 'B' })

    const r1 = (await (await getKey('import_map:conta-1')).json()) as Envelope<{
      value: string | null
    }>
    const r2 = (await (await getKey('import_map:conta-2')).json()) as Envelope<{
      value: string | null
    }>
    expect(r1.data.value).toBe('A')
    expect(r2.data.value).toBe('B')
  })

  it('PUT value ausente/não-string devolve 422 invalid_setting', async () => {
    const res = await putKey('import_map:conta-1', { value: 123 })
    expect(res.status).toBe(422)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_setting')
    expect(body.notifications[0].field).toBe('value')
  })

  it('corpo malformado (não é JSON) devolve 400 invalid_json', async () => {
    const res = await router().request(
      '/api/settings/import_map:conta-1',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: '{nao-e-json',
      },
      { DB: env.DB },
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  // A validação NUMÉRICA de fixed_net_cents (setFixedNetCents) não pode ser
  // contornada escrevendo por este caminho genérico — senão qualquer string
  // viraria um valor "salvo" pra essa chave, sem passar pelo RangeError que
  // `PUT /api/settings` garante.
  it('chave reservada (fixed_net_cents) recusa os dois verbos, 422 reserved_setting_key', async () => {
    const resGet = await getKey('fixed_net_cents')
    expect(resGet.status).toBe(422)
    const bodyGet = (await resGet.json()) as Envelope<null>
    expect(bodyGet.notifications[0].code).toBe('reserved_setting_key')

    const resPut = await putKey('fixed_net_cents', { value: 'lixo' })
    expect(resPut.status).toBe(422)
    const bodyPut = (await resPut.json()) as Envelope<null>
    expect(bodyPut.notifications[0].code).toBe('reserved_setting_key')

    // E o valor numérico salvo por PUT /api/settings continua intocado.
    await put({ fixed_net_cents: 250000 })
    const resGetDepois = await getKey('fixed_net_cents')
    expect(resGetDepois.status).toBe(422)
    const semValorCorrompido = await get()
    const bodySemValorCorrompido =
      (await semValorCorrompido.json()) as Envelope<{
        fixed_net_cents: number
      }>
    expect(bodySemValorCorrompido.data.fixed_net_cents).toBe(250000)
  })
})

// Liga/desliga dos alertas por e-mail. Rotas próprias, registradas ANTES da
// genérica /settings/:key: sem isso, '/settings/alertas' cairia nela como a
// chave 'alertas' e o PUT gravaria uma string opaca qualquer.
describe('GET/PUT /api/settings/alertas', () => {
  const PARA = 'dono@exemplo.test'
  const REMETENTE = 'alertas@exemplo.test'
  const ENVIO = { modo: 'email_routing', de: REMETENTE, para: PARA } as const
  const SEM_BINDING = {
    estado: 'nao_configurado',
    modo: null,
    codigo: 'alertas_sem_binding',
  }

  type Alertas = {
    ligado: boolean
    envio: { estado: string; modo: string | null; codigo?: string; em?: string }
  }

  function configCompleta(parcial: Record<string, unknown> = {}) {
    return {
      DB: env.DB,
      EMAIL: {} as SendEmail,
      ALLOWED_EMAIL: PARA,
      ALERTAS_REMETENTE: REMETENTE,
      ALERTAS_ENVIO: 'email_routing',
      ...parcial,
    }
  }

  function getAlertas(bindings: Record<string, unknown> = { DB: env.DB }) {
    return router().request('/api/settings/alertas', {}, bindings)
  }

  function putAlertas(
    body: unknown,
    cru = false,
    bindings: Record<string, unknown> = { DB: env.DB },
  ) {
    return router().request(
      '/api/settings/alertas',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: cru ? (body as string) : JSON.stringify(body),
      },
      bindings,
    )
  }

  async function linhaSalva(key: string) {
    return env.DB.prepare('SELECT value FROM settings WHERE key = ?')
      .bind(key)
      .first<{ value: string }>()
  }

  it('nada salvo e sem binding: 200 { ligado: true, envio não configurado }', async () => {
    const res = await getAlertas()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<Alertas>
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data).toEqual({ ligado: true, envio: SEM_BINDING })
  })

  it('PUT desliga e religa, e o GET relê', async () => {
    const desliga = await putAlertas({ ligado: false })
    expect(desliga.status).toBe(200)
    expect(((await desliga.json()) as Envelope<Alertas>).data).toEqual({
      ligado: false,
      envio: SEM_BINDING,
    })
    expect(
      ((await (await getAlertas()).json()) as Envelope<Alertas>).data,
    ).toEqual({ ligado: false, envio: SEM_BINDING })
    expect(await linhaSalva('alertas_email')).toEqual({ value: '0' })

    const liga = await putAlertas({ ligado: true })
    expect(((await liga.json()) as Envelope<Alertas>).data).toEqual({
      ligado: true,
      envio: SEM_BINDING,
    })
    expect(await linhaSalva('alertas_email')).toEqual({ value: '1' })
  })

  it.each([
    ['sem o campo', {}],
    ['string', { ligado: 'false' }],
    ['número', { ligado: 0 }],
    ['null', { ligado: null }],
    ['corpo null', null],
    ['corpo lista', [false]],
  ])(
    'corpo %s: 422 invalid_setting no campo ligado, nada gravado',
    async (_label, corpo) => {
      const res = await putAlertas(corpo)
      expect(res.status).toBe(422)
      const body = (await res.json()) as Envelope<null>
      expect(body.ok).toBe(false)
      expect(body.notifications[0].code).toBe('invalid_setting')
      expect(body.notifications[0].field).toBe('ligado')
      expect(body.notifications[0].message).toBe(
        'ligado precisa ser verdadeiro ou falso',
      )
      expect(await linhaSalva('alertas_email')).toBeNull()
    },
  )

  it('JSON malformado: 400 invalid_json', async () => {
    const res = await putAlertas('{nao-e-json', true)
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('a genérica não engole a rota: GET devolve { ligado, envio } e PUT com { value } não grava a chave "alertas"', async () => {
    const res = await getAlertas()
    const body = (await res.json()) as Envelope<Record<string, unknown>>
    expect(Object.keys(body.data)).toEqual(['ligado', 'envio'])

    const put = await putAlertas({ value: 'qualquer' })
    expect(put.status).toBe(422)
    expect(await linhaSalva('alertas')).toBeNull()
  })

  it('a chave alertas_email é reservada: a genérica recusa ler e escrever', async () => {
    await putAlertas({ ligado: false })

    const resGet = await getKey('alertas_email')
    expect(resGet.status).toBe(422)
    const bodyGet = (await resGet.json()) as Envelope<null>
    expect(bodyGet.notifications[0].code).toBe('reserved_setting_key')
    expect(bodyGet.notifications[0].message).toContain('/api/settings/alertas')

    const resPut = await putKey('alertas_email', { value: '1' })
    expect(resPut.status).toBe(422)
    const bodyPut = (await resPut.json()) as Envelope<null>
    expect(bodyPut.notifications[0].code).toBe('reserved_setting_key')
    expect(await linhaSalva('alertas_email')).toEqual({ value: '0' })
  })

  // Estado REAL do envio (E3/E4): a tela nunca diz "Ligado" sem e-mail
  // saindo. As regras moram em domain/alertas-envio.ts; aqui, o contrato.
  it('configurado e sem tentativa ainda: aguardando, no modo do ALERTAS_ENVIO', async () => {
    const body = (await (
      await getAlertas(configCompleta())
    ).json()) as Envelope<Alertas>
    expect(body.data).toEqual({
      ligado: true,
      envio: { estado: 'aguardando', modo: 'email_routing' },
    })
  })

  it('último envio deu certo: pronto, com a data', async () => {
    await registrarEnvio(env.DB, ENVIO, {
      resultado: 'enviado',
      em: '2026-08-10T09:00:00Z',
    })
    const body = (await (
      await getAlertas(configCompleta())
    ).json()) as Envelope<Alertas>
    expect(body.data.envio).toEqual({
      estado: 'pronto',
      modo: 'email_routing',
      em: '2026-08-10T09:00:00Z',
    })
  })

  it('última tentativa recusada por configuração: nao_configurado com código e data', async () => {
    await registrarEnvio(env.DB, ENVIO, {
      resultado: 'falhou',
      codigo: 'E_SENDER_NOT_VERIFIED',
      em: '2026-08-10T09:00:00Z',
    })
    const body = (await (
      await getAlertas(configCompleta())
    ).json()) as Envelope<Alertas>
    expect(body.data.envio).toEqual({
      estado: 'nao_configurado',
      modo: 'email_routing',
      codigo: 'E_SENDER_NOT_VERIFIED',
      em: '2026-08-10T09:00:00Z',
    })
  })

  it('última tentativa falhou por motivo passageiro: falhou com código e data', async () => {
    await registrarEnvio(env.DB, ENVIO, {
      resultado: 'falhou',
      codigo: 'E_RATE_LIMIT_EXCEEDED',
      em: '2026-08-10T09:00:00Z',
    })
    const body = (await (
      await getAlertas(configCompleta())
    ).json()) as Envelope<Alertas>
    expect(body.data.envio).toEqual({
      estado: 'falhou',
      modo: 'email_routing',
      codigo: 'E_RATE_LIMIT_EXCEEDED',
      em: '2026-08-10T09:00:00Z',
    })
  })

  it('PUT devolve a mesma forma do GET, com o estado do envio', async () => {
    await registrarEnvio(env.DB, ENVIO, {
      resultado: 'enviado',
      em: '2026-08-10T09:00:00Z',
    })
    const res = await putAlertas({ ligado: false }, false, configCompleta())
    expect(res.status).toBe(200)
    expect(((await res.json()) as Envelope<Alertas>).data).toEqual({
      ligado: false,
      envio: {
        estado: 'pronto',
        modo: 'email_routing',
        em: '2026-08-10T09:00:00Z',
      },
    })
  })

  it.each([
    [
      'sem destinatário',
      { ALLOWED_EMAIL: undefined },
      'alertas_sem_destinatario',
    ],
    [
      'sem remetente',
      { ALERTAS_REMETENTE: undefined },
      'alertas_sem_remetente',
    ],
    ['sem modo', { ALERTAS_ENVIO: undefined }, 'alertas_sem_modo'],
  ])(
    '%s: nao_configurado com o código da falta',
    async (_rotulo, parcial, codigo) => {
      const body = (await (
        await getAlertas(configCompleta(parcial))
      ).json()) as Envelope<Alertas>
      expect(body.data.envio.estado).toBe('nao_configurado')
      expect(body.data.envio.codigo).toBe(codigo)
    },
  )

  it('a resposta nunca traz o endereço de destino nem o do remetente', async () => {
    await registrarEnvio(env.DB, ENVIO, {
      resultado: 'falhou',
      codigo: 'destino_nao_verificado',
      em: '2026-08-10T09:00:00Z',
    })
    for (const res of [
      await getAlertas(configCompleta()),
      await putAlertas({ ligado: true }, false, configCompleta()),
      await getAlertas(configCompleta({ ALERTAS_ENVIO: 'smtp' })),
    ]) {
      const texto = await res.text()
      expect(texto).not.toContain(PARA)
      expect(texto).not.toContain(REMETENTE)
      expect(texto).not.toContain('@')
    }
  })

  // Só a leitura do registro do envio falha (o liga/desliga lê bem): prova
  // que é o estado do envio que propaga, sem cair num estado inventado.
  it('leitura do estado falhando no D1: a rota não inventa estado (propaga, 500)', async () => {
    const delega = <T extends object>(alvo: T, prop: string | symbol) => {
      const valor = Reflect.get(alvo, prop)
      return typeof valor === 'function' ? valor.bind(alvo) : valor
    }
    const dbQueFalha = new Proxy(env.DB, {
      get(alvo, prop) {
        if (prop !== 'prepare') return delega(alvo, prop)
        return (sql: string) =>
          new Proxy(alvo.prepare(sql), {
            get(stmt, p) {
              if (p !== 'bind') return delega(stmt, p)
              return (...args: unknown[]) => {
                if (!args.includes('alertas_email_envio')) {
                  return stmt.bind(...args)
                }
                return {
                  first: async () => {
                    throw new Error('D1_ERROR: falhou: SQLITE_ERROR')
                  },
                }
              }
            },
          })
      },
    })
    const res = await getAlertas(configCompleta({ DB: dbQueFalha }))
    expect(res.status).toBe(500)
  })

  it('a chave alertas_email_envio é reservada: a genérica recusa ler e escrever, apontando a rota dos alertas', async () => {
    await registrarEnvio(env.DB, ENVIO, {
      resultado: 'enviado',
      em: '2026-08-10T09:00:00Z',
    })
    const antes = await linhaSalva('alertas_email_envio')

    const resGet = await getKey('alertas_email_envio')
    expect(resGet.status).toBe(422)
    const bodyGet = (await resGet.json()) as Envelope<null>
    expect(bodyGet.notifications[0].code).toBe('reserved_setting_key')
    expect(bodyGet.notifications[0].message).toContain('/api/settings/alertas')

    const resPut = await putKey('alertas_email_envio', {
      value: JSON.stringify({
        resultado: 'enviado',
        modo: 'email_routing',
        em: '2030-01-01T00:00:00Z',
      }),
    })
    expect(resPut.status).toBe(422)
    const bodyPut = (await resPut.json()) as Envelope<null>
    expect(bodyPut.notifications[0].code).toBe('reserved_setting_key')
    expect(await linhaSalva('alertas_email_envio')).toEqual(antes)
  })

  it('no app montado, /api/settings/alertas vem antes de /api/settings/:key', () => {
    const indice = (metodo: string, path: string) =>
      app.routes.findIndex((r) => r.method === metodo && r.path === path)
    for (const metodo of ['GET', 'PUT']) {
      const alertas = indice(metodo, '/api/settings/alertas')
      const generica = indice(metodo, '/api/settings/:key')
      expect(alertas).toBeGreaterThanOrEqual(0)
      expect(generica).toBeGreaterThan(alertas)
    }
  })
})
