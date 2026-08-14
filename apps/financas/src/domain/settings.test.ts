import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_FIXED_NET_CENTS } from './reports'
import {
  getFixedNetCents,
  getSetting,
  MAX_FIXED_NET_CENTS,
  setFixedNetCents,
  setSetting,
} from './settings'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('getFixedNetCents', () => {
  it('devolve o default (R$ 3.600, líquido SEM freela) quando nada foi salvo', async () => {
    expect(await getFixedNetCents(env.DB)).toBe(DEFAULT_FIXED_NET_CENTS)
    expect(DEFAULT_FIXED_NET_CENTS).toBe(360000)
  })

  it('devolve o valor salvo por setFixedNetCents', async () => {
    await setFixedNetCents(env.DB, 548000)
    expect(await getFixedNetCents(env.DB)).toBe(548000)
  })

  it('grava como TEXT (centavos em string), nunca número cru', async () => {
    await setFixedNetCents(env.DB, 420000)
    const row = await env.DB.prepare(
      `SELECT value, typeof(value) AS t FROM settings WHERE key = 'fixed_net_cents'`,
    ).first<{ value: string; t: string }>()
    expect(row?.t).toBe('text')
    expect(row?.value).toBe('420000')
  })
})

describe('setFixedNetCents — validação (zero, negativo, não inteiro, absurdo)', () => {
  it.each([
    ['zero', 0],
    ['negativo', -100000],
    ['não inteiro (fração de centavo)', 360000.5],
  ])('rejeita %s com RangeError', async (_label, value) => {
    await expect(setFixedNetCents(env.DB, value)).rejects.toThrow(RangeError)
  })

  it('rejeita valor absurdamente grande, acima do teto de sanidade', async () => {
    await expect(
      setFixedNetCents(env.DB, MAX_FIXED_NET_CENTS + 1),
    ).rejects.toThrow(RangeError)
  })

  it('aceita exatamente o teto de sanidade (sem falso positivo na borda)', async () => {
    expect(await setFixedNetCents(env.DB, MAX_FIXED_NET_CENTS)).toBe(
      MAX_FIXED_NET_CENTS,
    )
  })

  it('salvar de novo SUBSTITUI o valor anterior (upsert) — não duplica linha', async () => {
    await setFixedNetCents(env.DB, 100000)
    await setFixedNetCents(env.DB, 200000)
    const { results } = await env.DB.prepare(
      `SELECT * FROM settings WHERE key = 'fixed_net_cents'`,
    ).all()
    expect(results.length).toBe(1)
    expect(await getFixedNetCents(env.DB)).toBe(200000)
  })

  it('valor inválido não fica salvo — rejeita ANTES de gravar, não depois', async () => {
    await setFixedNetCents(env.DB, 250000)
    await expect(setFixedNetCents(env.DB, -1)).rejects.toThrow(RangeError)
    expect(await getFixedNetCents(env.DB)).toBe(250000)
  })
})

// Fix round 1 (Minor 2 do review): a defesa de `getFixedNetCents` contra uma
// linha corrompida (JSDoc do próprio arquivo já a descrevia, mas nenhum
// teste inseria uma linha ruim de verdade pra provar) — inalcançável pelo
// caminho normal, já que `setFixedNetCents` valida ANTES de gravar; existe
// pro dia em que a chave for escrita por fora (`wrangler d1 execute`
// manual). Sem este teste, um refatoro futuro que simplificasse
// `getFixedNetCents` pra um `Number(row.value)` cru derrubaria a defesa sem
// nada pra pegar isso — a suíte continuaria verde inteira.
describe('getFixedNetCents — defesa contra linha corrompida (INSERT direto, fora de setFixedNetCents)', () => {
  async function gravarBruto(valor: string): Promise<void> {
    await env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('fixed_net_cents', ?, '2026-01-01T00:00:00Z')`,
    )
      .bind(valor)
      .run()
  }

  it.each([
    ['não numérico', 'lixo'],
    ['zero', '0'],
    ['negativo', '-100000'],
    ['fração de centavo (não inteiro)', '360000.5'],
    ['acima do teto de sanidade', String(MAX_FIXED_NET_CENTS + 1)],
  ])(
    'linha salva com valor %s cai pro default, não propaga o lixo nem quebra',
    async (_label, valorBruto) => {
      await gravarBruto(valorBruto)
      expect(await getFixedNetCents(env.DB)).toBe(DEFAULT_FIXED_NET_CENTS)
    },
  )
})

// CRITICAL C2 (fix final): a tabela `settings` só existe a partir da
// migration 0005 — se `wrangler deploy` rodar antes de
// `wrangler d1 migrations apply --remote`, o SELECT desta função batia
// contra uma tabela inexistente e propagava cru (sem try/catch aqui, e
// `routes/reports.ts#resolveFixedNetCents` chamava isso FORA do try/catch
// da rota) até um 500 sem envelope — `src/index.ts` não registrava `onError`
// na época (hoje registra: seria 500 `internal_error` DENTRO do envelope,
// ainda assim com as três telas quebradas — por isso esta defesa fica).
// Três telas dependiam do mesmo caminho: o bloco Comprometido da home,
// `#/comprometido` e `#/configuracoes` (`GET /api/settings`, mesma função).
// Este teste prova o fallback no nível mais baixo (o domínio); os testes
// de rota equivalentes ficam em `routes/reports.test.ts` e
// `routes/settings.test.ts`.
describe('getFixedNetCents — defesa contra a tabela settings ausente (fix final, achado C2)', () => {
  it('tabela dropada: devolve o default em vez de propagar o erro do D1', async () => {
    await env.DB.prepare('DROP TABLE settings').run()

    await expect(getFixedNetCents(env.DB)).resolves.toBe(
      DEFAULT_FIXED_NET_CENTS,
    )
  })
})

// `settings` é chave-valor GENÉRICA desde a migration 0005 (comentário do
// próprio schema: "uma configuração futura reusa esta MESMA tabela sem
// migration nova") — `getSetting`/`setSetting` são o primeiro consumidor
// além de `fixed_net_cents`, usados pelo mapa de colunas de import por
// conta (fatia ②, Tasks 4-5, `import_map:<account_id>`). Diferente de
// `getFixedNetCents`/`setFixedNetCents`: nenhuma validação de FORMATO do
// valor aqui — `value` é uma string opaca (o chamador decide o que
// significa, ex. JSON.stringify de um mapa de colunas), a mesma
// responsabilidade que `createAccount`/`setFixedNetCents` têm sobre O
// PRÓPRIO domínio, não sobre um genérico.
describe('getSetting/setSetting — chave-valor genérico', () => {
  it('chave nunca salva devolve null', async () => {
    expect(await getSetting(env.DB, 'import_map:conta-1')).toBeNull()
  })

  it('salva e relê pela mesma chave', async () => {
    await setSetting(env.DB, 'import_map:conta-1', '{"data":0,"valor":1}')
    expect(await getSetting(env.DB, 'import_map:conta-1')).toBe(
      '{"data":0,"valor":1}',
    )
  })

  it('chaves diferentes não colidem', async () => {
    await setSetting(env.DB, 'import_map:conta-1', 'A')
    await setSetting(env.DB, 'import_map:conta-2', 'B')
    expect(await getSetting(env.DB, 'import_map:conta-1')).toBe('A')
    expect(await getSetting(env.DB, 'import_map:conta-2')).toBe('B')
  })

  it('salvar de novo SUBSTITUI o valor anterior (upsert) — não duplica linha', async () => {
    await setSetting(env.DB, 'import_map:conta-1', 'v1')
    await setSetting(env.DB, 'import_map:conta-1', 'v2')
    const { results } = await env.DB.prepare(
      `SELECT * FROM settings WHERE key = 'import_map:conta-1'`,
    ).all()
    expect(results.length).toBe(1)
    expect(await getSetting(env.DB, 'import_map:conta-1')).toBe('v2')
  })

  it('nunca colide com fixed_net_cents — chaves distintas na mesma tabela', async () => {
    await setFixedNetCents(env.DB, 420000)
    await setSetting(env.DB, 'import_map:conta-1', 'valor-generico')
    expect(await getFixedNetCents(env.DB)).toBe(420000)
    expect(await getSetting(env.DB, 'import_map:conta-1')).toBe(
      'valor-generico',
    )
  })

  it('tabela settings ausente: getSetting devolve null em vez de propagar o erro do D1', async () => {
    await env.DB.prepare('DROP TABLE settings').run()
    await expect(getSetting(env.DB, 'import_map:conta-1')).resolves.toBeNull()
  })
})
