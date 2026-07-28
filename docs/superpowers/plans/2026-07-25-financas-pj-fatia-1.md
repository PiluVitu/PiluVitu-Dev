# Finanças PJ — Fatia ① Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um módulo pessoal de controle financeiro em que o dono cadastre dívidas com pessoas físicas compostas de sub-itens (e saiba quais itens já estão quitados), registre compras parceladas, e veja quanto da sua renda fixa já está comprometida nos próximos seis meses.

**Architecture:** Um Cloudflare Worker único em `financas.piluvitu.com.br`, atrás do Cloudflare Access, servindo uma SPA (Vite + React) por Static Assets e uma API Hono em `/api/*` sobre D1. UI e API no mesmo host — isso elimina CORS, cookie cross-site e o teto de body da Vercel de uma vez. `apps/web` (Vercel) e `apps/api` (Go) **não são tocados**. O Mac com Ollama só entra na fatia ③.

**Tech Stack:** Cloudflare Workers · Hono · D1 (SQLite, todas as tabelas `STRICT`) · Cloudflare Access (JWT) · Vite + React + TypeScript · Vitest com `@cloudflare/vitest-pool-workers` (Miniflare) · Jest em `packages/tools` · pnpm workspaces

**Spec:** `docs/superpowers/specs/2026-07-25-financas-pj-design.md` — leia a §0 (resultados dos spikes) antes de começar; ela contradiz o que a documentação da Cloudflare dá a entender em quatro pontos.

## Global Constraints

Todo requisito abaixo vale para **todas** as tasks, implicitamente.

**Dinheiro e precisão**

- Dinheiro é **sempre `INTEGER` em centavos**, do schema à UI. Nunca `REAL`, nunca float, nunca `toFixed`. Formatação só via `formatBRL` de `@piluvitu/tools/money`.
- Toda PK é **`TEXT` UUID** gerado no cliente com `crypto.randomUUID()`. Motivo: o binding do D1 devolve `INTEGER` como `Number` do JS (52 bits) e não existe `last_insert_rowid()` confiável entre statements de um `batch()`.

**D1 — fatos medidos em 2026-07-25 contra banco real (§0 do spec)**

- `BEGIN` / `COMMIT` / `SAVEPOINT` são **rejeitados**. Atomicidade é via `db.batch()`, que **faz rollback real** da sequência inteira quando um statement aborta.
- **`TRIGGER` funciona e dispara** (`SQLITE_CONSTRAINT_TRIGGER`). Os invariantes de soma vivem no banco, não na aplicação.
- **`FOREIGN KEY` é aplicada** (`PRAGMA foreign_keys = 1` por padrão). Todo `REFERENCES` tem efeito real.
- **`STRICT` funciona** e o tipo é aplicado. Toda tabela é `STRICT`; só `INT`/`INTEGER`/`REAL`/`TEXT`/`BLOB`/`ANY` são tipos válidos e toda coluna precisa de tipo declarado.
- `sqlite_version()` é **bloqueada** pelo D1 (`not authorized to use function`). Não tente consultá-la.
- **Limite real e ativo: 100 bound params por statement.** O limite documentado de 50 queries por invocação **não foi reproduzido**; `INSERT` multi-row continua sendo o desenho, mas por latência (151 ms contra ~8.000 ms), não por correção.
- Migrations são **forward-only** — não existe down migration. **Índice no D1 não pode ser alterado**, só dropado (irreversível) e recriado: acerte a `0001` de primeira.

**Datas e fuso**

- Datas são `TEXT` ISO-8601 `'YYYY-MM-DD'`; competência é `TEXT` `'YYYY-MM'`; timestamps são UTC `'YYYY-MM-DDTHH:MM:SSZ'`.
- **Teresina é UTC−3 fixo, sem horário de verão**, e o SQLite grava UTC. Um gasto às 22h do dia 31 **não pode** virar dia 1 do mês seguinte. Use `todayInTeresina()`; nunca `datetime('now')` para data de negócio.

**Convenções do repo (lei do `CLAUDE.md` raiz)**

- **Colocation:** teste no **mesmo diretório** do fonte (`x.ts` + `x.test.ts`). Jamais em `tests/` separado. E2E usa `.e2e.ts` ao lado da rota.
- Estilo TS: **sem ponto-e-vírgula**, aspas simples, prettier. ESM (`"type": "module"`).
- `packages/tools` expõe cada módulo no **export map** do `package.json` (ex.: `"./money": "./src/money.ts"`).
- pnpm 11 **bloqueia lifecycle scripts**: dependência que precise de script de instalação entra em `allowBuilds` no `pnpm-workspace.yaml`. Nunca use `dangerouslyAllowAllBuilds`. `minimumReleaseAge: 1440` pula versões com menos de 24 h.
- Antes de qualquer commit: `pnpm prettier:fix` → `pnpm lint` → `make test`.
- ⚠️ **`pnpm -r <script>` PULA em silêncio o workspace que não declara o script.** Verificado no repo: hoje **só `apps/web`** declara `prettier:fix` e `lint`; `packages/tools` não declara `lint`. Portanto `apps/financas` e `apps/financas-web` **precisam declarar os dois** nos seus `package.json` (`"lint": "tsc --noEmit"`, `"prettier:fix": "prettier --write ."` com `prettier` na devDependency do workspace), senão os comandos da raiz rodam verdes sem nunca ter olhado o código novo. E `pnpm -r lint` cobre **3** workspaces, não 4 — `@piluvitu/tools` fica de fora até ganhar o script.
- **Regra global:** tecnologia nova ou fluxo alterado ⇒ atualizar o `CLAUDE.md` do workspace onde mexeu (Task 14).

**Envelope de resposta** — shape idêntico ao de `apps/api/internal/httpx/respond.go`:

```ts
export type NotificationKind = 'error' | 'warning' | 'success' | 'info'
export type Notification = {
  type: NotificationKind
  code?: string // legível por máquina, ex.: 'over_allocation'
  message: string // legível por humano, pt-BR
  field?: string // campo ofensor em erro de validação
}
export type Envelope<T> = {
  ok: boolean
  data: T | null // null em erro
  notifications: Notification[] // NUNCA null — [] quando vazio
}
```

**Deploy**

- **Custom Domain é obrigatório**, não preferência. `*.workers.dev` é domínio registrável diferente ⇒ contexto cross-site ⇒ `SameSite=Lax` deixa de ser enviado, e **a quebra só aparece em produção**.

---

---

Everything is verified against real runs. Here are Tasks 1 and 2.

### Task 1: `money.ts` em `packages/tools`

**Files:**

- Create: `packages/tools/src/money.ts`
- Test: `packages/tools/src/money.test.ts`
- Modify: `packages/tools/package.json` (export map)
- Modify: `packages/tools/src/index.ts` (barrel)

**Interfaces:**

- Consumes: nada. É o **primeiro arquivo do projeto** — hoje não existe nenhum utilitário de moeda no repo (a formatação é `toLocaleString('pt-BR')` inline em 5 componentes do `apps/web`).
- Produces:
  ```ts
  export type Cents = number
  export function parseBRL(input: string): Cents
  export function formatBRL(cents: Cents): string
  export function splitInstallments(total: Cents, count: number): Cents[]
  export function sumCents(values: Cents[]): Cents
  ```
  Importável como `@piluvitu/tools/money`. Todas as tasks seguintes (Worker e SPA) formatam dinheiro **só** por aqui.

---

- [ ] **Step 1: Escrever o teste `packages/tools/src/money.test.ts`**

```ts
import { formatBRL, parseBRL, splitInstallments, sumCents } from './money'

describe('parseBRL', () => {
  test('aceita as quatro formas de entrada', () => {
    expect(parseBRL('1.360,00')).toBe(136000)
    expect(parseBRL('1360,00')).toBe(136000)
    expect(parseBRL('1360')).toBe(136000)
    expect(parseBRL('R$ 1.360,00')).toBe(136000)
  })

  test('aceita R$ colado, espaços nas bordas e negativo', () => {
    expect(parseBRL('R$1.360,00')).toBe(136000)
    expect(parseBRL('  R$ 1.360,00  ')).toBe(136000)
    expect(parseBRL('-R$ 1.360,00')).toBe(-136000)
    expect(parseBRL('-1360,00')).toBe(-136000)
  })

  test('um dígito decimal vale dezena de centavo', () => {
    expect(parseBRL('10,5')).toBe(1050)
    expect(parseBRL('0,05')).toBe(5)
  })

  test('zero nunca volta como -0', () => {
    expect(Object.is(parseBRL('-0,00'), 0)).toBe(true)
    expect(parseBRL('0')).toBe(0)
  })

  test('milhão com dois separadores', () => {
    expect(parseBRL('R$ 1.000.000,00')).toBe(100000000)
  })

  test('rejeita entrada inválida com RangeError', () => {
    expect(() => parseBRL('')).toThrow(RangeError)
    expect(() => parseBRL('abc')).toThrow(RangeError)
    expect(() => parseBRL('1.36')).toThrow(RangeError)
    expect(() => parseBRL('12.3456')).toThrow(RangeError)
    expect(() => parseBRL('1,234')).toThrow(RangeError)
    expect(() => parseBRL('1.360,00 reais')).toThrow(RangeError)
    expect(() => parseBRL('R$')).toThrow(RangeError)
  })
})

describe('formatBRL', () => {
  test('formata zero, centavo, milhar e milhão', () => {
    expect(formatBRL(0)).toBe('R$ 0,00')
    expect(formatBRL(5)).toBe('R$ 0,05')
    expect(formatBRL(136000)).toBe('R$ 1.360,00')
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00')
  })

  test('formata negativo com o sinal antes do R$', () => {
    expect(formatBRL(-136000)).toBe('-R$ 1.360,00')
    expect(formatBRL(-5)).toBe('-R$ 0,05')
  })

  test('não usa espaço não-quebrável (U+00A0) como o Intl usa', () => {
    expect(formatBRL(136000)).not.toContain('\u00a0')
  })

  test('round-trip parse -> format -> parse', () => {
    for (const cents of [0, 1, 99, 100, 136000, -136000, 100000000]) {
      expect(parseBRL(formatBRL(cents))).toBe(cents)
    }
  })

  test('rejeita não-inteiro com RangeError', () => {
    expect(() => formatBRL(10.5)).toThrow(RangeError)
    expect(() => formatBRL(NaN)).toThrow(RangeError)
  })
})

describe('splitInstallments', () => {
  test('R$ 100,00 em 3x põe o resto nas primeiras', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
  })

  test('divisão exata não sobra centavo', () => {
    expect(splitInstallments(9999, 3)).toEqual([3333, 3333, 3333])
  })

  test('1x devolve o total inteiro', () => {
    expect(splitInstallments(136000, 1)).toEqual([136000])
  })

  test('a soma das parcelas é sempre o total (propriedade)', () => {
    const totais = [1, 2, 7, 99, 100, 10000, 136000, 280000, 999999, 123457]
    const contagens = [1, 2, 3, 6, 7, 10, 12, 13, 24, 60, 359, 360]
    for (const total of totais) {
      for (const count of contagens) {
        const parcelas = splitInstallments(total, count)
        expect(parcelas).toHaveLength(count)
        expect(sumCents(parcelas)).toBe(total)
        expect(
          Math.max(...parcelas) - Math.min(...parcelas),
        ).toBeLessThanOrEqual(1)
      }
    }
  })

  test('rejeita total e contagem fora do domínio do schema', () => {
    expect(() => splitInstallments(0, 3)).toThrow(RangeError)
    expect(() => splitInstallments(-100, 3)).toThrow(RangeError)
    expect(() => splitInstallments(10.5, 3)).toThrow(RangeError)
    expect(() => splitInstallments(10000, 0)).toThrow(RangeError)
    expect(() => splitInstallments(10000, 361)).toThrow(RangeError)
    expect(() => splitInstallments(10000, 2.5)).toThrow(RangeError)
  })
})

describe('sumCents', () => {
  test('soma lista vazia, positivos e negativos', () => {
    expect(sumCents([])).toBe(0)
    expect(sumCents([3334, 3333, 3333])).toBe(10000)
    expect(sumCents([-50000, 20000, 30000])).toBe(0)
  })

  test('rejeita valor não-inteiro com RangeError', () => {
    expect(() => sumCents([100, 0.5])).toThrow(RangeError)
  })
})
```

> Os limites `1..360` de `splitInstallments` não são arbitrários: são exatamente o `CHECK (installments_count BETWEEN 1 AND 360)` da tabela `installment_plans` no §5.2 do spec. `total <= 0` idem (`CHECK (total_cents > 0)`).

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd packages/tools && pnpm exec jest src/money.test.ts`

Esperado: FAIL com

```
● Test suite failed to run

  Cannot find module './money' from 'src/money.test.ts'
```

- [ ] **Step 3: Implementar `packages/tools/src/money.ts`**

```ts
/**
 * Dinheiro em centavos. NUNCA float: `0.1 + 0.2` acumula erro de centavo, e o
 * schema do D1 guarda tudo como INTEGER (invariante 1 do spec).
 */
export type Cents = number

// Aceita: '1.360,00' | '1360,00' | '1360' | 'R$ 1.360,00' (e as variantes com
// sinal negativo antes do 'R$'). O grupo do inteiro exige separador de milhar
// consistente: '1.36' e '12.3456' são recusados de propósito.
const BRL = /^(-)?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/

export function parseBRL(input: string): Cents {
  const match = BRL.exec(String(input).trim())
  if (match === null) {
    throw new RangeError(`valor monetário inválido: ${JSON.stringify(input)}`)
  }
  const [, sign, intPart, decPart = ''] = match
  const cents = Number(intPart.replace(/\./g, '') + decPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `valor monetário fora do alcance seguro: ${JSON.stringify(input)}`,
    )
  }
  if (cents === 0) return 0
  return sign === '-' ? -cents : cents
}

// Formatação manual em vez de Intl.NumberFormat: o Intl usa U+00A0 entre 'R$'
// e o número e o resultado varia com a versão do ICU do runtime (Node, jsdom,
// workerd). Aqui a saída é byte a byte a mesma em qualquer lugar.
export function formatBRL(cents: Cents): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `centavos precisam ser inteiro seguro: ${String(cents)}`,
    )
  }
  const abs = Math.abs(cents)
  const inteiro = String(Math.trunc(abs / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    '.',
  )
  const decimal = String(abs % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}R$ ${inteiro},${decimal}`
}

// O resto de (total % count) vai nas PRIMEIRAS parcelas — é o que os emissores
// brasileiros fazem. R$ 100,00 em 3x = 3334 + 3333 + 3333.
export function splitInstallments(total: Cents, count: number): Cents[] {
  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new RangeError(
      `total precisa ser inteiro positivo em centavos: ${String(total)}`,
    )
  }
  if (!Number.isSafeInteger(count) || count < 1 || count > 360) {
    throw new RangeError(
      `número de parcelas precisa estar entre 1 e 360: ${String(count)}`,
    )
  }
  const base = Math.floor(total / count)
  const resto = total - base * count
  return Array.from({ length: count }, (_, i) => (i < resto ? base + 1 : base))
}

export function sumCents(values: Cents[]): Cents {
  let total = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(
        `centavos precisam ser inteiro seguro: ${String(value)}`,
      )
    }
    total += value
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('soma de centavos estourou o inteiro seguro')
  }
  return total
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd packages/tools && pnpm exec jest src/money.test.ts`

Esperado: PASS com `Tests: 18 passed, 18 total`

- [ ] **Step 5: Registrar `money` no export map do `packages/tools/package.json`**

Adicionar a linha `"./money"` ao objeto `exports`, logo depois de `"./roleta"`:

```json
  "exports": {
    ".": "./src/index.ts",
    "./cpf": "./src/cpf.ts",
    "./cnpj": "./src/cnpj.ts",
    "./base64": "./src/base64.ts",
    "./jwt-decode": "./src/jwt-decode.ts",
    "./json-format": "./src/json-format.ts",
    "./uuid": "./src/uuid.ts",
    "./qr-encode": "./src/qr-encode.ts",
    "./qr-decode": "./src/qr-decode.ts",
    "./prng": "./src/prng.ts",
    "./entropy": "./src/entropy.ts",
    "./roleta": "./src/roleta.ts",
    "./money": "./src/money.ts"
  },
```

> **Consumidores importam pelo subpath `@piluvitu/tools/money`, nunca pelo barrel `@piluvitu/tools`.** O barrel arrasta `qrcode` e `@zxing/browser` junto, e o bundle do Worker no free tier tem teto de **3 MB gzip** (§4 do spec).

- [ ] **Step 6: Acrescentar `money` ao barrel `packages/tools/src/index.ts`**

```ts
export * from './cpf'
export * from './cnpj'
export * from './base64'
export * from './jwt-decode'
export * from './json-format'
export * from './uuid'
export * from './qr-encode'
export * from './qr-decode'
export * from './prng'
export * from './entropy'
export * from './roleta'
export * from './money'
```

(Nenhum dos módulos existentes exporta `parseBRL`, `formatBRL`, `splitInstallments`, `sumCents` ou `Cents` — não há colisão de nome no `export *`.)

- [ ] **Step 7: Rodar a suíte inteira do pacote + type check**

Run: `pnpm --filter @piluvitu/tools test`
Esperado: PASS com `Test Suites: 10 passed, 10 total` / `Tests: 73 passed, 73 total`

Run: `cd packages/tools && pnpm exec tsc --noEmit`
Esperado: sem saída (exit 0)

- [ ] **Step 8: Formatar e commitar**

Run: `pnpm exec prettier --write packages/tools/src/money.ts packages/tools/src/money.test.ts packages/tools/src/index.ts packages/tools/package.json`

Run:

```bash
git add packages/tools/src/money.ts packages/tools/src/money.test.ts packages/tools/src/index.ts packages/tools/package.json
git commit -m "feat(tools): money.ts — centavos, parse/format BRL e rateio de parcelas

Primeiro arquivo da fatia ① de Finanças PJ. Hoje não existe nenhum utilitário
de moeda no repo — a formatação é toLocaleString('pt-BR') inline em 5
componentes do apps/web.

- Cents é sempre INTEGER em centavos; nenhum float em nenhum ponto.
- parseBRL aceita '1.360,00', '1360,00', '1360' e 'R\$ 1.360,00' (com ou sem
  sinal); qualquer outra coisa vira RangeError, inclusive separador de milhar
  malformado ('1.36', '12.3456').
- formatBRL é manual, não Intl.NumberFormat: o Intl emite U+00A0 entre 'R\$' e
  o número e a saída varia com a versão do ICU do runtime (Node, jsdom,
  workerd). Formatando à mão a saída é idêntica byte a byte nos três.
- splitInstallments põe o resto nas PRIMEIRAS parcelas, como fazem os
  emissores brasileiros: 10000 em 3x = [3334, 3333, 3333]. Domínio 1..360 e
  total > 0 espelham os CHECKs de installment_plans no §5.2 do spec.
- Propriedade coberta por teste: sum(split(t, n)) === t para 120 combinações
  de t e n, incluindo n=1 e n=360.

Exposto no export map como @piluvitu/tools/money. Consumidores usam o subpath,
nunca o barrel — o barrel arrasta qrcode e @zxing/browser, e o bundle do Worker
no free tier tem teto de 3 MB gzip.

Ref: docs/superpowers/specs/2026-07-25-financas-pj-design.md (§5.1, §5.2, §7)"
```

---

### Task 2: Scaffold do workspace `apps/financas`

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `.gitignore`
- Create: `apps/financas/package.json`
- Create: `apps/financas/wrangler.jsonc`
- Create: `apps/financas/tsconfig.json`
- Create: `apps/financas/vitest.config.ts`
- Create: `apps/financas/web/.gitignore` (ignora `dist/` desde já — `web/dist` é **gerado**, nunca versionado)
- Create: `apps/financas/src/index.ts`
- Create (gerado por comando): `apps/financas/worker-configuration.d.ts`
- Test: `apps/financas/src/index.test.ts`

**Interfaces:**

- Consumes: nada de Task 1 (o Worker só passa a formatar dinheiro na Task 11).
- Produces:
  - Workspace `@piluvitu/financas` registrado no `pnpm-workspace.yaml`.
  - Binding D1 `DB` (`D1Database`) e binding `ASSETS` (`Fetcher`), tipados no `Env` global gerado por `wrangler types` — é esse `D1Database` global que todas as assinaturas `(db: D1Database, ...)` das Tasks 6–10 usam.
  - `apps/financas/src/index.ts` exportando `export default app` (Hono), com `GET /api/health` respondendo `{ ok: true, data: { status: 'ok' }, notifications: [] }`. As Tasks 4 e 6–10 montam as demais rotas neste mesmo app.
  - `pnpm --filter @piluvitu/financas test` rodando Vitest sobre Miniflare, **100% local, sem `wrangler login` e sem secret**.

---

#### Por que Vitest convive com o Jest do `apps/web` sem conflito

Este é o item que o §7 do spec chama de "o mais subestimado de toda a estimativa". Ele deixa de ser problema por quatro razões concretas, não por sorte:

1. **`pnpm -r test` não tem runner próprio.** Ele executa o script `test` de **cada workspace, com o cwd no diretório do workspace**. `apps/web` → `jest`; `packages/tools` → `jest`; `apps/financas` → `vitest run`. Não há binário compartilhado, config compartilhada nem processo compartilhado — são três invocações independentes.
2. **Nenhum runner enxerga o diretório do outro.** O `rootDir` do Jest é o diretório onde está o `jest.config.ts` (`apps/web`, `packages/tools`) e o `testMatch` deles é relativo a isso — Jest nunca desce em `apps/financas`. E o `vitest.config.ts` do financas fixa `test.include: ['src/**/*.test.ts']`, relativo a `apps/financas` — o Vitest nunca sobe para `apps/web`. Bônus: esse `include` também **exclui** `apps/financas/web/`, onde a Task 11 monta o Vitest da SPA com config própria.
3. **Os globais de tipo não colidem porque não estão hoisted.** `@types/jest` é devDep de `apps/web` e de `packages/tools`, e o pnpm o instala **isolado** dentro de cada um (`packages/tools/node_modules/@types/jest` é um symlink pro `.pnpm`); a raiz do monorepo **não tem `node_modules/@types`**. Ao resolver tipos a partir de `apps/financas`, o TypeScript sobe a árvore e não encontra `@types/jest` em lugar nenhum. Além disso o `tsconfig.json` do financas declara `"types": ["@cloudflare/vitest-pool-workers/types"]` explicitamente, o que fecha a porta de vez — e é obrigatório de qualquer forma, porque é ele que traz o módulo `cloudflare:test`.
4. **Os testes do Worker importam `describe`/`it`/`expect` do `vitest` explicitamente**, sem `globals: true`. Não existe global ambíguo em nenhum arquivo.

O único ajuste global de verdade é o `allowBuilds` (Step 1): `pnpm install` **sai com exit 1** (`ERR_PNPM_IGNORED_BUILDS`) quando um pacote novo tem script de instalação e não está declarado.

---

- [ ] **Step 1: Registrar o workspace e liberar o build no `pnpm-workspace.yaml`**

Substituir o conteúdo de `pnpm-workspace.yaml` por:

```yaml
packages:
  - 'apps/web'
  - 'apps/financas'
  - 'packages/tools'

# Only the packages listed below may run lifecycle scripts during installation.
# All other install scripts are blocked by default (pnpm 11 default).
allowBuilds:
  better-sqlite3: false
  core-js: false
  core-js-pure: true
  esbuild: true
  protobufjs: false
  sharp: true
  unrs-resolver: true
  # workerd (runtime do Miniflare, dep de @cloudflare/vitest-pool-workers) traz
  # um postinstall que só hardlinka o binário nativo por cima do shim JS e
  # valida a versão. Medido: com o script BLOQUEADO, `vitest run` sobe o
  # workerd normalmente — lib/main.js resolve o pacote de plataforma
  # (@cloudflare/workerd-darwin-arm64) em runtime. Fica declarado como `false`
  # porque, sem entrada nenhuma, o pnpm 11 aborta o install com
  # ERR_PNPM_IGNORED_BUILDS (exit 1), o que quebraria o CI.
  workerd: false

# Ignore package versions published less than 24h ago (1440 min).
# Defense against supply-chain attacks where malicious versions are published and quickly pulled.
minimumReleaseAge: 1440
```

- [ ] **Step 2: Ignorar o estado local do wrangler no `.gitignore`**

Acrescentar ao final de `/Users/piluvitu/WWW/PiluVitu-Dev/.gitignore`:

```gitignore
# wrangler/miniflare (estado local do D1, cache de build)
apps/financas/.wrangler/
```

- [ ] **Step 3: Criar `apps/financas/package.json`**

```json
{
  "name": "@piluvitu/financas",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "cf-typegen": "wrangler types"
  },
  "dependencies": {
    "hono": "^4.12.32"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.18.8",
    "typescript": "^5.9.3",
    "vitest": "^4.1.10",
    "wrangler": "^4.114.0"
  }
}
```

> `@cloudflare/vitest-pool-workers@0.18.8` tem `peerDependencies` **`vitest: ^4.1.0`** (e `@vitest/runner`/`@vitest/snapshot` na mesma faixa) — por isso `vitest ^4.1.10` e não a 3.x. Ele já traz `wrangler@4.114.0` e `miniflare@4.20260722.0` como dependências diretas; o `wrangler` em devDependencies existe para os comandos de CLI (`d1 create`, `types`, `dev`, `deploy`) e está pinado na mesma versão de propósito.

- [ ] **Step 4: Instalar e confirmar que o pnpm não aborta**

Run: `pnpm install`

Esperado: exit 0, terminando em `Done in ...`. **Não pode** aparecer `ERR_PNPM_IGNORED_BUILDS`. Se aparecer citando `workerd`, o Step 1 não foi aplicado.

- [ ] **Step 5: Criar o banco D1 de verdade**

Este é o **único** passo do plano inteiro que exige conta Cloudflare. Nenhum teste depende dele (o Vitest roda em Miniflare, contra um SQLite local efêmero).

Run (uma vez, abre o browser):

```bash
pnpm --filter @piluvitu/financas exec wrangler login
```

Run:

```bash
pnpm --filter @piluvitu/financas exec wrangler d1 create piluvitu-financas
```

Esperado: mensagem de sucesso seguida de um bloco pronto para colar, com o `database_id` (UUID) da base recém-criada. **Copie esse UUID** — ele entra literalmente no Step 6.

- [ ] **Step 6: Criar `apps/financas/wrangler.jsonc`**

Trocar `COLE-AQUI-O-DATABASE-ID-DO-STEP-5` pelo UUID impresso no Step 5.

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "piluvitu-financas",
  "main": "src/index.ts",
  "compatibility_date": "2026-07-01",
  "observability": { "enabled": true },

  // Static Assets é GRÁTIS, ilimitado e FORA da cota de 100.000 requests/dia.
  // 'run_worker_first' é o que garante, de forma documentada, que /api/* chega
  // no Worker em vez de ser engolido pelo fallback de SPA. Sem ele, a ordem de
  // avaliação entre asset e Worker fica implícita, e o erro só apareceria em
  // produção.
  "assets": {
    "directory": "./web/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"],
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "piluvitu-financas",
      "database_id": "COLE-AQUI-O-DATABASE-ID-DO-STEP-5",
      "migrations_dir": "migrations",
    },
  ],
}
```

- [ ] **Step 7: Garantir `./web/dist` por script, sem versionar nada**

O `assets.directory` precisa existir e ter um `index.html`, senão o Miniflare não sobe o binding `ASSETS`. Mas `web/dist` é **saída de build** e não pode entrar no git: se for commitado agora, o `.gitignore` da SPA não o destrava depois (git continua rastreando arquivo já versionado) e todo `vite build` deixa a árvore suja para sempre.

Solução: o diretório é **gerado on demand** por um `pretest`, e ignorado desde já.

Criar `apps/financas/web/.gitignore`:

```
dist/
node_modules/
```

Acrescentar aos `scripts` de `apps/financas/package.json` — o `pretest` roda automaticamente antes de `test`:

```json
    "pretest": "node -e \"const f=require('fs');f.mkdirSync('web/dist',{recursive:true});f.existsSync('web/dist/index.html')||f.writeFileSync('web/dist/index.html','<!doctype html><html lang=\\'pt-BR\\'><head><meta charset=\\'utf-8\\'><title>Financas</title></head><body><div id=\\'root\\'></div></body></html>')\""
```

> Na Task 11, este `pretest` é **substituído** por `pnpm --filter @piluvitu/financas-web build`, que passa a gerar o `dist` de verdade. Até lá, o placeholder mínimo abaixo é o que o Miniflare enxerga — e ele nunca é commitado.

Conteúdo que o script gera (equivalente, para referência):

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Finanças</title>
  </head>
  <body>
    <div id="root">placeholder — substituído pelo build da SPA (Task 11)</div>
  </body>
</html>
```

- [ ] **Step 8: Criar `apps/financas/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/vitest-pool-workers/types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "worker-configuration.d.ts", "vitest.config.ts"],
  "exclude": ["node_modules", "web"]
}
```

> `"types"` fechado numa lista explícita é o que impede o TypeScript de arrastar `@types/*` de outros workspaces (§ "Por que Vitest convive com o Jest" acima) e é também o que traz o módulo `cloudflare:test`. `"exclude": ["web"]` deixa a SPA (Task 11) com o tsconfig dela.

- [ ] **Step 9: Criar `apps/financas/vitest.config.ts`**

```ts
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: './src/index.ts',
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  test: {
    // Colocation: teste ao lado do fonte. O recorte em src/ deixa de fora
    // apps/financas/web/, que na Task 11 ganha config de Vitest própria.
    include: ['src/**/*.test.ts'],
  },
})
```

> **Atenção à API.** A partir da `0.18.0` (a linha compatível com Vitest 4) o pacote **não exporta mais `@cloudflare/vitest-pool-workers/config` nem `defineWorkersProject`/`defineWorkersConfig`**. A integração virou um **plugin do Vite**: `cloudflareTest(...)` importado da raiz do pacote, dentro de `plugins`, e **sem** `test.poolOptions`. Todo tutorial ou snippet anterior a essa versão vai falhar com "Cannot find module .../config". O próprio pacote ships um codemod (`@cloudflare/vitest-pool-workers/codemods/vitest-v3-to-v4`) que faz exatamente essa conversão.
>
> Não é preciso declarar `nodejs_compat` no `wrangler.jsonc`: o pool injeta `nodejs_compat_v2` e `unsafe_module` no worker de runner por conta própria.

- [ ] **Step 10: Gerar os tipos do Worker**

Run: `pnpm --filter @piluvitu/financas cf-typegen`

Esperado: `✨ Types written to worker-configuration.d.ts`. O arquivo gerado (~540 KB) contém o `Env` do projeto **e** os runtime types do workerd — é dele que vem o `D1Database` global usado nas assinaturas das Tasks 6–10:

```ts
interface __BaseEnv_Env {
  DB: D1Database
  ASSETS: Fetcher
}
declare namespace Cloudflare {
  interface Env extends __BaseEnv_Env {}
}
interface Env extends __BaseEnv_Env {}
```

O arquivo **é commitado** (é o que permite `tsc --noEmit` no CI sem regenerar). Rodar `cf-typegen` de novo sempre que o `wrangler.jsonc` mudar. O comando é 100% local — não usa a API da Cloudflare e funciona sem login.

- [ ] **Step 11: Criar o esqueleto `apps/financas/src/index.ts` (ainda sem rotas)**

O pool do Vitest carrega o `main` antes de rodar qualquer teste; sem este arquivo a falha seria `Cannot find module .../src/index.ts`, que não prova nada. Com o esqueleto, a falha do Step 13 é uma asserção de verdade.

```ts
import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

export default app
```

- [ ] **Step 12: Escrever o teste `apps/financas/src/index.test.ts`**

```ts
import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('worker financas', () => {
  it('expõe o binding D1 "DB" e ele responde a uma query', async () => {
    expect(env.DB).toBeDefined()
    const row = await env.DB.prepare('SELECT 1 AS um').first<{ um: number }>()
    expect(row?.um).toBe(1)
  })

  it('expõe o binding ASSETS apontando para ./web/dist', async () => {
    const res = await env.ASSETS.fetch(
      'https://financas.piluvitu.com.br/index.html',
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })

  it('GET /api/health devolve o envelope', async () => {
    const res = await SELF.fetch('https://financas.piluvitu.com.br/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: 'ok' },
      notifications: [],
    })
  })

  it('rota desconhecida sob /api devolve 404 (e não o index.html da SPA)', async () => {
    const res = await SELF.fetch(
      'https://financas.piluvitu.com.br/api/nao-existe',
    )
    expect(res.status).toBe(404)
  })
})
```

> **Gotcha medido, não suposto:** `SELF` é um _service binding_ para o `export default` do Worker e **não passa pelo roteador de assets**. Medido neste scaffold: `SELF.fetch('/index.html')` → **404**, enquanto `env.ASSETS.fetch('/index.html')` → **200 text/html**. Ou seja: `run_worker_first` e `not_found_handling` são comportamento de borda e **não são reproduzidos pelo Miniflare via `SELF`** — para verificá-los, `wrangler dev`. Por isso o teste do SPA usa o binding `ASSETS` (que prova o que dá para provar aqui: que `assets.directory` resolve para `./web/dist`), e não `SELF`.
>
> `env` e `SELF` de `cloudflare:test` estão marcados `@deprecated` na 0.18.x em favor de `import { env, exports } from 'cloudflare:workers'`. Continuam exportados e funcionais; migrar é trabalho de outro dia, não desta task.

- [ ] **Step 13: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas test`

Esperado: FAIL com

```
 × GET /api/health devolve o envelope
AssertionError: expected 404 to be 200 // Object.is equality
 Tests  1 failed | 3 passed (4)
```

(Os três que já passam provam que o pool subiu, que o D1 local existe e que o `ASSETS` achou `./web/dist`. O que falta é só a rota.)

- [ ] **Step 14: Implementar a rota em `apps/financas/src/index.ts`**

```ts
import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

// Envelope no mesmo shape de apps/api/internal/httpx/respond.go:
// { ok, data, notifications } — notifications NUNCA null, [] quando vazio.
// A Task 4 substitui este c.json manual pelo helper okJson() de lib/envelope.ts.
app.get('/api/health', (c) =>
  c.json({ ok: true, data: { status: 'ok' }, notifications: [] }),
)

export default app
```

- [ ] **Step 15: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas test`

Esperado: PASS com

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

- [ ] **Step 16: Type check do workspace**

Run: `pnpm --filter @piluvitu/financas typecheck`

Esperado: sem saída (exit 0).

- [ ] **Step 17: Confirmar que Jest e Vitest coexistem de fato**

Run: `pnpm -r test`

Esperado: os três workspaces passam na mesma execução, cada um com o runner dele — `apps/web` e `packages/tools` reportando no formato do Jest (`Test Suites: N passed`) e `apps/financas` no formato do Vitest (`Test Files 1 passed (1)` / `Tests 4 passed (4)`). Nenhum aviso de teste duplicado, nenhum global de Jest vazando para o Worker.

- [ ] **Step 18: Formatar e commitar**

Run:

```bash
pnpm exec prettier --write apps/financas/src/index.ts apps/financas/src/index.test.ts apps/financas/vitest.config.ts apps/financas/package.json apps/financas/tsconfig.json apps/financas/wrangler.jsonc pnpm-workspace.yaml
```

Run:

```bash
git add apps/financas pnpm-workspace.yaml .gitignore
git commit -m "feat(financas): scaffold do Worker — Hono + D1 + Vitest em Miniflare

Abre a frente apps/financas (fatia ① de Finanças PJ). apps/web e apps/api não
são tocados.

- Worker Cloudflare com Hono; GET /api/health responde o envelope
  { ok, data, notifications }, mesmo shape de apps/api/internal/httpx.
- Static Assets serve a SPA de ./web/dist (grátis e fora da cota de 100k
  req/dia). run_worker_first: ['/api/*'] garante, de forma documentada, que a
  API chega no Worker em vez de ser engolida pelo fallback de SPA.
  ./web/dist é GERADO por um pretest e nunca versionado; a Task 11 troca
  esse pretest pelo build real do Vite.
- D1 'piluvitu-financas' criado de verdade e ligado no binding DB.
- Vitest com @cloudflare/vitest-pool-workers: roda 100% local em Miniflare,
  sem wrangler login e sem secret. A 0.18.x (linha do Vitest 4) removeu o
  subpath /config e o defineWorkersProject — a integração agora é o plugin
  Vite cloudflareTest(), sem test.poolOptions.
- worker-configuration.d.ts gerado por 'wrangler types' e commitado: é dele
  que sai o Env (DB, ASSETS) e o D1Database global das camadas de domínio.
- pnpm-workspace.yaml: workspace registrado e workerd declarado em allowBuilds
  como false. Medido: com o postinstall bloqueado o workerd sobe igual, porque
  lib/main.js resolve o pacote de plataforma em runtime — mas sem entrada
  nenhuma o pnpm 11 aborta o install com ERR_PNPM_IGNORED_BUILDS (exit 1).

Medido neste scaffold: SELF é service binding para o export default e NÃO
passa pelo roteador de assets — SELF.fetch('/index.html') dá 404 enquanto
env.ASSETS.fetch('/index.html') dá 200. run_worker_first e not_found_handling
são comportamento de borda e só se verificam com wrangler dev.

Ref: docs/superpowers/specs/2026-07-25-financas-pj-design.md (§3, §4, §7)"
```

### Task 3: Migration 0001 e testes de invariante do schema

**Files:**

- Create: `apps/financas/migrations/0001_financas_init.sql`
- Create: `apps/financas/src/schema.test.ts`
- Create: `apps/financas/src/test-setup.ts`
- Create: `apps/financas/src/test-env.d.ts`
- Modify: `apps/financas/vitest.config.ts`
- Modify: `apps/financas/wrangler.jsonc`
- Modify: `apps/financas/package.json`
- Modify: `apps/financas/CLAUDE.md`

**Interfaces:**

- Consumes (da Task 2): workspace `apps/financas` já existe e já está listado em `pnpm-workspace.yaml`; `package.json` com `"name": "@piluvitu/financas"` e script `"test": "vitest run"`; `wrangler.jsonc` com um binding D1 `"binding": "DB"` / `"database_name": "piluvitu-financas"`; `vitest.config.ts` usando o plugin `cloudflareTest` de `@cloudflare/vitest-pool-workers`; devDependency `@cloudflare/vitest-pool-workers` + `vitest` + `wrangler` instaladas.
- Produces (para as Tasks 4–11): o schema físico. Todas as tabelas, índices, triggers e views abaixo passam a existir em qualquer teste que rode sob `@cloudflare/vitest-pool-workers` neste workspace, porque `src/test-setup.ts` roda `reset()` + `applyD1Migrations` num `beforeEach` global. Nomes que as tasks seguintes consomem: tabelas `accounts`, `categories`, `payees`, `transactions`, `installment_plans`, `installments`, `debts`, `debt_items`, `debt_payments`, `debt_payment_allocations`; views `v_debt_item_balance` (colunas `item_id, debt_id, description, amount_cents, allocated_cents, remaining_cents, is_settled`) e `v_cashflow` (colunas de `transactions` + `competence_month`); triggers `trg_alloc_item_teto` e `trg_alloc_pagamento_teto`, que abortam com as mensagens literais `alocacao excede o valor do item` e `alocacao excede o valor do pagamento` (é essa string que a Task 9 traduz em `OverAllocationError`); categorias semeadas com os slugs `das`, `contador`, `inss`, `pro-labore`, `transferencia`, `quitacao-divida`, `custos-pj`.

---

- [ ] **Step 1: Preparar o terreno — pasta de migrations e setup de teste**

```bash
mkdir -p /Users/piluvitu/WWW/PiluVitu-Dev/apps/financas/migrations
```

Criar `apps/financas/src/test-setup.ts`:

```ts
import { applyD1Migrations, env, reset } from 'cloudflare:test'
import { beforeEach } from 'vitest'

// A 0.18.x REMOVEU a opcao `isolatedStorage` do pool — `WorkersPoolOptions`
// tem exatamente cinco campos (main, remoteBindings, additionalExports,
// miniflare, wrangler) e nenhum deles isola storage. O isolamento passou a
// ser EXPLICITO, via reset() do modulo cloudflare:test.
//
// reset() apaga os dados de TODOS os bindings — inclusive a tabela de
// controle das migrations. Por isso a ordem e reset -> reaplicar migrations,
// nunca o contrario: inverter deixa o banco vazio e sem schema.
//
// beforeEach (nao beforeAll) porque sem storage isolado o estado vaza de um
// teste para o seguinte, e teste de dinheiro que depende de ordem de execucao
// e teste que mente.
beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
```

Criar `apps/financas/src/test-env.d.ts`:

```ts
declare module 'cloudflare:test' {
  // Tipa `import('cloudflare:test').env`. TEST_MIGRATIONS é injetado pelo
  // vitest.config.ts a partir de readD1Migrations('./migrations').
  interface ProvidedEnv {
    DB: D1Database
    TEST_MIGRATIONS: D1Migration[]
  }
}
```

Confirme que o `tsconfig.json` do workspace tem `"types": ["@cloudflare/vitest-pool-workers/types"]` em `compilerOptions` — sem isso o módulo `cloudflare:test` não resolve e o `tsc` acusa erro.

- [ ] **Step 2: Apontar o Vitest para as migrations e registrar os comandos**

Substituir o conteúdo de `apps/financas/vitest.config.ts` por:

```ts
import { fileURLToPath } from 'node:url'
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // cloudflareTest aceita uma funcao async — e assim que readD1Migrations,
    // que e assincrono, entra na config sem top-level await.
    cloudflareTest(async () => ({
      main: './src/index.ts',
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          // Le migrations/*.sql em ordem e ja quebra cada arquivo em statements.
          // fileURLToPath em vez de __dirname porque o workspace e ESM.
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('./migrations', import.meta.url)),
          ),
        },
      },
    })),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

Em `apps/financas/wrangler.jsonc`, garantir que a entrada D1 declara o diretório de migrations (se a chave já existir, siga em frente):

```jsonc
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "piluvitu-financas",
      "database_id": "<id do banco criado na Task 2>",
      "migrations_dir": "migrations"
    }
  ]
```

Em `apps/financas/package.json`, acrescentar aos `scripts`:

```json
    "db:migrate:local": "wrangler d1 migrations apply piluvitu-financas --local",
    "db:migrate:remote": "wrangler d1 migrations apply piluvitu-financas --remote",
    "db:migrate:list": "wrangler d1 migrations list piluvitu-financas --local"
```

- [ ] **Step 3: Escrever o bloco 1 de `schema.test.ts` — tabelas, STRICT, FK e CHECKs**

Criar `apps/financas/src/schema.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const DB = env.DB
const NOW = '2026-07-25T12:00:00Z'

// --------------------------------------------------------------------------
// Helpers de fixture. Cada teste usa ids proprios: o reset() do beforeEach
// global (src/test-setup.ts) ja limpa tudo entre testes, mas ids distintos
// deixam a falha legivel quando alguma coisa vaza mesmo assim.
// --------------------------------------------------------------------------

async function novaConta(
  id: string,
  kind = 'checking',
  closing: number | null = null,
  due: number | null = null,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO accounts
       (id, name, scope, kind, currency, closing_day, due_day,
        opening_balance_cents, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'BRL', ?, ?, 0, ?, ?)`,
  )
    .bind(id, `Conta ${id}`, kind, closing, due, NOW, NOW)
    .run()
}

async function novoPayee(id: string): Promise<void> {
  await DB.prepare(
    `INSERT INTO payees (id, name, norm_name, kind, created_at)
     VALUES (?, ?, ?, 'person', ?)`,
  )
    .bind(id, `Payee ${id}`, `PAYEE ${id}`, NOW)
    .run()
}

async function novaDivida(id: string, payeeId: string): Promise<void> {
  await DB.prepare(
    `INSERT INTO debts
       (id, payee_id, direction, title, currency, opened_at, status,
        created_at, updated_at)
     VALUES (?, ?, 'i_owe', ?, 'BRL', '2026-03-05', 'open', ?, ?)`,
  )
    .bind(id, payeeId, `Divida ${id}`, NOW, NOW)
    .run()
}

async function novoItem(
  id: string,
  debtId: string,
  cents: number,
  descricao = `Item ${id}`,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO debt_items
       (id, debt_id, description, amount_cents, incurred_on, created_at)
     VALUES (?, ?, ?, ?, '2026-03-05', ?)`,
  )
    .bind(id, debtId, descricao, cents, NOW)
    .run()
}

// kind='offset' (encontro de contas) não toca no caixa, então não exige
// transaction_id — é o pagamento mais barato de montar num teste de schema.
async function novoPagamento(
  id: string,
  debtId: string,
  cents: number,
): Promise<void> {
  await DB.prepare(
    `INSERT INTO debt_payments
       (id, debt_id, paid_on, amount_cents, kind, transaction_id, created_at)
     VALUES (?, ?, '2026-05-10', ?, 'offset', NULL, ?)`,
  )
    .bind(id, debtId, cents, NOW)
    .run()
}

function stmtAlloc(
  id: string,
  paymentId: string,
  itemId: string,
  cents: number,
): D1PreparedStatement {
  return DB.prepare(
    `INSERT INTO debt_payment_allocations
       (id, payment_id, item_id, amount_cents, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).bind(id, paymentId, itemId, cents, NOW)
}

function stmtTx(
  id: string,
  accountId: string,
  cents: number,
  purchase: string,
  settled: string | null,
  transferId: string | null,
  parentId: string | null,
): D1PreparedStatement {
  return DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, settled_at,
        description, is_business, transfer_id, parent_id, created_at, updated_at)
     VALUES (?, ?, ?, 'BRL', ?, ?, ?, 0, ?, ?, ?, ?)`,
  ).bind(
    id,
    accountId,
    cents,
    purchase,
    settled,
    `Lancamento ${id}`,
    transferId,
    parentId,
    NOW,
    NOW,
  )
}

// --------------------------------------------------------------------------

describe('migration 0001 — tabelas', () => {
  it('cria exatamente as 10 tabelas do modelo', async () => {
    const { results } = await DB.prepare(
      `SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name NOT LIKE '_cf_%'
          AND name <> 'd1_migrations'
        ORDER BY name`,
    ).all<{ name: string }>()

    expect(results.map((r) => r.name)).toEqual([
      'accounts',
      'categories',
      'debt_items',
      'debt_payment_allocations',
      'debt_payments',
      'debts',
      'installment_plans',
      'installments',
      'payees',
      'transactions',
    ])
  })
})

describe('migration 0001 — STRICT e foreign keys', () => {
  it('STRICT recusa texto em coluna INTEGER', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO accounts
           (id, name, scope, kind, currency, opening_balance_cents,
            created_at, updated_at)
         VALUES (?, ?, 'PF', 'checking', 'BRL', ?, ?, ?)`,
      )
        .bind('c-strict', 'Conta STRICT', 'nao-e-numero', NOW, NOW)
        .run(),
    ).rejects.toThrow(/cannot store TEXT value in INTEGER column/)
  })

  it('foreign_keys está ativo: lançamento órfão falha', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date,
            description, is_business, created_at, updated_at)
         VALUES (?, ?, -1000, 'BRL', '2026-07-10', 'Órfão', 0, ?, ?)`,
      )
        .bind('t-orfa', 'conta-que-nao-existe', NOW, NOW)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})

describe('migration 0001 — CHECKs de entrada', () => {
  it('cartão de crédito sem closing_day/due_day é barrado na entrada', async () => {
    await expect(
      DB.prepare(
        `INSERT INTO accounts
           (id, name, scope, kind, currency, closing_day, due_day,
            opening_balance_cents, created_at, updated_at)
         VALUES ('c9-ruim', 'Cartão sem fechamento', 'PF', 'credit_card',
                 'BRL', NULL, NULL, 0, ?, ?)`,
      )
        .bind(NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)

    // controle positivo: com fechamento e vencimento, entra.
    await novaConta('c9-bom', 'credit_card', 25, 5)
    const row = await DB.prepare(
      `SELECT closing_day, due_day FROM accounts WHERE id = 'c9-bom'`,
    ).first<{ closing_day: number; due_day: number }>()
    expect(row).toEqual({ closing_day: 25, due_day: 5 })
  })

  it('moeda != BRL exige amount_original_cents e fx_rate_ppm', async () => {
    await novaConta('c10')

    await expect(
      DB.prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date,
            description, is_business, created_at, updated_at)
         VALUES ('t10-ruim', ?, -5432, 'USD', '2026-07-10', 'Steam', 0, ?, ?)`,
      )
        .bind('c10', NOW, NOW)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/)

    // controle positivo: US$ 10,00 a 5,4321 => R$ 54,32.
    await DB.prepare(
      `INSERT INTO transactions
         (id, account_id, amount_cents, currency, amount_original_cents,
          fx_rate_ppm, purchase_date, description, is_business,
          created_at, updated_at)
       VALUES ('t10-bom', ?, -5432, 'USD', 1000, 5432100, '2026-07-10',
               'Steam', 0, ?, ?)`,
    )
      .bind('c10', NOW, NOW)
      .run()

    const row = await DB.prepare(
      `SELECT fx_rate_ppm FROM transactions WHERE id = 't10-bom'`,
    ).first<{ fx_rate_ppm: number }>()
    expect(row?.fx_rate_ppm).toBe(5432100)
  })
})
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: FAIL — 5 testes falhando. O primeiro com `AssertionError: expected [] to deeply equal [ 'accounts', 'categories', … ]`, os demais com `D1_ERROR: no such table: accounts` / `no such table: transactions`.

- [ ] **Step 5: Escrever o 0001 — as 10 tabelas STRICT e os índices**

Criar `apps/financas/migrations/0001_financas_init.sql`:

```sql
-- =====================================================================
-- migrations/0001_financas_init.sql   —  alvo: Cloudflare D1 (SQLite)
--
-- REGRAS DE COMPATIBILIDADE D1 — TODAS MEDIDAS EM 2026-07-25:
--  * Sem PRAGMA de conexao (journal_mode/busy_timeout nao existem no D1;
--    a allowlist do D1 tem 17 PRAGMAs e os de conexao nao estao nela).
--  * Sem BEGIN/COMMIT/SAVEPOINT: o D1 REJEITA. Atomicidade e via batch(),
--    que MEDIDO faz rollback real da sequencia inteira.
--  * TRIGGER FUNCIONA e dispara — ao contrario do que se assumia com base
--    em workers-sdk#4998. Por isso os invariantes de soma vivem no BANCO,
--    via RAISE(ABORT), e nao na aplicacao.
--  * FOREIGN KEY e aplicada de verdade: PRAGMA foreign_keys = 1 por padrao e
--    INSERT orfao falha. Todo REFERENCES abaixo tem efeito real.
--  * STRICT funciona e o tipo e aplicado => todas as tabelas sao STRICT.
--  * sqlite_version() e BLOQUEADA pelo D1 ("not authorized to use function").
--    A versao exata segue desconhecida; STRICT funcionar prova >= 3.37.
--  * Migrations sao forward-only: nao existe down migration.
--
-- CONVENCOES:
--  * PK TEXT (UUIDv4 gerado no cliente).
--  * Dinheiro e INTEGER em centavos, nunca REAL.
--    2^53-1 centavos = R$ 90.071.992.547.409,91.
--  * Datas: TEXT ISO-8601 'YYYY-MM-DD' (ordenacao lexicografica ==
--    cronologica). Competencia: TEXT 'YYYY-MM'. Timestamps: UTC 'Z'.
--  * STRICT em todas as tabelas: num livro-caixa, matar a afinidade de tipo
--    do SQLite vale o custo. Consequencia: so INT/INTEGER/REAL/TEXT/BLOB/ANY
--    sao tipos validos, e toda coluna precisa de tipo declarado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- accounts — "varias contas e varios cartoes" e a dor declarada no 1.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,

  -- Etiqueta PJ/PF. Fica na conta como DEFAULT do lancamento, nao como
  -- verdade final (ver transactions.is_business).
  scope                 TEXT NOT NULL CHECK (scope IN ('PJ','PF')),

  -- O subtipo decide a SEMANTICA: so credit_card tem fatura, portanto so
  -- credit_card preenche transactions.bill_competence.
  kind                  TEXT NOT NULL
                        CHECK (kind IN ('checking','savings','credit_card',
                                        'cash','investment','benefit')),

  institution           TEXT,   -- 'Nubank','Inter','BB' — chave de matching no import (fatia 2)
  currency              TEXT NOT NULL DEFAULT 'BRL',

  -- Fechamento/vencimento moram AQUI, nao em codigo: e o que permite
  -- derivar bill_competence de purchase_date sem regra hardcoded.
  -- Compra 28/07 num cartao que fecha dia 25 => competencia '2026-08'.
  closing_day           INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  due_day               INTEGER CHECK (due_day     BETWEEN 1 AND 31),
  credit_limit_cents    INTEGER,

  -- Saldo de abertura: extrato = opening_balance + SUM(transactions).
  -- Evita importar o historico inteiro do banco so para o saldo bater —
  -- o que, alem de trabalhoso, estouraria os 100k rows written/dia.
  opening_balance_cents INTEGER NOT NULL DEFAULT 0,
  opening_date          TEXT,

  archived_at           TEXT,   -- soft delete: conta encerrada nao apaga historico
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,

  -- Cartao sem dia de fechamento nao calcula fatura nenhuma: barra na
  -- entrada em vez de gerar competencia errada depois.
  CHECK (kind <> 'credit_card' OR (closing_day IS NOT NULL AND due_day IS NOT NULL))
) STRICT;

-- Indice PARCIAL: 90% das telas listam so contas ativas. No D1, indice
-- parcial nao e so economia de espaco — e economia de cota de escrita,
-- porque so custa "row written" quando a linha CASA com o WHERE.
CREATE INDEX IF NOT EXISTS idx_accounts_scope
  ON accounts(scope, kind) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            TEXT PRIMARY KEY,
  parent_id     TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  name          TEXT NOT NULL,

  -- 'transfer' e 'debt_settlement' NAO sao receita nem despesa. Sao as
  -- duas classes que TODO relatorio de resultado exclui. Pilar no 2 do
  -- anti-dupla-contagem (o no 1 e transactions.transfer_id).
  kind          TEXT NOT NULL
                CHECK (kind IN ('income','expense','transfer','debt_settlement')),

  -- slug estavel para MEDIR o gap declarado de ~R$ 1.000/mes (DAS +
  -- contador + INSS) sem depender do texto digitado.
  -- Semear: 'das', 'contador', 'inss', 'pro-labore'.
  slug          TEXT,

  default_scope TEXT CHECK (default_scope IN ('PJ','PF')),
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)   -- hierarquia de 2 niveis; ciclo raso barrado
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_slug
  ON categories(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent
  ON categories(parent_id) WHERE parent_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- payees — credores, devedores, estabelecimentos e a PROPRIA PJ.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payees (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,

  -- Nome normalizado (upper, sem acento, sem sufixo de maquininha/cidade).
  -- Criado na fatia 1 mesmo sem import: indice do D1 nao e alteravel.
  norm_name           TEXT NOT NULL,

  -- 'self_entity' = a PROPRIA PJ do dono. Permite modelar divida com a
  -- propria empresa sem gambiarra: a PJ e um credor como outro qualquer,
  -- e o pagamento a ela e transferencia interna.
  kind                TEXT NOT NULL
                      CHECK (kind IN ('person','merchant','government','self_entity')),

  document            TEXT,   -- CPF/CNPJ sem mascara
  default_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_payees_norm ON payees(norm_name);

-- ---------------------------------------------------------------------
-- transactions — o livro-caixa UNICO. Dois filtros (is_business, scope),
-- uma tabela. Tudo que e dinheiro passa por aqui e so por aqui.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,

  -- VALOR COM SINAL: negativo = saida, positivo = entrada.
  -- Alternativa descartada: coluna `direction` + valor absoluto. Com sinal,
  -- saldo e fluxo de caixa sao um SUM() coberto por indice; com direction,
  -- toda agregacao vira CASE WHEN e o indice deixa de ajudar — e no D1
  -- "rows read" conta linhas ESCANEADAS, entao perder indice custa COTA.
  amount_cents          INTEGER NOT NULL CHECK (amount_cents <> 0),

  currency              TEXT NOT NULL DEFAULT 'BRL',
  -- Compra em USD (Steam, AWS, Copilot): guarda o original e a taxa para o
  -- extrato reconciliar com a fatura em real. fx_rate em PARTES POR MILHAO
  -- (taxa x 1e6, INTEGER): e o unico lugar onde um REAL entraria, e REAL no
  -- SQLite e float64 — 5,4321 nunca volta exatamente 5,4321.
  amount_original_cents INTEGER,
  fx_rate_ppm           INTEGER CHECK (fx_rate_ppm IS NULL OR fx_rate_ppm > 0),
  CHECK (currency = 'BRL'
         OR (amount_original_cents IS NOT NULL AND fx_rate_ppm IS NOT NULL)),

  -- TRES DATAS, TRES PERGUNTAS DIFERENTES. Coracao do schema:
  --  purchase_date   : quando o FATO aconteceu (competencia do gasto).
  purchase_date         TEXT NOT NULL,
  --  bill_competence : em qual FATURA caiu ('YYYY-MM'). Sem esta coluna,
  --                    "quanto vem na fatura de agosto" obrigaria a
  --                    reimplementar a regra de fechamento em toda query
  --                    (e a regra muda por cartao). NULL fora de cartao.
  bill_competence       TEXT,
  --  settled_at      : quando o DINHEIRO se moveu. NULL = previsto (parcela
  --                    futura, fatura em aberto). Permite responder regime
  --                    de caixa E projecao a partir de UMA tabela so.
  settled_at            TEXT,

  description           TEXT NOT NULL,
  payee_id              TEXT REFERENCES payees(id)     ON DELETE SET NULL,
  category_id           TEXT REFERENCES categories(id) ON DELETE SET NULL,

  -- Etiqueta PJ/PF NO LANCAMENTO, nao so na conta. A conta da o default;
  -- aqui e sobrescrivivel porque na pratica gasto de PJ cai em cartao PF —
  -- e e justamente esse caso que distorce a medicao do custo real da PJ.
  is_business           INTEGER NOT NULL DEFAULT 0 CHECK (is_business IN (0,1)),

  -- TRANSFERENCIA ENTRE CONTAS PROPRIAS: DUAS linhas (saida em A, entrada
  -- em B) com o MESMO transfer_id. Mecanismo anti-dupla-contagem no 1.
  -- Alternativa descartada: uma linha com account_from/account_to — quebra
  -- o SUM() por conta e obriga UNION em toda query de extrato.
  transfer_id           TEXT,

  -- RATEIO / ESTORNO: compra de mercado dividida em 'mercado' e 'pet' vira
  -- 1 linha pai (valor cheio, category_id NULL) + N filhas. Extrato usa os
  -- pais; relatorio por categoria usa as folhas. CASCADE porque apagar o
  -- pai sem as filhas deixaria o caixa inconsistente.
  parent_id             TEXT REFERENCES transactions(id) ON DELETE CASCADE,
  CHECK (parent_id IS NULL OR parent_id <> id),

  -- IDEMPOTENCIA DE IMPORT: FITID do OFX, ou hash estavel da linha do CSV.
  -- Coluna + indice unico parcial criados JA na fatia 1 porque indice no D1
  -- nao pode ser alterado depois — so dropado (irreversivel) e recriado.
  imported_id           TEXT,
  import_source         TEXT CHECK (import_source IS NULL OR
                          import_source IN ('manual','ofx','csv','pdf','pluggy','share-target')),

  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
) STRICT;

-- INDICES — desenhados contra a COTA, nao so contra latencia. Cada indice
-- APLICAVEL soma 1 "row written". Um lancamento comum (sem transfer, sem
-- import, sem fatura) casa com 3 dos 7 => 4 rows written, nao 8. Por isso
-- quase todos sao parciais.
CREATE INDEX IF NOT EXISTS idx_tx_account_date
  ON transactions(account_id, purchase_date);                 -- extrato por conta
CREATE INDEX IF NOT EXISTS idx_tx_settled
  ON transactions(settled_at) WHERE settled_at IS NOT NULL;   -- fluxo realizado
CREATE INDEX IF NOT EXISTS idx_tx_bill
  ON transactions(account_id, bill_competence)
  WHERE bill_competence IS NOT NULL;                          -- "o que vem na fatura de X"
CREATE INDEX IF NOT EXISTS idx_tx_category
  ON transactions(category_id, purchase_date)
  WHERE category_id IS NOT NULL;
-- Igualdade ANTES do range: is_business e igualdade, purchase_date e range.
CREATE INDEX IF NOT EXISTS idx_tx_business
  ON transactions(is_business, purchase_date);
CREATE INDEX IF NOT EXISTS idx_tx_transfer
  ON transactions(transfer_id) WHERE transfer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_parent
  ON transactions(parent_id)   WHERE parent_id   IS NOT NULL;
-- Dedupe do import. Unico POR CONTA porque FITID so e unico dentro da
-- instituicao; global daria colisao entre bancos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_imported
  ON transactions(account_id, imported_id) WHERE imported_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- installment_plans / installments — parcelamento.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS installment_plans (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  payee_id           TEXT REFERENCES payees(id)     ON DELETE SET NULL,
  category_id        TEXT REFERENCES categories(id) ON DELETE SET NULL,
  description        TEXT NOT NULL,

  -- total_cents e a soma EXATA das parcelas, nao o preco de tabela.
  -- Arredondamento: R$ 100,00 em 3x = 3334 + 3333 + 3333. O resto de
  -- (total_cents % n) vai nas PRIMEIRAS parcelas, que e o que os emissores
  -- brasileiros fazem. Invariante SUM(parcelas) = total_cents validado no batch.
  total_cents        INTEGER NOT NULL CHECK (total_cents > 0),
  installments_count INTEGER NOT NULL CHECK (installments_count BETWEEN 1 AND 360),

  purchase_date      TEXT NOT NULL,
  first_competence   TEXT NOT NULL,   -- 'YYYY-MM' da 1a fatura
  is_business        INTEGER NOT NULL DEFAULT 0 CHECK (is_business IN (0,1)),
  canceled_at        TEXT,            -- antecipacao/quitacao encerra o plano sem apagar historico
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS installments (
  id             TEXT PRIMARY KEY,
  plan_id        TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL CHECK (seq >= 1),
  due_date       TEXT NOT NULL,

  -- DECISAO CENTRAL: cada parcela materializa UMA transaction, criada JA NO
  -- ATO da compra, com settled_at NULL e bill_competence preenchida.
  --  * O dinheiro tem UMA fonte da verdade (transactions); installments
  --    guarda apenas metadado de cronograma (seq, vencimento).
  --  * "Quanto ja esta comprometido nos proximos 6 meses" vira UMA query
  --    indexada em transactions, sem tabela de projecao.
  --  * Quando a fatura e paga, o import so preenche settled_at — nao cria
  --    linha nova, entao previsto e realizado nunca se somam.
  -- Alternativa descartada: materializar so quando a parcela cai na fatura
  -- — some a visibilidade do comprometimento futuro, que e exatamente o
  -- que doi com varios cartoes.
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,

  created_at     TEXT NOT NULL,
  UNIQUE (plan_id, seq)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_installments_tx ON installments(transaction_id);

-- ORCAMENTO DE BATCH — REVISADO APOS MEDICAO.
-- Plano de 60 parcelas:
--    1  INSERT installment_plans
--   12  INSERT transactions  multi-row (19 colunas => 5 linhas/statement)
--    3  INSERT installments  multi-row ( 5 colunas => 20 linhas/statement)
--  = 16 statements.
--
-- A versao anterior deste spec dizia que 1 statement por parcela (121 no
-- total) FALHARIA por causa do limite de 50 queries/invocacao. MEDIDO: nao
-- falha — batch de 200 statements passou (210 ms), e 200 queries sequenciais
-- tambem (26,7 s). O multi-row continua sendo o desenho certo, mas por
-- LATENCIA, nao por correcao: 60 parcelas em 3 statements levam 151 ms
-- contra ~8.000 ms sequencial (53x). O limite de 100 bound params por
-- statement esse sim e real e continua governando as 7/20 linhas por INSERT.

-- ---------------------------------------------------------------------
-- debts / debt_items / debt_payments / debt_payment_allocations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debts (
  id            TEXT PRIMARY KEY,

  -- Credor/devedor e um payee. Pessoa fisica E entidade propria caem no
  -- mesmo modelo (payees.kind = 'person' | 'self_entity').
  payee_id      TEXT NOT NULL REFERENCES payees(id) ON DELETE RESTRICT,

  -- Direcao decide a semantica de caixa:
  --  'i_owe'      : eu devo. A COMPRA original geralmente NAO esta no meu
  --                 caixa (outra pessoa pagou) => debt_items.transaction_id NULL.
  --  'owed_to_me' : me devem. A compra ESTA no meu caixa (paguei no meu
  --                 cartao) => debt_items.transaction_id aponta pra ela.
  direction     TEXT NOT NULL CHECK (direction IN ('i_owe','owed_to_me')),

  title         TEXT NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'BRL',
  opened_at     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','settled','written_off')),
  settled_at    TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (status <> 'settled' OR settled_at IS NOT NULL)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debts_open
  ON debts(payee_id, direction) WHERE status = 'open';

-- O item responde "o Steam Deck ja esta quitado?".
CREATE TABLE IF NOT EXISTS debt_items (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  description    TEXT NOT NULL,                              -- 'Steam Deck OLED 1TB'
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),  -- SEMPRE positivo: e ESTOQUE, nao fluxo
  incurred_on    TEXT NOT NULL,

  -- Link OPCIONAL para a compra original no livro-caixa. NUNCA usado para
  -- gerar lancamento: debt_items e dimensao PATRIMONIAL. Quem toca no caixa
  -- e debt_payments. Essa separacao e o que torna a dupla contagem
  -- estruturalmente impossivel.
  -- ON DELETE SET NULL: apagar o lancamento nao pode apagar a divida.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,

  category_id    TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debt_items_debt ON debt_items(debt_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_items_tx
  ON debt_items(transaction_id) WHERE transaction_id IS NOT NULL;  -- 1 compra = 1 item

CREATE TABLE IF NOT EXISTS debt_payments (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  paid_on        TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),

  -- 'cash'     : houve movimento de dinheiro => transaction_id OBRIGATORIO.
  -- 'offset'   : encontro de contas (ele me devia, abateu) => sem caixa.
  -- 'forgiven' : perdao/baixa => sem caixa.
  kind           TEXT NOT NULL DEFAULT 'cash'
                 CHECK (kind IN ('cash','offset','forgiven')),

  -- O ELO com o livro-caixa. 1:1 forcado pelo indice unico abaixo — impede
  -- que um mesmo lancamento seja reaproveitado por dois pagamentos.
  transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
  CHECK (kind <> 'cash' OR transaction_id IS NOT NULL),
  CHECK (kind =  'cash' OR transaction_id IS NULL),

  notes          TEXT,
  created_at     TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id, paid_on);
CREATE UNIQUE INDEX IF NOT EXISTS uq_debt_payments_tx
  ON debt_payments(transaction_id) WHERE transaction_id IS NOT NULL;

-- ALOCACAO pagamento -> item. Tabela propria (N:N) e nao coluna item_id em
-- debt_payments, porque um pagamento de R$ 500 pode cobrir R$ 300 do Steam
-- Deck e R$ 200 do jantar. E essa granularidade que responde "o Steam Deck
-- ja esta quitado?" quando os pagamentos foram genericos.
CREATE TABLE IF NOT EXISTS debt_payment_allocations (
  id           TEXT PRIMARY KEY,
  payment_id   TEXT NOT NULL REFERENCES debt_payments(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES debt_items(id)    ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at   TEXT NOT NULL,

  -- Impede alocar o MESMO pagamento duas vezes ao MESMO item.
  UNIQUE (payment_id, item_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_alloc_item ON debt_payment_allocations(item_id);
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: PASS — 5 testes verdes (`Tests 5 passed`).

- [ ] **Step 7: Commit**

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git add apps/financas && git commit -m "feat(financas): migration 0001 com as 10 tabelas STRICT e os indices"
```

- [ ] **Step 8: Escrever o bloco 2 de `schema.test.ts` — triggers de teto e rollback do batch**

Acrescentar ao final de `apps/financas/src/schema.test.ts`:

```ts
describe('migration 0001 — triggers de teto de alocação', () => {
  it('trg_alloc_item_teto aborta quando a soma passa do valor do item', async () => {
    await novoPayee('p4')
    await novaDivida('d4', 'p4')
    await novoItem('i4', 'd4', 100000) // item de R$ 1.000
    await novoPagamento('pg4a', 'd4', 500000)
    await novoPagamento('pg4b', 'd4', 500000)

    await stmtAlloc('a4-1', 'pg4a', 'i4', 30000).run() // R$ 300, ok

    // R$ 900 sobre um item que já tem R$ 300 => 1.200 > 1.000 => aborta.
    // Os pagamentos são folgados de propósito: quem tem de disparar é o
    // teto do ITEM, não o do pagamento.
    await expect(stmtAlloc('a4-2', 'pg4b', 'i4', 90000).run()).rejects.toThrow(
      /alocacao excede o valor do item/,
    )
  })

  it('trg_alloc_pagamento_teto aborta quando a soma passa do valor do pagamento', async () => {
    await novoPayee('p5')
    await novaDivida('d5', 'p5')
    await novoItem('i5a', 'd5', 1000000) // teto do item bem longe
    await novoItem('i5b', 'd5', 1000000)
    await novoPagamento('pg5', 'd5', 50000) // pagamento de R$ 500

    await stmtAlloc('a5-1', 'pg5', 'i5a', 30000).run() // R$ 300, ok

    // + R$ 300 => R$ 600 alocados de um pagamento de R$ 500.
    // Item diferente de propósito: sem colidir com UNIQUE(payment_id,item_id).
    await expect(stmtAlloc('a5-2', 'pg5', 'i5b', 30000).run()).rejects.toThrow(
      /alocacao excede o valor do pagamento/,
    )
  })

  it('batch() reverte a sequência inteira quando o trigger aborta', async () => {
    await novoPayee('p6')
    await novaDivida('d6', 'p6')
    await novoItem('i6', 'd6', 100000)
    await novoPagamento('pg6a', 'd6', 500000)
    await novoPagamento('pg6b', 'd6', 500000)

    await expect(
      DB.batch([
        stmtAlloc('a6-1', 'pg6a', 'i6', 30000), // sozinha, seria válida
        stmtAlloc('a6-2', 'pg6b', 'i6', 90000), // estoura o teto do item
      ]),
    ).rejects.toThrow(/alocacao excede o valor do item/)

    const { results } = await DB.prepare(
      `SELECT id FROM debt_payment_allocations WHERE item_id = ?`,
    )
      .bind('i6')
      .all<{ id: string }>()

    // Nem a alocação de R$ 300 sobreviveu: o rollback é da sequência inteira.
    expect(results).toEqual([])
  })

  it('alocar exatamente até o teto passa — sem falso positivo', async () => {
    await novoPayee('p7')
    await novaDivida('d7', 'p7')
    await novoItem('i7', 'd7', 100000)
    await novoPagamento('pg7a', 'd7', 30000)
    await novoPagamento('pg7b', 'd7', 70000)

    await DB.batch([
      stmtAlloc('a7-1', 'pg7a', 'i7', 30000),
      stmtAlloc('a7-2', 'pg7b', 'i7', 70000), // fecha em 100000, no teto exato
    ])

    const row = await DB.prepare(
      `SELECT SUM(amount_cents) AS total FROM debt_payment_allocations WHERE item_id = ?`,
    )
      .bind('i7')
      .first<{ total: number }>()

    expect(row?.total).toBe(100000)
  })
})
```

- [ ] **Step 9: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: FAIL — 3 dos 4 testes novos falham. Os dois de trigger com `AssertionError: promise resolved "{ … }" instead of rejecting`, e o do batch com `expected [ { id: 'a6-1' }, { id: 'a6-2' } ] to deeply equal []`. O teste de teto exato já passa (é o controle positivo).

- [ ] **Step 10: Acrescentar os dois triggers ao 0001**

Anexar ao final de `apps/financas/migrations/0001_financas_init.sql`:

```sql

-- INVARIANTES DE SOMA NO BANCO (I1 e I2). Possivel porque foi MEDIDO que
-- TRIGGER funciona no D1 remoto e que batch() faz rollback real: um
-- RAISE(ABORT) aqui aborta a sequencia inteira, sem deixar rastro.
-- Isto SUBSTITUI o padrao de "INSERT guardado + inspecao de meta.changes +
-- batch compensatorio" que a versao anterior deste spec exigia.

-- (I2) a soma alocada a um item nunca passa do valor do item.
CREATE TRIGGER IF NOT EXISTS trg_alloc_item_teto
BEFORE INSERT ON debt_payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'alocacao excede o valor do item')
  WHERE (SELECT amount_cents FROM debt_items WHERE id = NEW.item_id)
        < NEW.amount_cents + COALESCE(
            (SELECT SUM(amount_cents) FROM debt_payment_allocations
              WHERE item_id = NEW.item_id), 0);
END;

-- (I1) a soma alocada por um pagamento nunca passa do valor do pagamento.
CREATE TRIGGER IF NOT EXISTS trg_alloc_pagamento_teto
BEFORE INSERT ON debt_payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'alocacao excede o valor do pagamento')
  WHERE (SELECT amount_cents FROM debt_payments WHERE id = NEW.payment_id)
        < NEW.amount_cents + COALESCE(
            (SELECT SUM(amount_cents) FROM debt_payment_allocations
              WHERE payment_id = NEW.payment_id), 0);
END;
```

Atenção ao ponto onde isso pode dar errado: o `readD1Migrations()` quebra o arquivo em statements usando o splitter do wrangler, e um splitter ingênuo cortaria o trigger no primeiro `;` de dentro do `BEGIN … END`. O wrangler 4 trata bloco `BEGIN … END` como statement composto. Se o Step 11 falhar com `incomplete input` ou `near "END"`, é exatamente isso — nesse caso mova os dois triggers para um `0002_triggers.sql` próprio (um trigger por arquivo) e reexecute.

- [ ] **Step 11: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: PASS — 9 testes verdes (`Tests 9 passed`).

- [ ] **Step 12: Commit**

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git add apps/financas && git commit -m "feat(financas): triggers de teto de alocacao (I1/I2) no 0001"
```

- [ ] **Step 13: Escrever o bloco 3 de `schema.test.ts` — as duas views**

Acrescentar ao final de `apps/financas/src/schema.test.ts`:

```ts
describe('migration 0001 — views', () => {
  it('v_debt_item_balance responde "o Steam Deck já está quitado?"', async () => {
    await novoPayee('p8')
    await novaDivida('d8', 'p8')
    await novoItem('i8-mac', 'd8', 450000, 'MacBook Air') // R$ 4.500
    await novoItem('i8-steam', 'd8', 280000, 'Steam Deck') // R$ 2.800
    await novoPagamento('pg8a', 'd8', 450000)
    await novoPagamento('pg8b', 'd8', 144000)

    await DB.batch([
      stmtAlloc('a8-1', 'pg8a', 'i8-mac', 450000), // quita o MacBook
      stmtAlloc('a8-2', 'pg8b', 'i8-steam', 144000), // R$ 1.440 no Steam Deck
    ])

    const { results } = await DB.prepare(
      `SELECT item_id, description, amount_cents, allocated_cents,
              remaining_cents, is_settled
         FROM v_debt_item_balance
        WHERE debt_id = ?
        ORDER BY description`,
    )
      .bind('d8')
      .all()

    expect(results).toEqual([
      {
        item_id: 'i8-mac',
        description: 'MacBook Air',
        amount_cents: 450000,
        allocated_cents: 450000,
        remaining_cents: 0,
        is_settled: 1,
      },
      {
        item_id: 'i8-steam',
        description: 'Steam Deck',
        amount_cents: 280000,
        allocated_cents: 144000,
        remaining_cents: 136000, // os R$ 1.360 que ainda faltam
        is_settled: 0,
      },
    ])
  })

  it('v_debt_item_balance mostra item sem nenhum pagamento como 0 alocado', async () => {
    await novoPayee('p8b')
    await novaDivida('d8b', 'p8b')
    await novoItem('i8b', 'd8b', 200000, 'Item intocado')

    const row = await DB.prepare(
      `SELECT allocated_cents, remaining_cents, is_settled
         FROM v_debt_item_balance WHERE item_id = ?`,
    )
      .bind('i8b')
      .first()

    // LEFT JOIN + COALESCE: sem alocação nenhuma a linha ainda aparece.
    expect(row).toEqual({
      allocated_cents: 0,
      remaining_cents: 200000,
      is_settled: 0,
    })
  })

  it('v_cashflow conta só o realizado, sem transferência e sem filha de rateio', async () => {
    await novaConta('c8')

    await DB.batch([
      // pai de rateio, liquidado: ENTRA
      stmtTx('t8-pai', 'c8', -20000, '2026-07-10', '2026-07-10', null, null),
      // previsto (settled_at NULL): FORA
      stmtTx('t8-prev', 'c8', -50000, '2026-07-12', null, null, null),
      // perna de transferência entre contas próprias: FORA
      stmtTx('t8-trf', 'c8', -30000, '2026-07-13', '2026-07-13', 'trf-1', null),
      // filha de rateio (o pai já foi contado cheio): FORA
      stmtTx(
        't8-filha',
        'c8',
        -8000,
        '2026-07-10',
        '2026-07-10',
        null,
        't8-pai',
      ),
    ])

    const { results } = await DB.prepare(
      `SELECT id, amount_cents, competence_month
         FROM v_cashflow WHERE account_id = ? ORDER BY id`,
    )
      .bind('c8')
      .all()

    expect(results).toEqual([
      { id: 't8-pai', amount_cents: -20000, competence_month: '2026-07' },
    ])
  })
})
```

- [ ] **Step 14: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: FAIL — 3 testes novos falham com `D1_ERROR: no such table: v_debt_item_balance` e `D1_ERROR: no such table: v_cashflow`.

- [ ] **Step 15: Acrescentar as duas views ao 0001**

Anexar ao final de `apps/financas/migrations/0001_financas_init.sql`:

```sql

-- ---------------------------------------------------------------------
-- VIEWS — MEDIDO: CREATE VIEW e SELECT sobre view funcionam no D1 remoto.
-- ---------------------------------------------------------------------

-- "O Steam Deck ja esta quitado?" em uma linha.
CREATE VIEW IF NOT EXISTS v_debt_item_balance AS
SELECT i.id            AS item_id,
       i.debt_id,
       i.description,
       i.amount_cents,
       COALESCE(SUM(a.amount_cents), 0)                  AS allocated_cents,
       i.amount_cents - COALESCE(SUM(a.amount_cents), 0) AS remaining_cents,
       CASE WHEN i.amount_cents - COALESCE(SUM(a.amount_cents), 0) <= 0
            THEN 1 ELSE 0 END                            AS is_settled
FROM debt_items i
LEFT JOIN debt_payment_allocations a ON a.item_id = i.id
GROUP BY i.id;

-- Fluxo de caixa REALIZADO. As duas exclusoes sao o anti-dupla-contagem:
--   transfer_id IS NULL -> nao conta as duas pernas de uma transferencia
--   parent_id   IS NULL -> conta o pai (valor cheio), nunca pai + filhas
CREATE VIEW IF NOT EXISTS v_cashflow AS
SELECT t.*, substr(t.settled_at, 1, 7) AS competence_month
FROM transactions t
WHERE t.settled_at IS NOT NULL
  AND t.transfer_id IS NULL
  AND t.parent_id  IS NULL;
```

- [ ] **Step 16: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: PASS — 12 testes verdes (`Tests 12 passed`).

- [ ] **Step 17: Commit**

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git add apps/financas && git commit -m "feat(financas): views v_debt_item_balance e v_cashflow no 0001"
```

- [ ] **Step 18: Escrever o bloco 4 de `schema.test.ts` — seed das categorias**

Acrescentar ao final de `apps/financas/src/schema.test.ts`:

```ts
describe('migration 0001 — seed de categorias', () => {
  it('semeia os slugs que medem o gap de ~R$ 1.000/mês da PJ', async () => {
    const { results } = await DB.prepare(
      `SELECT slug, kind, default_scope
         FROM categories
        WHERE slug IN ('das','contador','inss','pro-labore')
        ORDER BY slug`,
    ).all()

    expect(results).toEqual([
      { slug: 'contador', kind: 'expense', default_scope: 'PJ' },
      { slug: 'das', kind: 'expense', default_scope: 'PJ' },
      { slug: 'inss', kind: 'expense', default_scope: 'PJ' },
      // Pró-labore é PJ -> PF: é transferência, não despesa. Classificar
      // como 'expense' contaria o mesmo dinheiro duas vezes (despesa na PJ
      // e receita na PF) e inflaria o custo medido da PJ.
      { slug: 'pro-labore', kind: 'transfer', default_scope: 'PJ' },
    ])
  })

  it('semeia as categorias de transfer e debt_settlement', async () => {
    const { results } = await DB.prepare(
      `SELECT slug FROM categories
        WHERE kind IN ('transfer','debt_settlement')
        ORDER BY slug`,
    ).all()

    expect(results).toEqual([
      { slug: 'pro-labore' },
      { slug: 'quitacao-divida' },
      { slug: 'transferencia' },
    ])
  })

  it('DAS, contador e INSS penduram no pai "custos-pj"', async () => {
    const { results } = await DB.prepare(
      `SELECT c.slug
         FROM categories c
         JOIN categories p ON p.id = c.parent_id
        WHERE p.slug = 'custos-pj'
        ORDER BY c.slug`,
    ).all()

    expect(results).toEqual([
      { slug: 'contador' },
      { slug: 'das' },
      { slug: 'inss' },
    ])
  })
})
```

- [ ] **Step 19: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: FAIL — 3 testes novos falham com `AssertionError: expected [] to deeply equal [ { slug: 'contador', … } ]`.

- [ ] **Step 20: Acrescentar o seed ao 0001**

Anexar ao final de `apps/financas/migrations/0001_financas_init.sql`:

```sql

-- ---------------------------------------------------------------------
-- SEED — categorias com slug estavel.
--
-- Por que nascem na migration e nao na aplicacao: o gap declarado de
-- ~R$ 1.000/mes entre bruto e liquido (DAS + contador + INSS) so e
-- MEDIVEL se as tres saidas tiverem identidade estavel, independente do
-- texto que for digitado na tela. O slug e essa identidade, e ele e unico
-- (uq_categories_slug).
--
-- 'transfer' e 'debt_settlement' tambem sao semeados porque sao as duas
-- classes que TODO relatorio de resultado exclui — sem elas, o pagamento
-- de divida e o pro-labore viram despesa/receita e a dupla contagem volta.
--
-- INSERT OR IGNORE: mantem a migration reexecutavel sem quebrar no
-- indice unico de slug.
-- ---------------------------------------------------------------------
INSERT OR IGNORE INTO categories
  (id, parent_id, name, kind, slug, default_scope, created_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', NULL,
   'Custos da PJ', 'expense', 'custos-pj', 'PJ', '2026-07-25T00:00:00Z');

INSERT OR IGNORE INTO categories
  (id, parent_id, name, kind, slug, default_scope, created_at)
VALUES
  ('00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001',
   'DAS — Simples Nacional', 'expense', 'das', 'PJ', '2026-07-25T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000001',
   'Contador', 'expense', 'contador', 'PJ', '2026-07-25T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000001',
   'INSS', 'expense', 'inss', 'PJ', '2026-07-25T00:00:00Z');

-- Pro-labore e dinheiro saindo da PJ e entrando na PF: e TRANSFERENCIA.
-- Como 'expense' ele viraria despesa na PJ e receita na PF — o mesmo
-- dinheiro contado duas vezes, distorcendo o custo real da PJ.
INSERT OR IGNORE INTO categories
  (id, parent_id, name, kind, slug, default_scope, created_at)
VALUES
  ('00000000-0000-4000-8000-000000000005', NULL,
   'Pro-labore', 'transfer', 'pro-labore', 'PJ', '2026-07-25T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000006', NULL,
   'Transferencia entre contas', 'transfer', 'transferencia', NULL,
   '2026-07-25T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000007', NULL,
   'Quitacao de divida', 'debt_settlement', 'quitacao-divida', NULL,
   '2026-07-25T00:00:00Z');
```

- [ ] **Step 21: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts`

Esperado: PASS — 15 testes verdes (`Tests 15 passed`).

- [ ] **Step 22: Commit**

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git add apps/financas && git commit -m "feat(financas): seed de categorias com slug (das/contador/inss/pro-labore)"
```

- [ ] **Step 23: Documentar os comandos de migration e aplicar o 0001**

Acrescentar a `apps/financas/CLAUDE.md` a seção abaixo (se o arquivo ainda não existir porque a Task 2 não o criou, crie-o com este conteúdo sob um `# CLAUDE.md — apps/financas`):

````md
## Migrations (D1)

O schema vive em `migrations/`, aplicado pelo `wrangler d1 migrations`. O
`0001_financas_init.sql` cria as 10 tabelas **STRICT**, os índices (quase todos
parciais), os 2 triggers de teto de alocação, as 2 views e o seed de categorias.

| Comando                                              | Efeito                                                  |
| ---------------------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter @piluvitu/financas db:migrate:local`  | aplica no estado local do Miniflare (`.wrangler/state`) |
| `pnpm --filter @piluvitu/financas db:migrate:remote` | aplica no D1 de produção                                |
| `pnpm --filter @piluvitu/financas db:migrate:list`   | lista o que ainda não foi aplicado                      |

Direto pelo wrangler, se preferir:

```bash
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --local
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote
```

⚠️ **Forward-only: não existe down migration no D1.** Depois que uma migration
rodou com `--remote`, ela é imutável — corrigir schema significa escrever
`0002_*.sql`, nunca editar a anterior. Enquanto só rodou local, dá para editar o
`0001`, mas é preciso zerar o estado antes (`rm -rf apps/financas/.wrangler/state/v3/d1`),
senão o wrangler considera a migration já aplicada e não a reexecuta.

⚠️ **Índice no D1 não pode ser alterado** — só dropado (irreversível) e recriado.
Por isso `imported_id` / `import_source` e o `uq_tx_imported` nascem já no `0001`,
mesmo o import sendo fatia ②.

⚠️ **Sem `BEGIN`/`COMMIT`/`SAVEPOINT`** na migration: o D1 rejeita. Atomicidade em
runtime é via `db.batch()`, que faz rollback real da sequência inteira quando um
statement aborta (inclusive por `RAISE(ABORT)` de trigger).

### Testes de schema

`src/schema.test.ts` roda 100% local no Miniflare via
`@cloudflare/vitest-pool-workers` — sem secret e sem `wrangler login`.
`vitest.config.ts` lê as migrations com `readD1Migrations()` e injeta em
`env.TEST_MIGRATIONS`; `src/test-setup.ts` roda `reset()` seguido de
`applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` num `beforeEach` global.
A opção `isolatedStorage` **não existe mais na 0.18.x** — o isolamento é
explícito, e como `reset()` apaga também a tabela de controle das migrations,
a ordem reset → reaplicar é obrigatória.

```bash
pnpm --filter @piluvitu/financas exec vitest run src/schema.test.ts
```
````

Depois, aplicar de fato:

```bash
pnpm --filter @piluvitu/financas db:migrate:local
pnpm --filter @piluvitu/financas db:migrate:remote
```

- [ ] **Step 24: Formatar, lintar, rodar a suíte inteira e commitar**

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && pnpm prettier:fix && pnpm lint && pnpm --filter @piluvitu/financas exec tsc --noEmit && pnpm -r test
```

Esperado: prettier sem erro, ESLint sem erro, `tsc --noEmit` sem saída, e `pnpm -r test` verde em todos os workspaces (`@piluvitu/financas` com 15 testes passando).

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git add apps/financas && git commit -m "docs(financas): comandos de migration D1 e aviso de forward-only"
```

### Task 4: Envelope JSON e Cloudflare Access

**Files:**

- Create: `apps/financas/src/lib/envelope.ts`
- Test: `apps/financas/src/lib/envelope.test.ts`
- Create: `apps/financas/src/lib/access.ts`
- Test: `apps/financas/src/lib/access.test.ts`
- Modify: `apps/financas/src/index.ts` (**editar** o arquivo criado na Task 2 — não recriar: os testes de binding `DB`/`ASSETS` da Task 2 dependem dele)
- Test: `apps/financas/src/index.test.ts`
- Modify: `apps/financas/package.json` (dependência `hono`)
- Modify: `apps/financas/wrangler.jsonc` (bloco `vars`)
- Modify: `apps/financas/CLAUDE.md`

**Interfaces:**

- Consumes (da Task 2): o workspace `apps/financas` (pacote `@piluvitu/financas`), `apps/financas/vitest.config.ts` com o plugin `cloudflareTest` do `@cloudflare/vitest-pool-workers`, `apps/financas/wrangler.jsonc` com o binding `DB` de D1, e `tsconfig.json` com os tipos de `@cloudflare/workers-types` (é de lá que vem `D1Database`).
- Produces (para as Tasks 6–11):
  - `export type NotificationKind = 'error' | 'warning' | 'info'`
  - `export type Notification = { type: NotificationKind; code: string; message: string }`
  - `export type Envelope<T> = { ok: boolean; data: T | null; notifications: Notification[] }`
  - `export function okJson<T>(data: T, status?: number): Response`
  - `export function errJson(status: number, code: string, message: string): Response`
  - `export type AccessIdentity = { email: string; sub: string }`
  - `export class AccessError extends Error { constructor(public code: string, message: string) }`
  - `export async function verifyAccessJwt(token: string, teamDomain: string, aud: string): Promise<AccessIdentity>`
  - `export function requireAccess(opts: { teamDomain: string; aud: string; allowedEmails: string[] }): MiddlewareHandler`
  - `apps/financas/src/index.ts` — app Hono com `export type Bindings`, `GET /api/health` público e o Access montado em `/api/*`. As Tasks 6–10 só acrescentam rotas a esse arquivo.

**Por que o cache de JWKS não é opcional:** cada validação de JWT precisa da chave pública do time, que vive em `https://<teamDomain>/cdn-cgi/access/certs`. Esse `fetch` **consome 1 dos 50 subrequests da invocação** e custa **50–150 ms** (§8.11 do spec). Sem cache, toda chamada da SPA paga isso — a tela Comprometido faz várias em sequência. Com cache no escopo do módulo (vive enquanto o isolate viver) + TTL de 1 h, o custo vira ~1 ms de RS256 (§8.1). O preço do cache é o cenário de rotação de chave: por isso, quando o `kid` do token não está no cache quente, refazemos o fetch **uma vez** antes de rejeitar.

---

- [ ] **Step 1: Garantir o Hono no workspace**

Run:

```bash
pnpm --filter @piluvitu/financas add hono
```

Se a Task 3 já tiver adicionado, o comando é idempotente (só reescreve a mesma versão). `hono` não tem script de instalação, então **não** precisa entrar em `allowBuilds` no `pnpm-workspace.yaml`. Lembre que `minimumReleaseAge: 1440` faz o pnpm pular versões com menos de 24 h — se der erro de "no matching version", é isso, e a versão anterior serve.

- [ ] **Step 2: Escrever o teste do envelope**

Create `apps/financas/src/lib/envelope.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { errJson, okJson, type Envelope } from './envelope'

describe('okJson', () => {
  test('devolve ok=true, data e notifications vazio, com status 200 por padrão', async () => {
    const res = okJson({ id: 'abc', amount_cents: 1360 })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const body = (await res.json()) as Envelope<{
      id: string
      amount_cents: number
    }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ id: 'abc', amount_cents: 1360 })
    expect(body.notifications).toEqual([])
  })

  test('respeita o status informado (201 no create)', async () => {
    const res = okJson({ id: 'abc' }, 201)
    expect(res.status).toBe(201)
  })

  test('data null com ok=true é resposta válida (rota sem payload)', async () => {
    const res = okJson(null)
    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(true)
    expect(body.data).toBeNull()
  })

  test('notifications serializa como [] no JSON cru, nunca null', async () => {
    const texto = await okJson({ id: 'abc' }).text()
    expect(texto).toContain('"notifications":[]')
  })
})

describe('errJson', () => {
  test('devolve ok=false, data=null e uma notification do tipo error', async () => {
    const res = errJson(
      422,
      'invalid_json',
      'corpo da requisição não é JSON válido',
    )
    expect(res.status).toBe(422)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const body = (await res.json()) as Envelope<null>
    expect(body.ok).toBe(false)
    expect(body.data).toBeNull()
    expect(body.notifications).toEqual([
      {
        type: 'error',
        code: 'invalid_json',
        message: 'corpo da requisição não é JSON válido',
      },
    ])
  })

  test('propaga o status HTTP recebido', async () => {
    expect(errJson(401, 'not_authenticated', 'sem sessão').status).toBe(401)
    expect(errJson(403, 'email_not_allowed', 'fora da allowlist').status).toBe(
      403,
    )
    expect(errJson(404, 'not_found', 'rota não encontrada').status).toBe(404)
  })
})
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/envelope.test.ts`

Esperado: FAIL com `Failed to load url ./envelope ... Does the file exist?`

- [ ] **Step 4: Implementar o envelope**

Create `apps/financas/src/lib/envelope.ts`:

```ts
/**
 * Envelope único de resposta JSON do Worker de finanças.
 *
 * Mesmo shape do Go API (apps/api/internal/httpx/respond.go):
 *   { "ok": bool, "data": <payload>|null, "notifications": [ {type, code, message} ] }
 *
 * Mensagens (erro, aviso, info) vivem SEMPRE em `notifications`, para o
 * front-end lê-las do mesmo lugar em qualquer rota. `notifications` nunca
 * serializa como null — é [] quando não há nenhuma.
 *
 * Duas diferenças deliberadas em relação ao Go, travadas no contrato desta
 * fatia: aqui não existe o tipo 'success' nem o campo opcional `field`.
 */
export type NotificationKind = 'error' | 'warning' | 'info'

export type Notification = {
  type: NotificationKind
  code: string
  message: string
}

export type Envelope<T> = {
  ok: boolean
  data: T | null
  notifications: Notification[]
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

export function okJson<T>(data: T, status = 200): Response {
  const body: Envelope<T> = { ok: true, data, notifications: [] }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function errJson(
  status: number,
  code: string,
  message: string,
): Response {
  const body: Envelope<never> = {
    ok: false,
    data: null,
    notifications: [{ type: 'error', code, message }],
  }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/envelope.test.ts`

Esperado: PASS, 6 testes.

- [ ] **Step 6: Commit do envelope**

Run:

```bash
pnpm exec prettier --write "apps/financas/src/lib/envelope*.ts"
git add apps/financas/src/lib/envelope.ts apps/financas/src/lib/envelope.test.ts apps/financas/package.json
git commit -m "feat(financas): envelope JSON {ok,data,notifications} no Worker"
```

- [ ] **Step 7: Escrever o teste de `verifyAccessJwt` (harness com par de chaves real)**

O harness gera um par RSA de verdade com `crypto.subtle`, assina o JWT à mão e serve um JWKS falso via `fetchMock` (o mock de fetch de saída oficial do `@cloudflare/vitest-pool-workers`). **Cada teste usa um `teamDomain` diferente** de propósito: o cache de JWKS vive no escopo do módulo e é indexado por domínio, então domínios distintos isolam os testes uns dos outros sem precisar de uma função de reset.

Create `apps/financas/src/lib/access.test.ts`:

```ts
import { fetchMock } from 'cloudflare:test'
import { beforeAll, describe, expect, test } from 'vitest'
import { AccessError, verifyAccessJwt } from './access'

type Par = { priv: CryptoKey; jwk: JsonWebKey }

let parA: Par
let parB: Par

async function gerarPar(kid: string): Promise<Par> {
  const { privateKey, publicKey } = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const exportada = (await crypto.subtle.exportKey('jwk', publicKey)) as {
    n: string
    e: string
  }
  // Mesmos campos que o JWKS do Cloudflare Access devolve.
  return {
    priv: privateKey,
    jwk: {
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
      kid,
      n: exportada.n,
      e: exportada.e,
    },
  }
}

function b64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlText(texto: string): string {
  return b64url(new TextEncoder().encode(texto))
}

async function assinar(
  par: Par,
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const cabeca = b64urlText(JSON.stringify(header))
  const corpo = b64urlText(JSON.stringify(payload))
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    par.priv,
    new TextEncoder().encode(`${cabeca}.${corpo}`),
  )
  return `${cabeca}.${corpo}.${b64url(new Uint8Array(assinatura))}`
}

const AUD = 'aud-de-teste-1234'

function payloadValido(
  teamDomain: string,
  extra: Record<string, unknown> = {},
) {
  return {
    aud: [AUD],
    iss: `https://${teamDomain}`,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    email: 'dono@exemplo.com',
    sub: 'sub-do-dono',
    ...extra,
  }
}

/** Registra UM atendimento do JWKS para o domínio (consumido na 1ª chamada). */
function servirJwks(teamDomain: string, chaves: JsonWebKey[]): void {
  fetchMock
    .get(`https://${teamDomain}`)
    .intercept({ path: '/cdn-cgi/access/certs' })
    .reply(200, { keys: chaves })
}

beforeAll(async () => {
  fetchMock.activate()
  fetchMock.disableNetConnect()
  parA = await gerarPar('kid-a')
  parB = await gerarPar('kid-b')
})

describe('verifyAccessJwt', () => {
  test('caminho feliz: devolve email e sub do token', async () => {
    const dom = 'feliz.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).resolves.toEqual({
      email: 'dono@exemplo.com',
      sub: 'sub-do-dono',
    })
  })

  test('cacheia o JWKS: duas validações, um único fetch', async () => {
    const dom = 'cache.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk]) // um único atendimento registrado
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).resolves.toMatchObject({
      email: 'dono@exemplo.com',
    })
    // Se a 2ª validação fosse à rede, não haveria interceptor sobrando e o
    // fetchMock estouraria "No matching mock dispatch".
    await expect(verifyAccessJwt(token, dom, AUD)).resolves.toMatchObject({
      email: 'dono@exemplo.com',
    })
  })

  test('kid desconhecido com cache quente força um refetch do JWKS', async () => {
    const dom = 'rotacao.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const tokenA = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    await expect(verifyAccessJwt(tokenA, dom, AUD)).resolves.toMatchObject({
      sub: 'sub-do-dono',
    })

    // A Cloudflare rotacionou a chave: o JWKS agora tem kid-b.
    servirJwks(dom, [parB.jwk])
    const tokenB = await assinar(
      parB,
      { alg: 'RS256', kid: 'kid-b' },
      payloadValido(dom),
    )
    await expect(verifyAccessJwt(tokenB, dom, AUD)).resolves.toMatchObject({
      sub: 'sub-do-dono',
    })
  })

  test('token malformado (sem três partes) é invalid_token', async () => {
    const dom = 'malformado.cloudflareaccess.com'
    await expect(
      verifyAccessJwt('nao-e-um-jwt', dom, AUD),
    ).rejects.toMatchObject({
      name: 'AccessError',
      code: 'invalid_token',
    })
  })

  test('alg diferente de RS256 é invalid_token', async () => {
    const dom = 'alg.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'none', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('assinatura inválida (payload adulterado) é invalid_token', async () => {
    const dom = 'assinatura.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const [cabeca, , assinatura] = token.split('.')
    const adulterado = `${cabeca}.${b64urlText(
      JSON.stringify(payloadValido(dom, { email: 'invasor@exemplo.com' })),
    )}.${assinatura}`

    await expect(verifyAccessJwt(adulterado, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('aud errado é invalid_audience', async () => {
    const dom = 'aud.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { aud: ['aud-de-outro-app'] }),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_audience',
    })
  })

  test('iss de outro time é invalid_token', async () => {
    const dom = 'iss.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { iss: 'https://outro-time.cloudflareaccess.com' }),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('token expirado é token_expired', async () => {
    const dom = 'expirado.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { exp: Math.floor(Date.now() / 1000) - 60 }),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'token_expired',
    })
  })

  test('token sem email é invalid_token', async () => {
    const dom = 'sememail.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const semEmail = payloadValido(dom) as Record<string, unknown>
    delete semEmail.email
    const token = await assinar(parA, { alg: 'RS256', kid: 'kid-a' }, semEmail)

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'invalid_token',
    })
  })

  test('JWKS fora do ar é jwks_unavailable', async () => {
    const dom = 'jwksfora.cloudflareaccess.com'
    fetchMock
      .get(`https://${dom}`)
      .intercept({ path: '/cdn-cgi/access/certs' })
      .reply(500, 'boom')
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )

    await expect(verifyAccessJwt(token, dom, AUD)).rejects.toMatchObject({
      code: 'jwks_unavailable',
    })
  })

  test('AccessError é instância de Error e carrega o code', () => {
    const err = new AccessError('invalid_token', 'JWT malformado')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AccessError')
    expect(err.code).toBe('invalid_token')
    expect(err.message).toBe('JWT malformado')
  })
})
```

- [ ] **Step 8: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/access.test.ts`

Esperado: FAIL com `Failed to load url ./access ... Does the file exist?`

- [ ] **Step 9: Implementar `verifyAccessJwt` (sem o middleware ainda)**

Create `apps/financas/src/lib/access.ts`:

```ts
/**
 * Validação do JWT do Cloudflare Access.
 *
 * O Access fica na frente do Worker (Custom Domain na zona piluvitu.com.br) e
 * injeta o header 'Cf-Access-Jwt-Assertion' em toda requisição que passou pela
 * policy. O Worker NÃO confia no header pela existência dele: valida assinatura
 * (RS256), aud, iss e exp contra o JWKS do time.
 *
 * CACHE DE JWKS NÃO É OPCIONAL: o fetch de
 * https://<teamDomain>/cdn-cgi/access/certs consome 1 dos 50 subrequests da
 * invocação e custa 50-150 ms. Sem cache, TODA chamada da SPA paga isso. Com
 * cache no escopo do módulo (vive enquanto o isolate viver) + TTL, o custo por
 * requisição vira ~1 ms de RS256.
 *
 * O preço do cache é a rotação de chave: se o kid do token não estiver no cache
 * quente, refazemos o fetch UMA vez antes de rejeitar — senão uma rotação
 * derrubaria o acesso por até um TTL inteiro.
 */
export type AccessIdentity = { email: string; sub: string }

export class AccessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AccessError'
  }
}

const JWKS_TTL_MS = 60 * 60 * 1000

type JwksCacheado = { keys: JsonWebKey[]; fetchedAt: number }

const jwksCache = new Map<string, JwksCacheado>()

async function buscarJwks(teamDomain: string): Promise<JsonWebKey[]> {
  let res: Response
  try {
    res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  } catch (err) {
    throw new AccessError(
      'jwks_unavailable',
      `falha ao buscar o JWKS do Access: ${String(err)}`,
    )
  }
  if (!res.ok) {
    throw new AccessError(
      'jwks_unavailable',
      `JWKS do Access respondeu ${res.status}`,
    )
  }
  const body = (await res.json()) as { keys?: JsonWebKey[] }
  if (!body.keys || body.keys.length === 0) {
    throw new AccessError('jwks_unavailable', 'JWKS do Access veio sem chaves')
  }
  jwksCache.set(teamDomain, { keys: body.keys, fetchedAt: Date.now() })
  return body.keys
}

async function chavePorKid(
  teamDomain: string,
  kid: string,
): Promise<JsonWebKey> {
  const cache = jwksCache.get(teamDomain)
  const quente =
    cache !== undefined && Date.now() - cache.fetchedAt < JWKS_TTL_MS

  let keys = quente ? cache.keys : await buscarJwks(teamDomain)
  let chave = keys.find((k) => (k as { kid?: string }).kid === kid)

  if (chave === undefined && quente) {
    // Rotação de chave: o cache está velho de conteúdo, não de tempo.
    keys = await buscarJwks(teamDomain)
    chave = keys.find((k) => (k as { kid?: string }).kid === kid)
  }
  if (chave === undefined) {
    throw new AccessError(
      'invalid_token',
      `kid ${kid} não está no JWKS do Access`,
    )
  }
  return chave
}

function bytesDeB64url(parte: string): Uint8Array {
  const b64 = parte.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function jsonDeB64url<T>(parte: string): T {
  return JSON.parse(new TextDecoder().decode(bytesDeB64url(parte))) as T
}

type JwtHeader = { alg?: string; kid?: string }
type JwtPayload = {
  aud?: string | string[]
  iss?: string
  exp?: number
  email?: string
  sub?: string
}

export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  aud: string,
): Promise<AccessIdentity> {
  const partes = token.split('.')
  if (partes.length !== 3) {
    throw new AccessError('invalid_token', 'JWT do Access malformado')
  }

  let header: JwtHeader
  let payload: JwtPayload
  try {
    header = jsonDeB64url<JwtHeader>(partes[0])
    payload = jsonDeB64url<JwtPayload>(partes[1])
  } catch {
    throw new AccessError(
      'invalid_token',
      'JWT do Access não é base64url/JSON válido',
    )
  }

  if (header.alg !== 'RS256') {
    throw new AccessError(
      'invalid_token',
      `alg não suportado: ${String(header.alg)}`,
    )
  }
  if (!header.kid) {
    throw new AccessError('invalid_token', 'JWT do Access sem kid')
  }

  const jwk = await chavePorKid(teamDomain, header.kid)
  const chave = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const assinaturaOk = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    chave,
    bytesDeB64url(partes[2]),
    new TextEncoder().encode(`${partes[0]}.${partes[1]}`),
  )
  if (!assinaturaOk) {
    throw new AccessError(
      'invalid_token',
      'assinatura do JWT do Access não confere',
    )
  }

  const auds = Array.isArray(payload.aud)
    ? payload.aud
    : payload.aud
      ? [payload.aud]
      : []
  if (!auds.includes(aud)) {
    throw new AccessError(
      'invalid_audience',
      'aud do JWT não é a deste aplicativo',
    )
  }
  if (payload.iss !== `https://${teamDomain}`) {
    throw new AccessError('invalid_token', 'iss do JWT não é o time esperado')
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
    throw new AccessError('token_expired', 'JWT do Access expirado')
  }
  if (!payload.email || !payload.sub) {
    throw new AccessError('invalid_token', 'JWT do Access sem email ou sub')
  }

  return { email: payload.email, sub: payload.sub }
}
```

- [ ] **Step 10: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/access.test.ts`

Esperado: PASS, 12 testes.

- [ ] **Step 11: Escrever o teste do middleware `requireAccess`**

Acrescente ao final de `apps/financas/src/lib/access.test.ts` (os helpers `assinar`, `servirJwks`, `payloadValido`, `parA` e `AUD` do Step 7 continuam valendo, são de escopo de módulo). Troque também a linha de import do topo do arquivo para incluir `requireAccess`:

```ts
import { AccessError, requireAccess, verifyAccessJwt } from './access'
```

E acrescente `import { Hono } from 'hono'` logo abaixo do import do vitest. Depois, no fim do arquivo:

```ts
function appProtegido(opts: {
  teamDomain: string
  aud: string
  allowedEmails: string[]
}) {
  const app = new Hono()
  app.use('/protegido', requireAccess(opts))
  app.get('/protegido', (c) => c.json({ visto: true }))
  return app
}

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string; type: string }>
}

describe('requireAccess', () => {
  test('sem o header do Access responde 401 not_authenticated', async () => {
    const app = appProtegido({
      teamDomain: 'mw-sem-header.cloudflareaccess.com',
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido')
    expect(res.status).toBe(401)

    const body = (await res.json()) as CorpoErro
    expect(body.ok).toBe(false)
    expect(body.data).toBeNull()
    expect(body.notifications[0]).toMatchObject({
      type: 'error',
      code: 'not_authenticated',
    })
  })

  test('token inválido responde 401 invalid_token', async () => {
    const app = appProtegido({
      teamDomain: 'mw-invalido.cloudflareaccess.com',
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': 'nao-e-um-jwt' },
    })
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'invalid_token',
    )
  })

  test('e-mail fora da allowlist responde 403 email_not_allowed', async () => {
    const dom = 'mw-allowlist.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom, { email: 'estranho@exemplo.com' }),
    )
    const app = appProtegido({
      teamDomain: dom,
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(403)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'email_not_allowed',
    )
  })

  test('allowlist vazia barra todo mundo (fail closed)', async () => {
    const dom = 'mw-vazia.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const app = appProtegido({ teamDomain: dom, aud: AUD, allowedEmails: [] })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(403)
  })

  test('caminho feliz deixa o handler rodar', async () => {
    const dom = 'mw-feliz.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const app = appProtegido({
      teamDomain: dom,
      aud: AUD,
      allowedEmails: ['dono@exemplo.com'],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ visto: true })
  })

  test('allowlist compara e-mail sem diferenciar maiúsculas', async () => {
    const dom = 'mw-caixa.cloudflareaccess.com'
    servirJwks(dom, [parA.jwk])
    const token = await assinar(
      parA,
      { alg: 'RS256', kid: 'kid-a' },
      payloadValido(dom),
    )
    const app = appProtegido({
      teamDomain: dom,
      aud: AUD,
      allowedEmails: [' Dono@Exemplo.COM '],
    })

    const res = await app.request('/protegido', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 12: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/access.test.ts`

Esperado: FAIL com `The requested module './access' does not provide an export named 'requireAccess'`

- [ ] **Step 13: Implementar `requireAccess`**

Acrescente ao final de `apps/financas/src/lib/access.ts`, e coloque os dois imports abaixo no topo do arquivo (antes do bloco de comentário não, depois dele — logo antes de `export type AccessIdentity`):

```ts
import type { MiddlewareHandler } from 'hono'
import { errJson } from './envelope'
```

No fim do arquivo:

```ts
/**
 * Middleware do Hono que exige um JWT válido do Access e um e-mail da
 * allowlist. Módulo single-user: nada downstream lê a identidade, então ela
 * NÃO é gravada no contexto — o que mantém o tipo do Hono limpo nas Tasks 6-10.
 */
export function requireAccess(opts: {
  teamDomain: string
  aud: string
  allowedEmails: string[]
}): MiddlewareHandler {
  const permitidos = opts.allowedEmails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0)

  return async (c, next) => {
    const token = c.req.header('Cf-Access-Jwt-Assertion')
    if (!token) {
      return errJson(
        401,
        'not_authenticated',
        'requisição sem o JWT do Cloudflare Access',
      )
    }

    let identidade: AccessIdentity
    try {
      identidade = await verifyAccessJwt(token, opts.teamDomain, opts.aud)
    } catch (err) {
      if (err instanceof AccessError) {
        const status = err.code === 'jwks_unavailable' ? 503 : 401
        return errJson(status, err.code, err.message)
      }
      throw err
    }

    if (!permitidos.includes(identidade.email.toLowerCase())) {
      return errJson(
        403,
        'email_not_allowed',
        `e-mail ${identidade.email} não tem acesso`,
      )
    }

    await next()
  }
}
```

- [ ] **Step 14: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/access.test.ts`

Esperado: PASS, 18 testes.

- [ ] **Step 15: Commit do Access**

Run:

```bash
pnpm exec prettier --write "apps/financas/src/lib/access*.ts"
git add apps/financas/src/lib/access.ts apps/financas/src/lib/access.test.ts
git commit -m "feat(financas): valida o JWT do Cloudflare Access com cache de JWKS"
```

- [ ] **Step 16: Escrever o teste do `index.ts`**

Create `apps/financas/src/index.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import app, { type Bindings } from './index'
import type { Envelope } from './lib/envelope'

// Sem DB e sem rede: estes três casos não chegam a tocar D1 nem o JWKS.
const env = {
  ACCESS_TEAM_DOMAIN: 'indextest.cloudflareaccess.com',
  ACCESS_AUD: 'aud-de-teste-1234',
  ACCESS_ALLOWED_EMAILS: 'dono@exemplo.com',
} as unknown as Bindings

type CorpoErro = {
  ok: boolean
  data: null
  notifications: Array<{ code: string }>
}

describe('worker de finanças', () => {
  test('GET /api/health é público (não exige JWT do Access)', async () => {
    const res = await app.request('/api/health', {}, env)
    expect(res.status).toBe(200)

    const body = (await res.json()) as Envelope<{ status: string }>
    expect(body.ok).toBe(true)
    expect(body.data).toEqual({ status: 'up' })
    expect(body.notifications).toEqual([])
  })

  test('GET /api/accounts sem o header do Access responde 401', async () => {
    const res = await app.request('/api/accounts', {}, env)
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_authenticated',
    )
  })

  test('GET /api/accounts com header inválido responde 401 invalid_token', async () => {
    const res = await app.request(
      '/api/accounts',
      { headers: { 'Cf-Access-Jwt-Assertion': 'nao-e-um-jwt' } },
      env,
    )
    expect(res.status).toBe(401)
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'invalid_token',
    )
  })

  test('rota /api inexistente devolve envelope JSON, não texto puro', async () => {
    // POST /api/health não casa com nenhum handler e cai no catch-all — é o que
    // garante que api<T>() (Task 11) sempre encontra um envelope para desembrulhar.
    const res = await app.request('/api/health', { method: 'POST' }, env)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )
    expect(((await res.json()) as CorpoErro).notifications[0].code).toBe(
      'not_found',
    )
  })
})
```

- [ ] **Step 17: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/index.test.ts`

Esperado: FAIL com `Failed to load url ./index ... Does the file exist?` (ou, se a Task 3 tiver deixado um stub, FAIL na asserção de `body.ok`).

- [ ] **Step 18: Implementar o `index.ts` com o Access montado**

Create `apps/financas/src/index.ts` (o conteúdo abaixo é o arquivo inteiro — substitui qualquer stub da Task 3):

```ts
import { Hono } from 'hono'
import { requireAccess } from './lib/access'
import { errJson, okJson } from './lib/envelope'

export type Bindings = {
  DB: D1Database
  ACCESS_TEAM_DOMAIN: string
  ACCESS_AUD: string
  ACCESS_ALLOWED_EMAILS: string
}

const app = new Hono<{ Bindings: Bindings }>()

/**
 * O Access protege /api/* inteiro, MENOS /api/health — o health é sondado por
 * monitor externo, que não passa pela policy e portanto não tem JWT. A exceção
 * é explícita aqui (e não implícita na ordem de registro das rotas do Hono)
 * para não virar armadilha quando as Tasks 6-10 acrescentarem rotas.
 */
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next()

  return requireAccess({
    teamDomain: c.env.ACCESS_TEAM_DOMAIN,
    aud: c.env.ACCESS_AUD,
    allowedEmails: (c.env.ACCESS_ALLOWED_EMAILS ?? '').split(','),
  })(c, next)
})

app.get('/api/health', () => okJson({ status: 'up' }))

// Catch-all do /api: 404 também sai no envelope. Fora de /api quem responde é
// o Static Assets (SPA), que roda antes do Worker.
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', () => errJson(404, 'not_found', 'rota não encontrada'))

export default app
```

- [ ] **Step 19: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/index.test.ts`

Esperado: PASS, 4 testes.

- [ ] **Step 20: Declarar as vars do Access no `wrangler.jsonc`**

Modify `apps/financas/wrangler.jsonc` — acrescente (ou funda com o bloco existente) as chaves abaixo no objeto raiz, ao lado de `d1_databases`:

```jsonc
  "vars": {
    "ACCESS_TEAM_DOMAIN": "piluvitu.cloudflareaccess.com",
    "ACCESS_AUD": "trocar-pelo-aud-tag-da-application-do-access",

      // ⚠️ ESTE PLACEHOLDER SOBREVIVE ATÉ A TASK 15. Nada entre aqui e lá
      // falha se ele ficar como está — o middleware só compara `aud` em
      // runtime, e os testes usam um aud sintético. Antes de qualquer
      // `wrangler deploy`, confira: o valor tem que ser o Application Audience
      // (AUD) Tag da Application do Access, 64 hex. Se ainda estiver com o
      // texto do placeholder, TODA requisição de produção vai cair em 403
      // invalid_audience — e o sintoma parece problema de login, não de config.
    "ACCESS_ALLOWED_EMAILS": "paulo.tspi@gmail.com"
  },
```

O `ACCESS_AUD` real é a **Application Audience (AUD) Tag** que aparece em Zero Trust → Access → Applications → (a app do `financas.piluvitu.com.br`) → Overview. Não é segredo (vai no bundle do Worker de qualquer jeito), então fica em `vars` e não em secret.

- [ ] **Step 21: Rodar a suíte inteira do workspace e o type check**

Run:

```bash
pnpm --filter @piluvitu/financas exec vitest run
pnpm --filter @piluvitu/financas exec tsc --noEmit
```

Esperado: PASS em tudo (envelope 6 + access 18 + index 4 = 28 testes) e `tsc` sem saída.

- [ ] **Step 22: Atualizar o `CLAUDE.md` do workspace**

Modify `apps/financas/CLAUDE.md` — acrescente ao final (crie o arquivo com esta seção se a Task 3 não o tiver criado):

```markdown
## Envelope de resposta

Toda rota JSON responde no formato único `{ "ok": bool, "data": <payload>|null, "notifications": [{type,code,message}] }` — **o mesmo shape da Go API** (`apps/api/internal/httpx/respond.go`), para o front ler mensagens sempre do mesmo lugar. Helpers em `src/lib/envelope.ts`: `okJson(data, status = 200)` e `errJson(status, code, message)`. `notifications` nunca serializa como `null`. Duas diferenças deliberadas em relação ao Go: aqui não existe o tipo `'success'` nem o campo `field`.

Códigos em uso: `not_authenticated`, `invalid_token`, `invalid_audience`, `token_expired`, `jwks_unavailable`, `email_not_allowed`, `not_found`.

## Autenticação — Cloudflare Access

Zero linha de login própria: o Access fica na frente do Worker (Google OAuth + allowlist) e injeta o header `Cf-Access-Jwt-Assertion`. `src/lib/access.ts` **não confia na existência do header** — valida assinatura RS256, `aud`, `iss` (`https://<teamDomain>`) e `exp` contra o JWKS de `https://<teamDomain>/cdn-cgi/access/certs`, e depois confere o e-mail contra a allowlist (case-insensitive, e **fail closed**: allowlist vazia barra todo mundo).

- **O cache de JWKS não é opcional.** Esse fetch consome **1 dos 50 subrequests** da invocação e custa **50–150 ms**. O cache vive no escopo do módulo, indexado por `teamDomain`, com TTL de 1 h. Quando o `kid` do token não está no cache quente, o JWKS é refetchado **uma vez** antes de rejeitar — senão uma rotação de chave da Cloudflare derrubaria o acesso por até um TTL inteiro.
- **Montagem:** `src/index.ts` aplica o middleware em `/api/*` com uma exceção explícita para `/api/health` (sondado por monitor externo, que não tem JWT). Um catch-all `app.all('/api/*')` garante que 404 também saia no envelope.
- **Vars:** `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (Application Audience Tag da app no Zero Trust) e `ACCESS_ALLOWED_EMAILS` (CSV). Não são segredos — ficam em `vars` no `wrangler.jsonc`.
- **Custom Domain é obrigatório**, não preferência: em `*.workers.dev` o domínio registrável muda, o contexto vira cross-site e a quebra só aparece em produção.
- **Testes:** o JWT é assinado de verdade dentro do teste (par RSA via `crypto.subtle`) e o JWKS é servido pelo `fetchMock` do `cloudflare:test`. Cada caso usa um `teamDomain` diferente de propósito — é assim que os testes ficam isolados apesar do cache de módulo.
```

- [ ] **Step 23: Commit do wiring**

Run:

```bash
pnpm exec prettier --write "apps/financas/src/**/*.ts" "apps/financas/CLAUDE.md"
git add apps/financas/src/index.ts apps/financas/src/index.test.ts apps/financas/wrangler.jsonc apps/financas/CLAUDE.md
git commit -m "feat(financas): monta o Cloudflare Access em /api/* exceto /api/health"
```

---

### Task 5: `ids.ts` e `dates.ts`

**Files:**

- Create: `apps/financas/src/lib/ids.ts`
- Test: `apps/financas/src/lib/ids.test.ts`
- Create: `apps/financas/src/lib/dates.ts`
- Test: `apps/financas/src/lib/dates.test.ts`
- Modify: `apps/financas/CLAUDE.md`

**Interfaces:**

- Consumes (da Task 2): o workspace `apps/financas` com `vitest.config.ts` (plugin `cloudflareTest`). **Não depende da Task 4** — pode ser feita em paralelo.
- Produces (para as Tasks 6–10):
  - `export function newId(): string` — `crypto.randomUUID()`
  - `export function todayInTeresina(now?: Date): string` — `'YYYY-MM-DD'`, UTC−3 fixo
  - `export function nowIsoUtc(now?: Date): string` — `'YYYY-MM-DDTHH:MM:SSZ'`
  - `export function billCompetence(purchaseDate: string, closingDay: number): string`
  - `export function addMonthsToCompetence(competence: string, n: number): string`
  - `export function competenceDueDate(competence: string, dueDay: number): string`

O parâmetro `now` é **opcional** em `todayInTeresina` e `nowIsoUtc`: chamada sem argumento continua batendo a assinatura do contrato (`todayInTeresina(): string`), e o teste injeta o relógio em vez de mockar `Date` global — mock de `Date` dentro do workerd é frágil e contamina outros testes do mesmo arquivo.

- [ ] **Step 1: Escrever o teste de `newId`**

Create `apps/financas/src/lib/ids.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { newId } from './ids'

describe('newId', () => {
  test('devolve UUID v4 no formato canônico', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  test('não repete em 1000 chamadas', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/ids.test.ts`

Esperado: FAIL com `Failed to load url ./ids ... Does the file exist?`

- [ ] **Step 3: Implementar `newId`**

Create `apps/financas/src/lib/ids.ts`:

```ts
/**
 * Toda PK do schema é TEXT com UUID gerado na aplicação (invariante 2 do §5.1
 * do spec). Dois motivos, ambos medidos:
 *  - o binding do D1 devolve INTEGER como Number do JS (52 bits), então id
 *    numérico grande perde precisão em silêncio;
 *  - não existe last_insert_rowid() confiável ENTRE statements de um batch(),
 *    e o gerador de parcelas (Task 8) precisa pré-montar 60 linhas com os ids
 *    já conhecidos antes de mandar o batch.
 */
export function newId(): string {
  return crypto.randomUUID()
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/ids.test.ts`

Esperado: PASS, 2 testes.

- [ ] **Step 5: Commit do `ids.ts`**

Run:

```bash
pnpm exec prettier --write "apps/financas/src/lib/ids*.ts"
git add apps/financas/src/lib/ids.ts apps/financas/src/lib/ids.test.ts
git commit -m "feat(financas): newId() com crypto.randomUUID() para as PKs TEXT"
```

- [ ] **Step 6: Escrever o teste de `dates.ts`**

Create `apps/financas/src/lib/dates.test.ts`:

```ts
import { describe, expect, test } from 'vitest'
import {
  addMonthsToCompetence,
  billCompetence,
  competenceDueDate,
  nowIsoUtc,
  todayInTeresina,
} from './dates'

describe('todayInTeresina', () => {
  test('22h do dia 31 em Teresina continua sendo dia 31', () => {
    // 31/07 às 22h em UTC-3 já é 01/08 em UTC — é exatamente aqui que o
    // lançamento pularia de mês se a data saísse de toISOString() cru.
    const agora = new Date('2026-07-31T22:00:00-03:00')
    expect(agora.toISOString().slice(0, 10)).toBe('2026-08-01') // o jeito ERRADO
    expect(todayInTeresina(agora)).toBe('2026-07-31') // o jeito certo
  })

  test('23:59:59 local do dia 31 ainda é dia 31', () => {
    expect(todayInTeresina(new Date('2026-08-01T02:59:59Z'))).toBe('2026-07-31')
  })

  test('00:00 local do dia 1 já é dia 1', () => {
    expect(todayInTeresina(new Date('2026-08-01T03:00:00Z'))).toBe('2026-08-01')
  })

  test('Teresina é UTC-3 fixo: janeiro e julho usam o mesmo offset', () => {
    // Sem horário de verão desde 2019 — janeiro não pode virar UTC-2.
    expect(todayInTeresina(new Date('2027-01-01T02:30:00Z'))).toBe('2026-12-31')
    expect(todayInTeresina(new Date('2026-07-01T02:30:00Z'))).toBe('2026-06-30')
  })

  test('sem argumento devolve YYYY-MM-DD', () => {
    expect(todayInTeresina()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('nowIsoUtc', () => {
  test('devolve UTC com segundos e Z, sem milissegundos', () => {
    expect(nowIsoUtc(new Date('2026-07-25T13:04:05.789Z'))).toBe(
      '2026-07-25T13:04:05Z',
    )
  })

  test('sem argumento devolve YYYY-MM-DDTHH:MM:SSZ', () => {
    expect(nowIsoUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })
})

describe('billCompetence', () => {
  test('compra depois do fechamento cai na fatura do mês seguinte', () => {
    expect(billCompetence('2026-07-28', 25)).toBe('2026-08')
  })

  test('compra antes do fechamento cai na fatura do próprio mês', () => {
    expect(billCompetence('2026-07-20', 25)).toBe('2026-07')
  })

  test('compra no dia exato do fechamento ainda é a fatura do mês', () => {
    expect(billCompetence('2026-07-25', 25)).toBe('2026-07')
  })

  test('vira o ano corretamente', () => {
    expect(billCompetence('2026-12-28', 25)).toBe('2027-01')
  })

  test('fechamento 31 em fevereiro cai para o último dia do mês', () => {
    // Cartão que fecha dia 31 fecha 28/02 em 2026: compra em 28/02 é fatura de fevereiro.
    expect(billCompetence('2026-02-28', 31)).toBe('2026-02')
    expect(billCompetence('2026-03-01', 31)).toBe('2026-03')
  })

  test('fechamento 31 em mês de 30 dias cai para o dia 30', () => {
    expect(billCompetence('2026-04-30', 31)).toBe('2026-04')
    expect(billCompetence('2026-05-01', 31)).toBe('2026-05')
  })

  test('rejeita data e dia de fechamento inválidos', () => {
    expect(() => billCompetence('28/07/2026', 25)).toThrow(RangeError)
    expect(() => billCompetence('2026-07-28', 0)).toThrow(RangeError)
    expect(() => billCompetence('2026-07-28', 32)).toThrow(RangeError)
  })
})

describe('addMonthsToCompetence', () => {
  test('soma dentro do mesmo ano', () => {
    expect(addMonthsToCompetence('2026-08', 3)).toBe('2026-11')
  })

  test('soma 12 meses mantém o mês e avança um ano', () => {
    expect(addMonthsToCompetence('2026-11', 12)).toBe('2027-11')
  })

  test('vira o ano em dezembro', () => {
    expect(addMonthsToCompetence('2026-12', 1)).toBe('2027-01')
  })

  test('n = 0 devolve a mesma competência', () => {
    expect(addMonthsToCompetence('2026-08', 0)).toBe('2026-08')
  })

  test('aceita n negativo', () => {
    expect(addMonthsToCompetence('2026-01', -1)).toBe('2025-12')
  })

  test('60 parcelas a partir de agosto/2026 terminam em julho/2031', () => {
    expect(addMonthsToCompetence('2026-08', 59)).toBe('2031-07')
  })

  test('rejeita competência malformada', () => {
    expect(() => addMonthsToCompetence('2026-13', 1)).toThrow(RangeError)
    expect(() => addMonthsToCompetence('2026-08-01', 1)).toThrow(RangeError)
  })
})

describe('competenceDueDate', () => {
  test('monta a data de vencimento na competência', () => {
    expect(competenceDueDate('2026-08', 5)).toBe('2026-08-05')
  })

  test('dia 31 em mês de 30 dias cai para o dia 30', () => {
    expect(competenceDueDate('2026-09', 31)).toBe('2026-09-30')
  })

  test('dia 31 em fevereiro cai para o dia 28', () => {
    expect(competenceDueDate('2026-02', 31)).toBe('2026-02-28')
  })

  test('rejeita competência e dia inválidos', () => {
    expect(() => competenceDueDate('2026-00', 5)).toThrow(RangeError)
    expect(() => competenceDueDate('2026-08', 0)).toThrow(RangeError)
  })
})
```

- [ ] **Step 7: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/dates.test.ts`

Esperado: FAIL com `Failed to load url ./dates ... Does the file exist?`

- [ ] **Step 8: Implementar `dates.ts`**

Create `apps/financas/src/lib/dates.ts`:

```ts
/**
 * Datas do módulo de finanças.
 *
 * Convenções do schema (§5.2 do spec):
 *  - data       : TEXT 'YYYY-MM-DD' LOCAL (ordenação lexicográfica == cronológica)
 *  - competência: TEXT 'YYYY-MM'
 *  - timestamp  : TEXT UTC 'YYYY-MM-DDTHH:MM:SSZ'
 *
 * Teresina é UTC-3 FIXO — o Piauí não adota horário de verão desde 2019. O
 * offset é constante de propósito: Intl/timeZone dentro do Worker custaria CPU
 * (teto de 10 ms por invocação) para resolver um fuso que nunca muda.
 */
const TERESINA_OFFSET_MS = 3 * 60 * 60 * 1000

function assertDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`data inválida (esperado YYYY-MM-DD): ${value}`)
  }
}

function assertCompetence(value: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new RangeError(`competência inválida (esperado YYYY-MM): ${value}`)
  }
}

function assertDayOfMonth(value: number, campo: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new RangeError(`${campo} inválido (esperado 1..31): ${value}`)
  }
}

/** month é 1-based. Date.UTC(y, m, 0) devolve o último dia do mês m. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function todayInTeresina(now: Date = new Date()): string {
  return new Date(now.getTime() - TERESINA_OFFSET_MS).toISOString().slice(0, 10)
}

export function nowIsoUtc(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 19)}Z`
}

/**
 * Em qual fatura a compra cai. Competência é o mês em que a fatura FECHA:
 * compra em 28/07 num cartão que fecha dia 25 => '2026-08'. Dia de fechamento
 * maior que o tamanho do mês é aparado (cartão que fecha 31 fecha 28 em
 * fevereiro).
 */
export function billCompetence(
  purchaseDate: string,
  closingDay: number,
): string {
  assertDate(purchaseDate)
  assertDayOfMonth(closingDay, 'dia de fechamento')

  const year = Number(purchaseDate.slice(0, 4))
  const month = Number(purchaseDate.slice(5, 7))
  const day = Number(purchaseDate.slice(8, 10))
  const fechamentoEfetivo = Math.min(closingDay, daysInMonth(year, month))
  const competencia = `${year}-${pad2(month)}`

  return day <= fechamentoEfetivo
    ? competencia
    : addMonthsToCompetence(competencia, 1)
}

/** Aritmética de competência em inteiros — sem Date, sem risco de fuso. */
export function addMonthsToCompetence(competence: string, n: number): string {
  assertCompetence(competence)
  if (!Number.isInteger(n)) {
    throw new RangeError(`n inválido (esperado inteiro): ${n}`)
  }

  const year = Number(competence.slice(0, 4))
  const month = Number(competence.slice(5, 7))
  const total = year * 12 + (month - 1) + n

  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${pad2((total % 12) + 1)}`
}

/** Dia de vencimento dentro da competência, aparado ao tamanho do mês. */
export function competenceDueDate(competence: string, dueDay: number): string {
  assertCompetence(competence)
  assertDayOfMonth(dueDay, 'dia de vencimento')

  const year = Number(competence.slice(0, 4))
  const month = Number(competence.slice(5, 7))

  return `${competence}-${pad2(Math.min(dueDay, daysInMonth(year, month)))}`
}
```

- [ ] **Step 9: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/lib/dates.test.ts`

Esperado: PASS, 22 testes.

- [ ] **Step 10: Rodar a suíte inteira do workspace e o type check**

Run:

```bash
pnpm --filter @piluvitu/financas exec vitest run
pnpm --filter @piluvitu/financas exec tsc --noEmit
```

Esperado: PASS em tudo, `tsc` sem saída.

- [ ] **Step 11: Atualizar o `CLAUDE.md` do workspace**

Modify `apps/financas/CLAUDE.md` — acrescente ao final (crie o arquivo com esta seção se ele ainda não existir):

```markdown
## Datas, fuso e ids (`src/lib/dates.ts`, `src/lib/ids.ts`)

- **Teresina é UTC−3 fixo** (Piauí não adota horário de verão desde 2019). `todayInTeresina()` subtrai 3 h antes de cortar o `YYYY-MM-DD` — sem isso, um lançamento feito às 22h do dia 31 sairia com a data do dia 1 do mês seguinte, porque `toISOString()` é UTC. Offset constante, não `Intl.DateTimeFormat`: resolver fuso custa CPU e o teto do free tier é **10 ms por invocação**.
- **Três formatos, um por pergunta:** data local `YYYY-MM-DD` (`purchase_date`, `due_date`), competência `YYYY-MM` (`bill_competence`) e timestamp UTC `YYYY-MM-DDTHH:MM:SSZ` (`created_at`, `updated_at`, via `nowIsoUtc()`). Todos ordenam lexicograficamente == cronologicamente, que é o que faz os índices do §5.2 funcionarem.
- **Competência é o mês em que a fatura FECHA.** `billCompetence('2026-07-28', 25) === '2026-08'`. Dia de fechamento/vencimento maior que o tamanho do mês é aparado (fecha 31 ⇒ fecha 28 em fevereiro, 30 em abril). A aritmética de competência (`addMonthsToCompetence`) é feita em inteiros, sem `Date`, para não haver fuso no meio.
- **Relógio injetado, não mockado:** `todayInTeresina(now?)` e `nowIsoUtc(now?)` recebem um `Date` opcional. Os testes passam o instante; mock de `Date` global dentro do workerd é frágil e vaza entre testes do mesmo arquivo.
- **`newId()` é `crypto.randomUUID()`**: toda PK é TEXT porque o binding do D1 devolve INTEGER como `Number` (52 bits) e não há `last_insert_rowid()` confiável entre statements de um `batch()`.
```

- [ ] **Step 12: Commit do `dates.ts`**

Run:

```bash
pnpm exec prettier --write "apps/financas/src/lib/dates*.ts" "apps/financas/CLAUDE.md"
git add apps/financas/src/lib/dates.ts apps/financas/src/lib/dates.test.ts apps/financas/CLAUDE.md
git commit -m "feat(financas): competência de fatura, vencimento e data local de Teresina (UTC-3)"
```

### Task 6: Domínio de contas

**Files:**

- Create: `apps/financas/src/domain/accounts.ts`
- Create: `apps/financas/src/routes/accounts.ts`
- Modify: `apps/financas/src/index.ts` (montar o router sob `/api`)
- Modify: `apps/financas/CLAUDE.md` (seção "Domínio")
- Test: `apps/financas/src/domain/accounts.test.ts`
- Test: `apps/financas/src/routes/accounts.test.ts`

**Interfaces:**

- Consumes:
  - `newId(): string` de `apps/financas/src/lib/ids.ts` (Task 5)
  - `nowIsoUtc(): string` de `apps/financas/src/lib/dates.ts` (Task 5)
  - `okJson<T>(data: T, status?: number): Response` e `errJson(status: number, code: string, message: string): Response` de `apps/financas/src/lib/envelope.ts` (Task 4)
  - o app Hono exportado por `apps/financas/src/index.ts` (Task 4)
  - tabelas `accounts` e `transactions` da migration `migrations/0001_financas_init.sql` (Task 3)
  - `env.DB: D1Database` e `env.TEST_MIGRATIONS: D1Migration[]` do módulo `cloudflare:test`, declarados no `ProvidedEnv` + `vitest.config.ts` da Task 2
- Produces:
  - `export type Scope = 'PJ' | 'PF'`
  - `export type AccountKind = 'checking'|'savings'|'credit_card'|'cash'|'investment'|'benefit'`
  - `export type Account` / `export type NewAccount` (campos exatos abaixo)
  - `export async function createAccount(db: D1Database, input: NewAccount): Promise<Account>`
  - `export async function listAccounts(db: D1Database, opts?: { scope?: Scope; includeArchived?: boolean }): Promise<Account[]>`
  - `export async function accountBalances(db: D1Database): Promise<Array<{ account_id: string; balance_cents: number }>>`
  - `export async function archiveAccount(db: D1Database, id: string): Promise<void>`
  - `export const accountsRoutes` (router Hono com `GET /accounts`, `POST /accounts`, `POST /accounts/:id/archive`), montado em `/api`

---

- [ ] **Step 1: Escrever o teste do domínio de contas**

Criar `apps/financas/src/domain/accounts.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  accountBalances,
  archiveAccount,
  createAccount,
  listAccounts,
} from './accounts'
import { newId } from '../lib/ids'
import { nowIsoUtc } from '../lib/dates'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Lançamento cru: a Task 7 é que cria createTransaction. Aqui só interessa
// que accountBalances some o que existe na tabela.
async function seedTx(account_id: string, amount_cents: number) {
  const now = nowIsoUtc()
  await env.DB.prepare(
    `INSERT INTO transactions
       (id, account_id, amount_cents, currency, purchase_date, description,
        is_business, created_at, updated_at)
     VALUES (?, ?, ?, 'BRL', '2026-07-10', 'seed', 0, ?, ?)`,
  )
    .bind(newId(), account_id, amount_cents, now, now)
    .run()
}

describe('accounts', () => {
  it('cria conta PF com moeda default e sem arquivamento', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Nubank',
      scope: 'PF',
      kind: 'checking',
      institution: 'Nubank',
      opening_balance_cents: 234012,
      opening_date: '2026-07-01',
    })
    expect(acc.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(acc.currency).toBe('BRL')
    expect(acc.archived_at).toBeNull()
    expect(acc.opening_balance_cents).toBe(234012)
    expect(acc.created_at).toBe(acc.updated_at)
  })

  it('cria conta PJ de cartao com fechamento e vencimento', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Inter PJ cartao',
      scope: 'PJ',
      kind: 'credit_card',
      institution: 'Inter',
      closing_day: 25,
      due_day: 5,
      credit_limit_cents: 900000,
    })
    expect(acc.scope).toBe('PJ')
    expect(acc.closing_day).toBe(25)
    expect(acc.due_day).toBe(5)
    expect(acc.credit_limit_cents).toBe(900000)
  })

  it('recusa cartao de credito sem closing_day/due_day antes de tocar o banco', async () => {
    await expect(
      createAccount(env.DB, {
        name: 'Cartao torto',
        scope: 'PF',
        kind: 'credit_card',
      }),
    ).rejects.toThrow('cartao de credito exige closing_day e due_day')

    const { results } = await env.DB.prepare(
      "SELECT id FROM accounts WHERE name = 'Cartao torto'",
    ).all()
    expect(results).toHaveLength(0)
  })

  it('lista filtrando por scope', async () => {
    await createAccount(env.DB, {
      name: 'Inter PF',
      scope: 'PF',
      kind: 'checking',
    })
    await createAccount(env.DB, {
      name: 'Inter PJ',
      scope: 'PJ',
      kind: 'checking',
    })

    const pj = await listAccounts(env.DB, { scope: 'PJ' })
    expect(pj.map((a) => a.name)).toEqual(['Inter PJ'])
  })

  it('conta arquivada some da listagem default e volta com includeArchived', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta velha',
      scope: 'PF',
      kind: 'savings',
    })
    await archiveAccount(env.DB, acc.id)

    const ativas = await listAccounts(env.DB)
    expect(ativas.map((a) => a.id)).not.toContain(acc.id)

    const todas = await listAccounts(env.DB, { includeArchived: true })
    expect(todas.find((a) => a.id === acc.id)?.archived_at).not.toBeNull()
  })

  it('saldo = opening_balance + soma dos lancamentos', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta com movimento',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 100000,
    })
    await seedTx(acc.id, -25000)
    await seedTx(acc.id, -1500)
    await seedTx(acc.id, 40000)

    const saldos = await accountBalances(env.DB)
    expect(saldos.find((s) => s.account_id === acc.id)?.balance_cents).toBe(
      113500,
    )
  })

  it('saldo de conta sem lancamento nenhum e o proprio opening_balance', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta parada',
      scope: 'PF',
      kind: 'cash',
      opening_balance_cents: 5000,
    })
    const saldos = await accountBalances(env.DB)
    expect(saldos.find((s) => s.account_id === acc.id)?.balance_cents).toBe(
      5000,
    )
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas test src/domain/accounts.test.ts`
Esperado: FAIL com `Failed to resolve import "./accounts" from "src/domain/accounts.test.ts"`

- [ ] **Step 3: Implementar o domínio de contas**

Criar `apps/financas/src/domain/accounts.ts`:

```ts
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

export type Scope = 'PJ' | 'PF'

export type AccountKind =
  | 'checking'
  | 'savings'
  | 'credit_card'
  | 'cash'
  | 'investment'
  | 'benefit'

export type Account = {
  id: string
  name: string
  scope: Scope
  kind: AccountKind
  institution: string | null
  currency: string
  closing_day: number | null
  due_day: number | null
  credit_limit_cents: number | null
  opening_balance_cents: number
  opening_date: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type NewAccount = {
  name: string
  scope: Scope
  kind: AccountKind
  institution?: string | null
  currency?: string
  closing_day?: number | null
  due_day?: number | null
  credit_limit_cents?: number | null
  opening_balance_cents?: number
  opening_date?: string | null
}

const COLUMNS = `id, name, scope, kind, institution, currency, closing_day, due_day,
  credit_limit_cents, opening_balance_cents, opening_date, archived_at,
  created_at, updated_at`

export async function createAccount(
  db: D1Database,
  input: NewAccount,
): Promise<Account> {
  // O CHECK do schema barra isto, mas o D1 devolve "CHECK constraint failed",
  // que nao diz ao usuario o que fazer. Validar antes para ter mensagem util.
  if (
    input.kind === 'credit_card' &&
    (input.closing_day == null || input.due_day == null)
  ) {
    throw new RangeError('cartao de credito exige closing_day e due_day')
  }

  const id = newId()
  const now = nowIsoUtc()
  await db
    .prepare(
      `INSERT INTO accounts (${COLUMNS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      input.name,
      input.scope,
      input.kind,
      input.institution ?? null,
      input.currency ?? 'BRL',
      input.closing_day ?? null,
      input.due_day ?? null,
      input.credit_limit_cents ?? null,
      input.opening_balance_cents ?? 0,
      input.opening_date ?? null,
      now,
      now,
    )
    .run()

  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM accounts WHERE id = ?`)
    .bind(id)
    .first<Account>()
  if (!row) throw new Error(`conta ${id} sumiu logo apos o INSERT`)
  return row
}

export async function listAccounts(
  db: D1Database,
  opts: { scope?: Scope; includeArchived?: boolean } = {},
): Promise<Account[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (opts.scope) {
    where.push('scope = ?')
    binds.push(opts.scope)
  }
  if (!opts.includeArchived) where.push('archived_at IS NULL')

  const sql = `SELECT ${COLUMNS} FROM accounts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY scope, name`
  const stmt = db.prepare(sql)
  const res = await (binds.length ? stmt.bind(...binds) : stmt).all<Account>()
  return res.results
}

export async function accountBalances(
  db: D1Database,
): Promise<Array<{ account_id: string; balance_cents: number }>> {
  // UMA query com GROUP BY: no D1 "rows read" conta linha ESCANEADA, entao
  // uma query por conta custaria cota. parent_id IS NULL porque o rateio
  // guarda o valor cheio no pai e repete o mesmo dinheiro nas filhas.
  const res = await db
    .prepare(
      `SELECT a.id AS account_id,
              a.opening_balance_cents + COALESCE(SUM(t.amount_cents), 0) AS balance_cents
         FROM accounts a
         LEFT JOIN transactions t
                ON t.account_id = a.id AND t.parent_id IS NULL
        GROUP BY a.id
        ORDER BY a.name`,
    )
    .all<{ account_id: string; balance_cents: number }>()
  return res.results
}

export async function archiveAccount(
  db: D1Database,
  id: string,
): Promise<void> {
  // Soft delete: conta encerrada nao apaga historico (ON DELETE RESTRICT
  // em transactions.account_id impediria de qualquer forma).
  const now = nowIsoUtc()
  await db
    .prepare(
      'UPDATE accounts SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
    )
    .bind(now, now, id)
    .run()
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas test src/domain/accounts.test.ts`
Esperado: PASS — 7 testes verdes.

- [ ] **Step 5: Escrever o teste das rotas de contas**

Criar `apps/financas/src/routes/accounts.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { accountsRoutes } from './accounts'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

// Monta so o router, sem o middleware do Access: o objetivo aqui e o
// contrato HTTP + envelope, nao a autenticacao (coberta na Task 4).
function app() {
  const hono = new Hono()
  hono.route('/api', accountsRoutes)
  return hono
}

function post(path: string, body: unknown) {
  return app().request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

describe('rotas de contas', () => {
  it('POST /api/accounts devolve 201 com envelope ok', async () => {
    const res = await post('/api/accounts', {
      name: 'Nubank rota',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 1000,
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      ok: boolean
      data: { id: string; name: string }
      notifications: unknown[]
    }
    expect(body.ok).toBe(true)
    expect(body.data.name).toBe('Nubank rota')
    expect(body.notifications).toEqual([])
  })

  it('POST /api/accounts com cartao sem fechamento devolve 422 explicando', async () => {
    const res = await post('/api/accounts', {
      name: 'Cartao rota torto',
      scope: 'PF',
      kind: 'credit_card',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ type: string; code: string; message: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_account')
    expect(body.notifications[0].message).toContain('closing_day')
  })

  it('GET /api/accounts?scope=PJ filtra e devolve balance_cents', async () => {
    await post('/api/accounts', {
      name: 'Inter PJ rota',
      scope: 'PJ',
      kind: 'checking',
      opening_balance_cents: 412000,
    })
    await post('/api/accounts', {
      name: 'Inter PF rota',
      scope: 'PF',
      kind: 'checking',
    })

    const res = await app().request(
      '/api/accounts?scope=PJ',
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ name: string; balance_cents: number }>
    }
    expect(body.data.map((a) => a.name)).toEqual(['Inter PJ rota'])
    expect(body.data[0].balance_cents).toBe(412000)
  })

  it('GET /api/accounts com scope invalido devolve 422', async () => {
    const res = await app().request(
      '/api/accounts?scope=XX',
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      notifications: Array<{ code: string }>
    }
    expect(body.notifications[0].code).toBe('invalid_scope')
  })

  it('POST /api/accounts/:id/archive tira a conta da listagem default', async () => {
    const criada = await post('/api/accounts', {
      name: 'Conta a arquivar',
      scope: 'PF',
      kind: 'savings',
    })
    const { data } = (await criada.json()) as { data: { id: string } }

    const arq = await post(`/api/accounts/${data.id}/archive`, {})
    expect(arq.status).toBe(200)

    const res = await app().request('/api/accounts', {}, { DB: env.DB })
    const body = (await res.json()) as { data: Array<{ id: string }> }
    expect(body.data.map((a) => a.id)).not.toContain(data.id)
  })
})
```

- [ ] **Step 6: Rodar o teste de rotas e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas test src/routes/accounts.test.ts`
Esperado: FAIL com `Failed to resolve import "./accounts" from "src/routes/accounts.test.ts"`

- [ ] **Step 7: Implementar as rotas de contas**

Criar `apps/financas/src/routes/accounts.ts`:

```ts
import { Hono } from 'hono'
import {
  accountBalances,
  archiveAccount,
  createAccount,
  listAccounts,
  type NewAccount,
  type Scope,
} from '../domain/accounts'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

export const accountsRoutes = new Hono<Env>()

accountsRoutes.get('/accounts', async (c) => {
  const scope = c.req.query('scope')
  if (scope !== undefined && scope !== 'PJ' && scope !== 'PF') {
    return errJson(422, 'invalid_scope', "scope aceita apenas 'PJ' ou 'PF'")
  }
  const includeArchived = c.req.query('archived') === '1'

  const [contas, saldos] = await Promise.all([
    listAccounts(c.env.DB, {
      scope: scope as Scope | undefined,
      includeArchived,
    }),
    accountBalances(c.env.DB),
  ])
  const porConta = new Map(saldos.map((s) => [s.account_id, s.balance_cents]))
  return okJson(
    contas.map((a) => ({
      ...a,
      balance_cents: porConta.get(a.id) ?? a.opening_balance_cents,
    })),
  )
})

accountsRoutes.post('/accounts', async (c) => {
  let body: NewAccount
  try {
    body = await c.req.json<NewAccount>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createAccount(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError)
      return errJson(422, 'invalid_account', e.message)
    if (
      e instanceof Error &&
      /SQLITE_CONSTRAINT|constraint failed/i.test(e.message)
    ) {
      return errJson(422, 'constraint_violation', e.message)
    }
    throw e
  }
})

accountsRoutes.post('/accounts/:id/archive', async (c) => {
  const id = c.req.param('id')
  await archiveAccount(c.env.DB, id)
  return okJson({ id, archived: true })
})
```

- [ ] **Step 8: Montar o router no app Hono**

Em `apps/financas/src/index.ts`, adicionar o import junto dos demais imports do topo:

```ts
import { accountsRoutes } from './routes/accounts'
```

e a linha de montagem logo depois da rota `GET /api/health`:

```ts
app.route('/api', accountsRoutes)
```

- [ ] **Step 9: Rodar a suíte inteira e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas test`
Esperado: PASS — os 7 testes de domínio + os 5 de rota, mais os das Tasks 4 e 5.

- [ ] **Step 10: Type-check e formatação**

Run: `pnpm --filter @piluvitu/financas exec tsc --noEmit`
Esperado: sem saída (exit 0).

Run: `pnpm exec prettier --write "apps/financas/src/**/*.ts"`
Esperado: os 4 arquivos listados como `(changed)` ou `(unchanged)`, exit 0.

- [ ] **Step 11: Atualizar o `CLAUDE.md` do workspace**

Em `apps/financas/CLAUDE.md`, acrescentar ao final a seção:

```md
## Domínio

Cada arquivo de `src/domain/` recebe o `D1Database` por parâmetro (nunca lê `env` global) — é o que deixa os testes rodarem contra o D1 do Miniflare sem subir o Worker.

- **`accounts.ts`** — `createAccount` / `listAccounts` / `accountBalances` / `archiveAccount`.
  - `createAccount` valida em TS que `kind='credit_card'` traz `closing_day` e `due_day` e lança `RangeError`. O `CHECK` do schema barra igual, mas a mensagem do D1 ("CHECK constraint failed") não é acionável; a rota transforma o `RangeError` em `422 conta_invalida`.
  - `accountBalances` é **uma** query com `GROUP BY`: `opening_balance_cents + SUM(amount_cents)`, com `LEFT JOIN` (conta sem lançamento devolve o saldo de abertura) e `t.parent_id IS NULL` (rateio guarda o valor cheio no pai e repete nas filhas — somar os dois dobraria o saldo).
  - `archiveAccount` é soft delete (`archived_at`); `listAccounts` esconde arquivadas por padrão e as devolve com `includeArchived: true`.

## Rotas

`src/routes/*.ts` exporta routers Hono montados com `app.route('/api', ...)` em `src/index.ts`. Todas as respostas passam por `okJson`/`errJson` (`src/lib/envelope.ts`). Rotas de contas: `GET /api/accounts` (aceita `?scope=PJ|PF` e `?archived=1`, e devolve cada conta com `balance_cents` anexado), `POST /api/accounts`, `POST /api/accounts/:id/archive`.

Os testes de rota montam um `new Hono()` só com o router, **sem** o middleware do Access, e passam o binding via terceiro argumento de `app.request(path, init, { DB: env.DB })`.
```

- [ ] **Step 12: Commit**

Run:

```bash
git add apps/financas/src/domain/accounts.ts apps/financas/src/domain/accounts.test.ts \
        apps/financas/src/routes/accounts.ts apps/financas/src/routes/accounts.test.ts \
        apps/financas/src/index.ts apps/financas/CLAUDE.md
git commit -m "feat(financas): dominio de contas com saldo derivado e rotas /api/accounts"
```

---

### Task 7: Domínio de transações e transferências

**Files:**

- Create: `apps/financas/src/domain/transactions.ts`
- Create: `apps/financas/src/routes/transactions.ts`
- Modify: `apps/financas/src/index.ts` (montar o router sob `/api`)
- Modify: `apps/financas/CLAUDE.md` (seção "Domínio" e "Rotas")
- Test: `apps/financas/src/domain/transactions.test.ts`
- Test: `apps/financas/src/routes/transactions.test.ts`

**Interfaces:**

- Consumes:
  - `createAccount(db: D1Database, input: NewAccount): Promise<Account>` e `accountBalances(db: D1Database): Promise<Array<{ account_id: string; balance_cents: number }>>` de `../domain/accounts` (Task 6)
  - `billCompetence(purchaseDate: string, closingDay: number): string` e `nowIsoUtc(): string` de `../lib/dates` (Task 5)
  - `newId(): string` de `../lib/ids` (Task 5)
  - `okJson<T>(data: T, status?: number): Response` e `errJson(status: number, code: string, message: string): Response` de `../lib/envelope` (Task 4)
  - tabela `transactions` e view `v_cashflow` da migration `0001_financas_init.sql` (Task 3)
  - `env.DB` / `env.TEST_MIGRATIONS` do módulo `cloudflare:test` (Task 2)
- Produces:
  - `export type Transaction` / `export type NewTransaction` (campos exatos abaixo)
  - `export async function createTransaction(db: D1Database, input: NewTransaction): Promise<Transaction>`
  - `export async function createTransfer(db: D1Database, input: { from_account_id: string; to_account_id: string; amount_cents: number; date: string; description: string }): Promise<{ transfer_id: string; out: Transaction; inbound: Transaction }>`
  - `export async function listTransactions(db: D1Database, opts: { account_id?: string; from?: string; to?: string; limit?: number }): Promise<Transaction[]>`
  - `export const transactionsRoutes` (router Hono com `GET /transactions`, `POST /transactions`, `POST /transfers`), montado em `/api`

---

- [ ] **Step 1: Escrever o teste do domínio de transações**

Criar `apps/financas/src/domain/transactions.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { accountBalances, createAccount } from './accounts'
import {
  createTransaction,
  createTransfer,
  listTransactions,
} from './transactions'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

function contaCorrente(name: string, opening_balance_cents = 0) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'checking',
    opening_balance_cents,
  })
}

function cartao(name: string, closing_day: number) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day,
    due_day: 5,
  })
}

describe('createTransaction', () => {
  it('compra de 28/07 em cartao que fecha dia 25 cai na fatura de agosto', async () => {
    const card = await cartao('Nubank cartao', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -12990,
      purchase_date: '2026-07-28',
      description: 'Steam',
    })
    expect(tx.bill_competence).toBe('2026-08')
    expect(tx.settled_at).toBeNull()
    expect(tx.transfer_id).toBeNull()
  })

  it('compra de 20/07 no mesmo cartao cai na fatura de julho', async () => {
    const card = await cartao('Nubank cartao antes do fechamento', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -4500,
      purchase_date: '2026-07-20',
      description: 'iFood',
    })
    expect(tx.bill_competence).toBe('2026-07')
  })

  it('bill_competence informada no input vence a derivacao', async () => {
    const card = await cartao('Inter cartao', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -5000,
      purchase_date: '2026-07-28',
      description: 'ajuste manual',
      bill_competence: '2026-07',
    })
    expect(tx.bill_competence).toBe('2026-07')
  })

  it('lancamento em conta corrente grava bill_competence NULL', async () => {
    const acc = await contaCorrente('Nubank conta')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -8900,
      purchase_date: '2026-07-28',
      description: 'Padaria',
      settled_at: '2026-07-28',
    })
    expect(tx.bill_competence).toBeNull()
    expect(tx.settled_at).toBe('2026-07-28')
    expect(tx.currency).toBe('BRL')
    expect(tx.is_business).toBe(0)
  })

  it('conta inexistente vira erro com mensagem util', async () => {
    await expect(
      createTransaction(env.DB, {
        account_id: 'nao-existe',
        amount_cents: -100,
        purchase_date: '2026-07-20',
        description: 'x',
      }),
    ).rejects.toThrow('conta nao-existe nao existe')
  })

  it('amount_cents = 0 e barrado pelo CHECK do schema', async () => {
    const acc = await contaCorrente('Conta zero')
    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: 0,
        purchase_date: '2026-07-20',
        description: 'nada aconteceu',
      }),
    ).rejects.toThrow()

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE account_id = ?',
    )
      .bind(acc.id)
      .all()
    expect(results).toHaveLength(0)
  })

  it('moeda estrangeira sem amount_original_cents e barrada pelo CHECK', async () => {
    const acc = await contaCorrente('Conta USD')
    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -12990,
        currency: 'USD',
        purchase_date: '2026-07-20',
        description: 'AWS',
      }),
    ).rejects.toThrow()

    const ok = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -12990,
      currency: 'USD',
      amount_original_cents: -2399,
      fx_rate_ppm: 5415000,
      purchase_date: '2026-07-20',
      description: 'AWS',
    })
    expect(ok.currency).toBe('USD')
    expect(ok.amount_original_cents).toBe(-2399)
    expect(ok.fx_rate_ppm).toBe(5415000)
  })
})

describe('createTransfer', () => {
  it('gera duas linhas com o mesmo transfer_id e soma zero', async () => {
    const de = await contaCorrente('Origem PIX', 500000)
    const para = await contaCorrente('Destino PIX', 0)

    const { transfer_id, out, inbound } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    expect(out.transfer_id).toBe(transfer_id)
    expect(inbound.transfer_id).toBe(transfer_id)
    expect(out.account_id).toBe(de.id)
    expect(inbound.account_id).toBe(para.id)
    expect(out.amount_cents).toBe(-150000)
    expect(inbound.amount_cents).toBe(150000)
    expect(out.amount_cents + inbound.amount_cents).toBe(0)

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE transfer_id = ?',
    )
      .bind(transfer_id)
      .all()
    expect(results).toHaveLength(2)
  })

  it('nao aparece em v_cashflow, enquanto a despesa comum aparece', async () => {
    const de = await contaCorrente('Origem cashflow', 500000)
    const para = await contaCorrente('Destino cashflow', 0)

    const { transfer_id } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })
    await createTransaction(env.DB, {
      account_id: de.id,
      amount_cents: -3000,
      purchase_date: '2026-07-21',
      description: 'Mercado',
      settled_at: '2026-07-21',
    })

    const naTransferencia = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM v_cashflow WHERE transfer_id = ?',
    )
      .bind(transfer_id)
      .first<{ n: number }>()
    expect(naTransferencia?.n).toBe(0)

    const consolidado = await env.DB.prepare(
      'SELECT SUM(amount_cents) AS total FROM v_cashflow WHERE account_id = ?',
    )
      .bind(de.id)
      .first<{ total: number }>()
    expect(consolidado?.total).toBe(-3000)
  })

  it('move o saldo das duas contas sem mexer no consolidado', async () => {
    const de = await contaCorrente('Origem saldo', 500000)
    const para = await contaCorrente('Destino saldo', 100000)

    const antes = await accountBalances(env.DB)
    const consolidadoAntes = antes.reduce((acc, s) => acc + s.balance_cents, 0)

    await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    const depois = await accountBalances(env.DB)
    const porConta = new Map(depois.map((s) => [s.account_id, s.balance_cents]))
    expect(porConta.get(de.id)).toBe(350000)
    expect(porConta.get(para.id)).toBe(250000)
    expect(depois.reduce((acc, s) => acc + s.balance_cents, 0)).toBe(
      consolidadoAntes,
    )
  })

  it('recusa transferencia para a mesma conta e valor nao positivo', async () => {
    const acc = await contaCorrente('Conta unica')
    const outra = await contaCorrente('Conta outra')
    await expect(
      createTransfer(env.DB, {
        from_account_id: acc.id,
        to_account_id: acc.id,
        amount_cents: 1000,
        date: '2026-07-20',
        description: 'loop',
      }),
    ).rejects.toThrow('transferencia exige duas contas diferentes')
    await expect(
      createTransfer(env.DB, {
        from_account_id: acc.id,
        to_account_id: outra.id,
        amount_cents: 0,
        date: '2026-07-20',
        description: 'zero',
      }),
    ).rejects.toThrow('valor da transferencia deve ser positivo')
  })
})

describe('listTransactions', () => {
  it('filtra por conta e por periodo, mais recente primeiro', async () => {
    const acc = await contaCorrente('Extrato')
    const ruido = await contaCorrente('Fora do filtro')

    for (const [date, description] of [
      ['2026-06-30', 'junho'],
      ['2026-07-05', 'julho A'],
      ['2026-07-25', 'julho B'],
    ]) {
      await createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -1000,
        purchase_date: date,
        description,
        settled_at: date,
      })
    }
    await createTransaction(env.DB, {
      account_id: ruido.id,
      amount_cents: -9999,
      purchase_date: '2026-07-10',
      description: 'ruido',
      settled_at: '2026-07-10',
    })

    const rows = await listTransactions(env.DB, {
      account_id: acc.id,
      from: '2026-07-01',
      to: '2026-07-31',
    })
    expect(rows.map((r) => r.description)).toEqual(['julho B', 'julho A'])
  })

  it('respeita o limit', async () => {
    const acc = await contaCorrente('Extrato limitado')
    for (const day of ['01', '02', '03']) {
      await createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -100,
        purchase_date: `2026-07-${day}`,
        description: `dia ${day}`,
        settled_at: `2026-07-${day}`,
      })
    }
    const rows = await listTransactions(env.DB, {
      account_id: acc.id,
      limit: 2,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].description).toBe('dia 03')
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas test src/domain/transactions.test.ts`
Esperado: FAIL com `Failed to resolve import "./transactions" from "src/domain/transactions.test.ts"`

- [ ] **Step 3: Implementar o domínio de transações**

Criar `apps/financas/src/domain/transactions.ts`:

```ts
import { billCompetence, nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

export type Transaction = {
  id: string
  account_id: string
  amount_cents: number
  currency: string
  amount_original_cents: number | null
  fx_rate_ppm: number | null
  purchase_date: string
  bill_competence: string | null
  settled_at: string | null
  description: string
  payee_id: string | null
  category_id: string | null
  is_business: number
  transfer_id: string | null
  parent_id: string | null
  imported_id: string | null
  import_source: string | null
  created_at: string
  updated_at: string
}

export type NewTransaction = {
  account_id: string
  amount_cents: number
  purchase_date: string
  description: string
  bill_competence?: string | null
  settled_at?: string | null
  payee_id?: string | null
  category_id?: string | null
  is_business?: 0 | 1
  currency?: string
  amount_original_cents?: number | null
  fx_rate_ppm?: number | null
  imported_id?: string | null
  import_source?: string | null
}

const TX_COLUMNS = `id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
  purchase_date, bill_competence, settled_at, description, payee_id, category_id,
  is_business, transfer_id, parent_id, imported_id, import_source, created_at, updated_at`

// 19 colunas => 19 bound params por linha. O teto real e ativo do D1 e de
// 100 params POR STATEMENT (medido), entao 1 linha por statement aqui e
// folgado; o multi-row so aparece no plano de parcelas (Task 8).
const TX_VALUES = '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'

const INSERT_TX = `INSERT INTO transactions (${TX_COLUMNS}) VALUES ${TX_VALUES}`

function txBinds(
  id: string,
  input: NewTransaction,
  transfer_id: string | null,
  now: string,
): unknown[] {
  return [
    id,
    input.account_id,
    input.amount_cents,
    input.currency ?? 'BRL',
    input.amount_original_cents ?? null,
    input.fx_rate_ppm ?? null,
    input.purchase_date,
    input.bill_competence ?? null,
    input.settled_at ?? null,
    input.description,
    input.payee_id ?? null,
    input.category_id ?? null,
    input.is_business ?? 0,
    transfer_id,
    null, // parent_id: rateio e da fatia ②
    input.imported_id ?? null,
    input.import_source ?? null,
    now,
    now,
  ]
}

export async function createTransaction(
  db: D1Database,
  input: NewTransaction,
): Promise<Transaction> {
  const account = await db
    .prepare('SELECT kind, closing_day FROM accounts WHERE id = ?')
    .bind(input.account_id)
    .first<{ kind: string; closing_day: number | null }>()
  if (!account) throw new RangeError(`conta ${input.account_id} nao existe`)

  // A regra de fechamento mora na CONTA, nunca no chamador: compra 28/07 num
  // cartao que fecha dia 25 cai na fatura '2026-08'. Fora de credit_card,
  // bill_competence fica NULL — so cartao tem fatura.
  let competence = input.bill_competence ?? null
  if (
    competence === null &&
    account.kind === 'credit_card' &&
    account.closing_day !== null
  ) {
    competence = billCompetence(input.purchase_date, account.closing_day)
  }

  const id = newId()
  const now = nowIsoUtc()
  await db
    .prepare(INSERT_TX)
    .bind(...txBinds(id, { ...input, bill_competence: competence }, null, now))
    .run()

  const row = await db
    .prepare(`SELECT ${TX_COLUMNS} FROM transactions WHERE id = ?`)
    .bind(id)
    .first<Transaction>()
  if (!row) throw new Error(`lancamento ${id} sumiu logo apos o INSERT`)
  return row
}

export async function createTransfer(
  db: D1Database,
  input: {
    from_account_id: string
    to_account_id: string
    amount_cents: number
    date: string
    description: string
  },
): Promise<{ transfer_id: string; out: Transaction; inbound: Transaction }> {
  if (input.amount_cents <= 0)
    throw new RangeError('valor da transferencia deve ser positivo')
  if (input.from_account_id === input.to_account_id) {
    throw new RangeError('transferencia exige duas contas diferentes')
  }

  const transfer_id = newId()
  const now = nowIsoUtc()
  const base = {
    purchase_date: input.date,
    settled_at: input.date,
    description: input.description,
  }

  // UM batch: se a segunda perna falhar, o D1 reverte a primeira (medido) e
  // nao sobra meia transferencia no caixa. bill_competence fica NULL de
  // proposito — transferencia ja nasce liquidada e nao entra em fatura futura.
  const res = await db.batch<Transaction>([
    db.prepare(INSERT_TX).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: input.from_account_id,
          amount_cents: -input.amount_cents,
        },
        transfer_id,
        now,
      ),
    ),
    db.prepare(INSERT_TX).bind(
      ...txBinds(
        newId(),
        {
          ...base,
          account_id: input.to_account_id,
          amount_cents: input.amount_cents,
        },
        transfer_id,
        now,
      ),
    ),
    db
      .prepare(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE transfer_id = ? ORDER BY amount_cents`,
      )
      .bind(transfer_id),
  ])

  // ORDER BY amount_cents: a perna negativa (saida) vem primeiro.
  const [out, inbound] = res[2].results
  return { transfer_id, out, inbound }
}

export async function listTransactions(
  db: D1Database,
  opts: { account_id?: string; from?: string; to?: string; limit?: number },
): Promise<Transaction[]> {
  const where: string[] = []
  const binds: unknown[] = []
  if (opts.account_id) {
    where.push('account_id = ?')
    binds.push(opts.account_id)
  }
  if (opts.from) {
    where.push('purchase_date >= ?')
    binds.push(opts.from)
  }
  if (opts.to) {
    where.push('purchase_date <= ?')
    binds.push(opts.to)
  }
  // LIMIT sempre presente: no D1 "rows read" conta linha ESCANEADA, e uma
  // listagem sem teto vira cota queimada.
  const limit = Math.min(opts.limit ?? 200, 500)

  const sql = `SELECT ${TX_COLUMNS} FROM transactions
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY purchase_date DESC, created_at DESC
    LIMIT ?`
  const res = await db
    .prepare(sql)
    .bind(...binds, limit)
    .all<Transaction>()
  return res.results
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas test src/domain/transactions.test.ts`
Esperado: PASS — 13 testes verdes.

- [ ] **Step 5: Escrever o teste das rotas de lançamentos**

Criar `apps/financas/src/routes/transactions.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import { createAccount } from '../domain/accounts'
import { transactionsRoutes } from './transactions'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

function app() {
  const hono = new Hono()
  hono.route('/api', transactionsRoutes)
  return hono
}

function post(path: string, body: unknown) {
  return app().request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

describe('rotas de lancamentos', () => {
  it('POST /api/transactions em cartao devolve 201 com a competencia derivada', async () => {
    const card = await createAccount(env.DB, {
      name: 'Cartao rota',
      scope: 'PF',
      kind: 'credit_card',
      closing_day: 25,
      due_day: 5,
    })
    const res = await post('/api/transactions', {
      account_id: card.id,
      amount_cents: -12990,
      purchase_date: '2026-07-28',
      description: 'Steam',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      ok: boolean
      data: { bill_competence: string }
    }
    expect(body.ok).toBe(true)
    expect(body.data.bill_competence).toBe('2026-08')
  })

  it('POST /api/transactions com amount_cents = 0 devolve 422 em vez de 500', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota zero',
      scope: 'PF',
      kind: 'checking',
    })
    const res = await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: 0,
      purchase_date: '2026-07-28',
      description: 'nada',
    })
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      ok: boolean
      notifications: Array<{ type: string; code: string }>
    }
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('constraint_violation')
    expect(body.notifications[0].type).toBe('error')
  })

  it('POST /api/transfers devolve as duas pernas com o mesmo transfer_id', async () => {
    const de = await createAccount(env.DB, {
      name: 'Origem rota',
      scope: 'PF',
      kind: 'checking',
      opening_balance_cents: 500000,
    })
    const para = await createAccount(env.DB, {
      name: 'Destino rota',
      scope: 'PF',
      kind: 'checking',
    })
    const res = await post('/api/transfers', {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      data: {
        transfer_id: string
        out: { amount_cents: number; transfer_id: string }
        inbound: { amount_cents: number; transfer_id: string }
      }
    }
    expect(body.data.out.amount_cents).toBe(-150000)
    expect(body.data.inbound.amount_cents).toBe(150000)
    expect(body.data.out.transfer_id).toBe(body.data.transfer_id)
    expect(body.data.inbound.transfer_id).toBe(body.data.transfer_id)
  })

  it('GET /api/transactions filtra por account_id e periodo', async () => {
    const acc = await createAccount(env.DB, {
      name: 'Conta rota extrato',
      scope: 'PF',
      kind: 'checking',
    })
    await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-06-30',
      description: 'junho',
      settled_at: '2026-06-30',
    })
    await post('/api/transactions', {
      account_id: acc.id,
      amount_cents: -2000,
      purchase_date: '2026-07-15',
      description: 'julho',
      settled_at: '2026-07-15',
    })

    const res = await app().request(
      `/api/transactions?account_id=${acc.id}&from=2026-07-01&to=2026-07-31`,
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<{ description: string }> }
    expect(body.data.map((t) => t.description)).toEqual(['julho'])
  })

  it('GET /api/transactions com limit invalido devolve 422', async () => {
    const res = await app().request(
      '/api/transactions?limit=abc',
      {},
      { DB: env.DB },
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      notifications: Array<{ code: string }>
    }
    expect(body.notifications[0].code).toBe('invalid_limit')
  })
})
```

- [ ] **Step 6: Rodar o teste de rotas e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas test src/routes/transactions.test.ts`
Esperado: FAIL com `Failed to resolve import "./transactions" from "src/routes/transactions.test.ts"`

- [ ] **Step 7: Implementar as rotas de lançamentos**

Criar `apps/financas/src/routes/transactions.ts`:

```ts
import { Hono } from 'hono'
import {
  createTransaction,
  createTransfer,
  listTransactions,
  type NewTransaction,
} from '../domain/transactions'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

type NewTransfer = {
  from_account_id: string
  to_account_id: string
  amount_cents: number
  date: string
  description: string
}

// CHECK/FK do schema (amount_cents <> 0, moeda sem valor original) chegam como
// D1_ERROR. Sao erro do usuario, nao do servidor: viram 422, nunca 500.
function isConstraint(e: unknown): e is Error {
  return (
    e instanceof Error && /SQLITE_CONSTRAINT|constraint failed/i.test(e.message)
  )
}

export const transactionsRoutes = new Hono<Env>()

transactionsRoutes.get('/transactions', async (c) => {
  const limitRaw = c.req.query('limit')
  const limit = limitRaw === undefined ? undefined : Number(limitRaw)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return errJson(422, 'invalid_limit', 'limit deve ser um inteiro >= 1')
  }
  const rows = await listTransactions(c.env.DB, {
    account_id: c.req.query('account_id'),
    from: c.req.query('from'),
    to: c.req.query('to'),
    limit,
  })
  return okJson(rows)
})

transactionsRoutes.post('/transactions', async (c) => {
  let body: NewTransaction
  try {
    body = await c.req.json<NewTransaction>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createTransaction(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError) return errJson(422, 'invalid_entry', e.message)
    if (isConstraint(e)) return errJson(422, 'constraint_violation', e.message)
    throw e
  }
})

transactionsRoutes.post('/transfers', async (c) => {
  let body: NewTransfer
  try {
    body = await c.req.json<NewTransfer>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  try {
    return okJson(await createTransfer(c.env.DB, body), 201)
  } catch (e) {
    if (e instanceof RangeError)
      return errJson(422, 'invalid_transfer', e.message)
    if (isConstraint(e)) return errJson(422, 'constraint_violation', e.message)
    throw e
  }
})
```

- [ ] **Step 8: Montar o router no app Hono**

Em `apps/financas/src/index.ts`, adicionar o import junto dos demais imports do topo:

```ts
import { transactionsRoutes } from './routes/transactions'
```

e a linha de montagem logo depois de `app.route('/api', accountsRoutes)`:

```ts
app.route('/api', transactionsRoutes)
```

- [ ] **Step 9: Rodar a suíte inteira e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas test`
Esperado: PASS — os 13 testes de domínio + os 5 de rota desta task, mais tudo das Tasks 4 a 6.

- [ ] **Step 10: Type-check e formatação**

Run: `pnpm --filter @piluvitu/financas exec tsc --noEmit`
Esperado: sem saída (exit 0).

Run: `pnpm exec prettier --write "apps/financas/src/**/*.ts"`
Esperado: exit 0.

- [ ] **Step 11: Atualizar o `CLAUDE.md` do workspace**

Em `apps/financas/CLAUDE.md`, acrescentar na seção **Domínio** (depois do item `accounts.ts`):

```md
- **`transactions.ts`** — `createTransaction` / `createTransfer` / `listTransactions`. O livro-caixa é uma tabela só; os relatórios se separam por filtro, não por tabela.
  - `createTransaction` lê `kind` e `closing_day` da conta e **deriva** `bill_competence` via `billCompetence(purchase_date, closing_day)` quando a conta é `credit_card` e o input não trouxe competência. Conta que não é cartão grava `NULL` — só cartão tem fatura. Competência informada explicitamente vence a derivação.
  - `createTransfer` é o mecanismo anti-dupla-contagem nº 1: **duas** linhas (saída negativa na origem, entrada positiva no destino) com o **mesmo `transfer_id`**, num único `db.batch()` — se a segunda perna falhar, o D1 reverte a primeira e não sobra meia transferência. As duas nascem com `settled_at` preenchido e `bill_competence` NULL. `v_cashflow` filtra `transfer_id IS NULL`, então o consolidado ignora a transferência enquanto o saldo de cada conta reflete os dois lados.
  - `listTransactions` sempre aplica `LIMIT` (default 200, teto 500): no D1 "rows read" conta linha **escaneada**, e listagem sem teto queima cota.
  - Valor 0 e moeda ≠ BRL sem `amount_original_cents`/`fx_rate_ppm` são barrados pelos `CHECK` do schema, de propósito — a rota traduz o `D1_ERROR` em `422`, nunca `500`.
```

E na seção **Rotas**, acrescentar ao final:

```md
Rotas de lançamentos: `GET /api/transactions` (`?account_id=`, `?from=`, `?to=`, `?limit=`), `POST /api/transactions`, `POST /api/transfers`. Erros de `CHECK`/`FOREIGN KEY` do D1 são reconhecidos por `/SQLITE_CONSTRAINT|constraint failed/i` e viram `422`; `RangeError` do domínio vira `422` com código próprio.
```

- [ ] **Step 12: Commit**

Run:

```bash
git add apps/financas/src/domain/transactions.ts apps/financas/src/domain/transactions.test.ts \
        apps/financas/src/routes/transactions.ts apps/financas/src/routes/transactions.test.ts \
        apps/financas/src/index.ts apps/financas/CLAUDE.md
git commit -m "feat(financas): lancamentos com competencia de fatura derivada e transferencia em batch"
```

---

### Task 8: Parcelamento de cartão

**Files:**

- Create: `apps/financas/src/domain/installments.ts`
- Create: `apps/financas/src/domain/installments.test.ts`
- Create: `apps/financas/src/routes/installments.ts`
- Create: `apps/financas/src/routes/installments.test.ts`
- Modify: `apps/financas/src/index.ts`
- Modify: `apps/financas/CLAUDE.md`
- Test: `apps/financas/src/domain/installments.test.ts`, `apps/financas/src/routes/installments.test.ts`

**Interfaces:**

- Consumes:
  - `@piluvitu/tools/money` → `splitInstallments(total: Cents, count: number): Cents[]` (resto nas PRIMEIRAS)
  - `../lib/ids` → `newId(): string`
  - `../lib/dates` → `nowIsoUtc(): string`, `billCompetence(purchaseDate: string, closingDay: number): string`, `addMonthsToCompetence(competence: string, n: number): string`, `competenceDueDate(competence: string, dueDay: number): string`
  - `../lib/envelope` → `okJson<T>(data: T, status?: number): Response`, `errJson(status: number, code: string, message: string): Response`
  - `../index` → `type Bindings` (contém `DB: D1Database`)
  - migration `0001` já aplicada pelo setup do `vitest-pool-workers` (tabelas `accounts`, `transactions`, `installment_plans`, `installments`)
- Produces:
  - `createInstallmentPlan(db: D1Database, input: NewInstallmentPlan): Promise<{ plan: InstallmentPlan; installments: Installment[] }>`
  - `class InstallmentPlanError extends Error { readonly code: string }`
  - `type NewInstallmentPlan = { account_id: string; description: string; total_cents: number; installments_count: number; purchase_date: string; payee_id?: string | null; category_id?: string | null; is_business?: boolean }`
  - `type InstallmentPlan = { id, account_id, payee_id, category_id, description, total_cents, installments_count, purchase_date, first_competence, is_business, canceled_at, created_at, updated_at }`
  - `type Installment = { id: string; plan_id: string; seq: number; due_date: string; transaction_id: string }`
  - `export const installmentPlansRoutes = new Hono<AppEnv>()` montado em `POST /api/installment-plans`

---

- [ ] **Step 1: Escrever o teste de domínio (RED)**

Criar `apps/financas/src/domain/installments.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInstallmentPlan, InstallmentPlanError } from './installments'

async function seedAccount(
  id: string,
  kind: 'credit_card' | 'checking',
  closingDay: number | null,
  dueDay: number | null,
) {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'Nubank', 'BRL', ?, ?, NULL, 0, NULL, NULL,
       '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
  )
    .bind(id, `conta ${id}`, kind, closingDay, dueDay)
    .run()
  return id
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM installments'),
    env.DB.prepare('DELETE FROM installment_plans'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
  ])
})

describe('createInstallmentPlan', () => {
  it('plano de 10x gera 10 parcelas e 10 transactions com settled_at NULL', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const { plan, installments } = await createInstallmentPlan(env.DB, {
      account_id: accountId,
      description: 'Geladeira',
      total_cents: 250000,
      installments_count: 10,
      purchase_date: '2026-07-28',
    })

    expect(plan.installments_count).toBe(10)
    expect(plan.first_competence).toBe('2026-08')
    expect(installments).toHaveLength(10)
    expect(installments.map((i) => i.seq)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])

    const rows = await env.DB.prepare(
      `SELECT t.settled_at, t.bill_competence, t.amount_cents
         FROM installments i JOIN transactions t ON t.id = i.transaction_id
        WHERE i.plan_id = ? ORDER BY i.seq`,
    )
      .bind(plan.id)
      .all<{
        settled_at: string | null
        bill_competence: string
        amount_cents: number
      }>()

    expect(rows.results).toHaveLength(10)
    expect(rows.results.every((r) => r.settled_at === null)).toBe(true)
    expect(rows.results.every((r) => r.amount_cents < 0)).toBe(true)
    expect(rows.results[0].bill_competence).toBe('2026-08')
  })

  it('SUM das parcelas fecha no último centavo: R$ 100 em 3x = 3334+3333+3333', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const { plan } = await createInstallmentPlan(env.DB, {
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })

    const rows = await env.DB.prepare(
      `SELECT t.amount_cents FROM installments i
         JOIN transactions t ON t.id = i.transaction_id
        WHERE i.plan_id = ? ORDER BY i.seq`,
    )
      .bind(plan.id)
      .all<{ amount_cents: number }>()

    expect(rows.results.map((r) => r.amount_cents)).toEqual([
      -3334, -3333, -3333,
    ])

    const total = await env.DB.prepare(
      `SELECT SUM(-t.amount_cents) AS total FROM installments i
         JOIN transactions t ON t.id = i.transaction_id WHERE i.plan_id = ?`,
    )
      .bind(plan.id)
      .first<{ total: number }>()

    expect(total?.total).toBe(10000)
  })

  it('competências consecutivas viram o ano: 12x em novembro/2026 termina em outubro/2027', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const { plan, installments } = await createInstallmentPlan(env.DB, {
      account_id: accountId,
      description: 'Notebook',
      total_cents: 120000,
      installments_count: 12,
      purchase_date: '2026-11-20',
    })

    expect(plan.first_competence).toBe('2026-11')
    expect(installments[0].due_date).toBe('2026-11-05')
    expect(installments[11].due_date).toBe('2027-10-05')

    const comps = await env.DB.prepare(
      `SELECT t.bill_competence AS c FROM installments i
         JOIN transactions t ON t.id = i.transaction_id
        WHERE i.plan_id = ? ORDER BY i.seq`,
    )
      .bind(plan.id)
      .all<{ c: string }>()

    expect(comps.results.map((r) => r.c)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
      '2027-05',
      '2027-06',
      '2027-07',
      '2027-08',
      '2027-09',
      '2027-10',
    ])
  })

  it('plano de 60x roda num único batch de 16 statements (regressão do multi-row)', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)

    const batchSizes: number[] = []
    const spyDb = new Proxy(env.DB, {
      get(target, prop, receiver) {
        if (prop === 'batch') {
          return (statements: D1PreparedStatement[]) => {
            batchSizes.push(statements.length)
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as D1Database

    const { plan } = await createInstallmentPlan(spyDb, {
      account_id: accountId,
      description: 'Cirurgia do gato',
      total_cents: 600000,
      installments_count: 60,
      purchase_date: '2026-07-10',
    })

    // 1 plano + ceil(60/5) transactions + ceil(60/20) installments = 1 + 12 + 3
    expect(batchSizes).toEqual([16])

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM installments WHERE plan_id = ?',
    )
      .bind(plan.id)
      .first<{ n: number }>()
    expect(count?.n).toBe(60)
  })

  it('recusa conta que não é credit_card', async () => {
    const accountId = await seedAccount('acc-ck', 'checking', null, null)

    await expect(
      createInstallmentPlan(env.DB, {
        account_id: accountId,
        description: 'Geladeira',
        total_cents: 10000,
        installments_count: 3,
        purchase_date: '2026-07-10',
      }),
    ).rejects.toMatchObject({ code: 'invalid_account' })
  })

  it('recusa installments_count fora de 1..360', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)
    const base = {
      account_id: accountId,
      description: 'Geladeira',
      total_cents: 10000,
      purchase_date: '2026-07-10',
    }

    await expect(
      createInstallmentPlan(env.DB, { ...base, installments_count: 0 }),
    ).rejects.toBeInstanceOf(InstallmentPlanError)
    await expect(
      createInstallmentPlan(env.DB, { ...base, installments_count: 361 }),
    ).rejects.toMatchObject({ code: 'constraint_violation' })

    const orphans = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions',
    ).first<{
      n: number
    }>()
    expect(orphans?.n).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/installments.test.ts`
Esperado: FAIL com "Failed to resolve import "./installments" from "src/domain/installments.test.ts"".

- [ ] **Step 3: Implementar `createInstallmentPlan` com o batch multi-row**

Criar `apps/financas/src/domain/installments.ts`:

```ts
import { splitInstallments } from '@piluvitu/tools/money'
import {
  addMonthsToCompetence,
  billCompetence,
  competenceDueDate,
  nowIsoUtc,
} from '../lib/dates'
import { newId } from '../lib/ids'

export type NewInstallmentPlan = {
  account_id: string
  description: string
  total_cents: number
  installments_count: number
  purchase_date: string
  payee_id?: string | null
  category_id?: string | null
  is_business?: boolean
}

export type InstallmentPlan = {
  id: string
  account_id: string
  payee_id: string | null
  category_id: string | null
  description: string
  total_cents: number
  installments_count: number
  purchase_date: string
  first_competence: string
  is_business: number
  canceled_at: string | null
  created_at: string
  updated_at: string
}

/** created_at fica só no banco (gerado por strftime no INSERT) — ver orçamento de params abaixo. */
export type Installment = {
  id: string
  plan_id: string
  seq: number
  due_date: string
  transaction_id: string
}

export class InstallmentPlanError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'InstallmentPlanError'
    this.code = code
  }
}

type AccountRow = {
  id: string
  kind: string
  currency: string
  closing_day: number | null
  due_day: number | null
}

// ---------------------------------------------------------------------------
// ORÇAMENTO DE BOUND PARAMS — teto real e ativo do D1: 100 params por statement.
//
//   transactions      : 19 colunas  -> floor(100/19) =  5 linhas/statement (95 params)
//                                      6 linhas dariam 114 params => estouraria
//   installments      :  5 colunas  -> floor(100/5)  = 20 linhas/statement (100 params,
//                                      teto exato). created_at NÃO é bound: sai de
//                                      strftime() no próprio SQL, o que é o que mantém
//                                      a linha em 5 colunas em vez de 6.
//
// Plano de 60x = 1 (plano) + ceil(60/5)=12 (transactions) + ceil(60/20)=3 (installments)
//              = 16 statements num ÚNICO batch(), que faz rollback real (spike S3).
// ---------------------------------------------------------------------------
const TX_COLUMNS = [
  'id',
  'account_id',
  'amount_cents',
  'currency',
  'amount_original_cents',
  'fx_rate_ppm',
  'purchase_date',
  'bill_competence',
  'settled_at',
  'description',
  'payee_id',
  'category_id',
  'is_business',
  'transfer_id',
  'parent_id',
  'imported_id',
  'import_source',
  'created_at',
  'updated_at',
] as const

const PLAN_COLUMNS = [
  'id',
  'account_id',
  'payee_id',
  'category_id',
  'description',
  'total_cents',
  'installments_count',
  'purchase_date',
  'first_competence',
  'is_business',
  'canceled_at',
  'created_at',
  'updated_at',
] as const

const INSTALLMENT_BOUND_COLUMNS = [
  'id',
  'plan_id',
  'seq',
  'due_date',
  'transaction_id',
] as const

const MAX_BOUND_PARAMS = 100
const TX_ROWS_PER_STATEMENT = Math.floor(MAX_BOUND_PARAMS / TX_COLUMNS.length) // 5
const INSTALLMENT_ROWS_PER_STATEMENT = Math.floor(
  MAX_BOUND_PARAMS / INSTALLMENT_BOUND_COLUMNS.length,
) // 20

const TX_TUPLE = `(${TX_COLUMNS.map(() => '?').join(', ')})`
const INSTALLMENT_TUPLE =
  "(?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

function transactionStatements(
  db: D1Database,
  rows: unknown[][],
): D1PreparedStatement[] {
  const head = `INSERT INTO transactions (${TX_COLUMNS.join(', ')}) VALUES `
  return chunk(rows, TX_ROWS_PER_STATEMENT).map((group) =>
    db
      .prepare(head + group.map(() => TX_TUPLE).join(', '))
      .bind(...group.flat()),
  )
}

function installmentStatements(
  db: D1Database,
  rows: unknown[][],
): D1PreparedStatement[] {
  const head = `INSERT INTO installments (${INSTALLMENT_BOUND_COLUMNS.join(', ')}, created_at) VALUES `
  return chunk(rows, INSTALLMENT_ROWS_PER_STATEMENT).map((group) =>
    db
      .prepare(head + group.map(() => INSTALLMENT_TUPLE).join(', '))
      .bind(...group.flat()),
  )
}

export async function createInstallmentPlan(
  db: D1Database,
  input: NewInstallmentPlan,
): Promise<{ plan: InstallmentPlan; installments: Installment[] }> {
  const count = input.installments_count
  if (!Number.isInteger(count) || count < 1 || count > 360) {
    throw new InstallmentPlanError(
      'constraint_violation',
      'installments_count deve ser inteiro entre 1 e 360',
    )
  }
  if (!Number.isInteger(input.total_cents) || input.total_cents <= 0) {
    throw new InstallmentPlanError(
      'constraint_violation',
      'total_cents deve ser inteiro positivo em centavos',
    )
  }

  const account = await db
    .prepare(
      `SELECT id, kind, currency, closing_day, due_day
         FROM accounts WHERE id = ? AND archived_at IS NULL`,
    )
    .bind(input.account_id)
    .first<AccountRow>()

  if (!account) {
    throw new InstallmentPlanError(
      'invalid_account',
      'conta não encontrada ou arquivada',
    )
  }
  if (account.kind !== 'credit_card') {
    throw new InstallmentPlanError(
      'invalid_account',
      'parcelamento exige uma conta do tipo credit_card',
    )
  }
  if (account.closing_day === null || account.due_day === null) {
    throw new InstallmentPlanError(
      'invalid_account',
      'cartão sem closing_day/due_day não calcula competência',
    )
  }
  if (account.currency !== 'BRL') {
    throw new InstallmentPlanError(
      'constraint_violation',
      'parcelamento só suporta contas em BRL',
    )
  }

  const now = nowIsoUtc()
  const planId = newId()
  const firstCompetence = billCompetence(
    input.purchase_date,
    account.closing_day,
  )
  const isBusiness = input.is_business === true ? 1 : 0
  const payeeId = input.payee_id ?? null
  const categoryId = input.category_id ?? null
  const amounts = splitInstallments(input.total_cents, count)

  const plan: InstallmentPlan = {
    id: planId,
    account_id: account.id,
    payee_id: payeeId,
    category_id: categoryId,
    description: input.description,
    total_cents: input.total_cents,
    installments_count: count,
    purchase_date: input.purchase_date,
    first_competence: firstCompetence,
    is_business: isBusiness,
    canceled_at: null,
    created_at: now,
    updated_at: now,
  }

  const installments: Installment[] = []
  const txRows: unknown[][] = []
  const installmentRows: unknown[][] = []

  for (let i = 0; i < count; i++) {
    const seq = i + 1
    const competence = addMonthsToCompetence(firstCompetence, i)
    const dueDate = competenceDueDate(competence, account.due_day)
    const transactionId = newId()
    const installmentId = newId()

    txRows.push([
      transactionId,
      account.id,
      -amounts[i], // saída: valor com sinal negativo
      'BRL',
      null, // amount_original_cents
      null, // fx_rate_ppm
      input.purchase_date,
      competence, // bill_competence
      null, // settled_at: parcela é PREVISTA até a fatura ser paga
      `${input.description} (${seq}/${count})`,
      payeeId,
      categoryId,
      isBusiness,
      null, // transfer_id
      null, // parent_id
      null, // imported_id
      'manual', // import_source
      now,
      now,
    ])

    installmentRows.push([installmentId, planId, seq, dueDate, transactionId])
    installments.push({
      id: installmentId,
      plan_id: planId,
      seq,
      due_date: dueDate,
      transaction_id: transactionId,
    })
  }

  const planStatement = db
    .prepare(
      `INSERT INTO installment_plans (${PLAN_COLUMNS.join(', ')})
       VALUES (${PLAN_COLUMNS.map(() => '?').join(', ')})`,
    )
    .bind(
      plan.id,
      plan.account_id,
      plan.payee_id,
      plan.category_id,
      plan.description,
      plan.total_cents,
      plan.installments_count,
      plan.purchase_date,
      plan.first_competence,
      plan.is_business,
      plan.canceled_at,
      plan.created_at,
      plan.updated_at,
    )

  // UM único batch: rollback real se qualquer statement abortar (spike S3).
  await db.batch([
    planStatement,
    ...transactionStatements(db, txRows),
    ...installmentStatements(db, installmentRows),
  ])

  return { plan, installments }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/installments.test.ts`
Esperado: PASS — 6 testes verdes, incluindo `batchSizes` igual a `[16]`.

- [ ] **Step 5: Escrever o teste da rota (RED)**

Criar `apps/financas/src/routes/installments.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { installmentPlansRoutes } from './installments'

async function seedAccount(id: string, kind: 'credit_card' | 'checking') {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'Nubank', 'BRL', ?, ?, NULL, 0, NULL, NULL,
       '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
  )
    .bind(
      id,
      `conta ${id}`,
      kind,
      kind === 'credit_card' ? 25 : null,
      kind === 'credit_card' ? 5 : null,
    )
    .run()
  return id
}

function post(body: unknown) {
  return installmentPlansRoutes.request(
    '/',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    { DB: env.DB },
  )
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM installments'),
    env.DB.prepare('DELETE FROM installment_plans'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
  ])
})

describe('POST /api/installment-plans', () => {
  it('cria o plano e devolve envelope ok com as parcelas', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card')

    const res = await post({
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })
    const body = (await res.json()) as {
      ok: boolean
      data: {
        plan: { first_competence: string }
        installments: unknown[]
      } | null
      notifications: unknown[]
    }

    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data?.installments).toHaveLength(3)
    expect(body.data?.plan.first_competence).toBe('2026-07')
  })

  it('recusa conta que não é credit_card com 422 invalid_account', async () => {
    const accountId = await seedAccount('acc-ck', 'checking')

    const res = await post({
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 3,
      purchase_date: '2026-07-10',
    })
    const body = (await res.json()) as {
      ok: boolean
      notifications: { type: string; code?: string }[]
    }

    expect(res.status).toBe(422)
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_account')
    expect(body.notifications[0].type).toBe('error')
  })

  it('recusa installments_count fora de 1..360 com 422 constraint_violation', async () => {
    const accountId = await seedAccount('acc-cc', 'credit_card')

    const res = await post({
      account_id: accountId,
      description: 'Fone',
      total_cents: 10000,
      installments_count: 361,
      purchase_date: '2026-07-10',
    })
    const body = (await res.json()) as { notifications: { code?: string }[] }

    expect(res.status).toBe(422)
    expect(body.notifications[0].code).toBe('constraint_violation')
  })

  it('recusa corpo malformado com 400 invalid_json', async () => {
    const res = await post('{ isso nao e json')
    const body = (await res.json()) as { notifications: { code?: string }[] }

    expect(res.status).toBe(400)
    expect(body.notifications[0].code).toBe('invalid_json')
  })
})
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/installments.test.ts`
Esperado: FAIL com "Failed to resolve import "./installments" from "src/routes/installments.test.ts"".

- [ ] **Step 7: Implementar a rota**

Criar `apps/financas/src/routes/installments.ts`:

```ts
import { Hono } from 'hono'
import {
  createInstallmentPlan,
  InstallmentPlanError,
} from '../domain/installments'
import { errJson, okJson } from '../lib/envelope'
import type { Bindings } from '../index'

type AppEnv = { Bindings: Bindings }

type Body = {
  account_id?: unknown
  description?: unknown
  total_cents?: unknown
  installments_count?: unknown
  purchase_date?: unknown
  payee_id?: unknown
  category_id?: unknown
  is_business?: unknown
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const installmentPlansRoutes = new Hono<AppEnv>()

installmentPlansRoutes.post('/', async (c) => {
  let body: Body
  try {
    body = (await c.req.json()) as Body
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisição não é JSON válido')
  }

  if (typeof body?.account_id !== 'string' || body.account_id === '') {
    return errJson(400, 'invalid_json', 'account_id é obrigatório')
  }
  if (typeof body.description !== 'string' || body.description.trim() === '') {
    return errJson(400, 'invalid_json', 'description é obrigatória')
  }
  if (
    typeof body.total_cents !== 'number' ||
    !Number.isInteger(body.total_cents)
  ) {
    return errJson(
      400,
      'invalid_json',
      'total_cents deve ser inteiro em centavos',
    )
  }
  if (
    typeof body.installments_count !== 'number' ||
    !Number.isInteger(body.installments_count)
  ) {
    return errJson(400, 'invalid_json', 'installments_count deve ser inteiro')
  }
  if (
    typeof body.purchase_date !== 'string' ||
    !DATE_RE.test(body.purchase_date)
  ) {
    return errJson(
      400,
      'invalid_json',
      'purchase_date deve estar no formato YYYY-MM-DD',
    )
  }

  try {
    const result = await createInstallmentPlan(c.env.DB, {
      account_id: body.account_id,
      description: body.description,
      total_cents: body.total_cents,
      installments_count: body.installments_count,
      purchase_date: body.purchase_date,
      payee_id: typeof body.payee_id === 'string' ? body.payee_id : null,
      category_id:
        typeof body.category_id === 'string' ? body.category_id : null,
      is_business: body.is_business === true,
    })
    return okJson(result, 201)
  } catch (err) {
    if (err instanceof InstallmentPlanError) {
      return errJson(422, err.code, err.message)
    }
    return errJson(
      422,
      'constraint_violation',
      err instanceof Error
        ? err.message
        : 'falha ao criar o plano de parcelamento',
    )
  }
})
```

- [ ] **Step 8: Montar a rota ACIMA do catch-all em `src/index.ts`**

Adicionar o import junto aos outros imports de rota e registrar `app.route(...)` **antes** da linha `// SEMPRE POR ULTIMO` (rota registrada depois do `app.all('/api/*', ...)` fica inalcançável no Hono):

```ts
import { installmentPlansRoutes } from './routes/installments'

// ...

app.route('/api/installment-plans', installmentPlansRoutes)

// SEMPRE POR ULTIMO
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', (c) => errJson(404, 'not_found', 'rota não encontrada'))
```

- [ ] **Step 9: Rodar os dois arquivos e confirmar que passam**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/installments.test.ts src/routes/installments.test.ts`
Esperado: PASS — 10 testes verdes (6 de domínio, 4 de rota).

- [ ] **Step 10: Suíte inteira + typecheck + lint**

Run: `pnpm --filter @piluvitu/financas exec vitest run && pnpm --filter @piluvitu/financas exec tsc --noEmit && pnpm lint`
Esperado: PASS em tudo, 0 erro de tipo e 0 erro de ESLint.

- [ ] **Step 11: Documentar em `apps/financas/CLAUDE.md`**

Acrescentar a seção abaixo ao **final** do arquivo já existente (não recriar o arquivo):

```markdown
## Parcelamento de cartão

`POST /api/installment-plans` → `src/routes/installments.ts` (`installmentPlansRoutes`, montado acima do catch-all) → `createInstallmentPlan` em `src/domain/installments.ts`.

**Cada parcela materializa uma `transaction`** com `settled_at NULL` e `bill_competence` preenchida — parcela é _prevista_ até a fatura ser paga. `installments` guarda só o cronograma (`seq`, `due_date`, `transaction_id`).

- `first_competence` = `billCompetence(purchase_date, account.closing_day)`
- competência da parcela _i_ = `addMonthsToCompetence(first_competence, i)`
- `due_date` da parcela _i_ = `competenceDueDate(<competência>, account.due_day)`
- valores = `splitInstallments(total_cents, count)` do `@piluvitu/tools/money` (resto nas **primeiras**: R$ 100 em 3x = 3334+3333+3333); gravados com **sinal negativo** em `transactions.amount_cents`

**Um único `db.batch()`** (rollback real, spike S3), dimensionado pelo teto de **100 bound params por statement**:

| Tabela              | Colunas bound | Linhas/statement    |
| ------------------- | ------------- | ------------------- |
| `installment_plans` | 13            | 1 (statement único) |
| `transactions`      | 19            | **5** (95 params)   |
| `installments`      | 5             | **20** (100 params) |

`installments.created_at` **não é bound**: sai de `strftime('%Y-%m-%dT%H:%M:%fZ','now')` no próprio SQL — é o que mantém a linha em 5 colunas em vez de 6. Consequência: o payload de criação devolve `Installment` sem `created_at`.

Plano de 60x = 1 + 12 + 3 = **16 statements** num batch só (coberto por teste de regressão que espia `db.batch`).

**Recusas** (`InstallmentPlanError` → 422): conta inexistente/arquivada, conta com `kind <> 'credit_card'`, cartão sem `closing_day`/`due_day` → `invalid_account`; `installments_count` fora de 1..360, `total_cents <= 0`, conta não-BRL → `constraint_violation`. Corpo malformado ou campo faltando → **400** `invalid_json`.
```

- [ ] **Step 12: Commit**

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git add apps/financas/src/domain/installments.ts apps/financas/src/domain/installments.test.ts apps/financas/src/routes/installments.ts apps/financas/src/routes/installments.test.ts apps/financas/src/index.ts apps/financas/CLAUDE.md && git commit -m "feat(financas): parcelamento de cartão em batch único multi-row

Adiciona createInstallmentPlan: cada parcela materializa uma transaction com
settled_at NULL e bill_competence derivada de billCompetence/addMonthsToCompetence,
due_date por competenceDueDate e valores por splitInstallments (resto nas primeiras).

Tudo num único db.batch() respeitando o teto de 100 bound params por statement:
5 linhas/statement em transactions (19 colunas) e 20 em installments (5 colunas
bound, created_at via strftime). Plano de 60x = 16 statements.

Expõe POST /api/installment-plans, montado acima do catch-all, com 422
invalid_account para conta não-credit_card e 422 constraint_violation para
installments_count fora de 1..360."
```

---

### Task 9: Dívidas com itens e alocação de pagamento

**Files:**

- Create: `apps/financas/src/domain/debts.ts`
- Create: `apps/financas/src/domain/debts.test.ts`
- Create: `apps/financas/src/routes/debts.ts`
- Create: `apps/financas/src/routes/debts.test.ts`
- Modify: `apps/financas/src/index.ts`
- Modify: `apps/financas/CLAUDE.md`
- Test: `apps/financas/src/domain/debts.test.ts`, `apps/financas/src/routes/debts.test.ts`

**Interfaces:**

- Consumes:
  - `newId(): string` de `src/lib/ids.ts`
  - `nowIsoUtc(): string` de `src/lib/dates.ts`
  - `okJson<T>(data: T, status?: number): Response`, `errJson(status: number, code: string, message: string): Response` de `src/lib/envelope.ts`
  - `type Transaction` (19 colunas) de `src/domain/transactions.ts`
  - `type Bindings` de `src/index.ts` (contém `DB: D1Database`)
  - Migration 0001: tabelas `debts` / `debt_items` / `debt_payments` / `debt_payment_allocations`, triggers `trg_alloc_item_teto` / `trg_alloc_pagamento_teto`, views `v_debt_item_balance` / `v_cashflow`, e a categoria semeada de slug `quitacao-divida` (`kind='debt_settlement'`)
- Produces:
  - `createDebt(db: D1Database, input: { payee_id: string; direction: DebtDirection; title: string; opened_at: string; notes?: string }): Promise<Debt>`
  - `addDebtItem(db: D1Database, input: { debt_id: string; description: string; amount_cents: number; incurred_on: string; transaction_id?: string | null; category_id?: string | null }): Promise<DebtItem>`
  - `payDebt(db: D1Database, input: PayDebtInput): Promise<{ payment: DebtPayment; transaction: Transaction | null }>`
  - `debtDetail(db: D1Database, debt_id: string): Promise<{ debt: Debt | null; items: DebtItemBalance[]; payments: DebtPaymentWithAllocations[] }>`
  - `listDebts(db: D1Database, opts?: ListDebtsOptions): Promise<DebtSummary[]>`
  - `class OverAllocationError extends Error`, `class InvalidPaymentError extends Error` (com `code: string`)
  - `export const debtsRoutes = new Hono<AppEnv>()` montado em `/api/debts`

> Aritmética do cenário do dono (§6 do spec): itens 280000 + 450000 = **730000**; a tela diz “deve R$ 1.360 de R$ 7.300”, logo o total pago é **594000**. Os pagamentos são `100000 + 100000 + 394000` — com `294000` no terceiro a soma alocada (450000 + 144000) estouraria o próprio pagamento e o trigger I1 abortaria. O `2.940` do desenho ASCII do spec é typo de `3.940`.

---

- [ ] **Step 1: Escrever o teste de cadastro + saldo por item**

Criar `apps/financas/src/domain/debts.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { addDebtItem, createDebt, debtDetail } from './debts'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM debt_payment_allocations'),
    env.DB.prepare('DELETE FROM debt_payments'),
    env.DB.prepare('DELETE FROM debt_items'),
    env.DB.prepare('DELETE FROM debts'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
    env.DB.prepare('DELETE FROM payees'),
  ])
})

async function seedPai() {
  const now = nowIsoUtc()
  const payee_id = newId()
  const account_id = newId()
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO payees (id, name, norm_name, kind, created_at) VALUES (?,?,?,?,?)',
    ).bind(payee_id, 'Pai', 'PAI', 'person', now),
    env.DB.prepare(
      'INSERT INTO accounts (id, name, scope, kind, currency, opening_balance_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(account_id, 'Nubank', 'PF', 'checking', 'BRL', 0, now, now),
  ])
  return { payee_id, account_id }
}

describe('debts — cadastro e saldo por item', () => {
  it('cria a dívida com o pai e devolve o saldo de cada item', async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-05',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-03-05',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-03-05',
    })

    expect(debt.status).toBe('open')
    expect(debt.settled_at).toBeNull()

    const detail = await debtDetail(env.DB, debt.id)
    expect(detail.debt?.title).toBe('Pai')
    expect(detail.items).toHaveLength(2)
    expect(detail.payments).toHaveLength(0)

    const byId = new Map(detail.items.map((i) => [i.item_id, i]))
    expect(byId.get(steam.id)?.remaining_cents).toBe(280000)
    expect(byId.get(mac.id)?.allocated_cents).toBe(0)
    expect(byId.get(mac.id)?.is_settled).toBe(0)
  })

  it('nao cria item em divida inexistente', async () => {
    await expect(
      addDebtItem(env.DB, {
        debt_id: 'nao-existe',
        description: 'Fantasma',
        amount_cents: 1000,
        incurred_on: '2026-03-05',
      }),
    ).rejects.toThrow(/FOREIGN KEY|SQLITE_CONSTRAINT/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: FAIL com `Failed to resolve import "./debts" from "src/domain/debts.test.ts"`

- [ ] **Step 3: Implementar tipos, `createDebt`, `addDebtItem` e `debtDetail`**

Criar `apps/financas/src/domain/debts.ts`:

```ts
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'

export type DebtDirection = 'i_owe' | 'owed_to_me'
export type DebtStatus = 'open' | 'settled' | 'written_off'
export type DebtPaymentKind = 'cash' | 'offset' | 'forgiven'

export type Debt = {
  id: string
  payee_id: string
  direction: DebtDirection
  title: string
  currency: string
  opened_at: string
  status: DebtStatus
  settled_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type DebtItem = {
  id: string
  debt_id: string
  description: string
  amount_cents: number
  incurred_on: string
  transaction_id: string | null
  category_id: string | null
  created_at: string
}

// linha de v_debt_item_balance — responde "o Steam Deck ja esta quitado?"
export type DebtItemBalance = {
  item_id: string
  debt_id: string
  description: string
  amount_cents: number
  allocated_cents: number
  remaining_cents: number
  is_settled: number
}

export type DebtPayment = {
  id: string
  debt_id: string
  paid_on: string
  amount_cents: number
  kind: DebtPaymentKind
  transaction_id: string | null
  notes: string | null
  created_at: string
}

export type DebtPaymentAllocation = {
  id: string
  payment_id: string
  item_id: string
  amount_cents: number
  created_at: string
}

export type DebtPaymentWithAllocations = DebtPayment & {
  allocations: DebtPaymentAllocation[]
}

export async function createDebt(
  db: D1Database,
  input: {
    payee_id: string
    direction: DebtDirection
    title: string
    opened_at: string
    notes?: string
  },
): Promise<Debt> {
  const now = nowIsoUtc()
  const debt: Debt = {
    id: newId(),
    payee_id: input.payee_id,
    direction: input.direction,
    title: input.title,
    currency: 'BRL',
    opened_at: input.opened_at,
    status: 'open',
    settled_at: null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  }
  await db
    .prepare(
      `INSERT INTO debts
         (id, payee_id, direction, title, currency, opened_at, status, settled_at, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      debt.id,
      debt.payee_id,
      debt.direction,
      debt.title,
      debt.currency,
      debt.opened_at,
      debt.status,
      debt.settled_at,
      debt.notes,
      debt.created_at,
      debt.updated_at,
    )
    .run()
  return debt
}

// debt_items e ESTOQUE (dimensao patrimonial): nunca gera lancamento.
// transaction_id, quando existe, so APONTA para a compra original.
export async function addDebtItem(
  db: D1Database,
  input: {
    debt_id: string
    description: string
    amount_cents: number
    incurred_on: string
    transaction_id?: string | null
    category_id?: string | null
  },
): Promise<DebtItem> {
  const item: DebtItem = {
    id: newId(),
    debt_id: input.debt_id,
    description: input.description,
    amount_cents: input.amount_cents,
    incurred_on: input.incurred_on,
    transaction_id: input.transaction_id ?? null,
    category_id: input.category_id ?? null,
    created_at: nowIsoUtc(),
  }
  await db
    .prepare(
      `INSERT INTO debt_items
         (id, debt_id, description, amount_cents, incurred_on, transaction_id, category_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .bind(
      item.id,
      item.debt_id,
      item.description,
      item.amount_cents,
      item.incurred_on,
      item.transaction_id,
      item.category_id,
      item.created_at,
    )
    .run()
  return item
}

export async function debtDetail(
  db: D1Database,
  debt_id: string,
): Promise<{
  debt: Debt | null
  items: DebtItemBalance[]
  payments: DebtPaymentWithAllocations[]
}> {
  const [debtRes, itemsRes, paymentsRes, allocsRes] = await db.batch([
    db.prepare('SELECT * FROM debts WHERE id = ?').bind(debt_id),
    db
      .prepare(
        'SELECT * FROM v_debt_item_balance WHERE debt_id = ? ORDER BY description',
      )
      .bind(debt_id),
    db
      .prepare(
        'SELECT * FROM debt_payments WHERE debt_id = ? ORDER BY paid_on, created_at',
      )
      .bind(debt_id),
    db
      .prepare(
        `SELECT a.* FROM debt_payment_allocations a
           JOIN debt_payments p ON p.id = a.payment_id
          WHERE p.debt_id = ? ORDER BY a.created_at`,
      )
      .bind(debt_id),
  ])

  const allocs = allocsRes.results as DebtPaymentAllocation[]
  const payments = (paymentsRes.results as DebtPayment[]).map((p) => ({
    ...p,
    allocations: allocs.filter((a) => a.payment_id === p.id),
  }))

  return {
    debt: ((debtRes.results as Debt[])[0] ?? null) as Debt | null,
    items: itemsRes.results as DebtItemBalance[],
    payments,
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: PASS (2 testes)

- [ ] **Step 5: Escrever o teste do cenário real do dono + as três queries do §5.4**

Acrescentar ao final de `apps/financas/src/domain/debts.test.ts` (e incluir `payDebt` no import de `./debts`):

```ts
describe('debts — pagamento alocado', () => {
  it('CENARIO DO DONO: divida com o pai deixa o MacBook quitado e o Steam Deck com 136000', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-05',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-03-05',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-03-05',
    })

    // 100000 + 100000 + 394000 = 594000 pagos de 730000 => faltam 136000,
    // que e o "deve R$ 1.360 de R$ 7.300" da tela do spec §6.
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-03-05',
      amount_cents: 100000,
      account_id,
      allocations: [{ item_id: mac.id, amount_cents: 100000 }],
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-04-05',
      amount_cents: 100000,
      account_id,
      allocations: [{ item_id: mac.id, amount_cents: 100000 }],
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-05-10',
      amount_cents: 394000,
      account_id,
      allocations: [
        { item_id: mac.id, amount_cents: 250000 },
        { item_id: steam.id, amount_cents: 144000 },
      ],
    })

    const detail = await debtDetail(env.DB, debt.id)
    const byId = new Map(detail.items.map((i) => [i.item_id, i]))

    expect(byId.get(mac.id)?.remaining_cents).toBe(0)
    expect(byId.get(mac.id)?.is_settled).toBe(1)
    expect(byId.get(steam.id)?.allocated_cents).toBe(144000)
    expect(byId.get(steam.id)?.remaining_cents).toBe(136000)
    expect(byId.get(steam.id)?.is_settled).toBe(0)

    expect(detail.payments).toHaveLength(3)
    expect(detail.payments[2].allocations).toHaveLength(2)
    expect(detail.payments.every((p) => p.transaction_id !== null)).toBe(true)
  })

  it('AS TRES QUERIES DO §5.4: 1x no caixa, 1x na divida, 0x na despesa', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-07-01',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-07-01',
    })

    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-10',
      amount_cents: 50000,
      account_id,
      allocations: [
        { item_id: steam.id, amount_cents: 30000 },
        { item_id: mac.id, amount_cents: 20000 },
      ],
    })

    const cashflow = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM v_cashflow WHERE competence_month = ?`,
    )
      .bind('2026-07')
      .first<{ total: number }>()
    expect(cashflow?.total).toBe(-50000)

    const balance = await env.DB.prepare(
      'SELECT * FROM v_debt_item_balance WHERE debt_id = ? ORDER BY description',
    )
      .bind(debt.id)
      .all<DebtItemBalance>()
    const allocated = balance.results.reduce(
      (acc, r) => acc + r.allocated_cents,
      0,
    )
    expect(allocated).toBe(50000)

    const asExpense = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE c.kind = 'expense'`,
    ).first<{ n: number }>()
    expect(asExpense?.n).toBe(0)

    const txCount = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions',
    ).first<{
      n: number
    }>()
    expect(txCount?.n).toBe(1)
  })
})
```

Adicionar também `import type { DebtItemBalance } from './debts'` no topo do arquivo de teste.

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: FAIL com `The requested module './debts' does not provide an export named 'payDebt'`

- [ ] **Step 7: Implementar `payDebt` — um único `db.batch()`**

Acrescentar em `apps/financas/src/domain/debts.ts`:

```ts
import type { Transaction } from './transactions'

export type Allocation = { item_id: string; amount_cents: number }

export type PayDebtInput = {
  debt_id: string
  paid_on: string
  amount_cents: number
  allocations: Allocation[]
  kind?: DebtPaymentKind
  account_id?: string | null
  description?: string
  notes?: string
}

// debt_payments e FLUXO: gera EXATAMENTE UMA transaction, elo 1:1 garantido
// por uq_debt_payments_tx. Tudo num batch() so — o D1 faz rollback real, entao
// um teto estourado nao deixa nem lancamento orfao nem alocacao parcial.
export async function payDebt(
  db: D1Database,
  input: PayDebtInput,
): Promise<{ payment: DebtPayment; transaction: Transaction | null }> {
  const debt = await db
    .prepare('SELECT * FROM debts WHERE id = ?')
    .bind(input.debt_id)
    .first<Debt>()
  if (!debt) throw new Error('divida nao encontrada')

  const now = nowIsoUtc()
  const statements: D1PreparedStatement[] = []

  const category = await db
    .prepare("SELECT id FROM categories WHERE slug = 'quitacao-divida'")
    .first<{ id: string }>()
  if (!category)
    throw new Error("categoria 'quitacao-divida' ausente na migration 0001")

  const transaction: Transaction = {
    id: newId(),
    account_id: input.account_id as string,
    amount_cents: -input.amount_cents,
    currency: 'BRL',
    amount_original_cents: null,
    fx_rate_ppm: null,
    purchase_date: input.paid_on,
    bill_competence: null,
    settled_at: input.paid_on,
    description: input.description ?? `Pgto dívida — ${debt.title}`,
    payee_id: debt.payee_id,
    category_id: category.id,
    is_business: 0,
    transfer_id: null,
    parent_id: null,
    imported_id: null,
    import_source: 'manual',
    created_at: now,
    updated_at: now,
  }

  // 19 colunas. Com o teto de 100 bound params, um INSERT multi-row de
  // transactions cabe 5 linhas (5*19=95); aqui e sempre 1 linha.
  statements.push(
    db
      .prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, amount_original_cents, fx_rate_ppm,
            purchase_date, bill_competence, settled_at, description, payee_id, category_id,
            is_business, transfer_id, parent_id, imported_id, import_source, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        transaction.id,
        transaction.account_id,
        transaction.amount_cents,
        transaction.currency,
        transaction.amount_original_cents,
        transaction.fx_rate_ppm,
        transaction.purchase_date,
        transaction.bill_competence,
        transaction.settled_at,
        transaction.description,
        transaction.payee_id,
        transaction.category_id,
        transaction.is_business,
        transaction.transfer_id,
        transaction.parent_id,
        transaction.imported_id,
        transaction.import_source,
        transaction.created_at,
        transaction.updated_at,
      ),
  )

  const payment: DebtPayment = {
    id: newId(),
    debt_id: debt.id,
    paid_on: input.paid_on,
    amount_cents: input.amount_cents,
    kind: 'cash',
    transaction_id: transaction.id,
    notes: input.notes ?? null,
    created_at: now,
  }
  statements.push(
    db
      .prepare(
        `INSERT INTO debt_payments
           (id, debt_id, paid_on, amount_cents, kind, transaction_id, notes, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .bind(
        payment.id,
        payment.debt_id,
        payment.paid_on,
        payment.amount_cents,
        payment.kind,
        payment.transaction_id,
        payment.notes,
        payment.created_at,
      ),
  )

  for (const alloc of input.allocations) {
    statements.push(
      db
        .prepare(
          `INSERT INTO debt_payment_allocations
             (id, payment_id, item_id, amount_cents, created_at)
           VALUES (?,?,?,?,?)`,
        )
        .bind(newId(), payment.id, alloc.item_id, alloc.amount_cents, now),
    )
  }

  await db.batch(statements)
  return { payment, transaction }
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: PASS (4 testes)

- [ ] **Step 9: Escrever o teste de superalocação e do teto exato**

Acrescentar ao final de `apps/financas/src/domain/debts.test.ts` (e incluir `OverAllocationError` no import de `./debts`):

```ts
describe('debts — tetos do banco (I1/I2)', () => {
  async function debtDe1000() {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item de mil',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })
    return { debt, item, account_id }
  }

  async function counts() {
    const [tx, pay, alloc] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM transactions'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM debt_payments'),
      env.DB.prepare('SELECT COUNT(*) AS n FROM debt_payment_allocations'),
    ])
    return {
      transactions: (tx.results as Array<{ n: number }>)[0].n,
      payments: (pay.results as Array<{ n: number }>)[0].n,
      allocations: (alloc.results as Array<{ n: number }>)[0].n,
    }
  }

  it('superalocacao aborta e NADA persiste', async () => {
    const { debt, item, account_id } = await debtDe1000()
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })
    expect(await counts()).toEqual({
      transactions: 1,
      payments: 1,
      allocations: 1,
    })

    await expect(
      payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-06',
        amount_cents: 90000,
        account_id,
        allocations: [{ item_id: item.id, amount_cents: 90000 }],
      }),
    ).rejects.toBeInstanceOf(OverAllocationError)

    // nem transaction, nem payment, nem alocacao parcial
    expect(await counts()).toEqual({
      transactions: 1,
      payments: 1,
      allocations: 1,
    })
  })

  it('alocar EXATAMENTE ate o teto do item passa', async () => {
    const { debt, item, account_id } = await debtDe1000()
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })
    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-06',
      amount_cents: 70000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 70000 }],
    })

    const balance = await env.DB.prepare(
      'SELECT * FROM v_debt_item_balance WHERE item_id = ?',
    )
      .bind(item.id)
      .first<DebtItemBalance>()
    expect(balance?.allocated_cents).toBe(100000)
    expect(balance?.remaining_cents).toBe(0)
    expect(balance?.is_settled).toBe(1)
  })

  it('alocacao maior que o proprio pagamento aborta (I1)', async () => {
    const { debt, item, account_id } = await debtDe1000()
    await expect(
      payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 10000,
        account_id,
        allocations: [{ item_id: item.id, amount_cents: 20000 }],
      }),
    ).rejects.toBeInstanceOf(OverAllocationError)
    expect(await counts()).toEqual({
      transactions: 0,
      payments: 0,
      allocations: 0,
    })
  })
})
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: FAIL com `The requested module './debts' does not provide an export named 'OverAllocationError'`

- [ ] **Step 11: Implementar `OverAllocationError` e a tradução do erro do D1**

Acrescentar em `apps/financas/src/domain/debts.ts` (classe junto dos tipos; helper no fim do arquivo):

```ts
export class OverAllocationError extends Error {
  constructor(message = 'alocacao excede o teto do item ou do pagamento') {
    super(message)
    this.name = 'OverAllocationError'
  }
}

// trg_alloc_item_teto / trg_alloc_pagamento_teto abortam com
// SQLITE_CONSTRAINT_TRIGGER e o batch() inteiro reverte.
function translateD1Error(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('SQLITE_CONSTRAINT_TRIGGER'))
    return new OverAllocationError(message)
  return err instanceof Error ? err : new Error(message)
}
```

E trocar o `await db.batch(statements)` de `payDebt` por:

```ts
try {
  await db.batch(statements)
} catch (err) {
  throw translateD1Error(err)
}
```

- [ ] **Step 12: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: PASS (7 testes)

- [ ] **Step 13: Escrever o teste de `kind` sem caixa e de `direction='owed_to_me'`**

Acrescentar ao final de `apps/financas/src/domain/debts.test.ts` (e incluir `InvalidPaymentError` no import de `./debts`):

```ts
describe('debts — kind do pagamento e direcao da divida', () => {
  it("kind='offset' e kind='forgiven' NAO criam transaction", async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item de mil',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })

    const offset = await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-05',
      amount_cents: 30000,
      kind: 'offset',
      allocations: [{ item_id: item.id, amount_cents: 30000 }],
    })
    const forgiven = await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-06',
      amount_cents: 20000,
      kind: 'forgiven',
      allocations: [{ item_id: item.id, amount_cents: 20000 }],
    })

    expect(offset.transaction).toBeNull()
    expect(forgiven.transaction).toBeNull()
    expect(offset.payment.transaction_id).toBeNull()

    const tx = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions',
    ).first<{ n: number }>()
    expect(tx?.n).toBe(0)

    const balance = await env.DB.prepare(
      'SELECT * FROM v_debt_item_balance WHERE item_id = ?',
    )
      .bind(item.id)
      .first<DebtItemBalance>()
    expect(balance?.allocated_cents).toBe(50000)
  })

  it("kind='cash' sem account_id e recusado", async () => {
    const { payee_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item de mil',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })

    await expect(
      payDebt(env.DB, {
        debt_id: debt.id,
        paid_on: '2026-07-05',
        amount_cents: 30000,
        allocations: [{ item_id: item.id, amount_cents: 30000 }],
      }),
    ).rejects.toMatchObject({
      name: 'InvalidPaymentError',
      code: 'invalid_account',
    })

    const counted = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM debt_payments',
    ).first<{
      n: number
    }>()
    expect(counted?.n).toBe(0)
  })

  it("direction='owed_to_me': o recebimento entra positivo e NUNCA vira categoria income", async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'owed_to_me',
      title: 'Amigo',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Notebook do amigo',
      amount_cents: 320000,
      incurred_on: '2026-07-01',
    })

    const { transaction } = await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-10',
      amount_cents: 50000,
      account_id,
      allocations: [{ item_id: item.id, amount_cents: 50000 }],
    })
    expect(transaction?.amount_cents).toBe(50000)

    const kind = await env.DB.prepare(
      'SELECT c.kind AS kind FROM transactions t JOIN categories c ON c.id = t.category_id WHERE t.id = ?',
    )
      .bind(transaction?.id)
      .first<{ kind: string }>()
    expect(kind?.kind).toBe('debt_settlement')

    // classificar como income inflaria o faturamento e distorceria o DAS
    const asIncome = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM transactions t
         JOIN categories c ON c.id = t.category_id
        WHERE c.kind = 'income'`,
    ).first<{ n: number }>()
    expect(asIncome?.n).toBe(0)
  })
})
```

- [ ] **Step 14: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: FAIL com `The requested module './debts' does not provide an export named 'InvalidPaymentError'`

- [ ] **Step 15: Implementar `InvalidPaymentError`, o ramo por `kind` e o sinal por `direction`**

Acrescentar a classe em `apps/financas/src/domain/debts.ts`:

```ts
export class InvalidPaymentError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'InvalidPaymentError'
    this.code = code
  }
}
```

E reescrever o miolo de `payDebt` — do `const now` até a montagem de `payment` — assim:

```ts
const kind: DebtPaymentKind = input.kind ?? 'cash'
if (input.amount_cents <= 0)
  throw new InvalidPaymentError(
    'constraint_violation',
    'valor do pagamento tem que ser positivo',
  )
if (input.allocations.length === 0)
  throw new InvalidPaymentError(
    'constraint_violation',
    'pagamento precisa de ao menos uma alocacao',
  )
if (kind === 'cash' && !input.account_id)
  throw new InvalidPaymentError(
    'invalid_account',
    'pagamento em dinheiro exige account_id',
  )
if (kind !== 'cash' && input.account_id)
  throw new InvalidPaymentError(
    'invalid_account',
    'pagamento sem caixa nao aceita account_id',
  )

const now = nowIsoUtc()
const statements: D1PreparedStatement[] = []
let transaction: Transaction | null = null

if (kind === 'cash') {
  const category = await db
    .prepare("SELECT id FROM categories WHERE slug = 'quitacao-divida'")
    .first<{ id: string }>()
  if (!category)
    throw new InvalidPaymentError(
      'constraint_violation',
      "categoria 'quitacao-divida' ausente na migration 0001",
    )

  // i_owe: sai dinheiro (negativo). owed_to_me: entra (positivo).
  // A categoria e SEMPRE debt_settlement — nunca income/expense.
  const signed =
    debt.direction === 'i_owe' ? -input.amount_cents : input.amount_cents

  transaction = {
    id: newId(),
    account_id: input.account_id as string,
    amount_cents: signed,
    currency: 'BRL',
    amount_original_cents: null,
    fx_rate_ppm: null,
    purchase_date: input.paid_on,
    bill_competence: null,
    settled_at: input.paid_on,
    description: input.description ?? `Pgto dívida — ${debt.title}`,
    payee_id: debt.payee_id,
    category_id: category.id,
    is_business: 0,
    transfer_id: null,
    parent_id: null,
    imported_id: null,
    import_source: 'manual',
    created_at: now,
    updated_at: now,
  }

  statements.push(/* ...INSERT INTO transactions das 19 colunas, inalterado... */)
}

const payment: DebtPayment = {
  id: newId(),
  debt_id: debt.id,
  paid_on: input.paid_on,
  amount_cents: input.amount_cents,
  kind,
  transaction_id: transaction ? transaction.id : null,
  notes: input.notes ?? null,
  created_at: now,
}
```

Trocar também o `throw new Error('divida nao encontrada')` do topo por `throw new InvalidPaymentError('not_found', 'divida nao encontrada')`.

- [ ] **Step 16: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: PASS (10 testes)

- [ ] **Step 17: Escrever o teste de quitação automática da dívida**

Acrescentar ao final de `apps/financas/src/domain/debts.test.ts`:

```ts
describe('debts — quitacao automatica', () => {
  it('quitar o ultimo item marca a divida como settled', async () => {
    const { payee_id, account_id } = await seedPai()
    const debt = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-07-01',
    })
    const a = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item A',
      amount_cents: 100000,
      incurred_on: '2026-07-01',
    })
    const b = await addDebtItem(env.DB, {
      debt_id: debt.id,
      description: 'Item B',
      amount_cents: 50000,
      incurred_on: '2026-07-01',
    })

    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-07-10',
      amount_cents: 100000,
      account_id,
      allocations: [{ item_id: a.id, amount_cents: 100000 }],
    })
    const meio = await debtDetail(env.DB, debt.id)
    expect(meio.debt?.status).toBe('open')
    expect(meio.debt?.settled_at).toBeNull()

    await payDebt(env.DB, {
      debt_id: debt.id,
      paid_on: '2026-08-10',
      amount_cents: 50000,
      account_id,
      allocations: [{ item_id: b.id, amount_cents: 50000 }],
    })
    const fim = await debtDetail(env.DB, debt.id)
    expect(fim.debt?.status).toBe('settled')
    expect(fim.debt?.settled_at).toBe('2026-08-10')
  })

  it('divida sem itens nao vira settled', async () => {
    const { payee_id } = await seedPai()
    const vazia = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Sem itens',
      opened_at: '2026-07-01',
    })
    const outra = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Com item',
      opened_at: '2026-07-01',
    })
    const item = await addDebtItem(env.DB, {
      debt_id: outra.id,
      description: 'Item',
      amount_cents: 1000,
      incurred_on: '2026-07-01',
    })
    await payDebt(env.DB, {
      debt_id: outra.id,
      paid_on: '2026-07-10',
      amount_cents: 1000,
      kind: 'forgiven',
      allocations: [{ item_id: item.id, amount_cents: 1000 }],
    })

    const detail = await debtDetail(env.DB, vazia.id)
    expect(detail.debt?.status).toBe('open')
  })
})
```

- [ ] **Step 18: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: FAIL com `expected 'open' to be 'settled'`

- [ ] **Step 19: Implementar o `UPDATE debts` no fim do batch**

Acrescentar em `apps/financas/src/domain/debts.ts`, logo depois do laço que empilha as alocações e antes do `try { await db.batch(...) }`:

```ts
// Ultimo statement do batch: ja enxerga as alocacoes recem-inseridas.
// O EXISTS impede que uma divida sem itens vire settled.
statements.push(
  db
    .prepare(
      `UPDATE debts SET status = 'settled', settled_at = ?, updated_at = ?
          WHERE id = ? AND status = 'open'
            AND EXISTS (SELECT 1 FROM debt_items WHERE debt_id = ?)
            AND NOT EXISTS (
              SELECT 1 FROM v_debt_item_balance WHERE debt_id = ? AND is_settled = 0
            )`,
    )
    .bind(input.paid_on, now, debt.id, debt.id, debt.id),
)
```

- [ ] **Step 20: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: PASS (12 testes)

- [ ] **Step 21: Escrever o teste de `listDebts`**

Acrescentar ao final de `apps/financas/src/domain/debts.test.ts` (e incluir `listDebts` no import de `./debts`):

```ts
describe('debts — listagem com totais', () => {
  it('devolve total, pago e restante por divida e filtra por direcao', async () => {
    const { payee_id, account_id } = await seedPai()
    const pai = await createDebt(env.DB, {
      payee_id,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-05',
    })
    const steam = await addDebtItem(env.DB, {
      debt_id: pai.id,
      description: 'Steam Deck OLED 1TB',
      amount_cents: 280000,
      incurred_on: '2026-03-05',
    })
    const mac = await addDebtItem(env.DB, {
      debt_id: pai.id,
      description: 'MacBook Air',
      amount_cents: 450000,
      incurred_on: '2026-03-05',
    })
    await payDebt(env.DB, {
      debt_id: pai.id,
      paid_on: '2026-05-10',
      amount_cents: 594000,
      account_id,
      allocations: [
        { item_id: mac.id, amount_cents: 450000 },
        { item_id: steam.id, amount_cents: 144000 },
      ],
    })
    await createDebt(env.DB, {
      payee_id,
      direction: 'owed_to_me',
      title: 'Amigo',
      opened_at: '2026-06-01',
    })

    const todas = await listDebts(env.DB)
    expect(todas).toHaveLength(2)

    const doPai = todas.find((d) => d.id === pai.id)
    expect(doPai?.total_cents).toBe(730000)
    expect(doPai?.paid_cents).toBe(594000)
    expect(doPai?.remaining_cents).toBe(136000)

    const amigo = todas.find((d) => d.title === 'Amigo')
    expect(amigo?.total_cents).toBe(0)
    expect(amigo?.remaining_cents).toBe(0)

    const soDevo = await listDebts(env.DB, { direction: 'i_owe' })
    expect(soDevo.map((d) => d.title)).toEqual(['Pai'])

    const abertas = await listDebts(env.DB, { status: 'open' })
    expect(abertas).toHaveLength(2)
  })
})
```

- [ ] **Step 22: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: FAIL com `The requested module './debts' does not provide an export named 'listDebts'`

- [ ] **Step 23: Implementar `listDebts`**

Acrescentar ao final de `apps/financas/src/domain/debts.ts`:

```ts
export type ListDebtsOptions = {
  status?: DebtStatus | null
  direction?: DebtDirection | null
}

export type DebtSummary = Debt & {
  total_cents: number
  paid_cents: number
  remaining_cents: number
}

export async function listDebts(
  db: D1Database,
  opts: ListDebtsOptions = {},
): Promise<DebtSummary[]> {
  const status = opts.status ?? null
  const direction = opts.direction ?? null
  const res = await db
    .prepare(
      `SELECT d.*,
              COALESCE(i.total_cents, 0)                             AS total_cents,
              COALESCE(a.paid_cents, 0)                              AS paid_cents,
              COALESCE(i.total_cents, 0) - COALESCE(a.paid_cents, 0) AS remaining_cents
         FROM debts d
         LEFT JOIN (
           SELECT debt_id, SUM(amount_cents) AS total_cents
             FROM debt_items GROUP BY debt_id
         ) i ON i.debt_id = d.id
         LEFT JOIN (
           SELECT it.debt_id, SUM(al.amount_cents) AS paid_cents
             FROM debt_payment_allocations al
             JOIN debt_items it ON it.id = al.item_id
            GROUP BY it.debt_id
         ) a ON a.debt_id = d.id
        WHERE (? IS NULL OR d.status = ?)
          AND (? IS NULL OR d.direction = ?)
        ORDER BY d.opened_at DESC, d.created_at DESC`,
    )
    .bind(status, status, direction, direction)
    .all<DebtSummary>()
  return res.results
}
```

- [ ] **Step 24: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts`
Esperado: PASS (13 testes)

- [ ] **Step 25: Escrever o teste das rotas (caminho feliz)**

Criar `apps/financas/src/routes/debts.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nowIsoUtc } from '../lib/dates'
import { newId } from '../lib/ids'
import { debtsRoutes } from './debts'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM debt_payment_allocations'),
    env.DB.prepare('DELETE FROM debt_payments'),
    env.DB.prepare('DELETE FROM debt_items'),
    env.DB.prepare('DELETE FROM debts'),
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
    env.DB.prepare('DELETE FROM payees'),
  ])
})

async function seedPai() {
  const now = nowIsoUtc()
  const payee_id = newId()
  const account_id = newId()
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO payees (id, name, norm_name, kind, created_at) VALUES (?,?,?,?,?)',
    ).bind(payee_id, 'Pai', 'PAI', 'person', now),
    env.DB.prepare(
      'INSERT INTO accounts (id, name, scope, kind, currency, opening_balance_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(account_id, 'Nubank', 'PF', 'checking', 'BRL', 0, now, now),
  ])
  return { payee_id, account_id }
}

type Envelopish = {
  ok: boolean
  data: any
  notifications: Array<{ type: string; code?: string; message: string }>
}

async function call(path: string, init?: RequestInit) {
  const res = await debtsRoutes.request(path, init, env)
  const text = await res.text()
  let body: Envelopish
  try {
    body = JSON.parse(text) as Envelopish
  } catch {
    body = {
      ok: false,
      data: null,
      notifications: [{ type: 'error', message: text }],
    }
  }
  return { status: res.status, body }
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('rotas de dividas — caminho feliz', () => {
  it('cria divida, itens e pagamento e devolve o detalhe com os saldos', async () => {
    const { payee_id, account_id } = await seedPai()

    const criada = await call(
      '/',
      post({
        payee_id,
        direction: 'i_owe',
        title: 'Pai',
        opened_at: '2026-03-05',
      }),
    )
    expect(criada.status).toBe(201)
    expect(criada.body.ok).toBe(true)
    expect(criada.body.notifications).toEqual([])
    const debtId = criada.body.data.id as string

    const steam = await call(
      `/${debtId}/items`,
      post({
        description: 'Steam Deck OLED 1TB',
        amount_cents: 280000,
        incurred_on: '2026-03-05',
      }),
    )
    const mac = await call(
      `/${debtId}/items`,
      post({
        description: 'MacBook Air',
        amount_cents: 450000,
        incurred_on: '2026-03-05',
      }),
    )
    expect(steam.status).toBe(201)
    expect(mac.status).toBe(201)

    const pago = await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-05-10',
        amount_cents: 594000,
        account_id,
        allocations: [
          { item_id: mac.body.data.id, amount_cents: 450000 },
          { item_id: steam.body.data.id, amount_cents: 144000 },
        ],
      }),
    )
    expect(pago.status).toBe(201)
    expect(pago.body.data.transaction.amount_cents).toBe(-594000)

    const detalhe = await call(`/${debtId}`)
    expect(detalhe.status).toBe(200)
    const items = detalhe.body.data.items as Array<{
      description: string
      remaining_cents: number
    }>
    expect(
      items.find((i) => i.description.startsWith('Steam'))?.remaining_cents,
    ).toBe(136000)
    expect(
      items.find((i) => i.description.startsWith('MacBook'))?.remaining_cents,
    ).toBe(0)

    const lista = await call('/?direction=i_owe')
    expect(lista.status).toBe(200)
    expect(lista.body.data).toHaveLength(1)
    expect(lista.body.data[0].remaining_cents).toBe(136000)
  })

  it('divida inexistente devolve 404 not_found', async () => {
    const res = await call('/nao-existe')
    expect(res.status).toBe(404)
    expect(res.body.ok).toBe(false)
    expect(res.body.notifications[0].code).toBe('not_found')
  })

  it('query de status invalida devolve 400 invalid_query', async () => {
    const res = await call('/?status=qualquer')
    expect(res.status).toBe(400)
    expect(res.body.notifications[0].code).toBe('invalid_query')
  })
})
```

- [ ] **Step 26: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/debts.test.ts`
Esperado: FAIL com `Failed to resolve import "./debts" from "src/routes/debts.test.ts"`

- [ ] **Step 27: Implementar o router**

Criar `apps/financas/src/routes/debts.ts`:

```ts
import { Hono } from 'hono'
import {
  addDebtItem,
  createDebt,
  debtDetail,
  listDebts,
  payDebt,
} from '../domain/debts'
import type {
  Allocation,
  DebtDirection,
  DebtPaymentKind,
  DebtStatus,
} from '../domain/debts'
import { errJson, okJson } from '../lib/envelope'
import type { Bindings } from '../index'

type AppEnv = { Bindings: Bindings }

export const debtsRoutes = new Hono<AppEnv>()

const STATUSES: DebtStatus[] = ['open', 'settled', 'written_off']
const DIRECTIONS: DebtDirection[] = ['i_owe', 'owed_to_me']
const KINDS: DebtPaymentKind[] = ['cash', 'offset', 'forgiven']

async function parseBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

debtsRoutes.get('/', async (c) => {
  const status = c.req.query('status') ?? null
  const direction = c.req.query('direction') ?? null
  if (status !== null && !STATUSES.includes(status as DebtStatus))
    return errJson(400, 'invalid_query', 'status invalido')
  if (direction !== null && !DIRECTIONS.includes(direction as DebtDirection))
    return errJson(400, 'invalid_query', 'direction invalida')

  const debts = await listDebts(c.env.DB, {
    status: status as DebtStatus | null,
    direction: direction as DebtDirection | null,
  })
  return okJson(debts)
})

debtsRoutes.post('/', async (c) => {
  const body = await parseBody(c.req.raw)
  if (!body) return errJson(400, 'invalid_json', 'corpo nao e JSON valido')

  const { payee_id, direction, title, opened_at, notes } = body
  if (typeof payee_id !== 'string' || payee_id === '')
    return errJson(400, 'invalid_json', 'payee_id obrigatorio')
  if (
    typeof direction !== 'string' ||
    !DIRECTIONS.includes(direction as DebtDirection)
  )
    return errJson(400, 'invalid_json', 'direction invalida')
  if (typeof title !== 'string' || title === '')
    return errJson(400, 'invalid_json', 'title obrigatorio')
  if (typeof opened_at !== 'string' || opened_at === '')
    return errJson(400, 'invalid_json', 'opened_at obrigatorio')

  const debt = await createDebt(c.env.DB, {
    payee_id,
    direction: direction as DebtDirection,
    title,
    opened_at,
    notes: typeof notes === 'string' ? notes : undefined,
  })
  return okJson(debt, 201)
})

debtsRoutes.get('/:id', async (c) => {
  const detail = await debtDetail(c.env.DB, c.req.param('id'))
  if (!detail.debt) return errJson(404, 'not_found', 'divida nao encontrada')
  return okJson(detail)
})

debtsRoutes.post('/:id/items', async (c) => {
  const body = await parseBody(c.req.raw)
  if (!body) return errJson(400, 'invalid_json', 'corpo nao e JSON valido')

  const {
    description,
    amount_cents,
    incurred_on,
    transaction_id,
    category_id,
  } = body
  if (typeof description !== 'string' || description === '')
    return errJson(400, 'invalid_json', 'description obrigatoria')
  if (!Number.isInteger(amount_cents) || (amount_cents as number) <= 0)
    return errJson(
      400,
      'invalid_json',
      'amount_cents tem que ser inteiro positivo',
    )
  if (typeof incurred_on !== 'string' || incurred_on === '')
    return errJson(400, 'invalid_json', 'incurred_on obrigatorio')

  const item = await addDebtItem(c.env.DB, {
    debt_id: c.req.param('id'),
    description,
    amount_cents: amount_cents as number,
    incurred_on,
    transaction_id: typeof transaction_id === 'string' ? transaction_id : null,
    category_id: typeof category_id === 'string' ? category_id : null,
  })
  return okJson(item, 201)
})

debtsRoutes.post('/:id/payments', async (c) => {
  const body = await parseBody(c.req.raw)
  if (!body) return errJson(400, 'invalid_json', 'corpo nao e JSON valido')

  const {
    paid_on,
    amount_cents,
    allocations,
    kind,
    account_id,
    description,
    notes,
  } = body
  if (typeof paid_on !== 'string' || paid_on === '')
    return errJson(400, 'invalid_json', 'paid_on obrigatorio')
  if (!Number.isInteger(amount_cents) || (amount_cents as number) <= 0)
    return errJson(
      400,
      'invalid_json',
      'amount_cents tem que ser inteiro positivo',
    )
  if (kind !== undefined && !KINDS.includes(kind as DebtPaymentKind))
    return errJson(400, 'invalid_json', 'kind invalido')
  if (!Array.isArray(allocations) || allocations.length === 0)
    return errJson(400, 'invalid_json', 'allocations obrigatorio')
  for (const alloc of allocations as Allocation[]) {
    if (
      !alloc ||
      typeof alloc.item_id !== 'string' ||
      !Number.isInteger(alloc.amount_cents) ||
      alloc.amount_cents <= 0
    )
      return errJson(400, 'invalid_json', 'alocacao invalida')
  }

  const result = await payDebt(c.env.DB, {
    debt_id: c.req.param('id'),
    paid_on,
    amount_cents: amount_cents as number,
    allocations: allocations as Allocation[],
    kind: kind as DebtPaymentKind | undefined,
    account_id: typeof account_id === 'string' ? account_id : null,
    description: typeof description === 'string' ? description : undefined,
    notes: typeof notes === 'string' ? notes : undefined,
  })
  return okJson(result, 201)
})
```

- [ ] **Step 28: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/debts.test.ts`
Esperado: PASS (3 testes)

- [ ] **Step 29: Escrever o teste dos erros de negócio nas rotas**

Acrescentar ao final de `apps/financas/src/routes/debts.test.ts`:

```ts
describe('rotas de dividas — erros de negocio', () => {
  async function debtComItem() {
    const { payee_id, account_id } = await seedPai()
    const criada = await call(
      '/',
      post({
        payee_id,
        direction: 'i_owe',
        title: 'Pai',
        opened_at: '2026-07-01',
      }),
    )
    const debtId = criada.body.data.id as string
    const item = await call(
      `/${debtId}/items`,
      post({
        description: 'Item de mil',
        amount_cents: 100000,
        incurred_on: '2026-07-01',
      }),
    )
    return { debtId, itemId: item.body.data.id as string, account_id }
  }

  it('superalocacao devolve 422 over_allocation e nao persiste nada', async () => {
    const { debtId, itemId, account_id } = await debtComItem()
    await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-05',
        amount_cents: 30000,
        account_id,
        allocations: [{ item_id: itemId, amount_cents: 30000 }],
      }),
    )

    const res = await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-06',
        amount_cents: 90000,
        account_id,
        allocations: [{ item_id: itemId, amount_cents: 90000 }],
      }),
    )
    expect(res.status).toBe(422)
    expect(res.body.ok).toBe(false)
    expect(res.body.notifications[0].code).toBe('over_allocation')

    const pagamentos = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM debt_payments',
    ).first<{
      n: number
    }>()
    expect(pagamentos?.n).toBe(1)
  })

  it("kind='cash' sem account_id devolve 422 invalid_account", async () => {
    const { debtId, itemId } = await debtComItem()
    const res = await call(
      `/${debtId}/payments`,
      post({
        paid_on: '2026-07-05',
        amount_cents: 30000,
        allocations: [{ item_id: itemId, amount_cents: 30000 }],
      }),
    )
    expect(res.status).toBe(422)
    expect(res.body.notifications[0].code).toBe('invalid_account')
  })

  it('corpo que nao e JSON devolve 400 invalid_json', async () => {
    const res = await call('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'isso nao e json',
    })
    expect(res.status).toBe(400)
    expect(res.body.notifications[0].code).toBe('invalid_json')
  })

  it('item em divida inexistente devolve 422 constraint_violation', async () => {
    const res = await call(
      '/nao-existe/items',
      post({
        description: 'Fantasma',
        amount_cents: 1000,
        incurred_on: '2026-07-01',
      }),
    )
    expect(res.status).toBe(422)
    expect(res.body.notifications[0].code).toBe('constraint_violation')
  })
})
```

- [ ] **Step 30: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/debts.test.ts`
Esperado: FAIL com `expected 500 to be 422`

- [ ] **Step 31: Implementar `mapError` e envolver os handlers que tocam o banco**

Acrescentar em `apps/financas/src/routes/debts.ts` (logo abaixo de `parseBody`) e trocar `InvalidPaymentError`/`OverAllocationError` para o import de `../domain/debts`:

```ts
function mapError(err: unknown): Response {
  if (err instanceof OverAllocationError)
    return errJson(422, 'over_allocation', err.message)
  if (err instanceof InvalidPaymentError)
    return errJson(err.code === 'not_found' ? 404 : 422, err.code, err.message)
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('SQLITE_CONSTRAINT'))
    return errJson(422, 'constraint_violation', message)
  throw err
}
```

Envolver as três chamadas de domínio que escrevem (`createDebt`, `addDebtItem`, `payDebt`) no mesmo padrão, ex.:

```ts
try {
  const result = await payDebt(c.env.DB, {
    /* ...igual... */
  })
  return okJson(result, 201)
} catch (err) {
  return mapError(err)
}
```

- [ ] **Step 32: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/debts.test.ts`
Esperado: PASS (7 testes)

- [ ] **Step 33: Montar a rota no `src/index.ts` ACIMA do catch-all**

Em `apps/financas/src/index.ts`, acrescentar o import junto dos outros routers e a linha de montagem **imediatamente antes** do comentário `// SEMPRE POR ULTIMO`:

```ts
import { debtsRoutes } from './routes/debts'

// ...

app.route('/api/debts', debtsRoutes)

// SEMPRE POR ULTIMO
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', () => errJson(404, 'not_found', 'rota inexistente'))
```

- [ ] **Step 34: Rodar a suíte completa e o typecheck**

Run: `pnpm --filter @piluvitu/financas exec vitest run && pnpm --filter @piluvitu/financas exec tsc --noEmit`
Esperado: PASS em todos os arquivos de teste e `tsc` sem saída

- [ ] **Step 35: Documentar a seção Dívidas no `apps/financas/CLAUDE.md`**

Acrescentar a seção ao `apps/financas/CLAUDE.md` (arquivo já existe desde o scaffold):

```md
## Dívidas (`src/domain/debts.ts` + `src/routes/debts.ts`)

`debt_items` é **estoque** (dimensão patrimonial) e **nunca** gera lançamento; `debt_payments` é **fluxo** e gera **exatamente uma** `transaction`, elo 1:1 forçado por `uq_debt_payments_tx`. Os dois nunca se somam porque medem grandezas diferentes — a dupla contagem é estruturalmente impossível, não uma regra de relatório.

`payDebt()` roda **um único `db.batch()`**, com todos os UUIDs gerados antes:

1. `INSERT transactions` (19 colunas) — **só quando `kind='cash'`**. Sinal: `i_owe` → negativo, `owed_to_me` → positivo. `category_id` vem sempre de `SELECT id FROM categories WHERE slug='quitacao-divida'` (semeada na migration 0001 com `kind='debt_settlement'`) — nunca `income`/`expense`: classificar o recebimento como receita inflaria o faturamento e distorceria o cálculo do DAS.
2. `INSERT debt_payments`
3. N × `INSERT debt_payment_allocations`
4. `UPDATE debts SET status='settled'`, guardado por `EXISTS (debt_items)` + `NOT EXISTS (v_debt_item_balance … is_settled = 0)` — quitar o último item fecha a dívida sozinho.

Os tetos I1/I2 são dos **triggers** `trg_alloc_pagamento_teto` / `trg_alloc_item_teto`, não da aplicação. O D1 devolve `SQLITE_CONSTRAINT_TRIGGER`, o domínio relança como `OverAllocationError` e a rota traduz em **422 `over_allocation`**. Como `batch()` faz rollback real, a superalocação não deixa rastro: nem transaction, nem payment, nem alocação parcial. Alocar **exatamente** até o teto passa.

Teto de 100 bound params por statement: com 19 colunas, um `INSERT` multi-row de `transactions` cabe **5 linhas por statement**; `installments` (5 colunas) cabe 20.

| Rota                           | Sucesso | Erros                                                                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /api/debts`               | 200     | 400 `invalid_query`                                                                                           |
| `POST /api/debts`              | 201     | 400 `invalid_json`                                                                                            |
| `GET /api/debts/:id`           | 200     | 404 `not_found`                                                                                               |
| `POST /api/debts/:id/items`    | 201     | 400 `invalid_json`, 422 `constraint_violation`                                                                |
| `POST /api/debts/:id/payments` | 201     | 400 `invalid_json`, 404 `not_found`, 422 `invalid_account`, 422 `over_allocation`, 422 `constraint_violation` |

`kind='cash'` **exige** `account_id` (senão 422 `invalid_account`); `offset` e `forgiven` **recusam** `account_id` e não criam lançamento nenhum.

Testes: `pnpm --filter @piluvitu/financas exec vitest run src/domain/debts.test.ts` cobre o cenário real (Steam Deck 280000 + MacBook 450000, pagos 100000 + 100000 + 394000 ⇒ MacBook quitado e Steam Deck com 136000 em aberto) e as três queries do §5.4 do spec.
```

- [ ] **Step 36: Commitar**

```bash
git add apps/financas/src/domain/debts.ts apps/financas/src/domain/debts.test.ts \
        apps/financas/src/routes/debts.ts apps/financas/src/routes/debts.test.ts \
        apps/financas/src/index.ts apps/financas/CLAUDE.md
git commit -m "feat(financas): dívidas com itens, pagamento alocado e teto no banco" \
  -m "debt_items é estoque e nunca gera lançamento; debt_payments é fluxo e gera exatamente uma transaction (elo 1:1 via uq_debt_payments_tx). payDebt roda um único db.batch com transaction + payment + N alocações + UPDATE de quitação, com category_id lido do slug quitacao-divida. Superalocação vem dos triggers I1/I2 como SQLITE_CONSTRAINT_TRIGGER, vira OverAllocationError e 422 over_allocation, sem deixar rastro. Rotas GET/POST /api/debts, GET /api/debts/:id, POST /api/debts/:id/items e /payments montadas acima do catch-all."
```

---

### Task 10: Relatório de comprometido (`/api/reports/commitments`)

**Files:**

- Create: `apps/financas/src/domain/reports.ts`
- Create: `apps/financas/src/routes/reports.ts`
- Test: `apps/financas/src/domain/reports.test.ts`
- Modify: `apps/financas/src/index.ts`

**Interfaces:**

- Consumes:
  - `addMonthsToCompetence(competence: string, n: number): string` (Task 5)
  - `createAccount(db: D1Database, input: NewAccount): Promise<Account>` (Task 6)
  - `createTransaction(db: D1Database, input: NewTransaction): Promise<Transaction>` (Task 7)
  - `createDebt`, `addDebtItem` (Task 9)
  - `okJson<T>(data: T, status?: number): Response` / `errJson(status, code, message): Response` (Task 4)
  - View `v_debt_item_balance` e tabelas `transactions` / `accounts` / `debts` da migration 0001 (Task 2)
  - O setup file de Vitest da Task 3, que roda `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` antes de cada arquivo de teste
- Produces:
  - `export type CommitmentCell = { competence: string; account_id: string; account_name: string; committed_cents: number }`
  - `export type CommitmentReport = { competences: string[]; rows: Array<{ account_id: string; account_name: string; cells: number[] }>; totals: number[]; fixed_net_cents: number; pct_of_fixed_net: number[] }`
  - `export const DEFAULT_FIXED_NET_CENTS = 360000`
  - `export async function commitments(db: D1Database, opts: { from: string; months: number; fixed_net_cents: number }): Promise<CommitmentReport>`
  - Rota `GET /api/reports/commitments?from=YYYY-MM&months=6&fixed_net_cents=360000`

**Decisões de escopo desta task (fixadas aqui, não reabrir):**

1. **O denominador é o líquido SEM freela: R$ 3.600 = `360000` centavos** (§11 do spec: R$ 4.300 bruto − R$ 700 de camada PJ). Usar o líquido com freela (R$ 5.480) faria 60% virar 39% e esconderia exatamente o risco que a tela existe para mostrar. O valor é parâmetro (`fixed_net_cents`), e `DEFAULT_FIXED_NET_CENTS` é o default da rota.
2. **Só entra o que tem `bill_competence`** — parcela de cartão. Um lançamento previsto sem competência de fatura não sabe em qual mês cair, e chutar seria mentir.
3. **Dívida aberta entra inteira na PRIMEIRA competência da janela.** Na fatia ① dívida não tem cronograma (não existe coluna de vencimento em `debts`), então distribuir seria invenção. Colocar tudo no mês mais próximo é o tratamento conservador — erra para "comprometido demais", nunca para "de menos". Só `direction = 'i_owe'` conta: o que me devem não é compromisso meu.
4. **`transfer_id IS NULL` e `parent_id IS NULL`**, pelo mesmo motivo da view `v_cashflow`: perna de transferência e filha de rateio contariam duas vezes.
5. Cada célula é **positiva** (`-SUM(amount_cents)`), porque a tela mostra "quanto vou pagar". Célula que dá saldo líquido de entrada (estorno maior que a parcela) é descartada pelo `HAVING`.

- [ ] **Step 1: Escrever o teste do relatório**

Create `apps/financas/src/domain/reports.test.ts`:

```ts
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { createAccount } from './accounts'
import { createTransaction } from './transactions'
import { addDebtItem, createDebt } from './debts'
import { commitments, DEFAULT_FIXED_NET_CENTS } from './reports'

const db = env.DB

async function cartao(name: string) {
  return createAccount(db, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
  })
}

async function parcela(
  account_id: string,
  competence: string,
  cents: number,
  settled_at: string | null = null,
) {
  return createTransaction(db, {
    account_id,
    amount_cents: -cents,
    purchase_date: '2026-07-28',
    bill_competence: competence,
    settled_at,
    description: `parcela ${competence}`,
  })
}

describe('commitments', () => {
  it('devolve 6 competencias a partir do from, em ordem', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 124000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 6,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.competences).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ])
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].account_name).toBe('Nubank cartao')
    expect(report.rows[0].cells).toEqual([124000, 0, 0, 0, 0, 0])
  })

  it('soma varias parcelas na mesma competencia e separa por conta', async () => {
    const nubank = await cartao('Nubank cartao')
    const inter = await cartao('Inter cartao')
    await parcela(nubank.id, '2026-08', 100000)
    await parcela(nubank.id, '2026-08', 24000)
    await parcela(inter.id, '2026-08', 42000)
    await parcela(inter.id, '2026-09', 42000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    const porNome = Object.fromEntries(
      report.rows.map((r) => [r.account_name, r.cells]),
    )
    expect(porNome['Nubank cartao']).toEqual([124000, 0])
    expect(porNome['Inter cartao']).toEqual([42000, 42000])
    expect(report.totals).toEqual([166000, 42000])
  })

  it('conta sem parcela nenhuma na janela nao aparece', async () => {
    const nubank = await cartao('Nubank cartao')
    await cartao('Cartao dormente')
    const conta = await createAccount(db, {
      name: 'Nubank conta',
      scope: 'PF',
      kind: 'checking',
    })
    await createTransaction(db, {
      account_id: conta.id,
      amount_cents: -5000,
      purchase_date: '2026-08-10',
      description: 'mercado',
      settled_at: '2026-08-10',
    })
    await parcela(nubank.id, '2026-08', 124000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 3,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.rows.map((r) => r.account_name)).toEqual(['Nubank cartao'])
  })

  it('parcela ja liquidada (settled_at preenchido) nao conta', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 124000, '2026-08-05')
    await parcela(nubank.id, '2026-09', 124000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.rows[0].cells).toEqual([0, 124000])
    expect(report.totals).toEqual([0, 124000])
  })

  it('nao conta perna de transferencia nem filha de rateio', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 100000)

    const pai = await createTransaction(db, {
      account_id: nubank.id,
      amount_cents: -30000,
      purchase_date: '2026-07-28',
      bill_competence: '2026-08',
      description: 'mercado (pai)',
    })
    await db
      .prepare(
        `INSERT INTO transactions
           (id, account_id, amount_cents, currency, purchase_date, bill_competence,
            description, is_business, parent_id, created_at, updated_at)
         VALUES (?, ?, ?, 'BRL', ?, ?, ?, 0, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        nubank.id,
        -30000,
        '2026-07-28',
        '2026-08',
        'mercado (filha)',
        pai.id,
        '2026-07-28T12:00:00Z',
        '2026-07-28T12:00:00Z',
      )
      .run()

    const report = await commitments(db, {
      from: '2026-08',
      months: 1,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.totals).toEqual([130000])
  })

  it('percentual bate contra o liquido fixo, nunca contra o liquido com freela', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-08', 216000)
    await parcela(nubank.id, '2026-09', 90000)

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.fixed_net_cents).toBe(360000)
    expect(report.pct_of_fixed_net).toEqual([60, 25])
  })

  it('vira o ano corretamente', async () => {
    const nubank = await cartao('Nubank cartao')
    await parcela(nubank.id, '2026-12', 50000)
    await parcela(nubank.id, '2027-01', 50000)

    const report = await commitments(db, {
      from: '2026-11',
      months: 3,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.competences).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(report.rows[0].cells).toEqual([0, 50000, 50000])
  })

  it('saldo aberto de divida i_owe entra na primeira competencia da janela', async () => {
    const payeeId = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO payees (id, name, norm_name, kind, created_at)
         VALUES (?, 'Pai', 'PAI', 'person', ?)`,
      )
      .bind(payeeId, '2026-01-01T00:00:00Z')
      .run()

    const divida = await createDebt(db, {
      payee_id: payeeId,
      direction: 'i_owe',
      title: 'Pai',
      opened_at: '2026-03-01',
    })
    await addDebtItem(db, {
      debt_id: divida.id,
      description: 'Steam Deck',
      amount_cents: 280000,
      incurred_on: '2026-03-01',
    })

    const report = await commitments(db, {
      from: '2026-08',
      months: 3,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    const linha = report.rows.find((r) => r.account_name === 'Divida — Pai')
    expect(linha).toBeDefined()
    expect(linha!.cells).toEqual([280000, 0, 0])
    expect(report.totals).toEqual([280000, 0, 0])
  })

  it('divida owed_to_me nao é compromisso meu', async () => {
    const payeeId = crypto.randomUUID()
    await db
      .prepare(
        `INSERT INTO payees (id, name, norm_name, kind, created_at)
         VALUES (?, 'Amigo', 'AMIGO', 'person', ?)`,
      )
      .bind(payeeId, '2026-01-01T00:00:00Z')
      .run()

    const divida = await createDebt(db, {
      payee_id: payeeId,
      direction: 'owed_to_me',
      title: 'Amigo',
      opened_at: '2026-03-01',
    })
    await addDebtItem(db, {
      debt_id: divida.id,
      description: 'Notebook',
      amount_cents: 320000,
      incurred_on: '2026-03-01',
    })

    const report = await commitments(db, {
      from: '2026-08',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })

    expect(report.rows).toEqual([])
    expect(report.totals).toEqual([0, 0])
  })

  it('rejeita competencia e janela invalidas', async () => {
    await expect(
      commitments(db, { from: '2026-8', months: 6, fixed_net_cents: 360000 }),
    ).rejects.toThrow(RangeError)
    await expect(
      commitments(db, { from: '2026-08', months: 0, fixed_net_cents: 360000 }),
    ).rejects.toThrow(RangeError)
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas run test reports`

Esperado: FAIL com `Failed to resolve import "./reports"` — o módulo ainda não existe.

- [ ] **Step 3: Implementar `commitments`**

Create `apps/financas/src/domain/reports.ts`:

```ts
import { addMonthsToCompetence } from '../lib/dates'

export type CommitmentCell = {
  competence: string
  account_id: string
  account_name: string
  committed_cents: number
}

export type CommitmentReport = {
  competences: string[]
  rows: Array<{ account_id: string; account_name: string; cells: number[] }>
  totals: number[]
  fixed_net_cents: number
  pct_of_fixed_net: number[]
}

/**
 * Liquido em mes SEM freela: R$ 4.300 bruto − R$ 700 de camada PJ = R$ 3.600.
 * Este e o denominador correto do "% do liquido fixo". O liquido COM freela
 * (R$ 5.480) esconderia o risco que esta tela existe pra mostrar.
 */
export const DEFAULT_FIXED_NET_CENTS = 360000

const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/

type DebtRow = { debt_id: string; title: string; remaining_cents: number }

export async function commitments(
  db: D1Database,
  opts: { from: string; months: number; fixed_net_cents: number },
): Promise<CommitmentReport> {
  const { from, months, fixed_net_cents } = opts

  if (!COMPETENCE_RE.test(from)) {
    throw new RangeError(`competencia invalida: ${from} (esperado 'YYYY-MM')`)
  }
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new RangeError(
      `months invalido: ${months} (esperado inteiro entre 1 e 24)`,
    )
  }

  const competences = Array.from({ length: months }, (_, i) =>
    addMonthsToCompetence(from, i),
  )
  const slot = new Map(competences.map((c, i) => [c, i]))
  const placeholders = competences.map(() => '?').join(',')

  // Parcelas previstas: settled_at NULL. transfer_id/parent_id NULL pelo mesmo
  // motivo da view v_cashflow — perna de transferencia e filha de rateio
  // contariam duas vezes.
  const previstas = await db
    .prepare(
      `SELECT t.bill_competence   AS competence,
              t.account_id        AS account_id,
              a.name              AS account_name,
              -SUM(t.amount_cents) AS committed_cents
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE t.settled_at      IS NULL
          AND t.transfer_id     IS NULL
          AND t.parent_id       IS NULL
          AND t.bill_competence IS NOT NULL
          AND t.bill_competence IN (${placeholders})
        GROUP BY t.account_id, t.bill_competence
       HAVING SUM(t.amount_cents) < 0`,
    )
    .bind(...competences)
    .all<CommitmentCell>()

  // Divida aberta que EU devo. Sem cronograma na fatia ①, o saldo inteiro cai
  // na competencia mais proxima da janela (leitura conservadora).
  const dividas = await db
    .prepare(
      `SELECT d.id    AS debt_id,
              d.title AS title,
              SUM(CASE WHEN b.remaining_cents > 0 THEN b.remaining_cents ELSE 0 END)
                      AS remaining_cents
         FROM debts d
         JOIN v_debt_item_balance b ON b.debt_id = d.id
        WHERE d.status    = 'open'
          AND d.direction = 'i_owe'
        GROUP BY d.id
       HAVING remaining_cents > 0`,
    )
    .all<DebtRow>()

  const byId = new Map<
    string,
    { account_id: string; account_name: string; cells: number[] }
  >()
  const ensure = (account_id: string, account_name: string) => {
    let row = byId.get(account_id)
    if (!row) {
      row = { account_id, account_name, cells: competences.map(() => 0) }
      byId.set(account_id, row)
    }
    return row
  }

  for (const cell of previstas.results) {
    const i = slot.get(cell.competence)
    if (i === undefined) continue
    ensure(cell.account_id, cell.account_name).cells[i] += cell.committed_cents
  }

  for (const d of dividas.results) {
    ensure(`debt:${d.debt_id}`, `Divida — ${d.title}`).cells[0] +=
      d.remaining_cents
  }

  const rows = [...byId.values()].sort((a, b) =>
    a.account_name.localeCompare(b.account_name, 'pt-BR'),
  )
  const totals = competences.map((_, i) =>
    rows.reduce((sum, r) => sum + r.cells[i], 0),
  )
  const pct_of_fixed_net = totals.map((t) =>
    fixed_net_cents > 0 ? Math.round((t * 100) / fixed_net_cents) : 0,
  )

  return { competences, rows, totals, fixed_net_cents, pct_of_fixed_net }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas run test reports`

Esperado: PASS — 10 testes verdes.

- [ ] **Step 5: Criar a rota**

Create `apps/financas/src/routes/reports.ts`:

```ts
import { Hono } from 'hono'
import { commitments, DEFAULT_FIXED_NET_CENTS } from '../domain/reports'
import { errJson, okJson } from '../lib/envelope'

type Bindings = { DB: D1Database }

const reports = new Hono<{ Bindings: Bindings }>()

reports.get('/commitments', async (c) => {
  const from = c.req.query('from') ?? ''
  const months = Number(c.req.query('months') ?? '6')
  const fixed = Number(
    c.req.query('fixed_net_cents') ?? String(DEFAULT_FIXED_NET_CENTS),
  )

  try {
    const report = await commitments(c.env.DB, {
      from,
      months,
      fixed_net_cents:
        Number.isFinite(fixed) && fixed > 0 ? fixed : DEFAULT_FIXED_NET_CENTS,
    })
    return okJson(report)
  } catch (err) {
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})

export default reports
```

O handler HTTP não ganha teste automatizado nesta fatia: exercitá-lo exigiria burlar o middleware do Cloudflare Access montado no `/api/*` (Task 4). A cobertura fica no domínio (Step 1) e no checklist manual pós-deploy (Task 14).

- [ ] **Step 6: Montar a rota no `index.ts`**

Modify `apps/financas/src/index.ts` — adicionar o import junto dos outros imports de rota:

```ts
import reports from './routes/reports'
```

e a montagem junto das outras chamadas `app.route(...)`:

```ts
app.route('/api/reports', reports)
```

- [ ] **Step 7: Rodar a suíte inteira do Worker**

Run: `pnpm --filter @piluvitu/financas run test`

Esperado: PASS — nenhuma regressão nas suítes das Tasks 5–9.

- [ ] **Step 8: Formatar, checar tipos e commitar**

Run:

```
pnpm prettier:fix
pnpm --filter @piluvitu/financas exec tsc --noEmit
pnpm --filter @piluvitu/financas run test
```

Commit:

```
git add apps/financas/src/domain/reports.ts apps/financas/src/domain/reports.test.ts apps/financas/src/routes/reports.ts apps/financas/src/index.ts
git commit -m "feat(financas): relatorio de comprometido por competencia sobre o liquido fixo"
```

---

### Task 11: SPA — scaffold Vite, api client e tela de Contas

**Files:**

- Create: `apps/financas/web/package.json`
- Create: `apps/financas/web/vite.config.ts`
- Create: `apps/financas/web/tsconfig.json`
- Create: `apps/financas/web/index.html`
- Create: `apps/financas/web/.gitignore`
- Create: `apps/financas/web/src/test/setup.ts`
- Create: `apps/financas/web/src/main.tsx`
- Create: `apps/financas/web/src/styles.css`
- Create: `apps/financas/web/src/App.tsx`
- Create: `apps/financas/web/src/api.ts`
- Test: `apps/financas/web/src/api.test.ts`
- Create: `apps/financas/web/src/pages/accounts.tsx`
- Test: `apps/financas/web/src/pages/accounts.test.tsx`
- Modify: `pnpm-workspace.yaml`
- Modify: `apps/financas/wrangler.jsonc`
- Modify: `apps/financas/package.json`
- Test: `apps/financas/src/domain/accounts.test.ts` (adiciona 1 caso)

**Interfaces:**

- Consumes:
  - `formatBRL(cents: Cents): string` de `@piluvitu/tools/money` (Task 1)
  - `Envelope<T> = { ok: boolean; data: T | null; notifications: Notification[] }` (Task 4) — contrato de resposta que o client desembrulha
  - `listAccounts(db, opts?)` e `accountBalances(db)` (Task 6)
- Produces:
  - `export class ApiError extends Error { constructor(public status: number, public code: string, message: string) }`
  - `export async function api<T>(path: string, init?: RequestInit): Promise<T>`
  - `export type AccountView` e `export function AccountsPage()` em `web/src/pages/accounts.tsx`
  - Workspace `@piluvitu/financas-web` com `build` gerando `apps/financas/web/dist`, servido pelo Worker via Static Assets

**Por que Vite + React, e NÃO Next.js (decisão registrada, não reabrir):**

- O bundle de Worker no free tier é **3 MB gzip**. Next.js via `@opennextjs/cloudflare` não cabe; Hono ocupa **~14 kB**. Não é preferência de stack — é teto de plataforma.
- Com a SPA servida pelo mesmo Worker, **UI e API ficam no mesmo host**: some CORS, some cookie cross-site, e some o teto de 4,5 MB de body da Vercel (que quebraria o share-target com PDF de fatura na fatia ③).
- **Workers Static Assets é grátis, ilimitado, e NÃO consome a cota de 100.000 requests/dia** (limites: 20.000 arquivos por versão, 25 MiB por arquivo). Ou seja: cada `index.html`, `.js` e `.css` servido custa zero da cota — só as chamadas `/api/*` contam. É por isso que a SPA é mais barata que SSR aqui, não só mais leve.
- Consequência de roteamento: `assets.run_worker_first: ["/api/*"]` no `wrangler.jsonc` faz o Worker atender a API primeiro; todo o resto cai no asset router, com `not_found_handling: "single-page-application"` devolvendo `index.html` para as rotas do client.

- [ ] **Step 1: Registrar o novo workspace**

Modify `pnpm-workspace.yaml` — a lista `packages` passa a ser:

```yaml
packages:
  - 'apps/web'
  - 'apps/financas'
  - 'apps/financas/web'
  - 'packages/tools'
```

(`apps/financas` já foi adicionado na Task 3; a linha nova é `apps/financas/web`.)

Nenhuma dependência nova exige `allowBuilds`: `esbuild` — usado por Vite e Vitest — já está liberado com `esbuild: true`. Lembrete do `minimumReleaseAge: 1440`: versões publicadas há menos de 24 h são puladas pelo pnpm; se uma resolução falhar por isso, fixe a versão anterior em vez de mexer na política.

- [ ] **Step 2: Criar o package do SPA**

Create `apps/financas/web/package.json`:

```json
{
  "name": "@piluvitu/financas-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@piluvitu/tools": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.1.0",
    "jsdom": "^27.0.0",
    "typescript": "^5.9.3",
    "vite": "^7.2.0",
    "vitest": "^3.2.4"
  }
}
```

> `apps/financas/web/.gitignore` **já foi criado na Task 2** — não recrie. Em vez disso, troque o `pretest` de `apps/financas/package.json` (que na Task 2 gerava um placeholder) pelo build real:
>
> ```json
>     "pretest": "pnpm --filter @piluvitu/financas-web build"
> ```

Create `apps/financas/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `apps/financas/web/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // @piluvitu/tools é fonte TS linkada pelo workspace: sem exclude, o
  // pre-bundle do Vite tenta tratar como dep publicada e falha no .ts.
  optimizeDeps: { exclude: ['@piluvitu/tools'] },
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5273,
    // `wrangler dev` sobe o Worker em 8787; o proxy evita CORS no dev.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

Create `apps/financas/web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sem `globals: true` o auto-cleanup da Testing Library não se registra.
afterEach(() => {
  cleanup()
})
```

Create `apps/financas/web/index.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Finanças</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/financas/web/src/styles.css`:

```css
:root {
  color-scheme: light dark;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    sans-serif;
}

body {
  margin: 0;
  padding: 1rem;
}

nav a {
  margin-right: 1rem;
}

table {
  border-collapse: collapse;
  width: 100%;
}

th,
td {
  padding: 0.25rem 0.5rem;
  text-align: right;
  border-bottom: 1px solid rgba(128, 128, 128, 0.3);
}

th:first-child,
td:first-child {
  text-align: left;
}
```

Create `apps/financas/web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Run: `pnpm install`

Esperado: instalação verde, com `apps/financas/web` listado como workspace novo.

- [ ] **Step 3: Escrever o teste do api client**

Create `apps/financas/web/src/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

type FetchMock = ReturnType<typeof vi.fn>

function mockFetch(response: unknown) {
  const fn = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fn)
  return fn as FetchMock
}

function envelopeResponse(status: number, body: unknown) {
  return { status, json: async () => body }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api', () => {
  it('desembrulha o envelope e devolve data', async () => {
    const fetchMock = mockFetch(
      envelopeResponse(200, {
        ok: true,
        data: [{ id: 'a1' }],
        notifications: [],
      }),
    )

    const data = await api<Array<{ id: string }>>('/api/accounts')

    expect(data).toEqual([{ id: 'a1' }])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/accounts',
      expect.objectContaining({
        headers: expect.objectContaining({
          'content-type': 'application/json',
        }),
      }),
    )
  })

  it('lanca ApiError com status, code e message da notificacao de erro', async () => {
    mockFetch(
      envelopeResponse(409, {
        ok: false,
        data: null,
        notifications: [
          { type: 'warning', code: 'ignorar', message: 'nao é essa' },
          {
            type: 'error',
            code: 'over_allocation',
            message: 'alocacao excede o valor do item',
          },
        ],
      }),
    )

    await expect(
      api('/api/debts/d1/payments', { method: 'POST' }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'over_allocation',
      message: 'alocacao excede o valor do item',
    })
  })

  it('lanca ApiError invalid_envelope quando a resposta nao é envelope', async () => {
    // Cenário real: o Cloudflare Access devolve HTML de login em vez de JSON.
    mockFetch({
      status: 302,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    })

    const err = await api('/api/accounts').catch((e) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('invalid_envelope')
    expect(err.status).toBe(302)
  })

  it('repassa method e body', async () => {
    const fetchMock = mockFetch(
      envelopeResponse(200, { ok: true, data: { id: 'x' }, notifications: [] }),
    )

    await api('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/transactions',
      expect.objectContaining({ method: 'POST', body: '{"a":1}' }),
    )
  })
})
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas-web run test api`

Esperado: FAIL com `Failed to resolve import "./api"` — o módulo ainda não existe.

- [ ] **Step 5: Implementar o api client**

Create `apps/financas/web/src/api.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type Notification = {
  type: 'error' | 'warning' | 'info'
  code: string
  message: string
}
type Envelope<T> = {
  ok: boolean
  data: T | null
  notifications: Notification[]
}

/**
 * `path` é o caminho completo, incluindo o prefixo /api (ex.: '/api/accounts').
 * UI e API moram no mesmo host — não existe base URL configurável.
 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })

  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }

  const envelope = body as Envelope<T> | null
  if (!envelope || typeof envelope.ok !== 'boolean') {
    throw new ApiError(
      res.status,
      'invalid_envelope',
      `resposta sem envelope (HTTP ${res.status})`,
    )
  }

  if (!envelope.ok) {
    const notes = envelope.notifications ?? []
    const note = notes.find((n) => n.type === 'error') ?? notes[0]
    throw new ApiError(
      res.status,
      note?.code ?? 'unknown',
      note?.message ?? 'erro desconhecido',
    )
  }

  return envelope.data as T
}
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas-web run test api`

Esperado: PASS — 4 testes verdes.

> **Steps 7 e 8 removidos por decisão do dono do repo (conflito de plano).** Eles mandavam alterar `src/routes/accounts.ts` para mesclar `balance_cents` no payload — mas a **Task 6 já entrega exatamente isso**, com teste de rota provando (`expect(body.data[0].balance_cents).toBe(412000)`). Aplicar o trecho como estava renomearia o handler e faria `GET /api/accounts` deixar de existir, virando `GET /api`. A Task 11 consome a rota que já existe; não a modifica.

- [ ] **Step 9: Escrever o teste da tela de Contas**

Create `apps/financas/web/src/pages/accounts.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountsPage } from './accounts'

const contas = [
  {
    id: 'a1',
    name: 'Nubank',
    scope: 'PF',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 234012,
  },
  {
    id: 'a2',
    name: 'Nubank cartao',
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
    balance_cents: -184790,
  },
  {
    id: 'a3',
    name: 'Inter PJ',
    scope: 'PJ',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 412000,
  },
]

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ status, json: async () => body }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountsPage', () => {
  it('agrupa por scope e formata saldo com formatBRL', async () => {
    mockFetch({ ok: true, data: contas, notifications: [] })

    render(<AccountsPage />)

    await waitFor(() =>
      expect(screen.getByTestId('grupo-PF')).toBeInTheDocument(),
    )

    const pf = within(screen.getByTestId('grupo-PF'))
    expect(pf.getByText('Nubank')).toBeInTheDocument()
    expect(pf.getByTestId('saldo-a1')).toHaveTextContent('R$ 2.340,12')
    expect(pf.getByTestId('saldo-a2')).toHaveTextContent('-R$ 1.847,90')

    const pj = within(screen.getByTestId('grupo-PJ'))
    expect(pj.getByTestId('saldo-a3')).toHaveTextContent('R$ 4.120,00')
    expect(pj.queryByText('Nubank')).not.toBeInTheDocument()
  })

  it('mostra fechamento e vencimento so no cartao', async () => {
    mockFetch({ ok: true, data: contas, notifications: [] })

    render(<AccountsPage />)

    await waitFor(() =>
      expect(screen.getByTestId('fatura-a2')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('fatura-a2')).toHaveTextContent(
      'fecha 25 · vence 05',
    )
    expect(screen.queryByTestId('fatura-a1')).not.toBeInTheDocument()
  })

  it('mostra a mensagem de erro da API', async () => {
    mockFetch(
      {
        ok: false,
        data: null,
        notifications: [
          { type: 'error', code: 'forbidden', message: 'acesso negado' },
        ],
      },
      403,
    )

    render(<AccountsPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('acesso negado'),
    )
  })
})
```

- [ ] **Step 10: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas-web run test accounts`

Esperado: FAIL com `Failed to resolve import "./accounts"` — a página ainda não existe.

- [ ] **Step 11: Implementar a tela de Contas**

Create `apps/financas/web/src/pages/accounts.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'

export type AccountView = {
  id: string
  name: string
  scope: 'PJ' | 'PF'
  kind: string
  closing_day: number | null
  due_day: number | null
  balance_cents: number
}

const SCOPES = ['PF', 'PJ'] as const

function dd(n: number): string {
  return String(n).padStart(2, '0')
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountView[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<AccountView[]>('/api/accounts')
      .then((data) => {
        if (vivo) setAccounts(data)
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  if (error) return <p role="alert">{error}</p>
  if (!accounts) return <p>Carregando…</p>

  return (
    <section>
      <h1>Contas</h1>
      {SCOPES.map((scope) => {
        const list = accounts.filter((a) => a.scope === scope)
        if (list.length === 0) return null
        return (
          <div key={scope} data-testid={`grupo-${scope}`}>
            <h2>{scope}</h2>
            <table>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.name}
                      {a.kind === 'credit_card' &&
                      a.closing_day !== null &&
                      a.due_day !== null ? (
                        <small data-testid={`fatura-${a.id}`}>
                          {` fecha ${dd(a.closing_day)} · vence ${dd(a.due_day)}`}
                        </small>
                      ) : null}
                    </td>
                    <td data-testid={`saldo-${a.id}`}>
                      {formatBRL(a.balance_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </section>
  )
}
```

Create `apps/financas/web/src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { AccountsPage } from './pages/accounts'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/contas')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/contas')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

export function App() {
  const hash = useHash()

  return (
    <>
      <nav>
        <a href="#/contas">Contas</a>
      </nav>
      {hash.startsWith('#/contas') ? (
        <AccountsPage />
      ) : (
        <p>Rota desconhecida: {hash}</p>
      )}
    </>
  )
}
```

- [ ] **Step 12: Rodar os testes e confirmar que passam**

Run: `pnpm --filter @piluvitu/financas-web run test`

Esperado: PASS — 7 testes verdes (4 de `api`, 3 de `accounts`).

- [ ] **Step 13: Servir o `dist` pelo Worker**

Modify `apps/financas/wrangler.jsonc` — adicionar o bloco `assets` no nível raiz da config:

```jsonc
  "assets": {
    // Static Assets é grátis e NÃO consome a cota de 100k requests/dia.
    "directory": "./web/dist",
    // Rotas do client (#/…) e deep links caem no index.html.
    "not_found_handling": "single-page-application",
    // A API roda ANTES do asset router; o resto vai direto pro asset.
    "run_worker_first": ["/api/*"]
  },
```

Modify `apps/financas/package.json` — garantir estes scripts (mantendo os que a Task 3 já criou):

```json
  "scripts": {
    "build:web": "pnpm --filter @piluvitu/financas-web build",
    "dev": "pnpm run build:web && wrangler dev",
    "deploy": "pnpm run build:web && wrangler deploy",
    "lint": "tsc --noEmit",
    "test": "vitest run"
  }
```

- [ ] **Step 14: Verificar o build de ponta a ponta**

Run:

```
pnpm --filter @piluvitu/financas-web run build
ls apps/financas/web/dist/index.html
```

Esperado: build verde e o `index.html` presente em `apps/financas/web/dist/`.

- [ ] **Step 15: Formatar, checar tipos e commitar**

Run:

```
pnpm prettier:fix
pnpm --filter @piluvitu/financas-web run lint
pnpm --filter @piluvitu/financas exec tsc --noEmit
pnpm --filter @piluvitu/financas-web run test
pnpm --filter @piluvitu/financas run test
```

Commit:

```
git add pnpm-workspace.yaml pnpm-lock.yaml apps/financas/web apps/financas/wrangler.jsonc apps/financas/package.json apps/financas/src/routes/accounts.ts apps/financas/src/domain/accounts.test.ts
git commit -m "feat(financas): SPA Vite + api client com envelope + tela de contas com saldo"
```

---

### Task 12: SPA — tela de Dívida (itens, pagamentos e alocação)

**Files:**

- Create: `apps/financas/web/src/pages/debt-detail.tsx`
- Test: `apps/financas/web/src/pages/debt-detail.test.tsx`
- Modify: `apps/financas/web/src/App.tsx`
- Modify: `apps/financas/web/src/styles.css`

**Interfaces:**

- Consumes:
  - `api<T>(path, init?)` e `ApiError` (Task 11)
  - `formatBRL(cents)`, `parseBRL(input)`, `sumCents(values)` de `@piluvitu/tools/money` (Task 1)
  - `GET /api/debts/:id` → `{ debt, items: DebtItemBalance[], payments: Array<DebtPayment & { allocations }> }` (Task 9)
  - `POST /api/debts/:id/payments` com body `{ paid_on, amount_cents, allocations, kind, account_id, description }` (Task 9)
  - `GET /api/accounts` → `AccountView[]` (Task 11), para escolher a conta pagadora quando `kind = 'cash'`
- Produces:
  - `export type DebtDetailView`
  - `export function validateAllocations(input: { total_cents: number; items: DebtItemBalanceView[]; alloc: Record<string, number> }): string | null`
  - `export function DebtDetailPage({ debtId }: { debtId: string })`
  - Rota `#/dividas/<id>` no `App`

**Regra de confiança (fixada aqui):** o formulário barra no cliente exatamente o que os triggers `trg_alloc_item_teto` / `trg_alloc_pagamento_teto` barram no banco — soma das alocações acima do valor do pagamento, e alocação acima do saldo do item. Isso é **conveniência de UX, não segurança**: a verdade continua sendo o `RAISE(ABORT)` do D1, que reverte o `batch()` inteiro (medido em 2026-07-25). Por isso o `catch` do submit trata o `OverAllocationError` que volta da API como caminho esperado, com teste dedicado — nunca como "não deveria acontecer".

- [ ] **Step 1: Escrever o teste do guard puro de alocação**

Create `apps/financas/web/src/pages/debt-detail.test.tsx`:

```tsx
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DebtDetailPage, validateAllocations } from './debt-detail'

const items = [
  {
    item_id: 'i1',
    debt_id: 'd1',
    description: 'MacBook Air',
    amount_cents: 450000,
    allocated_cents: 450000,
    remaining_cents: 0,
    is_settled: 1,
  },
  {
    item_id: 'i2',
    debt_id: 'd1',
    description: 'Steam Deck',
    amount_cents: 280000,
    allocated_cents: 144000,
    remaining_cents: 136000,
    is_settled: 0,
  },
]

const detail = {
  debt: {
    id: 'd1',
    payee_id: 'p1',
    direction: 'i_owe',
    title: 'Pai',
    currency: 'BRL',
    opened_at: '2026-03-01',
    status: 'open',
    settled_at: null,
    notes: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  items,
  payments: [
    {
      id: 'pg1',
      debt_id: 'd1',
      paid_on: '2026-05-10',
      amount_cents: 294000,
      kind: 'cash',
      transaction_id: 'tx1',
      notes: null,
      created_at: '2026-05-10T00:00:00Z',
      allocations: [
        { item_id: 'i1', amount_cents: 150000 },
        { item_id: 'i2', amount_cents: 144000 },
      ],
    },
  ],
}

const contas = [
  {
    id: 'a1',
    name: 'Nubank',
    scope: 'PF',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 234012,
  },
]

function ok(data: unknown, status = 200) {
  return { status, json: async () => ({ ok: true, data, notifications: [] }) }
}

function fail(status: number, code: string, message: string) {
  return {
    status,
    json: async () => ({
      ok: false,
      data: null,
      notifications: [{ type: 'error', code, message }],
    }),
  }
}

/** Responde por rota, na ordem em que a tela chama. */
function mockRoutes(post?: unknown) {
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST')
      return post ?? ok({ payment: {}, transaction: null }, 201)
    if (path.startsWith('/api/accounts')) return ok(contas)
    if (path.startsWith('/api/debts/')) return ok(detail)
    throw new Error(`rota nao mockada: ${path}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateAllocations', () => {
  it('aceita alocacao que fecha exatamente no teto do item', () => {
    expect(
      validateAllocations({
        total_cents: 136000,
        items,
        alloc: { i2: 136000 },
      }),
    ).toBeNull()
  })

  it('recusa valor de pagamento zerado', () => {
    expect(validateAllocations({ total_cents: 0, items, alloc: {} })).toMatch(
      /maior que zero/,
    )
  })

  it('recusa soma de alocacoes acima do valor do pagamento', () => {
    expect(
      validateAllocations({ total_cents: 50000, items, alloc: { i2: 60000 } }),
    ).toMatch(/valor do pagamento/)
  })

  it('recusa alocacao acima do saldo do item', () => {
    expect(
      validateAllocations({
        total_cents: 300000,
        items,
        alloc: { i2: 200000 },
      }),
    ).toMatch(/Steam Deck/)
  })

  it('recusa alocacao em item ja quitado', () => {
    expect(
      validateAllocations({ total_cents: 10000, items, alloc: { i1: 10000 } }),
    ).toMatch(/MacBook Air/)
  })

  it('aceita alocacao parcial (sobra sem alocar)', () => {
    expect(
      validateAllocations({
        total_cents: 200000,
        items,
        alloc: { i2: 136000 },
      }),
    ).toBeNull()
  })
})

describe('DebtDetailPage', () => {
  it('mostra itens com total/pago/falta e marca o quitado', async () => {
    mockRoutes()

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByTestId('item-i1')).toBeInTheDocument(),
    )

    const macbook = within(screen.getByTestId('item-i1'))
    expect(macbook.getByTestId('item-i1-total')).toHaveTextContent(
      'R$ 4.500,00',
    )
    expect(macbook.getByTestId('item-i1-pago')).toHaveTextContent('R$ 4.500,00')
    expect(macbook.getByTestId('item-i1-falta')).toHaveTextContent('R$ 0,00')
    expect(screen.getByTestId('item-i1')).toHaveClass('quitado')

    const steam = within(screen.getByTestId('item-i2'))
    expect(steam.getByTestId('item-i2-falta')).toHaveTextContent('R$ 1.360,00')
    expect(screen.getByTestId('item-i2')).not.toHaveClass('quitado')
  })

  it('lista pagamentos com a alocacao de cada um por item', async () => {
    mockRoutes()

    render(<DebtDetailPage debtId="d1" />)

    await waitFor(() =>
      expect(screen.getByTestId('pagamento-pg1')).toBeInTheDocument(),
    )

    const pg = within(screen.getByTestId('pagamento-pg1'))
    expect(pg.getByText('10/05/2026')).toBeInTheDocument()
    expect(pg.getByTestId('pagamento-pg1-total')).toHaveTextContent(
      'R$ 2.940,00',
    )
    expect(pg.getByTestId('alloc-pg1-i1')).toHaveTextContent('MacBook Air')
    expect(pg.getByTestId('alloc-pg1-i1')).toHaveTextContent('R$ 1.500,00')
    expect(pg.getByTestId('alloc-pg1-i2')).toHaveTextContent('R$ 1.440,00')
  })

  it('barra a superalocacao no cliente e NAO chama a API', async () => {
    const fetchMock = mockRoutes()

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '500,00' },
    })
    fireEvent.change(screen.getByLabelText('Steam Deck'), {
      target: { value: '900,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/valor do pagamento/),
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('envia o pagamento dividido entre itens quando o guard passa', async () => {
    const fetchMock = mockRoutes()

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-08-05' },
    })
    fireEvent.change(screen.getByLabelText('Steam Deck'), {
      target: { value: '1.360,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      )
      expect(post).toBeDefined()
      expect(post![0]).toBe('/api/debts/d1/payments')
      expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({
        paid_on: '2026-08-05',
        amount_cents: 136000,
        kind: 'cash',
        account_id: 'a1',
        description: 'Pgto divida — Pai',
        allocations: [{ item_id: 'i2', amount_cents: 136000 }],
      })
    })
  })

  it('mostra o OverAllocationError vindo da API mesmo com o guard do cliente ok', async () => {
    // O trigger do D1 é a verdade: o cliente pode estar com dado velho.
    mockRoutes(fail(409, 'over_allocation', 'alocacao excede o valor do item'))

    render(<DebtDetailPage debtId="d1" />)
    await waitFor(() =>
      expect(screen.getByTestId('item-i2')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(screen.getByLabelText('Steam Deck'), {
      target: { value: '1.360,00' },
    })
    fireEvent.submit(screen.getByTestId('form-pagamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'O banco recusou: alocacao excede o valor do item. Nada foi gravado — recarregue a divida.',
      ),
    )
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas-web run test debt-detail`

Esperado: FAIL com `Failed to resolve import "./debt-detail"` — a página ainda não existe.

- [ ] **Step 3: Implementar a tela de Dívida**

Create `apps/financas/web/src/pages/debt-detail.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL, sumCents } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import type { AccountView } from './accounts'

export type DebtItemBalanceView = {
  item_id: string
  debt_id: string
  description: string
  amount_cents: number
  allocated_cents: number
  remaining_cents: number
  is_settled: number
}

export type DebtPaymentView = {
  id: string
  debt_id: string
  paid_on: string
  amount_cents: number
  kind: 'cash' | 'offset' | 'forgiven'
  transaction_id: string | null
  notes: string | null
  allocations: Array<{ item_id: string; amount_cents: number }>
}

export type DebtDetailView = {
  debt: {
    id: string
    title: string
    direction: 'i_owe' | 'owed_to_me'
    status: 'open' | 'settled' | 'written_off'
  }
  items: DebtItemBalanceView[]
  payments: DebtPaymentView[]
}

/**
 * Espelho, no cliente, do que os triggers trg_alloc_item_teto e
 * trg_alloc_pagamento_teto barram no D1. Devolve a primeira mensagem de erro,
 * ou null. NAO é a fonte de verdade — só evita ida e volta óbvia.
 */
export function validateAllocations(input: {
  total_cents: number
  items: DebtItemBalanceView[]
  alloc: Record<string, number>
}): string | null {
  const { total_cents, items, alloc } = input

  if (total_cents <= 0) return 'Informe um valor de pagamento maior que zero.'

  for (const item of items) {
    const valor = alloc[item.item_id] ?? 0
    if (valor < 0) return `Alocação negativa em ${item.description}.`
    if (valor > item.remaining_cents) {
      return `${item.description} tem só ${formatBRL(item.remaining_cents)} em aberto — não dá para alocar ${formatBRL(valor)}.`
    }
  }

  const alocado = sumCents(items.map((i) => alloc[i.item_id] ?? 0))
  if (alocado > total_cents) {
    return `A soma das alocações (${formatBRL(alocado)}) passa do valor do pagamento (${formatBRL(total_cents)}).`
  }

  return null
}

function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function DebtDetailPage({ debtId }: { debtId: string }) {
  const [detail, setDetail] = useState<DebtDetailView | null>(null)
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [valor, setValor] = useState('')
  const [paidOn, setPaidOn] = useState('')
  const [accountId, setAccountId] = useState('')
  const [allocRaw, setAllocRaw] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function carregar() {
    const [d, contas] = await Promise.all([
      api<DebtDetailView>(`/api/debts/${debtId}`),
      api<AccountView[]>('/api/accounts'),
    ])
    setDetail(d)
    setAccounts(contas)
    setAccountId((atual) => atual || contas[0]?.id || '')
  }

  useEffect(() => {
    carregar().catch((e: unknown) =>
      setLoadError(e instanceof ApiError ? e.message : String(e)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtId])

  const totalCents = useMemo(() => {
    if (valor.trim() === '') return 0
    try {
      return parseBRL(valor)
    } catch {
      return -1
    }
  }, [valor])

  const alloc = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [id, raw] of Object.entries(allocRaw)) {
      if (raw.trim() === '') continue
      try {
        out[id] = parseBRL(raw)
      } catch {
        out[id] = -1
      }
    }
    return out
  }, [allocRaw])

  if (loadError) return <p role="alert">{loadError}</p>
  if (!detail) return <p>Carregando…</p>

  const totalDivida = sumCents(detail.items.map((i) => i.amount_cents))
  const emAberto = sumCents(
    detail.items.map((i) => Math.max(0, i.remaining_cents)),
  )
  const descricaoItem = (id: string) =>
    detail.items.find((i) => i.item_id === id)?.description ?? id

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (totalCents < 0) {
      setFormError('Valor inválido. Use o formato 1.360,00.')
      return
    }

    const erro = validateAllocations({
      total_cents: totalCents,
      items: detail!.items,
      alloc,
    })
    if (erro) {
      setFormError(erro)
      return
    }
    if (!accountId) {
      setFormError('Escolha a conta de onde o dinheiro sai.')
      return
    }

    const allocations = Object.entries(alloc)
      .filter(([, cents]) => cents > 0)
      .map(([item_id, amount_cents]) => ({ item_id, amount_cents }))

    setEnviando(true)
    try {
      await api(`/api/debts/${debtId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          paid_on: paidOn || new Date().toISOString().slice(0, 10),
          amount_cents: totalCents,
          kind: 'cash',
          account_id: accountId,
          description: `Pgto divida — ${detail!.debt.title}`,
          allocations,
        }),
      })
      setValor('')
      setAllocRaw({})
      await carregar()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'over_allocation') {
        // O trigger do D1 abortou e o batch inteiro reverteu: nem pagamento,
        // nem lançamento no caixa, nem alocação parcial ficaram.
        setFormError(
          `O banco recusou: ${err.message}. Nada foi gravado — recarregue a divida.`,
        )
      } else {
        setFormError(err instanceof ApiError ? err.message : String(err))
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section>
      <h1>Dívida · {detail.debt.title}</h1>
      <p>
        {detail.debt.direction === 'i_owe' ? 'devo' : 'me devem'}{' '}
        <strong>{formatBRL(emAberto)}</strong> de {formatBRL(totalDivida)}
      </p>

      <h2>Itens</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>total</th>
            <th>pago</th>
            <th>falta</th>
          </tr>
        </thead>
        <tbody>
          {detail.items.map((i) => (
            <tr
              key={i.item_id}
              data-testid={`item-${i.item_id}`}
              className={i.is_settled ? 'quitado' : undefined}
            >
              <td>
                {i.description}
                {i.is_settled ? <span aria-label="quitado"> ✓</span> : null}
              </td>
              <td data-testid={`item-${i.item_id}-total`}>
                {formatBRL(i.amount_cents)}
              </td>
              <td data-testid={`item-${i.item_id}-pago`}>
                {formatBRL(i.allocated_cents)}
              </td>
              <td data-testid={`item-${i.item_id}-falta`}>
                {formatBRL(Math.max(0, i.remaining_cents))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Pagamentos</h2>
      <ul>
        {detail.payments.map((p) => (
          <li key={p.id} data-testid={`pagamento-${p.id}`}>
            <span>{dataBR(p.paid_on)}</span>{' '}
            <strong data-testid={`pagamento-${p.id}-total`}>
              {formatBRL(p.amount_cents)}
            </strong>
            <ul>
              {p.allocations.map((a) => (
                <li key={a.item_id} data-testid={`alloc-${p.id}-${a.item_id}`}>
                  {descricaoItem(a.item_id)} · {formatBRL(a.amount_cents)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <h2>Novo pagamento</h2>
      <form onSubmit={enviar} data-testid="form-pagamento">
        <label>
          Valor
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="1.360,00"
          />
        </label>
        <label>
          Data
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </label>
        <label>
          Conta
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Dividir entre itens</legend>
          {detail.items.map((i) => (
            <label key={i.item_id}>
              {i.description}
              <input
                value={allocRaw[i.item_id] ?? ''}
                disabled={i.is_settled === 1}
                onChange={(e) =>
                  setAllocRaw((prev) => ({
                    ...prev,
                    [i.item_id]: e.target.value,
                  }))
                }
                placeholder={formatBRL(Math.max(0, i.remaining_cents))}
              />
            </label>
          ))}
        </fieldset>

        {formError ? <p role="alert">{formError}</p> : null}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Registrar pagamento'}
        </button>
      </form>
    </section>
  )
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas-web run test debt-detail`

Esperado: PASS — 12 testes verdes (6 do guard puro, 6 da tela).

- [ ] **Step 5: Ligar a rota `#/dividas/<id>` no App**

Modify `apps/financas/web/src/App.tsx` — conteúdo completo:

```tsx
import { useEffect, useState } from 'react'
import { AccountsPage } from './pages/accounts'
import { DebtDetailPage } from './pages/debt-detail'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/contas')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/contas')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

export function App() {
  const hash = useHash()
  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null

  return (
    <>
      <nav>
        <a href="#/contas">Contas</a>
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : hash.startsWith('#/contas') ? (
        <AccountsPage />
      ) : (
        <p>Rota desconhecida: {hash}</p>
      )}
    </>
  )
}
```

Modify `apps/financas/web/src/styles.css` — acrescentar ao final:

```css
tr.quitado {
  opacity: 0.55;
}

tr.quitado td:first-child {
  text-decoration: line-through;
}

fieldset label,
form > label {
  display: block;
  margin: 0.25rem 0;
}
```

- [ ] **Step 6: Rodar a suíte do SPA inteira**

Run: `pnpm --filter @piluvitu/financas-web run test`

Esperado: PASS — 19 testes verdes, sem regressão em `api` e `accounts`.

- [ ] **Step 7: Formatar, checar tipos e commitar**

Run:

```
pnpm prettier:fix
pnpm --filter @piluvitu/financas-web run lint
pnpm --filter @piluvitu/financas-web run test
```

Commit:

```
git add apps/financas/web/src/pages/debt-detail.tsx apps/financas/web/src/pages/debt-detail.test.tsx apps/financas/web/src/App.tsx apps/financas/web/src/styles.css
git commit -m "feat(financas): tela de divida com itens, pagamentos e alocacao por item"
```

---

### Task 13: SPA — telas de Comprometido e Lançamento

**Files:**

- Create: `apps/financas/web/src/pages/commitments.tsx`
- Test: `apps/financas/web/src/pages/commitments.test.tsx`
- Create: `apps/financas/web/src/pages/new-entry.tsx`
- Test: `apps/financas/web/src/pages/new-entry.test.tsx`
- Modify: `apps/financas/web/src/App.tsx`
- Modify: `apps/financas/web/src/styles.css`

**Interfaces:**

- Consumes:
  - `api<T>(path, init?)` e `ApiError` (Task 11)
  - `AccountView` de `./accounts` (Task 11)
  - `formatBRL`, `parseBRL` de `@piluvitu/tools/money` (Task 1)
  - `GET /api/reports/commitments?from=YYYY-MM&months=6` → `CommitmentReport` (Task 10)
  - `POST /api/transactions` com `NewTransaction` (Task 7)
  - `POST /api/installment-plans` com `NewInstallmentPlan` (Task 8)
- Produces:
  - `export type CommitmentReportView` e `export function CommitmentsPage()`
  - `export function NewEntryPage()`
  - Rotas `#/comprometido` e `#/lancar` no `App`

- [ ] **Step 1: Escrever o teste da tela Comprometido**

Create `apps/financas/web/src/pages/commitments.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommitmentsPage } from './commitments'

const report = {
  competences: [
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
  ],
  rows: [
    {
      account_id: 'debt:d1',
      account_name: 'Divida — Pai',
      cells: [50000, 50000, 36000, 0, 0, 0],
    },
    {
      account_id: 'a2',
      account_name: 'Inter cartao',
      cells: [42000, 42000, 42000, 42000, 0, 0],
    },
    {
      account_id: 'a1',
      account_name: 'Nubank cartao',
      cells: [124000, 124000, 124000, 89000, 89000, 89000],
    },
  ],
  totals: [216000, 216000, 202000, 131000, 89000, 89000],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [60, 60, 56, 36, 25, 25],
}

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CommitmentsPage', () => {
  it('pede 6 competencias e monta a matriz competencia x conta', async () => {
    const fetchMock = mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-a1')).toBeInTheDocument(),
    )

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/reports/commitments?from=2026-08&months=6',
    )

    const cabecalho = within(screen.getByTestId('cabecalho'))
    expect(cabecalho.getByText('ago/26')).toBeInTheDocument()
    expect(cabecalho.getByText('jan/27')).toBeInTheDocument()

    const nubank = within(screen.getByTestId('linha-a1'))
    expect(nubank.getByTestId('celula-a1-0')).toHaveTextContent('R$ 1.240,00')
    expect(nubank.getByTestId('celula-a1-3')).toHaveTextContent('R$ 890,00')
  })

  it('mostra TOTAL e % do liquido fixo', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(screen.getByTestId('total-0')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('total-0')).toHaveTextContent('R$ 2.160,00')
    expect(screen.getByTestId('pct-0')).toHaveTextContent('60%')
    expect(screen.getByTestId('pct-4')).toHaveTextContent('25%')
    expect(screen.getByTestId('denominador')).toHaveTextContent('R$ 3.600,00')
  })

  it('destaca em vermelho so o que passa de 50%', async () => {
    mockFetch({ ok: true, data: report, notifications: [] })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() => expect(screen.getByTestId('pct-0')).toBeInTheDocument())
    expect(screen.getByTestId('pct-0')).toHaveClass('alerta') // 60%
    expect(screen.getByTestId('pct-2')).toHaveClass('alerta') // 56%
    expect(screen.getByTestId('pct-3')).not.toHaveClass('alerta') // 36%
    expect(screen.getByTestId('pct-5')).not.toHaveClass('alerta') // 25%
  })

  it('mostra estado vazio quando nao ha comprometimento', async () => {
    mockFetch({
      ok: true,
      data: {
        ...report,
        rows: [],
        totals: [0, 0, 0, 0, 0, 0],
        pct_of_fixed_net: [0, 0, 0, 0, 0, 0],
      },
      notifications: [],
    })

    render(<CommitmentsPage from="2026-08" />)

    await waitFor(() =>
      expect(
        screen.getByText('Nenhuma parcela ou dívida em aberto na janela.'),
      ).toBeInTheDocument(),
    )
  })

  it('mostra o erro da API', async () => {
    mockFetch(
      {
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'invalid_query',
            message: 'competencia invalida: 2026-8',
          },
        ],
      },
      400,
    )

    render(<CommitmentsPage from="2026-8" />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'competencia invalida',
      ),
    )
  })
})
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas-web run test commitments`

Esperado: FAIL com `Failed to resolve import "./commitments"` — a página ainda não existe.

- [ ] **Step 3: Implementar a tela Comprometido**

Create `apps/financas/web/src/pages/commitments.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'

export type CommitmentReportView = {
  competences: string[]
  rows: Array<{ account_id: string; account_name: string; cells: number[] }>
  totals: number[]
  fixed_net_cents: number
  pct_of_fixed_net: number[]
}

const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

/** '2026-08' -> 'ago/26' */
export function rotuloCompetencia(competence: string): string {
  const [ano, mes] = competence.split('-')
  return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`
}

/** Acima disso, metade da renda fixa já está comprometida antes de qualquer compra nova. */
const LIMIAR_ALERTA_PCT = 50

export function CommitmentsPage({
  from,
  months = 6,
}: {
  from: string
  months?: number
}) {
  const [report, setReport] = useState<CommitmentReportView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<CommitmentReportView>(
      `/api/reports/commitments?from=${from}&months=${months}`,
    )
      .then((data) => {
        if (vivo) setReport(data)
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [from, months])

  if (error) return <p role="alert">{error}</p>
  if (!report) return <p>Carregando…</p>

  return (
    <section>
      <h1>Comprometido</h1>
      <p>
        Denominador: líquido fixo (mês sem freela) de{' '}
        <strong data-testid="denominador">
          {formatBRL(report.fixed_net_cents)}
        </strong>
        .
      </p>

      {report.rows.length === 0 ? (
        <p>Nenhuma parcela ou dívida em aberto na janela.</p>
      ) : null}

      <table>
        <thead data-testid="cabecalho">
          <tr>
            <th />
            {report.competences.map((c) => (
              <th key={c}>{rotuloCompetencia(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.account_id} data-testid={`linha-${r.account_id}`}>
              <td>{r.account_name}</td>
              {r.cells.map((cents, i) => (
                <td key={i} data-testid={`celula-${r.account_id}-${i}`}>
                  {cents === 0 ? '—' : formatBRL(cents)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>TOTAL</th>
            {report.totals.map((cents, i) => (
              <td key={i} data-testid={`total-${i}`}>
                {formatBRL(cents)}
              </td>
            ))}
          </tr>
          <tr>
            <th>% do líquido fixo</th>
            {report.pct_of_fixed_net.map((pct, i) => (
              <td
                key={i}
                data-testid={`pct-${i}`}
                className={pct > LIMIAR_ALERTA_PCT ? 'alerta' : undefined}
              >
                {pct}%
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas-web run test commitments`

Esperado: PASS — 5 testes verdes.

- [ ] **Step 5: Escrever o teste da tela de Lançamento**

Create `apps/financas/web/src/pages/new-entry.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewEntryPage } from './new-entry'

const contas = [
  {
    id: 'a1',
    name: 'Nubank',
    scope: 'PF',
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 234012,
  },
  {
    id: 'a2',
    name: 'Nubank cartao',
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 25,
    due_day: 5,
    balance_cents: -184790,
  },
]

function mockRoutes(post?: unknown) {
  const fn = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return (
        post ?? {
          status: 201,
          json: async () => ({
            ok: true,
            data: { id: 'novo' },
            notifications: [],
          }),
        }
      )
    }
    if (path.startsWith('/api/accounts')) {
      return {
        status: 200,
        json: async () => ({ ok: true, data: contas, notifications: [] }),
      }
    }
    throw new Error(`rota nao mockada: ${path}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

function postBody(fetchMock: ReturnType<typeof mockRoutes>) {
  const call = fetchMock.mock.calls.find(
    ([, init]) => (init as RequestInit)?.method === 'POST',
  )
  return {
    path: call![0] as string,
    body: JSON.parse((call![1] as RequestInit).body as string),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NewEntryPage', () => {
  it('lanca uma saida simples com valor negativo em centavos', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Mercado' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.360,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a1' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/transactions')
      expect(body).toEqual({
        account_id: 'a1',
        amount_cents: -136000,
        purchase_date: '2026-07-28',
        description: 'Mercado',
        is_business: 0,
      })
    })
  })

  it('o toggle PJ marca is_business = 1', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Contador' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '275,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-05' },
    })
    fireEvent.click(screen.getByLabelText('PJ'))
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => expect(postBody(fetchMock).body.is_business).toBe(1))
  })

  it('entrada manda valor positivo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Freela' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '2.000,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-15' },
    })
    fireEvent.click(screen.getByLabelText('Entrada'))
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(postBody(fetchMock).body.amount_cents).toBe(200000),
    )
  })

  it('modo parcelado chama POST /api/installment-plans com o total positivo', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Geladeira' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '1.000,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.change(screen.getByLabelText('Conta'), {
      target: { value: 'a2' },
    })
    fireEvent.click(screen.getByLabelText('Parcelado'))
    fireEvent.change(screen.getByLabelText('Parcelas'), {
      target: { value: '3' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() => {
      const { path, body } = postBody(fetchMock)
      expect(path).toBe('/api/installment-plans')
      expect(body).toEqual({
        account_id: 'a2',
        description: 'Geladeira',
        total_cents: 100000,
        installments_count: 3,
        purchase_date: '2026-07-28',
        is_business: 0,
      })
    })
  })

  it('mostra a previa das parcelas com o resto nas primeiras', async () => {
    mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '100,00' },
    })
    fireEvent.click(screen.getByLabelText('Parcelado'))
    fireEvent.change(screen.getByLabelText('Parcelas'), {
      target: { value: '3' },
    })

    expect(screen.getByTestId('previa-parcelas')).toHaveTextContent(
      '3× de R$ 33,34 / R$ 33,33 / R$ 33,33',
    )
  })

  it('recusa valor invalido sem chamar a API', async () => {
    const fetchMock = mockRoutes()

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Erro' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: 'abc' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Valor inválido'),
    )
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit)?.method === 'POST',
      ),
    ).toBe(false)
  })

  it('mostra o erro da API no submit', async () => {
    mockRoutes({
      status: 422,
      json: async () => ({
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'invalid_account',
            message: 'cartao sem dia de fechamento',
          },
        ],
      }),
    })

    render(<NewEntryPage />)
    await waitFor(() =>
      expect(screen.getByLabelText('Conta')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'X' },
    })
    fireEvent.change(screen.getByLabelText('Valor'), {
      target: { value: '10,00' },
    })
    fireEvent.change(screen.getByLabelText('Data'), {
      target: { value: '2026-07-28' },
    })
    fireEvent.submit(screen.getByTestId('form-lancamento'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'cartao sem dia de fechamento',
      ),
    )
  })
})
```

- [ ] **Step 6: Rodar o teste e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas-web run test new-entry`

Esperado: FAIL com `Failed to resolve import "./new-entry"` — a página ainda não existe.

- [ ] **Step 7: Implementar a tela de Lançamento**

Create `apps/financas/web/src/pages/new-entry.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { formatBRL, parseBRL, splitInstallments } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import type { AccountView } from './accounts'

export function NewEntryPage() {
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [accountId, setAccountId] = useState('')
  const [entrada, setEntrada] = useState(false)
  const [isBusiness, setIsBusiness] = useState(false)
  const [parcelado, setParcelado] = useState(false)
  const [parcelas, setParcelas] = useState(2)

  const [formError, setFormError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vivo = true
    api<AccountView[]>('/api/accounts')
      .then((data) => {
        if (!vivo) return
        setAccounts(data)
        setAccountId((atual) => atual || data[0]?.id || '')
      })
      .catch((e: unknown) => {
        if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const totalCents = useMemo(() => {
    if (valor.trim() === '') return 0
    try {
      return parseBRL(valor)
    } catch {
      return -1
    }
  }, [valor])

  const previa = useMemo(() => {
    if (!parcelado || totalCents <= 0 || parcelas < 1) return null
    return splitInstallments(totalCents, parcelas)
  }, [parcelado, totalCents, parcelas])

  if (loadError) return <p role="alert">{loadError}</p>

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setOkMsg(null)

    if (totalCents <= 0) {
      setFormError('Valor inválido. Use o formato 1.360,00.')
      return
    }
    if (descricao.trim() === '') {
      setFormError('Descreva o lançamento.')
      return
    }
    if (!accountId) {
      setFormError('Escolha a conta.')
      return
    }

    const purchase_date = data || new Date().toISOString().slice(0, 10)
    const is_business = isBusiness ? 1 : 0

    setEnviando(true)
    try {
      if (parcelado) {
        await api('/api/installment-plans', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accountId,
            description: descricao,
            total_cents: totalCents,
            installments_count: parcelas,
            purchase_date,
            is_business,
          }),
        })
        setOkMsg(`Plano de ${parcelas}× criado.`)
      } else {
        await api('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            account_id: accountId,
            amount_cents: entrada ? totalCents : -totalCents,
            purchase_date,
            description: descricao,
            is_business,
          }),
        })
        setOkMsg('Lançamento gravado.')
      }
      setDescricao('')
      setValor('')
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section>
      <h1>Lançar</h1>
      <form onSubmit={enviar} data-testid="form-lancamento">
        <label>
          Descrição
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <label>
          Valor
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="1.360,00"
          />
        </label>
        <label>
          Data
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </label>
        <label>
          Conta
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            checked={entrada}
            onChange={(e) => setEntrada(e.target.checked)}
          />
          Entrada
        </label>

        <label>
          <input
            type="checkbox"
            checked={isBusiness}
            onChange={(e) => setIsBusiness(e.target.checked)}
          />
          PJ
        </label>

        <label>
          <input
            type="checkbox"
            checked={parcelado}
            onChange={(e) => setParcelado(e.target.checked)}
          />
          Parcelado
        </label>

        {parcelado ? (
          <>
            <label>
              Parcelas
              <input
                type="number"
                min={1}
                max={360}
                value={parcelas}
                onChange={(e) => setParcelas(Number(e.target.value))}
              />
            </label>
            {previa ? (
              <p data-testid="previa-parcelas">
                {parcelas}× de{' '}
                {previa
                  .slice(0, 3)
                  .map((c) => formatBRL(c))
                  .join(' / ')}
                {previa.length > 3 ? ' …' : ''}
              </p>
            ) : null}
          </>
        ) : null}

        {formError ? <p role="alert">{formError}</p> : null}
        {okMsg ? <p role="status">{okMsg}</p> : null}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Salvando…' : 'Gravar'}
        </button>
      </form>
    </section>
  )
}
```

- [ ] **Step 8: Rodar o teste e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas-web run test new-entry`

Esperado: PASS — 7 testes verdes.

- [ ] **Step 9: Ligar as duas rotas no App**

Modify `apps/financas/web/src/App.tsx` — conteúdo completo:

```tsx
import { useEffect, useState } from 'react'
import { AccountsPage } from './pages/accounts'
import { CommitmentsPage } from './pages/commitments'
import { DebtDetailPage } from './pages/debt-detail'
import { NewEntryPage } from './pages/new-entry'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/contas')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/contas')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

/** Competência do mês corrente em Teresina (UTC−3, sem horário de verão). */
export function competenciaAtual(now: Date = new Date()): string {
  const teresina = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return teresina.toISOString().slice(0, 7)
}

export function App() {
  const hash = useHash()
  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null

  return (
    <>
      <nav>
        <a href="#/contas">Contas</a>
        <a href="#/lancar">Lançar</a>
        <a href="#/comprometido">Comprometido</a>
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : hash.startsWith('#/comprometido') ? (
        <CommitmentsPage from={competenciaAtual()} />
      ) : hash.startsWith('#/lancar') ? (
        <NewEntryPage />
      ) : (
        <AccountsPage />
      )}
    </>
  )
}
```

Modify `apps/financas/web/src/styles.css` — acrescentar ao final:

```css
.alerta {
  color: #c0392b;
  font-weight: 700;
}

tfoot th,
tfoot td {
  border-top: 2px solid rgba(128, 128, 128, 0.6);
}
```

- [ ] **Step 10: Rodar a suíte inteira do SPA**

Run: `pnpm --filter @piluvitu/financas-web run test`

Esperado: PASS — 31 testes verdes, sem regressão nas telas das Tasks 11 e 12.

- [ ] **Step 11: Formatar, checar tipos e commitar**

Run:

```
pnpm prettier:fix
pnpm --filter @piluvitu/financas-web run lint
pnpm --filter @piluvitu/financas-web run test
pnpm --filter @piluvitu/financas-web run build
```

Commit:

```
git add apps/financas/web/src/pages/commitments.tsx apps/financas/web/src/pages/commitments.test.tsx apps/financas/web/src/pages/new-entry.tsx apps/financas/web/src/pages/new-entry.test.tsx apps/financas/web/src/App.tsx apps/financas/web/src/styles.css
git commit -m "feat(financas): telas de comprometido e lancamento (simples e parcelado)"
```

---

### Task 14: Payees, categorias e o CRUD de dívida na SPA

**Files:**

- Create: `apps/financas/src/domain/payees.ts`
- Create: `apps/financas/src/domain/payees.test.ts`
- Create: `apps/financas/src/routes/payees.ts`
- Create: `apps/financas/src/routes/payees.test.ts`
- Create: `apps/financas/src/routes/categories.ts`
- Create: `apps/financas/src/routes/categories.test.ts`
- Create: `apps/financas/vitest.web.config.ts`
- Create: `apps/financas/vitest.web.setup.ts`
- Create: `apps/financas/web/src/pages/DividasPage.tsx`
- Create: `apps/financas/web/src/pages/DividasPage.test.tsx`
- Create: `apps/financas/web/src/pages/NovoItemForm.tsx`
- Create: `apps/financas/web/src/pages/NovoItemForm.test.tsx`
- Modify: `apps/financas/src/index.ts`
- Modify: `apps/financas/vitest.config.ts`
- Modify: `apps/financas/package.json`
- Modify: `apps/financas/web/src/App.tsx`
- Modify: `apps/financas/web/src/pages/DividaPage.tsx`
- Modify: `apps/financas/CLAUDE.md`
- Test: `apps/financas/src/domain/payees.test.ts`, `apps/financas/src/routes/payees.test.ts`, `apps/financas/src/routes/categories.test.ts`, `apps/financas/web/src/pages/DividasPage.test.tsx`, `apps/financas/web/src/pages/NovoItemForm.test.tsx`

**Interfaces:**

- Consumes:
  - `newId(): string` (`src/lib/ids.ts`); `nowIsoUtc(): string`, `todayInTeresina(): string` (`src/lib/dates.ts`)
  - `okJson<T>(data: T, status?: number): Response`, `errJson(status: number, code: string, message: string): Response`, `type Envelope<T> = { ok: boolean; data: T|null; notifications: Notification[] }` (`src/lib/envelope.ts`)
  - `parseBRL(input: string): Cents`, `formatBRL(cents: Cents): string` (`@piluvitu/tools/money`)
  - `type Bindings` de `src/index.ts` (contém `DB: D1Database`) e `const app` (Hono) do mesmo arquivo
  - `export const debtsRoutes = new Hono<AppEnv>()` (`src/routes/debts.ts`), montado em `/api/debts`, expondo `GET /` (aceita `?status=open`, devolve `{id,title,payee_name,direction,total_cents,paid_cents,remaining_cents}[]`), `POST /` (`{payee_id,direction,title,opened_at}` → `{id}`), `GET /:id`, `POST /:id/items` (`{description,amount_cents,incurred_on}`)
  - Migration `0001` já semeia as categorias com slug `das`, `contador`, `inss`, `pro-labore`, `quitacao-divida`
- Produces:
  - `normalizeName(name: string): string`
  - `type PayeeKind = 'person'|'merchant'|'government'|'self_entity'`
  - `type Payee = { id, name, norm_name, kind, document, default_category_id, created_at }`
  - `createPayee(db: D1Database, input: NewPayee): Promise<Payee>`
  - `listPayees(db: D1Database, opts?: { kind?: PayeeKind }): Promise<Payee[]>`
  - `export const payeesRoutes` / `export const categoriesRoutes` montados em `/api/payees` e `/api/categories`
  - `export function DividasPage(): JSX.Element`, `export function NovoItemForm(props: { debtId: string; onCreated: () => void | Promise<void> }): JSX.Element`

---

- [ ] **Step 1: Escrever o teste de `normalizeName`**

`apps/financas/src/domain/payees.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeName } from './payees'

describe('normalizeName', () => {
  it('sobe pra caixa alta', () => {
    expect(normalizeName('Pai')).toBe('PAI')
  })

  it('remove acento', () => {
    expect(normalizeName('Padaria Pão de Açúcar')).toBe('PADARIA PAO DE ACUCAR')
  })

  it('colapsa espaco duplo', () => {
    expect(normalizeName('Pai   Jose  ')).toBe('PAI JOSE')
  })

  it('corta sufixo de cidade + UF', () => {
    expect(normalizeName('MERCADO SAO LUIZ  TERESINA PI')).toBe(
      'MERCADO SAO LUIZ',
    )
  })

  it('corta sufixo de maquininha', () => {
    expect(normalizeName('Restaurante Tempero PAGSEGURO')).toBe(
      'RESTAURANTE TEMPERO',
    )
  })

  it('nao corta quando sobraria nome vazio', () => {
    expect(normalizeName('Mercado PI')).toBe('MERCADO')
    expect(normalizeName('PAGSEGURO')).toBe('PAGSEGURO')
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/payees.test.ts`
Esperado: FAIL com `Failed to resolve import "./payees" from "src/domain/payees.test.ts"`

- [ ] **Step 3: Implementar `normalizeName` e os tipos**

`apps/financas/src/domain/payees.ts`:

```ts
import { newId } from '../lib/ids'
import { nowIsoUtc } from '../lib/dates'

export type PayeeKind = 'person' | 'merchant' | 'government' | 'self_entity'

export type Payee = {
  id: string
  name: string
  norm_name: string
  kind: PayeeKind
  document: string | null
  default_category_id: string | null
  created_at: string
}

const UF = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
])

const MAQUININHAS = new Set([
  'PAGSEGURO',
  'PAGBANK',
  'MERCADOPAGO',
  'CIELO',
  'REDE',
  'STONE',
  'GETNET',
  'SUMUP',
  'PAGARME',
  'PICPAY',
  'INFINITEPAY',
])

/**
 * Chave de matching de estabelecimento (fatia ②). Criada já na ① porque
 * o índice idx_payees_norm do D1 não é alterável depois.
 * Limitação conhecida: cidade de nome composto deixa resíduo ('SAO' em
 * 'MERCADO X SAO LUIS MA'), porque só o último token de cidade é cortado.
 */
export function normalizeName(name: string): string {
  const tokens = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  while (tokens.length > 1 && MAQUININHAS.has(tokens[tokens.length - 1]))
    tokens.pop()

  if (tokens.length > 1 && UF.has(tokens[tokens.length - 1])) {
    tokens.pop()
    if (tokens.length > 1) tokens.pop()
  }

  return tokens.join(' ')
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/payees.test.ts`
Esperado: PASS, 6 testes

- [ ] **Step 5: Escrever os testes de `createPayee` e `listPayees`**

Acrescentar ao fim de `apps/financas/src/domain/payees.test.ts` (e trocar a linha de import por `import { createPayee, listPayees, normalizeName } from './payees'`, somando `import { env, applyD1Migrations } from 'cloudflare:test'` e `beforeEach`):

```ts
describe('createPayee / listPayees', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
    await env.DB.prepare('DELETE FROM payees').run()
  })

  it('grava norm_name normalizado', async () => {
    const payee = await createPayee(env.DB, {
      name: 'Mercado São Luiz  Teresina PI',
      kind: 'merchant',
    })

    const row = await env.DB.prepare(
      'SELECT name, norm_name, kind, document, default_category_id FROM payees WHERE id = ?',
    )
      .bind(payee.id)
      .first<{
        name: string
        norm_name: string
        kind: string
        document: string | null
        default_category_id: string | null
      }>()

    expect(row?.name).toBe('Mercado São Luiz  Teresina PI')
    expect(row?.norm_name).toBe('MERCADO SAO LUIZ')
    expect(row?.kind).toBe('merchant')
    expect(row?.document).toBeNull()
    expect(row?.default_category_id).toBeNull()
    expect(payee.norm_name).toBe('MERCADO SAO LUIZ')
  })

  it('filtra por kind', async () => {
    await createPayee(env.DB, { name: 'Pai', kind: 'person' })
    await createPayee(env.DB, { name: 'Receita Federal', kind: 'government' })
    await createPayee(env.DB, { name: 'Minha PJ', kind: 'self_entity' })

    const pessoas = await listPayees(env.DB, { kind: 'person' })
    expect(pessoas.map((p) => p.name)).toEqual(['Pai'])

    const todos = await listPayees(env.DB)
    expect(todos).toHaveLength(3)
  })
})
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/payees.test.ts`
Esperado: FAIL com `does not provide an export named 'createPayee'`

- [ ] **Step 7: Implementar `createPayee` e `listPayees`**

Acrescentar ao fim de `apps/financas/src/domain/payees.ts`:

```ts
export type NewPayee = {
  name: string
  kind: PayeeKind
  document?: string | null
  default_category_id?: string | null
}

export async function createPayee(
  db: D1Database,
  input: NewPayee,
): Promise<Payee> {
  const row: Payee = {
    id: newId(),
    name: input.name,
    norm_name: normalizeName(input.name),
    kind: input.kind,
    document: input.document ?? null,
    default_category_id: input.default_category_id ?? null,
    created_at: nowIsoUtc(),
  }

  await db
    .prepare(
      'INSERT INTO payees (id, name, norm_name, kind, document, default_category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      row.id,
      row.name,
      row.norm_name,
      row.kind,
      row.document,
      row.default_category_id,
      row.created_at,
    )
    .run()

  return row
}

export async function listPayees(
  db: D1Database,
  opts: { kind?: PayeeKind } = {},
): Promise<Payee[]> {
  const stmt = opts.kind
    ? db
        .prepare('SELECT * FROM payees WHERE kind = ? ORDER BY norm_name')
        .bind(opts.kind)
    : db.prepare('SELECT * FROM payees ORDER BY norm_name')

  const { results } = await stmt.all<Payee>()
  return results
}
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/domain/payees.test.ts`
Esperado: PASS, 8 testes

- [ ] **Step 9: Escrever o teste das rotas de payees (inclui ordem de montagem e o encadeamento com `/api/debts`)**

`apps/financas/src/routes/payees.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import { debtsRoutes } from './debts'
import { payeesRoutes } from './payees'

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
  await env.DB.prepare('DELETE FROM payees').run()
})

function postInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

describe('payeesRoutes', () => {
  it('esta montado ACIMA do catch-all /api/*', () => {
    const primeiro = app.routes.findIndex((r) =>
      r.path.startsWith('/api/payees'),
    )
    const catchAll = app.routes.findIndex((r) => r.path === '/api/*')
    expect(primeiro).toBeGreaterThanOrEqual(0)
    expect(catchAll).toBeGreaterThanOrEqual(0)
    expect(primeiro).toBeLessThan(catchAll)
  })

  it('POST cria e GET lista filtrando por kind', async () => {
    const criado = await payeesRoutes.request(
      '/',
      postInit({ name: 'Pai', kind: 'person' }),
      env,
    )
    expect(criado.status).toBe(201)
    const body = await criado.json<{
      ok: boolean
      data: { id: string; norm_name: string }
      notifications: unknown[]
    }>()
    expect(body.ok).toBe(true)
    expect(body.data.norm_name).toBe('PAI')
    expect(body.notifications).toEqual([])

    await payeesRoutes.request(
      '/',
      postInit({ name: 'Receita Federal', kind: 'government' }),
      env,
    )

    const listados = await payeesRoutes.request('/?kind=person', undefined, env)
    const lista = await listados.json<{ data: { name: string }[] }>()
    expect(lista.data.map((p) => p.name)).toEqual(['Pai'])
  })

  it('rejeita corpo nao-JSON com 400 invalid_json', async () => {
    const res = await payeesRoutes.request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      },
      env,
    )
    expect(res.status).toBe(400)
    const body = await res.json<{
      ok: boolean
      notifications: { code?: string }[]
    }>()
    expect(body.ok).toBe(false)
    expect(body.notifications[0].code).toBe('invalid_json')
  })

  it('rejeita kind fora do enum com 422 constraint_violation', async () => {
    const res = await payeesRoutes.request(
      '/',
      postInit({ name: 'X', kind: 'amigo' }),
      env,
    )
    expect(res.status).toBe(422)
    const body = await res.json<{ notifications: { code?: string }[] }>()
    expect(body.notifications[0].code).toBe('constraint_violation')
  })

  it('rejeita query kind invalida com 400 invalid_query', async () => {
    const res = await payeesRoutes.request('/?kind=amigo', undefined, env)
    expect(res.status).toBe(400)
    const body = await res.json<{ notifications: { code?: string }[] }>()
    expect(body.notifications[0].code).toBe('invalid_query')
  })

  it('id do payee recem-criado serve para POST /api/debts', async () => {
    const criado = await payeesRoutes.request(
      '/',
      postInit({ name: 'Pai', kind: 'person' }),
      env,
    )
    const { data: payee } = await criado.json<{ data: { id: string } }>()

    const divida = await debtsRoutes.request(
      '/',
      postInit({
        payee_id: payee.id,
        direction: 'i_owe',
        title: 'Pai',
        opened_at: '2026-03-05',
      }),
      env,
    )
    expect(divida.status).toBe(201)
    const { data: debt } = await divida.json<{ data: { id: string } }>()

    const row = await env.DB.prepare('SELECT payee_id FROM debts WHERE id = ?')
      .bind(debt.id)
      .first<{ payee_id: string }>()
    expect(row?.payee_id).toBe(payee.id)
  })
})
```

- [ ] **Step 10: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/payees.test.ts`
Esperado: FAIL com `Failed to resolve import "./payees" from "src/routes/payees.test.ts"`

- [ ] **Step 11: Implementar o router de payees**

`apps/financas/src/routes/payees.ts`:

```ts
import { Hono } from 'hono'
import type { Bindings } from '../index'
import { errJson, okJson } from '../lib/envelope'
import { createPayee, listPayees, type PayeeKind } from '../domain/payees'

type AppEnv = { Bindings: Bindings }

const KINDS: PayeeKind[] = ['person', 'merchant', 'government', 'self_entity']

function isKind(value: unknown): value is PayeeKind {
  return typeof value === 'string' && (KINDS as string[]).includes(value)
}

export const payeesRoutes = new Hono<AppEnv>()

payeesRoutes.get('/', async (c) => {
  const kind = c.req.query('kind')
  if (kind !== undefined && !isKind(kind)) {
    return errJson(
      400,
      'invalid_query',
      'kind precisa ser person, merchant, government ou self_entity',
    )
  }
  return okJson(await listPayees(c.env.DB, { kind }))
})

payeesRoutes.post('/', async (c) => {
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name === '')
    return errJson(422, 'constraint_violation', 'name e obrigatorio')
  if (!isKind(body.kind))
    return errJson(422, 'constraint_violation', 'kind invalido')

  try {
    const payee = await createPayee(c.env.DB, {
      name,
      kind: body.kind,
      document: typeof body.document === 'string' ? body.document : null,
      default_category_id:
        typeof body.default_category_id === 'string'
          ? body.default_category_id
          : null,
    })
    return okJson(payee, 201)
  } catch {
    return errJson(
      422,
      'constraint_violation',
      'nao foi possivel gravar o payee',
    )
  }
})
```

- [ ] **Step 12: Escrever o teste de `GET /api/categories`**

`apps/financas/src/routes/categories.test.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import app from '../index'
import { categoriesRoutes } from './categories'

type Categoria = { id: string; name: string; kind: string; slug: string | null }

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('categoriesRoutes', () => {
  it('esta montado ACIMA do catch-all /api/*', () => {
    const primeiro = app.routes.findIndex((r) =>
      r.path.startsWith('/api/categories'),
    )
    const catchAll = app.routes.findIndex((r) => r.path === '/api/*')
    expect(primeiro).toBeGreaterThanOrEqual(0)
    expect(primeiro).toBeLessThan(catchAll)
  })

  it('devolve as categorias semeadas, incluindo os 4 slugs do gap da PJ', async () => {
    const res = await categoriesRoutes.request('/', undefined, env)
    expect(res.status).toBe(200)

    const body = await res.json<{
      ok: boolean
      data: Categoria[]
      notifications: unknown[]
    }>()
    expect(body.ok).toBe(true)
    expect(body.notifications).toEqual([])
    expect(body.data.length).toBeGreaterThan(0)

    const slugs = body.data.map((c) => c.slug)
    for (const slug of ['das', 'contador', 'inss', 'pro-labore']) {
      expect(slugs).toContain(slug)
    }

    const quitacao = body.data.find((c) => c.slug === 'quitacao-divida')
    expect(quitacao?.kind).toBe('debt_settlement')
  })

  it('filtra por kind e rejeita kind invalido com 400 invalid_query', async () => {
    const ok = await categoriesRoutes.request(
      '/?kind=debt_settlement',
      undefined,
      env,
    )
    const body = await ok.json<{ data: Categoria[] }>()
    expect(body.data.every((c) => c.kind === 'debt_settlement')).toBe(true)

    const ruim = await categoriesRoutes.request('/?kind=lucro', undefined, env)
    expect(ruim.status).toBe(400)
    const erro = await ruim.json<{ notifications: { code?: string }[] }>()
    expect(erro.notifications[0].code).toBe('invalid_query')
  })
})
```

- [ ] **Step 13: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/categories.test.ts src/routes/payees.test.ts`
Esperado: FAIL com `Failed to resolve import "./categories"` e, em `payees.test.ts`, `expected -1 to be greater than or equal to 0` no teste de montagem

- [ ] **Step 14: Implementar o router de categories**

`apps/financas/src/routes/categories.ts`:

```ts
import { Hono } from 'hono'
import type { Bindings } from '../index'
import { errJson, okJson } from '../lib/envelope'

type AppEnv = { Bindings: Bindings }

export type Category = {
  id: string
  parent_id: string | null
  name: string
  kind: 'income' | 'expense' | 'transfer' | 'debt_settlement'
  slug: string | null
  default_scope: 'PJ' | 'PF' | null
  created_at: string
}

const KINDS = ['income', 'expense', 'transfer', 'debt_settlement']

const COLUNAS = 'id, parent_id, name, kind, slug, default_scope, created_at'

export const categoriesRoutes = new Hono<AppEnv>()

categoriesRoutes.get('/', async (c) => {
  const kind = c.req.query('kind')
  if (kind !== undefined && !KINDS.includes(kind)) {
    return errJson(
      400,
      'invalid_query',
      'kind precisa ser income, expense, transfer ou debt_settlement',
    )
  }

  const stmt = kind
    ? c.env.DB.prepare(
        `SELECT ${COLUNAS} FROM categories WHERE archived_at IS NULL AND kind = ? ORDER BY name`,
      ).bind(kind)
    : c.env.DB.prepare(
        `SELECT ${COLUNAS} FROM categories WHERE archived_at IS NULL ORDER BY name`,
      )

  const { results } = await stmt.all<Category>()
  return okJson(results)
})
```

- [ ] **Step 15: Montar as duas rotas ACIMA do catch-all no `src/index.ts`**

Em `apps/financas/src/index.ts`, acrescentar os imports junto dos demais routers e as duas linhas de `app.route` imediatamente **antes** do comentário `// SEMPRE POR ULTIMO`:

```ts
import { categoriesRoutes } from './routes/categories'
import { payeesRoutes } from './routes/payees'

// ... demais app.route(...) já existentes
app.route('/api/payees', payeesRoutes)
app.route('/api/categories', categoriesRoutes)

// SEMPRE POR ULTIMO
// SEMPRE POR ÚLTIMO — no Hono a ordem de registro decide. Qualquer
// app.route('/api', ...) registrado DEPOIS desta linha fica inalcançável.
app.all('/api/*', (c) => errJson(404, 'not_found', 'rota inexistente'))
```

- [ ] **Step 16: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run src/routes/payees.test.ts src/routes/categories.test.ts`
Esperado: PASS, 9 testes

- [ ] **Step 17: Commit do backend**

```bash
git add apps/financas/src/domain/payees.ts apps/financas/src/domain/payees.test.ts \
  apps/financas/src/routes/payees.ts apps/financas/src/routes/payees.test.ts \
  apps/financas/src/routes/categories.ts apps/financas/src/routes/categories.test.ts \
  apps/financas/src/index.ts
git commit -m "feat(financas): payees com norm_name e GET /api/categories

- normalizeName (caixa, acento, espaco duplo, sufixo de maquininha e cidade/UF)
- createPayee/listPayees sobre a tabela payees do 0001
- GET/POST /api/payees e GET /api/categories, montados acima do catch-all
- codigos de erro invalid_json/invalid_query/constraint_violation"
```

- [ ] **Step 18: Instalar as deps de teste da SPA e criar o config do Vitest web**

```bash
pnpm --filter @piluvitu/financas add -D jsdom @vitejs/plugin-react \
  @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

`apps/financas/vitest.web.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['web/src/**/*.test.tsx'],
    setupFiles: ['./vitest.web.setup.ts'],
  },
})
```

`apps/financas/vitest.web.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Em `apps/financas/vitest.config.ts` (o do pool de Workers), impedir que ele varra os testes da SPA — as opções já existentes viram spread:

```ts
export default defineConfig({
  test: {
    ...cloudflareTest({
      /* opcoes ja existentes: miniflare/d1Databases/TEST_MIGRATIONS/wrangler */
    }),
    exclude: ['**/node_modules/**', 'web/**'],
  },
})
```

Em `apps/financas/package.json`, o script `test` passa a rodar as duas suítes:

```json
    "test": "vitest run && vitest run --config vitest.web.config.ts",
```

- [ ] **Step 19: Escrever o teste da `DividasPage`**

`apps/financas/web/src/pages/DividasPage.test.tsx`:

```tsx
import { formatBRL } from '@piluvitu/tools/money'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DividasPage } from './DividasPage'

const dividas = [
  {
    id: 'd1',
    title: 'Pai',
    payee_name: 'PAI',
    direction: 'i_owe',
    total_cents: 730000,
    paid_cents: 594000,
    remaining_cents: 136000,
  },
]

const payees = [{ id: 'p1', name: 'Pai', kind: 'person' }]

function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ ok: status < 400, data, notifications: [] }),
    {
      status,
      headers: { 'content-type': 'application/json' },
    },
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url.startsWith('/api/debts')) return json(dividas)
    if (method === 'GET' && url.startsWith('/api/payees')) return json(payees)
    if (method === 'POST' && url === '/api/payees')
      return json({ id: 'p9', name: 'Tio', kind: 'person' }, 201)
    if (method === 'POST' && url === '/api/debts')
      return json({ id: 'd9' }, 201)
    throw new Error(`url inesperada: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
})

describe('DividasPage', () => {
  it('lista as dividas abertas com total, pago e restante', async () => {
    render(<DividasPage />)

    expect(await screen.findByRole('link', { name: 'Pai' })).toHaveAttribute(
      'href',
      '#/dividas/d1',
    )
    expect(screen.getByText(formatBRL(730000))).toBeInTheDocument()
    expect(screen.getByText(formatBRL(594000))).toBeInTheDocument()
    expect(screen.getByText(formatBRL(136000))).toBeInTheDocument()
  })

  it('cria payee inline e usa o id retornado no POST /api/debts', async () => {
    const user = userEvent.setup()
    render(<DividasPage />)
    await screen.findByRole('link', { name: 'Pai' })

    await user.type(screen.getByLabelText('Título'), 'Tio')
    await user.selectOptions(screen.getByLabelText('Pessoa'), '__novo__')
    await user.type(screen.getByLabelText('Nome da pessoa'), 'Tio')
    await user.click(screen.getByRole('button', { name: 'Criar dívida' }))

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
      )
      expect(posts.map((c) => String(c[0]))).toEqual([
        '/api/payees',
        '/api/debts',
      ])
    })

    const corpoPayee = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(
            (c) =>
              String(c[0]) === '/api/payees' &&
              (c[1] as RequestInit).method === 'POST',
          )![1] as RequestInit
        ).body,
      ),
    )
    expect(corpoPayee).toEqual({ name: 'Tio', kind: 'person' })

    const corpoDivida = JSON.parse(
      String(
        (
          fetchMock.mock.calls.find(
            (c) =>
              String(c[0]) === '/api/debts' &&
              (c[1] as RequestInit).method === 'POST',
          )![1] as RequestInit
        ).body,
      ),
    )
    expect(corpoDivida.payee_id).toBe('p9')
    expect(corpoDivida.title).toBe('Tio')
    expect(corpoDivida.direction).toBe('i_owe')
  })
})
```

- [ ] **Step 20: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run --config vitest.web.config.ts web/src/pages/DividasPage.test.tsx`
Esperado: FAIL com `Failed to resolve import "./DividasPage" from "web/src/pages/DividasPage.test.tsx"`

- [ ] **Step 21: Implementar a `DividasPage`**

`apps/financas/web/src/pages/DividasPage.tsx`:

```tsx
import { formatBRL } from '@piluvitu/tools/money'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { todayInTeresina } from '../../../src/lib/dates'

export type DebtListRow = {
  id: string
  title: string
  payee_name: string
  direction: 'i_owe' | 'owed_to_me'
  total_cents: number
  paid_cents: number
  remaining_cents: number
}

export type PayeeOption = { id: string; name: string; kind: string }

type Envelope<T> = {
  ok: boolean
  data: T | null
  notifications: { type: string; message: string }[]
}

const NOVO = '__novo__'

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const env = (await res.json()) as Envelope<T>
  if (!env.ok || env.data === null)
    throw new Error(env.notifications[0]?.message ?? 'falha na requisicao')
  return env.data
}

function postar<T>(url: string, body: unknown): Promise<T> {
  return pedir<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function DividasPage() {
  const [dividas, setDividas] = useState<DebtListRow[]>([])
  const [payees, setPayees] = useState<PayeeOption[]>([])
  const [payeeId, setPayeeId] = useState(NOVO)
  const [nomeNovo, setNomeNovo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [abertura, setAbertura] = useState(todayInTeresina())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const [d, p] = await Promise.all([
      pedir<DebtListRow[]>('/api/debts?status=open'),
      pedir<PayeeOption[]>('/api/payees?kind=person'),
    ])
    setDividas(d)
    setPayees(p)
  }, [])

  useEffect(() => {
    carregar().catch((e: Error) => setErro(e.message))
  }, [carregar])

  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      let id = payeeId
      if (id === NOVO) {
        const criado = await postar<PayeeOption>('/api/payees', {
          name: nomeNovo,
          kind: 'person',
        })
        id = criado.id
      }
      await postar<{ id: string }>('/api/debts', {
        payee_id: id,
        direction: 'i_owe',
        title: titulo,
        opened_at: abertura,
      })
      setTitulo('')
      setNomeNovo('')
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section>
      <h1>Dívidas</h1>
      {erro !== null && <p role="alert">{erro}</p>}

      <table>
        <thead>
          <tr>
            <th>Dívida</th>
            <th>Pessoa</th>
            <th>Total</th>
            <th>Pago</th>
            <th>Falta</th>
          </tr>
        </thead>
        <tbody>
          {dividas.map((d) => (
            <tr key={d.id}>
              <td>
                <a href={`#/dividas/${d.id}`}>{d.title}</a>
              </td>
              <td>{d.payee_name}</td>
              <td>{formatBRL(d.total_cents)}</td>
              <td>{formatBRL(d.paid_cents)}</td>
              <td>{formatBRL(d.remaining_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <form onSubmit={enviar}>
        <h2>Nova dívida</h2>

        <label htmlFor="titulo">Título</label>
        <input
          id="titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          required
        />

        <label htmlFor="pessoa">Pessoa</label>
        <select
          id="pessoa"
          value={payeeId}
          onChange={(e) => setPayeeId(e.target.value)}
        >
          <option value={NOVO}>— nova pessoa —</option>
          {payees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {payeeId === NOVO && (
          <>
            <label htmlFor="nome-novo">Nome da pessoa</label>
            <input
              id="nome-novo"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              required
            />
          </>
        )}

        <label htmlFor="abertura">Aberta em</label>
        <input
          id="abertura"
          type="date"
          value={abertura}
          onChange={(e) => setAbertura(e.target.value)}
          required
        />

        <button type="submit" disabled={salvando}>
          Criar dívida
        </button>
      </form>
    </section>
  )
}
```

- [ ] **Step 22: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run --config vitest.web.config.ts web/src/pages/DividasPage.test.tsx`
Esperado: PASS, 2 testes

- [ ] **Step 23: Escrever o teste do `NovoItemForm`**

`apps/financas/web/src/pages/NovoItemForm.test.tsx`:

```tsx
import { parseBRL } from '@piluvitu/tools/money'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NovoItemForm } from './NovoItemForm'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ ok: true, data: { id: 'it1' }, notifications: [] }),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      ),
  )
  vi.stubGlobal('fetch', fetchMock)
})

describe('NovoItemForm', () => {
  it('posta o item em centavos e avisa o pai', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NovoItemForm debtId="d1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText('Descrição'), 'Steam Deck OLED 1TB')
    await user.clear(screen.getByLabelText('Valor'))
    await user.type(screen.getByLabelText('Valor'), '2.800,00')
    await user.clear(screen.getByLabelText('Data'))
    await user.type(screen.getByLabelText('Data'), '2026-03-05')
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/debts/d1/items')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      description: 'Steam Deck OLED 1TB',
      amount_cents: parseBRL('2.800,00'),
      incurred_on: '2026-03-05',
    })
  })

  it('barra valor invalido sem chamar a API', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NovoItemForm debtId="d1" onCreated={onCreated} />)

    await user.type(screen.getByLabelText('Descrição'), 'Jantar')
    await user.type(screen.getByLabelText('Valor'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Adicionar item' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('valor inválido')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 24: Rodar e confirmar que falha**

Run: `pnpm --filter @piluvitu/financas exec vitest run --config vitest.web.config.ts web/src/pages/NovoItemForm.test.tsx`
Esperado: FAIL com `Failed to resolve import "./NovoItemForm" from "web/src/pages/NovoItemForm.test.tsx"`

- [ ] **Step 25: Implementar o `NovoItemForm`**

`apps/financas/web/src/pages/NovoItemForm.tsx`:

```tsx
import { parseBRL } from '@piluvitu/tools/money'
import { useState, type FormEvent } from 'react'
import { todayInTeresina } from '../../../src/lib/dates'

type Envelope<T> = {
  ok: boolean
  data: T | null
  notifications: { type: string; message: string }[]
}

export function NovoItemForm({
  debtId,
  onCreated,
}: {
  debtId: string
  onCreated: () => void | Promise<void>
}) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(todayInTeresina())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)

    let centavos = 0
    try {
      centavos = parseBRL(valor)
    } catch {
      centavos = 0
    }
    if (!Number.isFinite(centavos) || centavos <= 0) {
      setErro('valor inválido')
      return
    }

    setSalvando(true)
    try {
      const res = await fetch(`/api/debts/${debtId}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          description: descricao,
          amount_cents: centavos,
          incurred_on: data,
        }),
      })
      const env = (await res.json()) as Envelope<{ id: string }>
      if (!env.ok) {
        setErro(env.notifications[0]?.message ?? 'falha ao gravar o item')
        return
      }
      setDescricao('')
      setValor('')
      await onCreated()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={enviar}>
      <h3>Novo item</h3>
      {erro !== null && <p role="alert">{erro}</p>}

      <label htmlFor="item-descricao">Descrição</label>
      <input
        id="item-descricao"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
        required
      />

      <label htmlFor="item-valor">Valor</label>
      <input
        id="item-valor"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
      />

      <label htmlFor="item-data">Data</label>
      <input
        id="item-data"
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        required
      />

      <button type="submit" disabled={salvando}>
        Adicionar item
      </button>
    </form>
  )
}
```

- [ ] **Step 26: Rodar e confirmar que passa**

Run: `pnpm --filter @piluvitu/financas exec vitest run --config vitest.web.config.ts`
Esperado: PASS, 4 testes (DividasPage + NovoItemForm)

- [ ] **Step 27: Ligar as duas telas na navegação**

Em `apps/financas/web/src/App.tsx`: acrescentar o import e o branch de rota **antes** do branch que casa `#/dividas/<id>`, mais o link no nav:

```tsx
import { DividasPage } from './pages/DividasPage'

// dentro do nav, junto dos demais links:
;<a href="#/dividas">Dívidas</a>

// dentro do switch de rota, ANTES do branch de detalhe (#/dividas/<id>):
if (route === '#/dividas' || route === '#/dividas/') return <DividasPage />
```

Em `apps/financas/web/src/pages/DividaPage.tsx`: importar o formulário e renderizá-lo logo abaixo da tabela de itens, passando a mesma função de recarga do detalhe já usada pelo formulário de pagamento:

```tsx
import { NovoItemForm } from './NovoItemForm'

// logo abaixo da tabela de ITENS:
;<NovoItemForm debtId={debtId} onCreated={carregar} />
```

- [ ] **Step 28: Rodar a suíte inteira e o lint**

Run: `pnpm --filter @piluvitu/financas test && pnpm --filter @piluvitu/financas exec tsc --noEmit && pnpm prettier:fix`
Esperado: PASS nas duas suítes (Workers + web), `tsc` sem erro

- [ ] **Step 29: Documentar em `apps/financas/CLAUDE.md`**

Acrescentar a seção abaixo ao arquivo existente (não recriar o arquivo):

````md
## Payees, categorias e a tela de dívidas

- **`src/domain/payees.ts`** — `normalizeName()` gera `payees.norm_name` (caixa alta, sem acento, sem sufixo de maquininha e sem `CIDADE UF` no fim). É a chave de matching do import da fatia ②, criada já agora porque índice do D1 (`idx_payees_norm`) **não é alterável**. Limitação conhecida: cidade de nome composto deixa resíduo.
- **`GET|POST /api/payees`** (`src/routes/payees.ts`) e **`GET /api/categories`** (`src/routes/categories.ts`). Ambos montados em `src/index.ts` **acima** da linha `// SEMPRE POR ULTIMO` — registrar depois do catch-all `app.all('/api/*')` torna a rota inalcançável no Hono.
- Códigos de erro em inglês snake_case: `invalid_json` e `invalid_query` → **400**; `constraint_violation` → **422**.
- `GET /api/categories` é o que torna medível o gap de ~R$ 1.000/mês da PJ: os slugs `das`, `contador`, `inss` e `pro-labore` são semeados pela migration `0001` e não podem ser recriados por código (a categoria `quitacao-divida`, `kind='debt_settlement'`, também vem de lá — leia o id por `SELECT id FROM categories WHERE slug='quitacao-divida'`).
- **SPA:** `#/dividas` (`web/src/pages/DividasPage.tsx`) lista as dívidas abertas com total/pago/restante via `formatBRL` e cria dívida escolhendo um payee existente **ou** criando um `person` inline (`POST /api/payees` → id → `POST /api/debts`). `#/dividas/<id>` ganhou o `NovoItemForm`, que converte o valor digitado com `parseBRL` antes de `POST /api/debts/<id>/items`.

### Testes: duas suítes, dois configs

| Suíte       | Config                 | Ambiente                          |
| ----------- | ---------------------- | --------------------------------- |
| Worker + D1 | `vitest.config.ts`     | `@cloudflare/vitest-pool-workers` |
| SPA (React) | `vitest.web.config.ts` | `jsdom` + Testing Library         |

`vitest.config.ts` tem `exclude: ['web/**']` — sem isso o pool de Workers tenta rodar os testes de componente, que precisam de DOM. `pnpm --filter @piluvitu/financas test` roda as duas em sequência.

```bash
pnpm --filter @piluvitu/financas exec vitest run src/routes/payees.test.ts
pnpm --filter @piluvitu/financas exec vitest run --config vitest.web.config.ts
```

Nos testes de Worker o binding é **`env.DB`**, importado de `cloudflare:test`; os routers são exercitados por `payeesRoutes.request(path, init, env)`, o que dispensa o JWT do Access.
````

- [ ] **Step 30: Commit final**

```bash
git add apps/financas
git commit -m "feat(financas): tela de dividas com payee inline e form de item

- DividasPage (#/dividas): lista aberta com total/pago/restante em formatBRL,
  link pro detalhe e criacao de divida com payee existente ou novo inline
- NovoItemForm: converte o valor com parseBRL e posta em /api/debts/:id/items
- App.tsx roteia #/dividas; DividaPage renderiza o form de novo item
- segunda suite de teste (vitest.web.config.ts, jsdom + Testing Library),
  com exclude de web/** no config do pool de Workers
- apps/financas/CLAUDE.md: rotas novas, slugs semeados e os dois configs"
```

---

### Task 15: CLAUDE.md, deploy e CI

**Files:**

- Modify: `apps/financas/CLAUDE.md` (**acrescentar** as seções que faltam — as Tasks 3, 4, 5, 6, 7, 8, 9 e 14 já escreveram as delas; NUNCA recriar o arquivo inteiro)
- Modify: `CLAUDE.md` (raiz — tabela de workspaces)
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/financas/package.json` (script `lint`)
- Modify: `apps/financas/wrangler.jsonc` (vars do Access)

**Interfaces:**

- Consumes: tudo das Tasks 1–13 (comandos, scripts e nomes de arquivo documentados)
- Produces: documentação da frente `apps/financas`, job de CI `financas`, e o procedimento de deploy + checklist manual pós-deploy

- [ ] **Step 1: Criar o `CLAUDE.md` do workspace novo**

A regra global do repo (`CLAUDE.md` raiz) é explícita: tecnologia nova ⇒ o `CLAUDE.md` do workspace onde se mexeu é atualizado. `apps/financas` é frente nova, então nasce com o seu.

Create `apps/financas/CLAUDE.md`:

````markdown
# CLAUDE.md — `apps/financas`

Guidance para a frente de **finanças PJ/PF**. O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz. `apps/web` e `apps/api` **não são tocados** por esta frente — zero risco de regressão no que já funciona.

## O que é

Módulo pessoal de controle financeiro (single-user), servido por **um único Cloudflare Worker** em `financas.piluvitu.com.br`, atrás do **Cloudflare Access**. Alvo de custo: **R$ 0/mês**.

```
financas.piluvitu.com.br
  └─ Cloudflare Access (Google + allowlist de 1 e-mail)
       └─ Worker único
            ├─ Static Assets  → SPA Vite + React (web/dist)   grátis, FORA da cota
            ├─ Hono /api/*    → envelope { ok, data, notifications }
            └─ D1 (SQLite)
```

## Stack

| Camada  | Escolha                                                         | Por quê                                                                         |
| ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Runtime | **Cloudflare Workers**                                          | uptime independente do MacBook (requisito que motivou a frente)                 |
| HTTP    | **Hono** (~14 kB)                                               | o bundle de Worker no free é **3 MB gzip**; Next.js via OpenNext **não cabe**   |
| UI      | **Vite + React 19 + TS** (`apps/financas/web`)                  | Static Assets é grátis, ilimitado e **não consome a cota de 100k requests/dia** |
| Dados   | **D1** (SQLite), todas as tabelas `STRICT`                      | dinheiro é `INTEGER` em centavos, PK é `TEXT` UUID                              |
| Auth    | **Cloudflare Access** (JWT em `Cf-Access-Jwt-Assertion`)        | zero linha de auth própria; JWKS cacheado em module scope                       |
| Testes  | `@cloudflare/vitest-pool-workers` (Worker) + Vitest/jsdom (SPA) | rodam 100% local em Miniflare, sem secret e sem `wrangler login`                |
| Money   | `@piluvitu/tools/money`                                         | `parseBRL` / `formatBRL` / `splitInstallments` / `sumCents`                     |

⚠️ **Vitest aqui, Jest no `apps/web`.** Os dois convivem no monorepo e não se enxergam: cada workspace tem o seu runner e o seu script `test`. Não tente unificar.

## Workspaces

São **dois** pacotes pnpm nesta pasta:

| Pacote                   | Path                | Papel                                      |
| ------------------------ | ------------------- | ------------------------------------------ |
| `@piluvitu/financas`     | `apps/financas`     | Worker (Hono + D1) + migrations + wrangler |
| `@piluvitu/financas-web` | `apps/financas/web` | SPA Vite/React, build em `web/dist`        |

## Comandos

| Comando                                         | Faz                                               |
| ----------------------------------------------- | ------------------------------------------------- |
| `pnpm --filter @piluvitu/financas dev`          | build do SPA + `wrangler dev` (Worker em `:8787`) |
| `pnpm --filter @piluvitu/financas-web dev`      | Vite em `:5273` com proxy de `/api` para `:8787`  |
| `pnpm --filter @piluvitu/financas run test`     | Vitest do Worker (Miniflare + D1 local)           |
| `pnpm --filter @piluvitu/financas-web run test` | Vitest do SPA (jsdom + Testing Library)           |
| `pnpm --filter @piluvitu/financas run lint`     | `tsc --noEmit` do Worker                          |
| `pnpm --filter @piluvitu/financas-web run lint` | `tsc --noEmit` do SPA                             |
| `pnpm --filter @piluvitu/financas run deploy`   | build do SPA + `wrangler deploy`                  |

### Migrations

Forward-only, **sem down migration**.

```bash
# local (Miniflare)
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --local
# produção — rodar manualmente, nunca em CI
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote
```

## Fatos MEDIDOS contra o D1 real (2026-07-25) — não especular contra isto

| Fato                                                                     | Consequência                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `TRIGGER` cria **e dispara** (`SQLITE_CONSTRAINT_TRIGGER`)               | invariantes de soma vivem no **banco** (`RAISE(ABORT)`), não na app       |
| `batch()` faz **rollback real** da sequência inteira                     | atomicidade suficiente; sem batch compensatório                           |
| `STRICT` funciona **e o tipo é aplicado**                                | as 10 tabelas são `STRICT`                                                |
| `PRAGMA foreign_keys = 1` por padrão; INSERT órfão **falha**             | todo `REFERENCES` tem efeito real                                         |
| `VIEW` funciona (`CREATE` + `SELECT`)                                    | `v_debt_item_balance` e `v_cashflow` são confiáveis                       |
| `sqlite_version()` é **bloqueada** pelo D1                               | versão segue desconhecida; `STRICT` funcionar prova >= 3.37               |
| Limite de 50 queries/invocação **não reproduzido** (batch de 200 passou) | multi-row é escolha de **latência** (151 ms vs 8.000 ms), não de correção |
| **100 bound params por statement** — limite real e ativo                 | `transactions` (14 col) → 7 linhas/INSERT; `installments` (5 col) → 20    |
| `BEGIN` / `COMMIT` / `SAVEPOINT` são **rejeitados**                      | atomicidade só via `batch()`                                              |

## Gotchas de free tier

1. **CPU 10 ms por invocação, sem escape.** Parse de PDF **nunca** roda no Worker — vai para o cliente ou para o Mac (fatia ③). `limits.cpu_ms` só existe no plano pago.
2. **`rows read` conta linhas escaneadas, não o result set.** Sem índice, uma agregação lê 36k linhas e o dia acaba em ~13 renders. **Índice no D1 não pode ser alterado** — só dropado (irreversível) e recriado; por isso as colunas e índices de import nasceram na migration 0001.
3. **100.000 rows written/dia.** Uso corrente ~50/dia. Carga inicial de histórico (fatia ②) estoura: criar tabela sem índice, importar, `CREATE INDEX` depois.
4. **Custom Domain é obrigatório.** Em `*.workers.dev` o domínio registrável muda, o contexto vira cross-site, `SameSite=Lax` deixa de ser enviado — e **a quebra só aparece em produção**.
5. **JWKS do Access custa 1 dos 50 subrequests e 50–150 ms.** Cache em module scope com TTL (`src/lib/access.ts`).
6. **Cron: 5 triggers por conta.** Agrupar num Worker só com `switch (event.cron)` desde o início.
7. **`VACUUM INTO` não existe no D1.** Backup = Time Travel (7 dias no free) + GitHub Action com `wrangler d1 export --remote` (gera **SQL**, não `.sqlite`, e bloqueia outras queries enquanto roda).
8. **Queues no free têm retenção fixa de 24 h.** Não usar na fatia ②; ir de Cron + outbox no D1.
9. **`INTEGER` volta como `Number` do JS, nunca `BigInt`.** Centavos são seguros (teto R$ 90 trilhões); ids numéricos grandes não — daí PK `TEXT`.

## Modelo de dados — regras que não se negociam

1. Dinheiro é **`INTEGER` em centavos**, do schema à UI. Nunca `REAL`.
2. Toda PK é **`TEXT` UUID** gerado no cliente (`crypto.randomUUID()`), porque não há `last_insert_rowid()` confiável entre statements de um `batch()`.
3. Transferência entre contas próprias = **2 linhas com o mesmo `transfer_id`**. Todo relatório de resultado filtra `transfer_id IS NULL`.
4. **Três datas, três perguntas:** `purchase_date` (o fato), `bill_competence` (qual fatura), `settled_at` (quando o dinheiro se moveu; `NULL` = previsto).
5. `debt_items` é **estoque** e nunca gera lançamento; `debt_payments` é **fluxo** e gera exatamente 1 linha em `transactions`. Dupla contagem é estruturalmente impossível.
6. Pagamento de dívida usa categoria `kind='debt_settlement'` — classificar como `income` inflaria o faturamento e distorceria o DAS.

## Relatório de comprometido

`src/domain/reports.ts`. O denominador de `pct_of_fixed_net` é o **líquido em mês SEM freela — R$ 3.600 (`DEFAULT_FIXED_NET_CENTS = 360000`)**, nunca os R$ 5.480 do mês com freela: usar o líquido com freela esconderia exatamente o risco que a tela existe para mostrar. Entram parcelas com `settled_at IS NULL` e `bill_competence` preenchida (mais `transfer_id IS NULL` e `parent_id IS NULL`), e o saldo aberto das dívidas `direction='i_owe'` — que, sem cronograma na fatia ①, cai inteiro na **primeira** competência da janela.

## Colocation

Vale a lei da raiz: `x.ts` + `x.test.ts` no **mesmo** diretório. Sem pasta `tests/`.

## Environment / vars

Em `wrangler.jsonc` (não são secretas — o segredo é a policy do Access, não estes valores):

- `ACCESS_TEAM_DOMAIN` — ex.: `piluvitu.cloudflareaccess.com`
- `ACCESS_AUD` — Application Audience (AUD) Tag da aplicação no Zero Trust
- `ACCESS_ALLOWED_EMAILS` — allowlist separada por vírgula (1 e-mail)

Binding D1: `DB` (database `financas`).

## Fora de escopo da fatia ①

Sem import de arquivo (②), sem LLM (② e ③), sem Open Finance/PWA (④). E **sem aba _Saúde financeira_**: três das cinco métricas dependem de essenciais medidos, que dependem de import — gráfico antes do dado é gráfico que mente.
````

- [ ] **Step 2: Registrar o workspace na tabela da raiz**

Modify `CLAUDE.md` (raiz) — adicionar a linha na tabela de workspaces do bloco de citação do topo, logo abaixo da linha de `apps/api`:

```
> | `apps/financas`  | `apps/financas/CLAUDE.md`  | Worker Cloudflare (Hono + D1 + Static Assets), SPA Vite/React, dívidas, parcelas, comprometido, Cloudflare Access, deploy `wrangler`     |
```

E na seção **Tech Stack (visão geral)**, adicionar o bullet depois do de `apps/api`:

```
- **`apps/financas`** — **Cloudflare Worker** (Hono + D1 SQLite) servindo uma **SPA Vite + React 19** por Static Assets, em `financas.piluvitu.com.br` atrás do **Cloudflare Access**. Testes com `@cloudflare/vitest-pool-workers` (Worker) e Vitest/jsdom (SPA). → detalhes em `apps/financas/CLAUDE.md`.
```

- [ ] **Step 3: Garantir o script de `lint` no package do Worker**

Modify `apps/financas/package.json` — se ainda não existir, acrescentar em `scripts` (mantendo os demais):

```json
    "lint": "tsc --noEmit"
```

Com isso `pnpm -r lint` e `pnpm -r test` da raiz passam a cobrir as duas frentes novas automaticamente.

Run: `pnpm -r lint`

Esperado: verde nos 4 workspaces (`@piluvitu/web`, `@piluvitu/tools`, `@piluvitu/financas`, `@piluvitu/financas-web`).

- [ ] **Step 4: Adicionar o job de CI**

Modify `.github/workflows/ci.yml` — acrescentar o job abaixo, no mesmo nível de `web:` e `api:` (roda em paralelo com eles):

```yaml
financas:
  name: Finanças (typecheck + test + build)
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4

    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Typecheck (worker)
      run: pnpm --filter @piluvitu/financas run lint

    - name: Typecheck (spa)
      run: pnpm --filter @piluvitu/financas-web run lint

    # O binding ASSETS do Miniflare exige que web/dist exista com um index.html,
    # e web/dist e gerado (esta no .gitignore). Por isso o build da SPA vem
    # ANTES dos testes do Worker: em clone limpo, a ordem inversa quebra o job.
    - name: Build (spa)
      run: pnpm --filter @piluvitu/financas-web run build

    # vitest-pool-workers roda em Miniflare local: sem secret, sem wrangler login.
    - name: Test (worker + D1)
      run: pnpm --filter @piluvitu/financas run test

    - name: Test (spa)
      run: pnpm --filter @piluvitu/financas-web run test
```

Não há job de deploy: a fatia ① publica **manualmente** com `wrangler deploy`, e a migration em produção é ato deliberado (forward-only, sem down). Automatizar deploy de banco sem down migration é como se automatiza um erro.

- [ ] **Step 5: Verificar o CI localmente antes de subir**

Run:

```
pnpm install --frozen-lockfile
pnpm --filter @piluvitu/financas run lint
pnpm --filter @piluvitu/financas-web run lint
pnpm --filter @piluvitu/financas run test
pnpm --filter @piluvitu/financas-web run test
pnpm --filter @piluvitu/financas-web run build
```

Esperado: todos verdes — é exatamente a sequência do job novo.

- [ ] **Step 6: Criar a aplicação no Cloudflare Access**

No dashboard **Zero Trust → Access → Applications → Add an application → Self-hosted**:

1. **Application name:** `financas`
2. **Session Duration:** `24 hours`
3. **Public hostname:** `financas.piluvitu.com.br` (zona `piluvitu.com.br`)
4. **Identity providers:** Google (o mesmo já usado pela conta)
5. **Policy:** nome `dono`, Action **Allow**, regra **Include → Emails → `paulo.tspi@gmail.com`** — allowlist de **um** e-mail, nada de "Everyone in domain"
6. Copiar o **Application Audience (AUD) Tag** da aba _Overview_ e o **team domain** (`<team>.cloudflareaccess.com`)

Módulo é single-user: qualquer patamar do Zero Trust Free cobre 1 seat com folga (S4 foi encerrado por escopo).

- [ ] **Step 7: Preencher as vars do Access no wrangler**

Modify `apps/financas/wrangler.jsonc` — bloco `vars` com os valores do Step 6:

```jsonc
  "vars": {
    "ACCESS_TEAM_DOMAIN": "piluvitu.cloudflareaccess.com",
    "ACCESS_AUD": "<cole aqui o Application Audience (AUD) Tag>",
    "ACCESS_ALLOWED_EMAILS": "paulo.tspi@gmail.com"
  },
```

São os três valores que `src/index.ts` (Task 4) passa para `requireAccess({ teamDomain, aud, allowedEmails })`. Não são secrets: o segredo é a policy do Access, não estes identificadores.

- [ ] **Step 8: Aplicar a migration em produção**

Run:

```
pnpm --filter @piluvitu/financas exec wrangler d1 migrations list piluvitu-financas --remote
pnpm --filter @piluvitu/financas exec wrangler d1 migrations apply piluvitu-financas --remote
```

Esperado: `0001_financas_init.sql` aplicada. **Forward-only: não existe down migration.** Se o schema sair errado, a correção é uma migration nova — e índice no D1 não pode ser alterado, só dropado (irreversível) e recriado.

- [ ] **Step 9: Publicar o Worker**

Run:

```
pnpm --filter @piluvitu/financas run deploy
```

(o script faz `build:web` antes do `wrangler deploy`, então o `web/dist` publicado é sempre o do commit atual)

Esperado: saída do wrangler listando o binding `DB` e os assets carregados.

- [ ] **Step 10: Ligar o Custom Domain**

No dashboard **Workers & Pages → `financas` → Settings → Domains & Routes → Add → Custom Domain**: `financas.piluvitu.com.br`.

**Isto é obrigatório, não preferência.** Em `*.workers.dev` o domínio registrável passa a ser diferente do da zona, o contexto vira cross-site, `SameSite=Lax` deixa de ser enviado, e **a quebra só aparece em produção**. `SameSite=None` não salva: Safari (ITP) e Firefox (ETP) bloqueiam terceiros por padrão e o Chrome não — testa-se no Chrome, passa, e quebra fora dele.

- [ ] **Step 11: Checklist de verificação manual pós-deploy**

Rodar na ordem, do celular Android **e** do MacBook:

- [ ] `https://financas.piluvitu.com.br` redireciona para o login do Google do Access (não abre direto)
- [ ] Login com `paulo.tspi@gmail.com` entra e mostra a tela **Contas**
- [ ] Login com outra conta Google é **negado** pelo Access
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://financas.piluvitu.com.br/api/health` devolve **302** ou **403** (sem JWT, o Access barra — se devolver 200, a policy não está protegendo `/api/*`)
- [ ] O `index.html` e os assets carregam **sem** erro de CSP/404 no console (Static Assets servindo `web/dist`)
- [ ] Recarregar em `#/comprometido` com F5 volta a mesma tela (`not_found_handling: single-page-application`)
- [ ] Criar a conta **Nubank cartão** (`credit_card`, fecha 25, vence 05) e ver `fecha 25 · vence 05` no card
- [ ] Lançar uma compra em **10×** de R$ 1.000 nesse cartão em 28/07 e conferir que a 1ª parcela caiu em **`2026-08`** (compra depois do fechamento)
- [ ] Somar as 10 parcelas na tela e bater **exatamente** R$ 1.000,00 (resto nas primeiras)
- [ ] Cadastrar a dívida do **Pai** (R$ 1.360 em aberto) com os itens **MacBook Air** e **Steam Deck**
- [ ] Registrar um pagamento dividido entre os dois itens e ver a alocação listada por item
- [ ] Tentar alocar **mais** do que o item comporta e confirmar: mensagem de erro **e nada gravado** — nem pagamento, nem lançamento no caixa (recarregar a página para conferir)
- [ ] Alocar **exatamente** até o teto do item e confirmar que passa (o trigger não dá falso positivo)
- [ ] Tela **Comprometido**: a matriz mostra 6 competências, o TOTAL bate com a soma das colunas, e o `%` usa **R$ 3.600** como denominador (não R$ 5.480)
- [ ] Competência acima de 50% aparece em **vermelho**
- [ ] Fazer uma transferência entre duas contas próprias e confirmar que ela **não** aparece no Comprometido
- [ ] Lançar às 22h do dia 31 (horário de Teresina, UTC−3) e confirmar que a data gravada é **dia 31**, não dia 1 do mês seguinte
- [ ] No dashboard do D1, conferir `rows written` do dia dentro do esperado (~dezenas), não milhares

- [ ] **Step 12: Formatar e commitar**

Run:

```
pnpm prettier:fix
pnpm -r lint
pnpm -r test
```

Commit:

```
git add apps/financas/CLAUDE.md CLAUDE.md .github/workflows/ci.yml apps/financas/package.json apps/financas/wrangler.jsonc
git commit -m "docs(financas): CLAUDE.md da frente nova, job de CI e procedimento de deploy com Access"
```

---
