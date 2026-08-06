/**
 * Cliente do Google Sheets (fatia ③, Task 2) — porte de
 * `apps/api/internal/gsheets/movies.go` (`ReadMovies`, `GetCategories`,
 * `parseRow`). Usa `lib/google-auth.ts#getAccessToken` (JWT RS256 puro, sem
 * lib) pra trocar a service account por um access token OAuth2 com escopo
 * readonly do Sheets, e chama a API REST v4 direto via `fetch` — mesmo
 * desenho de `google-auth.ts`: sem SDK do Google (`googleapis`), sem disco.
 *
 * ⚠️ O ACHADO que decide este arquivo, medido contra a planilha real
 * (2026-08-06): o layout de coluna é `A=Nº, B=Título, C=Filme/Série,
 * D=Gênero, E=Assistido?, F=Nota` (mesmo comentário de
 * `gsheets/movies.go:52`). A CATEGORIA é a coluna D (índice 3), NÃO a B —
 * um spike que leu o índice 1 (título) como categoria produziu 255
 * "categorias" que na verdade eram títulos de filme; a lista PARECIA
 * plausível, só comparando com o Go (11 categorias reais) o erro aparecia.
 */
import { getAccessToken, type ServiceAccount } from './google-auth'

export type SheetMovie = {
  number: number
  title: string
  type: 'filme' | 'serie'
  category: string
  watched: boolean
}

export type GsheetsConfig = {
  serviceAccount: ServiceAccount
  spreadsheetId: string
  range: string
}

export type GsheetsDeps = {
  /** Relógio injetado — repassado pro cache de token de `getAccessToken`. */
  now?: Date
}

/** Mesmo escopo do `sheets.SpreadsheetsReadonlyScope` usado pelo cliente Go. */
const SHEETS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets.readonly'

function cellString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Tolerante — mimica `strconv.Atoi` do Go IGNORANDO o erro (`number, _ :=
 * strconv.Atoi(...)`, `gsheets/movies.go:63`): lixo ou string vazia vira
 * `0`, NUNCA descarta a linha por causa disso. `Atoi` exige a string
 * INTEIRA como inteiro (sem parse parcial) — por isso o regex exige a
 * string toda, e não `Number.parseInt` puro (que aceitaria `"12.5"` como
 * `12`, um comportamento que Atoi rejeitaria com erro, virando `0` aqui).
 * Diferente de `parseInt64` (`routes/votacao.ts`), que EXIGE um inteiro
 * válido pra não descartar — aqui o requisito é o oposto, tolerância total.
 */
function parseNumberTolerant(raw: string): number {
  if (!/^[+-]?\d+$/.test(raw)) return 0
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? 0 : n
}

/**
 * `'serie'` quando o cru (minúsculo, trimado) é `serie` OU `série` — a
 * planilha real usa a forma ACENTUADA (`gsheets/movies.go:78-85`).
 * Qualquer outra coisa vira `'filme'` (default do Go).
 */
function normalizeType(raw: string): 'filme' | 'serie' {
  const v = raw.trim().toLowerCase()
  return v === 'serie' || v === 'série' ? 'serie' : 'filme'
}

/**
 * `true` só para `sim`/`yes`/`true`/`1` (case-insensitive); qualquer outra
 * coisa, `false` (`gsheets/movies.go:87-94`).
 */
function parseYesNo(raw: string): boolean {
  const v = raw.trim().toLowerCase()
  return v === 'sim' || v === 'yes' || v === 'true' || v === '1'
}

/**
 * Porte de `parseRow` (`gsheets/movies.go:54-71`).
 *
 * - `row.length < 5` ⇒ descarta (larguras observadas na planilha real: 5 e
 *   6).
 * - Título vazio (após trim, coluna B/índice 1) OU categoria vazia (após
 *   trim + lowercase, coluna D/índice 3) ⇒ descarta.
 * - `number` (coluna A/índice 0) é TOLERANTE — nunca descarta a linha por
 *   causa dele, vira `0`.
 *
 * ⚠️ 745 de 1001 linhas da planilha real são descartadas (256 usáveis) —
 * NORMAL, não defeito. A planilha tem muita linha curta/incompleta; "de
 * propósito" essa tolerância não vira uma exigência mais rígida, senão o
 * conjunto sorteável em produção muda.
 */
export function parseRow(row: unknown[]): SheetMovie | null {
  if (row.length < 5) return null

  const title = cellString(row[1]).trim()
  const category = cellString(row[3]).trim().toLowerCase()
  if (title === '' || category === '') return null

  return {
    number: parseNumberTolerant(cellString(row[0]).trim()),
    title,
    type: normalizeType(cellString(row[2])),
    category,
    watched: parseYesNo(cellString(row[4])),
  }
}

function sheetsValuesUrl(spreadsheetId: string, range: string): string {
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
}

type SheetsValuesResponse = {
  values?: unknown[][]
}

/**
 * Porte de `ReadMovies` (`gsheets/movies.go:15-29`). Troca a service
 * account por um access token (`google-auth.ts#getAccessToken`, cache por
 * isolate) e lê o range configurado via REST direto — sem SDK.
 *
 * ⚠️ Qualquer falha DAQUI PRA FRENTE (troca de token, `fetch`, resposta não
 * `ok`, JSON malformado) é RUNTIME — a rota (`routes/votacao.ts`) mapeia
 * isto pra 502 `sheets_read_failed`. 503 `sheets_disabled` é só para
 * CONFIGURAÇÃO ausente/malformada (checado antes de chamar esta função —
 * ver o comentário na rota pro porquê um `GOOGLE_SA_JSON` malformado
 * também cai em 503, não aqui).
 */
export async function readMovies(
  cfg: GsheetsConfig,
  deps: GsheetsDeps = {},
): Promise<SheetMovie[]> {
  const token = await getAccessToken(
    cfg.serviceAccount,
    SHEETS_READONLY_SCOPE,
    {
      now: deps.now,
    },
  )

  const res = await fetch(sheetsValuesUrl(cfg.spreadsheetId, cfg.range), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`gsheets: falha ao ler valores (status ${res.status})`)
  }

  let data: SheetsValuesResponse
  try {
    data = (await res.json()) as SheetsValuesResponse
  } catch {
    throw new Error('gsheets: resposta da planilha não é um JSON válido')
  }

  const rows = data.values ?? []
  const movies: SheetMovie[] = []
  for (const row of rows) {
    const movie = parseRow(row)
    if (movie !== null) movies.push(movie)
  }
  return movies
}

/**
 * Porte de `GetCategories` (`gsheets/movies.go:33-48`). Deduplica as
 * categorias das linhas usáveis e ordena.
 *
 * ⚠️ **A ordenação do Go é `slices.Sort` sobre `string` — ordem de BYTE
 * (UTF-8), NÃO `localeCompare`.** `Array#sort()` SEM comparador (usado
 * abaixo) compara por unidade de código UTF-16 — que, pra todo caractere do
 * BMP (inclusive os acentuados usados nas categorias reais, nenhum
 * suplementar/astral aqui), produz a MESMA ordem relativa que a comparação
 * byte a byte de UTF-8 (propriedade da própria codificação: comparação
 * lexicográfica de bytes UTF-8 preserva a ordem de codepoint). `ação` e
 * `animação` ordenam DIFERENTE sob `localeCompare('pt-BR')` (que colate
 * `ç`~`c`, empurrando `ação` pra perto do início) do que sob esta ordem de
 * byte/codepoint (`ç` = U+00E7 = 231, bem depois de `n`/`v`) — MEDIDO:
 * `.sort()` produz `[animação, aventura, ação, ...]`, `localeCompare`
 * produziria `[ação, animação, aventura, ...]`. Nunca trocar por
 * `.sort((a,b) => a.localeCompare(b))`.
 */
export async function getCategories(
  cfg: GsheetsConfig,
  deps: GsheetsDeps = {},
): Promise<string[]> {
  const movies = await readMovies(cfg, deps)
  const unique = new Set(movies.map((m) => m.category))
  return [...unique].sort()
}
