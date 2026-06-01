# Votação — voto de aprovação + roleta de desempate com entropia de câmera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir voto de aprovação (vários filmes por usuário) e, no empate, um sorteio em roleta cujo motor de aleatoriedade é reforçado por entropia de uma foto ao vivo processada no navegador (só o hash trafega), com auditoria/log estruturado — tudo apoiado num módulo de entropia reutilizável também exposto em `/tools/roleta`.

**Architecture:** Lógica pura e portável (PRNG sfc32, mistura de entropia SHA-256, sorteio) vive no pacote `@piluvitu/tools` (`packages/tools/src`, testado em Jest/jsdom). A captura de câmera (DOM) e a roda visual ficam em `apps/web` (hook + componentes). A votação passa a `UNIQUE(session_id,user_id,movie_id)` (rebuild idempotente no startup). No empate, o browser deriva um digest e o envia; a Go API mistura com `crypto/rand`, escolhe um índice sem viés entre os empatados (provably-fair), persiste vencedor + linha de auditoria em `tiebreaks`, e loga via `log/slog`.

**Tech Stack:** Go 1.23 (chi, `log/slog`, `crypto/rand`, `modernc.org/sqlite`), Next.js 16 / React 19 / TypeScript, TanStack Query, Web Crypto API, Jest (jsdom), Playwright, Storybook.

**Path reconciliation vs. spec:** o spec citou `apps/web/lib/entropy` e `e2e/tools.spec.ts`; o layout real é `packages/tools/src/*` (lógica pura, export map em `package.json`) e e2e colocado `app/(site)/.../*.e2e.ts` (testMatch `**/*.e2e.ts`). Este plano usa os caminhos reais.

**Comandos de verificação (rodar da raiz salvo indicado):**

- Go: `cd apps/api && go vet ./... && go test ./...`
- Pacote tools (Jest): `pnpm --filter @piluvitu/tools test`
- Web (Jest): `pnpm --filter @piluvitu/web test`
- E2E: `pnpm --filter @piluvitu/web test:e2e`
- Lint/format/build: `pnpm prettier:fix && pnpm lint && pnpm --filter @piluvitu/web build`

**Regras do projeto:** migrations não são rodadas pelo agente (o rebuild é idempotente no startup; em dev, apague `apps/api/tmp/votacao.db`). Build/lint rodam automaticamente. Atualizar `CLAUDE.md` ao final (Fase 8).

---

## File Structure

**Backend (`apps/api`)**

- `internal/logging/logging.go` (criar) — `slog` por request: `Middleware`, `FromContext`.
- `internal/router/router.go` (modificar) — `middleware.RequestID` + logging middleware; remover rota `/runoff`; add rota `/tiebreak`.
- `cmd/api/main.go` (modificar) — init do `slog` default (JSON prod / texto dev).
- `internal/votacao/schema.sql` (modificar) — `votes` UNIQUE novo + `voting_sessions.winner_method` + tabela `tiebreaks`.
- `internal/votacao/store.go` (modificar) — `NewStore` chama `migrate()`; `migrate()` faz rebuild idempotente do `votes` e add-column.
- `internal/votacao/votes.go` (modificar) — `ReplaceUserVotes`, `GetUserVotes`, `CountVoters`; remover `ErrAlreadyVoted`/`InsertVote` single-use (substituídos).
- `internal/votacao/tiebreak.go` (criar) — `TiebreakSeed`, `PickTiebreakIndex` (puro).
- `internal/votacao/tiebreaks.go` (criar) — `CreateTiebreak`, `GetTiebreakBySession`, `SetSessionWinner`.
- `internal/handlers/votacao/votes.go` (modificar) — `CreateVote` aceita `movie_ids[]`; `CloseSession` sem desempate determinístico; novo `Tiebreak`; remover `CreateRunoff`; logs de erro.
- `internal/handlers/votacao/sessions.go` (modificar) — `GetSession` retorna `voted_movie_ids`.

**Pacote puro (`packages/tools/src`)**

- `prng.ts` + `prng.test.ts` (criar) — sfc32 + `seedFromBytes`.
- `entropy.ts` + `entropy.test.ts` (criar) — `mixEntropy`, `toHex`, `fromHex`, `cryptoRandomBytes`.
- `roleta.ts` + `roleta.test.ts` (criar) — `normalizeOptions`, `drawWinnerIndex`.
- `package.json` (modificar) — export map `./prng`, `./entropy`, `./roleta`.
- `jest.setup.ts` (modificar) — garantir `crypto.subtle` (webcrypto) no jsdom.

**Frontend (`apps/web`)**

- `hooks/use-camera-entropy.ts` + (sem teste unit; coberto em e2e) (criar).
- `lib/log.ts` (criar) — logger leve client.
- `components/entropy/roulette-wheel.tsx` + `.stories.tsx` (criar).
- `components/entropy/camera-entropy-capture.tsx` + `.stories.tsx` (criar).
- `components/tools/roleta-tool.tsx` + `.stories.tsx` (criar).
- `app/(site)/tools/roleta/page.tsx` (criar).
- `lib/tools-registry.ts` (modificar) — entrada `roleta`.
- `app/(site)/tools/tools.e2e.ts` (modificar) — casos `/tools/roleta`.
- `lib/votacao/types.ts` (modificar) — `voted_movie_ids`, `total_voters`, `winner_method`, `TiebreakResponse`.
- `lib/votacao/api-client.ts` (modificar) — `vote(id, movieIds[])`, `tiebreak(...)`; remover `createRunoff`.
- `lib/votacao/results.ts` (sem mudança de assinatura; já serve).
- `hooks/votacao/use-vote-mutation.ts` (modificar) — `movieIds[]`.
- `hooks/votacao/use-create-tiebreak.ts` (criar); `hooks/votacao/use-create-runoff.ts` (remover).
- `components/votacao/vote-section.tsx` (modificar) — multi-seleção.
- `components/votacao/results-list.tsx` (modificar) — badge roleta + multi "seu voto".
- `components/votacao/tiebreak-roulette.tsx` + `.stories.tsx` (criar); `runoff-button.tsx` (remover).
- `app/(site)/votacao/[id]/page.tsx` (modificar) — usar `voted_movie_ids` + `TiebreakRoulette`.
- `app/(site)/votacao/votacao.e2e.ts` (modificar) — multi-voto + tiebreak.

**Docs**

- `CLAUDE.md` (modificar).

---

## Phase 0 — Fundação de logging (backend)

### Task 0.1: Pacote `internal/logging` + RequestID + slog no main + logs de erro

**Files:**

- Create: `apps/api/internal/logging/logging.go`
- Create: `apps/api/internal/logging/logging_test.go`
- Modify: `apps/api/internal/router/router.go`
- Modify: `apps/api/cmd/api/main.go`
- Modify: `apps/api/internal/handlers/votacao/votes.go` (logs nos erros existentes)

- [ ] **Step 1: Write the failing test**

Create `apps/api/internal/logging/logging_test.go`:

```go
package logging_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/logging"
)

func TestFromContextIncludesRequestID(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))

	var seen string
	h := logging.Middleware(logger)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logging.FromContext(r.Context()).Info("hello")
		seen = w.Header().Get("X-Request-Id")
	}))

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if seen == "" {
		t.Fatal("expected X-Request-Id header to be set")
	}
	out := buf.String()
	if !strings.Contains(out, "hello") {
		t.Fatalf("log missing message: %s", out)
	}
	var entry map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &entry); err != nil {
		t.Fatalf("log not JSON: %v (%s)", err, out)
	}
	if entry["request_id"] == nil || entry["request_id"] == "" {
		t.Fatalf("log missing request_id: %s", out)
	}
}

func TestFromContextWithoutMiddlewareReturnsDefault(t *testing.T) {
	// Should never panic even if middleware didn't run.
	logging.FromContext(context.Background()).Info("noop")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/logging/...`
Expected: FAIL (package `logging` does not exist / undefined `Middleware`).

- [ ] **Step 3: Write minimal implementation**

Create `apps/api/internal/logging/logging.go`:

```go
// Package logging provides per-request structured logging via log/slog.
// Middleware attaches a request-scoped logger (enriched with request_id and,
// when available, user_id) to the request context; FromContext retrieves it.
package logging

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"
)

type ctxKey struct{}

// Middleware attaches a logger carrying the chi RequestID to every request.
// Place AFTER middleware.RequestID so the id is present.
func Middleware(base *slog.Logger) func(http.Handler) http.Handler {
	if base == nil {
		base = slog.Default()
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqID := middleware.GetReqID(r.Context())
			l := base.With("request_id", reqID)
			ctx := context.WithValue(r.Context(), ctxKey{}, l)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// FromContext returns the request-scoped logger, or slog.Default() if absent.
func FromContext(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return slog.Default()
}

// With returns a logger derived from the context logger with extra attrs.
func With(ctx context.Context, args ...any) *slog.Logger {
	return FromContext(ctx).With(args...)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/logging/...`
Expected: PASS.

- [ ] **Step 5: Wire RequestID + logging middleware into the router**

In `apps/api/internal/router/router.go`, change the middleware block at the top of `New` (currently `r.Use(middleware.Logger)`):

```go
func New(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(logging.Middleware(slog.Default()))
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(corsOptions()))
	// ... rest unchanged
```

Add imports to `router.go`: `"log/slog"` and `"github.com/PiluVitu/api/internal/logging"`.

- [ ] **Step 6: Init the slog default in main**

In `apps/api/cmd/api/main.go`, at the very top of `main()` (before reading PORT), add:

```go
	initLogger()
```

And add this function + imports (`"log/slog"`, `"strings"` already imported, `"os"` already imported) at the bottom of `main.go`:

```go
// initLogger configures the process-wide slog default: JSON in production,
// human-readable text in dev. Prod is detected by SESSION_COOKIE_SECURE=true
// (the same signal the cookie uses), matching how the app already splits envs.
func initLogger() {
	level := slog.LevelInfo
	var handler slog.Handler
	if strings.EqualFold(os.Getenv("SESSION_COOKIE_SECURE"), "true") {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level})
	}
	slog.SetDefault(slog.New(handler))
}
```

- [ ] **Step 7: Add error logging to the existing votação error paths**

In `apps/api/internal/handlers/votacao/votes.go`, import `"github.com/PiluVitu/api/internal/logging"`. In `CloseSession`, replace the two `internal_error` branches so they log before responding. Example for the tally failure:

```go
	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("close: tally failed", "err", err, "session_id", sessionID, "code", "internal_error")
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao apurar os votos.")
		return
	}
```

Apply the same pattern (`logging.FromContext(r.Context()).Error(...)` with `err`, relevant ids, `code`) to every `http.StatusInternalServerError` branch in `votes.go`. (Other files get logs as they're touched in later tasks.)

- [ ] **Step 8: Verify build + tests**

Run: `cd apps/api && go vet ./... && go test ./...`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/internal/logging apps/api/internal/router/router.go apps/api/cmd/api/main.go apps/api/internal/handlers/votacao/votes.go
git commit -m "feat(api): structured per-request logging (slog + RequestID)"
```

---

## Phase 1 — Módulo de entropia (pacote `@piluvitu/tools`)

### Task 1.1: PRNG determinístico sfc32

**Files:**

- Create: `packages/tools/src/prng.ts`
- Test: `packages/tools/src/prng.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/tools/src/prng.test.ts`:

```ts
import { sfc32, seedFromBytes } from './prng'

describe('sfc32', () => {
  it('is deterministic for the same seed', () => {
    const a = sfc32(1, 2, 3, 4)
    const b = sfc32(1, 2, 3, 4)
    const seqA = Array.from({ length: 5 }, () => a.nextUint32())
    const seqB = Array.from({ length: 5 }, () => b.nextUint32())
    expect(seqA).toEqual(seqB)
  })

  it('float() stays in [0,1)', () => {
    const r = sfc32(9, 8, 7, 6)
    for (let i = 0; i < 1000; i++) {
      const f = r.float()
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })

  it('int(n) stays in [0,n) and is roughly uniform', () => {
    const r = sfc32(42, 42, 42, 42)
    const n = 5
    const counts = new Array(n).fill(0)
    const N = 50000
    for (let i = 0; i < N; i++) counts[r.int(n)]++
    counts.forEach((c) => {
      expect(c).toBeGreaterThan((N / n) * 0.8)
      expect(c).toBeLessThan((N / n) * 1.2)
    })
  })

  it('int throws for non-positive bounds', () => {
    expect(() => sfc32(1, 1, 1, 1).int(0)).toThrow()
  })

  it('seedFromBytes is deterministic for the same bytes', () => {
    const bytes = new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ])
    const a = seedFromBytes(bytes)
    const b = seedFromBytes(bytes)
    expect(a.nextUint32()).toBe(b.nextUint32())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @piluvitu/tools test -- prng`
Expected: FAIL (cannot find module `./prng`).

- [ ] **Step 3: Write minimal implementation**

Create `packages/tools/src/prng.ts`:

```ts
/**
 * Deterministic, fast, decent-quality PRNG (sfc32). Pure and portable — no DOM,
 * no crypto. Seed it from entropy bytes via seedFromBytes(). Given the same
 * seed it always yields the same sequence (reproducible draws).
 */
export interface Prng {
  nextUint32(): number
  float(): number
  int(maxExclusive: number): number
  pick<T>(arr: T[]): { index: number; value: T }
  shuffle<T>(arr: T[]): T[]
}

export function sfc32(a: number, b: number, c: number, d: number): Prng {
  let s0 = a >>> 0
  let s1 = b >>> 0
  let s2 = c >>> 0
  let s3 = d >>> 0

  function nextUint32(): number {
    const t = (((s0 + s1) | 0) + s3) | 0
    s3 = (s3 + 1) | 0
    s0 = s1 ^ (s1 >>> 9)
    s1 = (s2 + (s2 << 3)) | 0
    s2 = ((s2 << 21) | (s2 >>> 11)) >>> 0
    s2 = (s2 + t) | 0
    return t >>> 0
  }

  // Warm up the state so low-entropy seeds disperse.
  for (let i = 0; i < 15; i++) nextUint32()

  function int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error('int: maxExclusive must be a positive integer')
    }
    // Rejection sampling for an unbiased result in [0, maxExclusive).
    const limit = 0x100000000 - (0x100000000 % maxExclusive)
    let x = nextUint32()
    while (x >= limit) x = nextUint32()
    return x % maxExclusive
  }

  function float(): number {
    return nextUint32() / 0x100000000
  }

  function pick<T>(arr: T[]): { index: number; value: T } {
    const index = int(arr.length)
    return { index, value: arr[index] }
  }

  function shuffle<T>(arr: T[]): T[] {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(i + 1)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  return { nextUint32, float, int, pick, shuffle }
}

/**
 * Builds a Prng from arbitrary entropy bytes by reading the first 16 bytes as
 * four big-endian uint32 seeds (deterministically padded when shorter).
 */
export function seedFromBytes(bytes: Uint8Array): Prng {
  const u = (i: number): number => {
    const o = i * 4
    if (o + 4 > bytes.length) return (0x9e3779b9 ^ (i + 1)) >>> 0
    return (
      ((bytes[o] << 24) |
        (bytes[o + 1] << 16) |
        (bytes[o + 2] << 8) |
        bytes[o + 3]) >>>
      0
    )
  }
  return sfc32(u(0), u(1), u(2), u(3))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @piluvitu/tools test -- prng`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/prng.ts packages/tools/src/prng.test.ts
git commit -m "feat(tools): deterministic sfc32 PRNG seeded from entropy bytes"
```

### Task 1.2: Mistura de entropia (SHA-256) + hex

**Files:**

- Create: `packages/tools/src/entropy.ts`
- Test: `packages/tools/src/entropy.test.ts`
- Modify: `packages/tools/jest.setup.ts`

- [ ] **Step 1: Ensure WebCrypto in the jsdom test env**

In `packages/tools/jest.setup.ts`, append (keeps existing TextEncoder/TextDecoder lines):

```ts
import { webcrypto } from 'crypto'

// jsdom exposes crypto.getRandomValues/randomUUID but not always subtle;
// fall back to Node's webcrypto so entropy.ts (SHA-256) is testable.
if (!('crypto' in global) || !(global.crypto as Crypto).subtle) {
  Object.assign(global, { crypto: webcrypto })
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/tools/src/entropy.test.ts`:

```ts
import { toHex, fromHex, cryptoRandomBytes, mixEntropy } from './entropy'

describe('entropy', () => {
  it('toHex/fromHex round-trip', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255, 128])
    expect(fromHex(toHex(bytes))).toEqual(bytes)
  })

  it('toHex pads each byte to two chars', () => {
    expect(toHex(new Uint8Array([1, 255]))).toBe('01ff')
  })

  it('fromHex rejects odd-length input', () => {
    expect(() => fromHex('abc')).toThrow()
  })

  it('cryptoRandomBytes returns the requested length', () => {
    expect(cryptoRandomBytes(32).length).toBe(32)
  })

  it('mixEntropy produces a 32-byte SHA-256 digest', async () => {
    const out = await mixEntropy(new Uint8Array([1, 2, 3]))
    expect(out.length).toBe(32)
  })

  it('mixEntropy is non-deterministic across calls (CSPRNG mixed in)', async () => {
    const a = await mixEntropy(new Uint8Array([1, 2, 3]))
    const b = await mixEntropy(new Uint8Array([1, 2, 3]))
    expect(toHex(a)).not.toBe(toHex(b))
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @piluvitu/tools test -- entropy`
Expected: FAIL (cannot find module `./entropy`).

- [ ] **Step 4: Write minimal implementation**

Create `packages/tools/src/entropy.ts`:

```ts
/**
 * Entropy mixing for randomness seeds. Pure/portable (Web Crypto API — browser,
 * Node 20+, jsdom via setup). mixEntropy ALWAYS folds in a fresh CSPRNG sample,
 * so the output is never weaker than crypto.getRandomValues even if a caller's
 * source (e.g. a black camera frame) carries little entropy.
 */
export function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('fromHex: hex length must be even')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error('fromHex: invalid hex')
    out[i] = byte
  }
  return out
}

export function cryptoRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  globalThis.crypto.getRandomValues(out)
  return out
}

export async function mixEntropy(
  ...sources: Uint8Array[]
): Promise<Uint8Array> {
  const all = [...sources, cryptoRandomBytes(32)]
  const total = all.reduce((n, s) => n + s.length, 0)
  const buf = new Uint8Array(total)
  let off = 0
  for (const s of all) {
    buf.set(s, off)
    off += s.length
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(digest)
}

/** Convenience: mix sources and return the digest as a lowercase hex string. */
export async function mixEntropyHex(...sources: Uint8Array[]): Promise<string> {
  return toHex(await mixEntropy(...sources))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @piluvitu/tools test -- entropy`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tools/src/entropy.ts packages/tools/src/entropy.test.ts packages/tools/jest.setup.ts
git commit -m "feat(tools): SHA-256 entropy mixing with mandatory CSPRNG fold-in"
```

### Task 1.3: Sorteio puro (roleta)

**Files:**

- Create: `packages/tools/src/roleta.ts`
- Test: `packages/tools/src/roleta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/tools/src/roleta.test.ts`:

```ts
import { normalizeOptions, drawWinnerIndex } from './roleta'
import { toHex } from './entropy'

describe('roleta', () => {
  it('normalizeOptions trims, drops blanks, assigns ids', () => {
    const opts = normalizeOptions('  A \n\n B\nC  \n')
    expect(opts.map((o) => o.label)).toEqual(['A', 'B', 'C'])
    expect(opts.map((o) => o.id)).toEqual(['0', '1', '2'])
  })

  it('drawWinnerIndex is deterministic for a given digest', () => {
    const digest = toHex(new Uint8Array(32).fill(7))
    expect(drawWinnerIndex(4, digest)).toBe(drawWinnerIndex(4, digest))
  })

  it('drawWinnerIndex stays within range', () => {
    for (let seed = 0; seed < 50; seed++) {
      const digest = toHex(new Uint8Array(32).fill(seed))
      const idx = drawWinnerIndex(3, digest)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(3)
    }
  })

  it('drawWinnerIndex throws when there are no options', () => {
    expect(() => drawWinnerIndex(0, '00')).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @piluvitu/tools test -- roleta`
Expected: FAIL (cannot find module `./roleta`).

- [ ] **Step 3: Write minimal implementation**

Create `packages/tools/src/roleta.ts`:

```ts
import { seedFromBytes } from './prng'
import { fromHex } from './entropy'

export interface RoletaOption {
  id: string
  label: string
}

/** Splits a textarea blob into trimmed, non-empty options with stable ids. */
export function normalizeOptions(raw: string): RoletaOption[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((label, i) => ({ id: String(i), label }))
}

/**
 * Deterministically picks a winning index in [0, count) from an entropy digest
 * (hex). Same digest → same winner, so a client animation can land honestly.
 */
export function drawWinnerIndex(count: number, digestHex: string): number {
  if (count <= 0) throw new Error('drawWinnerIndex: no options')
  return seedFromBytes(fromHex(digestHex)).int(count)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @piluvitu/tools test -- roleta`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tools/src/roleta.ts packages/tools/src/roleta.test.ts
git commit -m "feat(tools): pure roleta draw (deterministic winner from digest)"
```

### Task 1.4: Export map do pacote

**Files:**

- Modify: `packages/tools/package.json`
- Modify: `packages/tools/src/index.ts`

- [ ] **Step 1: Add subpath exports**

In `packages/tools/package.json`, add to the `exports` object (after `"./qr-decode"`):

```json
    "./prng": "./src/prng.ts",
    "./entropy": "./src/entropy.ts",
    "./roleta": "./src/roleta.ts"
```

- [ ] **Step 2: Re-export from the barrel**

In `packages/tools/src/index.ts`, append:

```ts
export * from './prng'
export * from './entropy'
export * from './roleta'
```

- [ ] **Step 3: Verify the whole package still tests green**

Run: `pnpm --filter @piluvitu/tools test`
Expected: PASS (all suites).

- [ ] **Step 4: Commit**

```bash
git add packages/tools/package.json packages/tools/src/index.ts
git commit -m "chore(tools): export prng/entropy/roleta subpaths"
```

---

## Phase 2 — UI de entropia (apps/web)

### Task 2.1: Hook `use-camera-entropy`

**Files:**

- Create: `apps/web/lib/log.ts`
- Create: `apps/web/hooks/use-camera-entropy.ts`

- [ ] **Step 1: Create the client logger**

Create `apps/web/lib/log.ts`:

```ts
/**
 * Tiny client-side logger. Wraps console with a level + prefix so entropy/roulette
 * steps and errors are traceable in the browser console. NEVER pass raw image data
 * here — only hashes/metadata. Integration point for a future error reporter is
 * marked below.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, scope: string, msg: string, data?: unknown) {
  const line = `[${scope}] ${msg}`
  // eslint-disable-next-line no-console
  const fn = console[level] ?? console.log
  if (data !== undefined) fn(line, data)
  else fn(line)
  // FUTURE: forward level==='error' to an error reporter (e.g. Sentry) here.
}

export const log = {
  debug: (scope: string, msg: string, data?: unknown) =>
    emit('debug', scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) =>
    emit('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) =>
    emit('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) =>
    emit('error', scope, msg, data),
}
```

- [ ] **Step 2: Create the hook**

Create `apps/web/hooks/use-camera-entropy.ts`:

```ts
'use client'
import { useCallback, useRef, useState } from 'react'
import { mixEntropyHex } from '@piluvitu/tools/entropy'
import { log } from '@/lib/log'

export type EntropySource = 'camera' | 'crypto-only'
export interface EntropyResult {
  digestHex: string
  source: EntropySource
}
type State = 'idle' | 'capturing' | 'done' | 'error'

const FRAME_COUNT = 3
const FRAME_GAP_MS = 60

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Captures a few webcam frames, hashes their pixels together with crypto.getRandomValues
 * into a 32-byte digest, then discards the image. Only the digest leaves this hook —
 * the photo never does. Falls back to crypto-only when no camera/permission.
 */
export function useCameraEntropy() {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const capture = useCallback(async (): Promise<EntropyResult> => {
    setState('capturing')
    setError(null)
    const frames: Uint8Array[] = []
    let source: EntropySource = 'crypto-only'

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })
      streamRef.current = stream
      const video = document.createElement('video')
      video.srcObject = stream
      video.muted = true
      await video.play()

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 240
      const ctx = canvas.getContext('2d')
      if (ctx) {
        for (let i = 0; i < FRAME_COUNT; i++) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
          frames.push(new Uint8Array(data.buffer.slice(0)))
          if (i < FRAME_COUNT - 1) await wait(FRAME_GAP_MS)
        }
        source = 'camera'
      }
    } catch (err) {
      // No camera / denied permission → crypto-only fallback (still secure).
      log.warn('entropy', 'camera unavailable, using crypto-only', String(err))
    } finally {
      stop()
    }

    const digestHex = await mixEntropyHex(...frames)
    log.info('entropy', `captured (${source})`, {
      digestPrefix: digestHex.slice(0, 8),
    })
    setState('done')
    return { digestHex, source }
  }, [stop])

  return { capture, stop, state, error: error ?? undefined }
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/log.ts apps/web/hooks/use-camera-entropy.ts
git commit -m "feat(web): camera entropy hook (in-browser hash, image discarded)"
```

### Task 2.2: Componente `RouletteWheel` + story

**Files:**

- Create: `apps/web/components/entropy/roulette-wheel.tsx`
- Create: `apps/web/components/entropy/roulette-wheel.stories.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/entropy/roulette-wheel.tsx`:

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface WheelOption {
  id: number | string
  label: string
}

interface Props {
  options: WheelOption[]
  /** When set (and spinning was requested), the wheel lands on this option. */
  winnerId: number | string | null
  spinning: boolean
  onSpinEnd?: (winnerId: number | string) => void
  className?: string
}

const PALETTE = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]
const SPIN_MS = 4000
const EXTRA_TURNS = 6

/**
 * Conic-gradient roulette. Lands deterministically on `winnerId` when spinning.
 * Pure presentation — it does not decide the winner; the caller passes it in.
 */
export function RouletteWheel({
  options,
  winnerId,
  spinning,
  onSpinEnd,
  className,
}: Props) {
  const [angle, setAngle] = useState(0)
  const firedRef = useRef(false)
  const n = Math.max(options.length, 1)
  const slice = 360 / n

  useEffect(() => {
    if (!spinning || winnerId == null) return
    const idx = Math.max(
      0,
      options.findIndex((o) => o.id === winnerId),
    )
    firedRef.current = false
    // Land the winner's slice center under the top pointer (12 o'clock).
    const target = EXTRA_TURNS * 360 + (360 - (idx * slice + slice / 2))
    setAngle(target)
    const t = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true
        onSpinEnd?.(winnerId)
      }
    }, SPIN_MS + 50)
    return () => clearTimeout(t)
  }, [spinning, winnerId, options, slice, onSpinEnd])

  const gradient = options
    .map(
      (_, i) =>
        `${PALETTE[i % PALETTE.length]} ${i * slice}deg ${(i + 1) * slice}deg`,
    )
    .join(', ')

  return (
    <div
      className={cn(
        'relative mx-auto aspect-square w-72 max-w-full',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="border-t-foreground absolute -top-2 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-8 border-t-[16px] border-x-transparent"
      />
      <div
        role="img"
        aria-label={
          winnerId != null
            ? `Roleta — vencedor: ${options.find((o) => o.id === winnerId)?.label ?? ''}`
            : 'Roleta de sorteio'
        }
        className="border-foreground/20 h-full w-full rounded-full border-4 shadow-inner"
        style={{
          background: n > 1 ? `conic-gradient(${gradient})` : PALETTE[0],
          transform: `rotate(${angle}deg)`,
          transition: spinning
            ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
            : 'none',
        }}
      />
      <div className="bg-background border-foreground/30 absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2" />
    </div>
  )
}
```

- [ ] **Step 2: Create the story**

Create `apps/web/components/entropy/roulette-wheel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { RouletteWheel, type WheelOption } from './roulette-wheel'

const OPTIONS: WheelOption[] = [
  { id: 1, label: 'Duna' },
  { id: 2, label: 'Matrix' },
  { id: 3, label: 'Interestelar' },
  { id: 4, label: 'Blade Runner' },
]

const meta: Meta<typeof RouletteWheel> = {
  title: 'Entropy/RouletteWheel',
  component: RouletteWheel,
}
export default meta
type Story = StoryObj<typeof RouletteWheel>

export const Idle: Story = {
  args: { options: OPTIONS, winnerId: null, spinning: false },
}

export const Interactive: Story = {
  render: () => {
    const [winner, setWinner] = useState<number | null>(null)
    const [spinning, setSpinning] = useState(false)
    return (
      <div className="space-y-4">
        <RouletteWheel
          options={OPTIONS}
          winnerId={winner}
          spinning={spinning}
          onSpinEnd={() => setSpinning(false)}
        />
        <Button
          onClick={() => {
            setWinner(OPTIONS[Math.floor(Math.random() * OPTIONS.length)].id)
            setSpinning(true)
          }}
        >
          Girar
        </Button>
      </div>
    )
  },
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/entropy/roulette-wheel.tsx apps/web/components/entropy/roulette-wheel.stories.tsx
git commit -m "feat(web): RouletteWheel component (lands on caller-provided winner)"
```

### Task 2.3: Componente `CameraEntropyCapture` + story

**Files:**

- Create: `apps/web/components/entropy/camera-entropy-capture.tsx`
- Create: `apps/web/components/entropy/camera-entropy-capture.stories.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/entropy/camera-entropy-capture.tsx`:

```tsx
'use client'
import { Button } from '@/components/ui/button'
import {
  useCameraEntropy,
  type EntropyResult,
} from '@/hooks/use-camera-entropy'

interface Props {
  onEntropy: (result: EntropyResult) => void
  label?: string
  disabled?: boolean
}

/**
 * Consent + capture UI for camera entropy. Makes the privacy guarantee explicit:
 * the photo is hashed locally and discarded; only the hash is used/sent.
 */
export function CameraEntropyCapture({
  onEntropy,
  label = 'Capturar entropia da câmera',
  disabled,
}: Props) {
  const { capture, state } = useCameraEntropy()
  const busy = state === 'capturing'

  return (
    <div className="space-y-2 rounded-md border p-4">
      <p className="text-muted-foreground text-xs">
        A foto é processada localmente no seu navegador e{' '}
        <strong>descartada na hora</strong>; só um hash de entropia é usado. Sem
        câmera/permissão, caímos no gerador seguro do navegador.
      </p>
      <Button
        type="button"
        disabled={disabled || busy}
        onClick={async () => onEntropy(await capture())}
        data-testid="capture-entropy"
      >
        {busy ? 'Capturando…' : label}
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create the story**

Create `apps/web/components/entropy/camera-entropy-capture.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { CameraEntropyCapture } from './camera-entropy-capture'

const meta: Meta<typeof CameraEntropyCapture> = {
  title: 'Entropy/CameraEntropyCapture',
  component: CameraEntropyCapture,
}
export default meta
type Story = StoryObj<typeof CameraEntropyCapture>

export const Default: Story = {
  args: {
    // eslint-disable-next-line no-console
    onEntropy: (r) => console.log('entropy', r.source, r.digestHex.slice(0, 8)),
  },
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/entropy/camera-entropy-capture.tsx apps/web/components/entropy/camera-entropy-capture.stories.tsx
git commit -m "feat(web): CameraEntropyCapture consent/capture UI"
```

---

## Phase 3 — Página `/tools/roleta`

### Task 3.1: Componente `RoletaTool` + story

**Files:**

- Create: `apps/web/components/tools/roleta-tool.tsx`
- Create: `apps/web/components/tools/roleta-tool.stories.tsx`

- [ ] **Step 1: Create the tool component**

Create `apps/web/components/tools/roleta-tool.tsx`:

```tsx
'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { normalizeOptions, drawWinnerIndex } from '@piluvitu/tools/roleta'
import { CameraEntropyCapture } from '@/components/entropy/camera-entropy-capture'
import {
  RouletteWheel,
  type WheelOption,
} from '@/components/entropy/roulette-wheel'
import type { EntropyResult } from '@/hooks/use-camera-entropy'
import { mixEntropyHex } from '@piluvitu/tools/entropy'
import { log } from '@/lib/log'

export function RoletaTool() {
  const [raw, setRaw] = useState('Pizza\nSushi\nHambúrguer\nTapioca')
  const [winnerId, setWinnerId] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)

  const options = useMemo<WheelOption[]>(
    () => normalizeOptions(raw).map((o, i) => ({ id: i, label: o.label })),
    [raw],
  )

  async function spinWith(digestHex: string) {
    if (options.length === 0) return
    const idx = drawWinnerIndex(options.length, digestHex)
    log.info('roleta', 'winner drawn', {
      idx,
      digestPrefix: digestHex.slice(0, 8),
    })
    setWinnerId(options[idx].id)
    setSpinning(true)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="roleta-options" className="text-sm font-medium">
          Opções (uma por linha)
        </label>
        <Textarea
          id="roleta-options"
          rows={5}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          data-testid="roleta-options"
        />
      </div>

      <RouletteWheel
        options={options}
        winnerId={winnerId}
        spinning={spinning}
        onSpinEnd={() => setSpinning(false)}
      />

      {winnerId != null && !spinning && (
        <p
          className="text-center text-lg font-semibold"
          data-testid="roleta-winner"
        >
          🎉 {options.find((o) => o.id === winnerId)?.label}
        </p>
      )}

      <CameraEntropyCapture
        label="Girar com entropia da câmera"
        disabled={spinning || options.length === 0}
        onEntropy={(r: EntropyResult) => spinWith(r.digestHex)}
      />

      <Button
        variant="secondary"
        disabled={spinning || options.length === 0}
        onClick={async () => spinWith(await mixEntropyHex())}
        data-testid="roleta-spin-crypto"
      >
        Girar só com aleatório do navegador
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Verify the Textarea primitive exists**

Run (from `apps/web/`): `ls components/ui/textarea.tsx`
Expected: file exists. If it does NOT, generate it first: `pnpm dlx shadcn@latest add textarea` (or copy from shadcn docs) and commit separately. Most likely it already exists.

- [ ] **Step 3: Create the story**

Create `apps/web/components/tools/roleta-tool.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { RoletaTool } from './roleta-tool'

const meta: Meta<typeof RoletaTool> = {
  title: 'Tools/RoletaTool',
  component: RoletaTool,
}
export default meta
type Story = StoryObj<typeof RoletaTool>

export const Default: Story = {}
```

- [ ] **Step 4: Type-check**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/tools/roleta-tool.tsx apps/web/components/tools/roleta-tool.stories.tsx
git commit -m "feat(web): RoletaTool — client-side draw with camera entropy"
```

### Task 3.2: Página + entrada no registry

**Files:**

- Modify: `apps/web/lib/tools-registry.ts`
- Create: `apps/web/app/(site)/tools/roleta/page.tsx`

- [ ] **Step 1: Register the tool**

In `apps/web/lib/tools-registry.ts`: add `faDharmachakra` to the `@fortawesome/free-solid-svg-icons` import, and append this entry to the `TOOLS` array (after the `uuid` entry):

```ts
  {
    slug: 'roleta',
    title: 'Roleta / Sorteio',
    description: 'Sorteio com entropia da câmera',
    icon: faDharmachakra,
    group: 'geradores',
  },
```

- [ ] **Step 2: Create the page**

Create `apps/web/app/(site)/tools/roleta/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { TOOLS } from '@/lib/tools-registry'
import { ToolPageShell } from '@/components/tools/tool-page-shell'
import { RoletaTool } from '@/components/tools/roleta-tool'

const tool = TOOLS.find((t) => t.slug === 'roleta')!

export const metadata: Metadata = { title: tool.title }

export default function RoletaPage() {
  return (
    <ToolPageShell tool={tool}>
      <RoletaTool />
    </ToolPageShell>
  )
}
```

- [ ] **Step 3: Type-check + build the route**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS. (Full `next build` runs in Phase 8.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/tools-registry.ts "apps/web/app/(site)/tools/roleta/page.tsx"
git commit -m "feat(web): /tools/roleta page + registry entry"
```

### Task 3.3: E2E da roleta

**Files:**

- Modify: `apps/web/app/(site)/tools/tools.e2e.ts`

- [ ] **Step 1: Add the e2e test**

Append to `apps/web/app/(site)/tools/tools.e2e.ts` (inside the file, following its existing `test(...)` style):

```ts
test('roleta: draws a winner using browser randomness', async ({ page }) => {
  await page.goto('/tools/roleta')
  await expect(page.getByTestId('roleta-options')).toBeVisible()

  // Use the crypto-only path so the test needs no camera permission.
  await page.getByTestId('roleta-spin-crypto').click()

  // Winner appears once the spin animation settles.
  await expect(page.getByTestId('roleta-winner')).toBeVisible({
    timeout: 10000,
  })
  const text = (await page.getByTestId('roleta-winner').textContent()) ?? ''
  expect(
    ['Pizza', 'Sushi', 'Hambúrguer', 'Tapioca'].some((o) => text.includes(o)),
  ).toBe(true)
})
```

- [ ] **Step 2: Run the e2e**

Run: `pnpm --filter @piluvitu/web test:e2e -- tools`
Expected: PASS (the roleta test + existing tools tests).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(site)/tools/tools.e2e.ts"
git commit -m "test(web): e2e for /tools/roleta crypto-only draw"
```

---

## Phase 4 — Votação: voto de aprovação (backend)

### Task 4.1: Novo schema (votes UNIQUE, winner_method, tiebreaks)

**Files:**

- Modify: `apps/api/internal/votacao/schema.sql`

- [ ] **Step 1: Update schema.sql**

In `apps/api/internal/votacao/schema.sql`:

1. Change the `votes` UNIQUE from `UNIQUE (session_id, user_id)` to:

```sql
  UNIQUE (session_id, user_id, movie_id)
```

2. Add a column to `voting_sessions` (inside the existing CREATE TABLE, after `winner_movie_id`):

```sql
  winner_method     TEXT,
```

3. Append the new table + index at the end of the file:

```sql
CREATE TABLE IF NOT EXISTS tiebreaks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  triggered_by    INTEGER NOT NULL REFERENCES users(id),
  tied_ids_json   TEXT NOT NULL,
  client_entropy  TEXT NOT NULL,
  server_nonce    TEXT NOT NULL,
  winner_movie_id INTEGER NOT NULL REFERENCES session_movies(id),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tiebreaks_session ON tiebreaks(session_id);
```

Note: `schema.sql` defines the shape for **new** databases. Existing DBs are patched by `migrate()` (next task) — `CREATE TABLE IF NOT EXISTS` won't alter an existing `votes`/`voting_sessions`.

- [ ] **Step 2: Verify it still compiles (embedded)**

Run: `cd apps/api && go build ./...`
Expected: PASS (schema is embedded; build proves it's still readable).

- [ ] **Step 3: Commit**

```bash
git add apps/api/internal/votacao/schema.sql
git commit -m "feat(api): votes approval UNIQUE + winner_method + tiebreaks table"
```

### Task 4.2: `migrate()` idempotente (rebuild votes + add column)

**Files:**

- Modify: `apps/api/internal/votacao/store.go`
- Test: `apps/api/internal/votacao/store_test.go`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/internal/votacao/store_test.go`:

```go
func TestMigrateRebuildsLegacyVotesUnique(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "legacy.db")

	// Simulate a legacy DB: votes with the OLD UNIQUE(session_id,user_id).
	raw, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	_, err = raw.Exec(`
		CREATE TABLE votes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL,
			user_id INTEGER NOT NULL,
			movie_id INTEGER NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (session_id, user_id)
		);
		INSERT INTO votes (session_id, user_id, movie_id) VALUES (1, 1, 10);
	`)
	if err != nil {
		t.Fatalf("seed legacy: %v", err)
	}
	_ = raw.Close()

	// Opening via NewStore must migrate the table so a second movie for the
	// same (session,user) is now allowed (approval voting).
	s, err := votacao.NewStore(path)
	if err != nil {
		t.Fatalf("NewStore (migrate): %v", err)
	}
	defer s.Close()

	if _, err := s.DB().Exec(`INSERT INTO votes (session_id, user_id, movie_id) VALUES (1, 1, 11)`); err != nil {
		t.Fatalf("expected second approval to be allowed after migrate, got: %v", err)
	}
	// The original row must survive.
	var n int
	if err := s.DB().QueryRow(`SELECT COUNT(*) FROM votes WHERE session_id=1 AND user_id=1`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected 2 votes preserved+added, got %d", n)
	}
}
```

Ensure `store_test.go` imports include `"database/sql"` and `"path/filepath"` and `_ "modernc.org/sqlite"` (add any missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/votacao/ -run TestMigrateRebuildsLegacyVotesUnique`
Expected: FAIL (the second insert is rejected by the old UNIQUE — migrate not implemented).

- [ ] **Step 3: Implement migrate() and call it from NewStore**

In `apps/api/internal/votacao/store.go`, replace the schema-apply line in `NewStore` and add `migrate`:

```go
	if _, err := db.Exec(schemaSQL); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("votacao: apply schema: %w", err)
	}
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("votacao: migrate: %w", err)
	}
	return &Store{db: db}, nil
}

// migrate brings pre-existing databases up to the current schema. It is
// idempotent: on a fresh DB (already correct shape) every step is a no-op.
func migrate(db *sql.DB) error {
	if err := migrateVotesUnique(db); err != nil {
		return err
	}
	return migrateAddColumn(db, "voting_sessions", "winner_method", "TEXT")
}

// migrateVotesUnique rebuilds the votes table when it still carries the legacy
// UNIQUE(session_id,user_id) (single-vote) instead of the approval-voting
// UNIQUE(session_id,user_id,movie_id).
func migrateVotesUnique(db *sql.DB) error {
	legacy, err := hasTwoColVotesUnique(db)
	if err != nil {
		return err
	}
	if !legacy {
		return nil
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	stmts := []string{
		`CREATE TABLE votes_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
			user_id INTEGER NOT NULL REFERENCES users(id),
			movie_id INTEGER NOT NULL REFERENCES session_movies(id),
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE (session_id, user_id, movie_id)
		)`,
		`INSERT OR IGNORE INTO votes_new (id, session_id, user_id, movie_id, created_at)
			SELECT id, session_id, user_id, movie_id, created_at FROM votes`,
		`DROP TABLE votes`,
		`ALTER TABLE votes_new RENAME TO votes`,
		`CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id)`,
	}
	for _, s := range stmts {
		if _, err := tx.Exec(s); err != nil {
			return fmt.Errorf("rebuild votes: %w", err)
		}
	}
	return tx.Commit()
}

// hasTwoColVotesUnique reports whether votes has a UNIQUE index spanning exactly
// (session_id, user_id) — the legacy single-vote constraint.
func hasTwoColVotesUnique(db *sql.DB) (bool, error) {
	rows, err := db.Query(`PRAGMA index_list('votes')`)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	type idx struct {
		name   string
		unique int
	}
	var uniques []idx
	for rows.Next() {
		var seq int
		var name string
		var unique int
		var origin string
		var partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return false, err
		}
		if unique == 1 {
			uniques = append(uniques, idx{name: name})
		}
	}
	if err := rows.Err(); err != nil {
		return false, err
	}
	for _, u := range uniques {
		cols, err := indexColumns(db, u.name)
		if err != nil {
			return false, err
		}
		if len(cols) == 2 && cols[0] == "session_id" && cols[1] == "user_id" {
			return true, nil
		}
	}
	return false, nil
}

func indexColumns(db *sql.DB, name string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA index_info(%q)", name))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var seqno, cid int
		var col sql.NullString
		if err := rows.Scan(&seqno, &cid, &col); err != nil {
			return nil, err
		}
		cols = append(cols, col.String)
	}
	return cols, rows.Err()
}

// migrateAddColumn adds a column if absent (idempotent ALTER).
func migrateAddColumn(db *sql.DB, table, column, decl string) error {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%q)", table))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name string
		var ctype string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == column {
			return nil // already present
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	_, err = db.Exec(fmt.Sprintf("ALTER TABLE %q ADD COLUMN %s %s", table, column, decl))
	return err
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/votacao/ -run TestMigrateRebuildsLegacyVotesUnique`
Expected: PASS.

- [ ] **Step 5: Run the whole votacao package**

Run: `cd apps/api && go test ./internal/votacao/...`
Expected: PASS (existing tests still green — fresh DBs see a no-op migrate).

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/votacao/store.go apps/api/internal/votacao/store_test.go
git commit -m "feat(api): idempotent migrate — rebuild votes UNIQUE + add winner_method"
```

### Task 4.3: `ReplaceUserVotes` + `GetUserVotes` + `CountVoters`

**Files:**

- Modify: `apps/api/internal/votacao/votes.go`
- Test: `apps/api/internal/votacao/votes_test.go`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/internal/votacao/votes_test.go` (use existing helpers like `newTestStore` and whatever seed helpers the file already has — seed a session + movies first the same way the existing tests do):

```go
func TestReplaceUserVotes(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "sub-rv", "rv@example.com")
	sess := mustSession(t, s, u.ID)
	m1 := mustMovie(t, s, sess.ID, "Ação", "A")
	m2 := mustMovie(t, s, sess.ID, "Comédia", "B")
	m3 := mustMovie(t, s, sess.ID, "Drama", "C")

	// First submission: approve m1 + m2.
	if err := s.ReplaceUserVotes(ctx, sess.ID, u.ID, []int64{m1.ID, m2.ID}); err != nil {
		t.Fatalf("replace 1: %v", err)
	}
	got, err := s.GetUserVotes(ctx, sess.ID, u.ID)
	if err != nil {
		t.Fatalf("get votes: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 votes, got %d", len(got))
	}

	// Re-submission replaces the set: now only m3.
	if err := s.ReplaceUserVotes(ctx, sess.ID, u.ID, []int64{m3.ID}); err != nil {
		t.Fatalf("replace 2: %v", err)
	}
	got, _ = s.GetUserVotes(ctx, sess.ID, u.ID)
	if len(got) != 1 || got[0] != m3.ID {
		t.Fatalf("want [m3], got %v", got)
	}

	// Empty set clears the user's votes.
	if err := s.ReplaceUserVotes(ctx, sess.ID, u.ID, nil); err != nil {
		t.Fatalf("replace empty: %v", err)
	}
	got, _ = s.GetUserVotes(ctx, sess.ID, u.ID)
	if len(got) != 0 {
		t.Fatalf("want empty, got %v", got)
	}
}

func TestReplaceUserVotesRejectsForeignMovie(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "sub-fm", "fm@example.com")
	sess := mustSession(t, s, u.ID)
	_ = mustMovie(t, s, sess.ID, "Ação", "A")

	err := s.ReplaceUserVotes(ctx, sess.ID, u.ID, []int64{99999})
	if !errors.Is(err, votacao.ErrMovieNotInSession) {
		t.Fatalf("want ErrMovieNotInSession, got %v", err)
	}
}

func TestCountVoters(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	u1 := mustUser(t, s, "sub-c1", "c1@example.com")
	u2 := mustUser(t, s, "sub-c2", "c2@example.com")
	sess := mustSession(t, s, u1.ID)
	m1 := mustMovie(t, s, sess.ID, "Ação", "A")
	m2 := mustMovie(t, s, sess.ID, "Comédia", "B")

	_ = s.ReplaceUserVotes(ctx, sess.ID, u1.ID, []int64{m1.ID, m2.ID})
	_ = s.ReplaceUserVotes(ctx, sess.ID, u2.ID, []int64{m1.ID})

	voters, err := s.CountVoters(ctx, sess.ID)
	if err != nil {
		t.Fatalf("count voters: %v", err)
	}
	if voters != 2 {
		t.Fatalf("want 2 distinct voters, got %d", voters)
	}
}
```

> Note: `mustUser`/`mustSession`/`mustMovie` — reuse the seed helpers already present in `votes_test.go`/`helper_test.go`. If they don't exist with these exact names, define thin wrappers in `helper_test.go` calling the real store methods (`CreateOrUpdateUser`/`CreateVotingSession`/`InsertSessionMovies`+`GetSessionMovies`). Match the existing test file's conventions.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/votacao/ -run 'TestReplaceUserVotes|TestCountVoters'`
Expected: FAIL (undefined `ReplaceUserVotes`/`GetUserVotes`/`CountVoters`/`ErrMovieNotInSession`).

- [ ] **Step 3: Implement the store methods**

In `apps/api/internal/votacao/votes.go`:

1. Add the error and remove the now-unused single-vote pieces. Replace the `ErrAlreadyVoted` var with:

```go
// ErrMovieNotInSession is returned by ReplaceUserVotes when a movie_id does not
// belong to the target session.
var ErrMovieNotInSession = errors.New("votacao: movie not in session")
```

2. Replace `InsertVote` with `ReplaceUserVotes`:

```go
// ReplaceUserVotes sets the user's approvals for a session to exactly movieIDs
// (transactional: delete all then insert the new set). An empty/nil set clears
// the user's votes. Every movieID must belong to the session.
func (s *Store) ReplaceUserVotes(ctx context.Context, sessionID, userID int64, movieIDs []int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("votacao: begin replace votes: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	for _, mid := range movieIDs {
		var ok int
		if err := tx.QueryRowContext(ctx,
			`SELECT EXISTS(SELECT 1 FROM session_movies WHERE id=? AND session_id=?)`,
			mid, sessionID,
		).Scan(&ok); err != nil {
			return fmt.Errorf("votacao: validate movie: %w", err)
		}
		if ok == 0 {
			return ErrMovieNotInSession
		}
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM votes WHERE session_id=? AND user_id=?`, sessionID, userID,
	); err != nil {
		return fmt.Errorf("votacao: clear votes: %w", err)
	}
	for _, mid := range movieIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO votes (session_id, user_id, movie_id) VALUES (?, ?, ?)`,
			sessionID, userID, mid,
		); err != nil {
			return fmt.Errorf("votacao: insert vote: %w", err)
		}
	}
	return tx.Commit()
}
```

3. Replace `GetUserVote` with `GetUserVotes`:

```go
// GetUserVotes returns the movie_ids the user approved in the session (asc),
// or an empty slice when they have not voted.
func (s *Store) GetUserVotes(ctx context.Context, sessionID, userID int64) ([]int64, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT movie_id FROM votes WHERE session_id=? AND user_id=? ORDER BY movie_id ASC`,
		sessionID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("votacao: get user votes: %w", err)
	}
	defer rows.Close()
	out := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// CountVoters returns the number of distinct users who voted in the session.
func (s *Store) CountVoters(ctx context.Context, sessionID int64) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(DISTINCT user_id) FROM votes WHERE session_id=?`, sessionID,
	).Scan(&n)
	return n, err
}
```

4. Remove `isVotesUniqueViolation` and the `strings` import if it becomes unused. Keep `HasVoted`, `ListVotesBySession`, `ListSessionVotesWithUsers`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/votacao/ -run 'TestReplaceUserVotes|TestCountVoters'`
Expected: PASS.

- [ ] **Step 5: Fix any remaining compile breaks in the package**

Run: `cd apps/api && go build ./internal/votacao/...`
Expected: PASS. (If a `GetUserVote`/`InsertVote` reference remains elsewhere in this package, it'll surface here — the handler is updated in the next tasks.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/votacao/votes.go apps/api/internal/votacao/votes_test.go apps/api/internal/votacao/helper_test.go
git commit -m "feat(api): approval voting store (ReplaceUserVotes/GetUserVotes/CountVoters)"
```

### Task 4.4: Handler de voto aceita `movie_ids[]`

**Files:**

- Modify: `apps/api/internal/handlers/votacao/votes.go`
- Test: `apps/api/internal/handlers/votacao/votes_test.go`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/internal/handlers/votacao/votes_test.go` (follow the file's existing handler-test setup — it builds a `Handlers` with a real store and uses `auth.WithUserForTests` + `unwrap`):

```go
func TestCreateVoteApprovesMultiple(t *testing.T) {
	h, store := newTestHandlers(t) // reuse the existing helper in this package
	ctx := context.Background()
	u := seedUser(t, store, "voter@example.com")
	sess := seedSession(t, store, u.ID)
	m1 := seedMovie(t, store, sess.ID, "Ação", "A")
	m2 := seedMovie(t, store, sess.ID, "Drama", "B")

	body := fmt.Sprintf(`{"movie_ids":[%d,%d]}`, m1.ID, m2.ID)
	req := httptest.NewRequest(http.MethodPost,
		fmt.Sprintf("/votacao/sessions/%d/votes", sess.ID), strings.NewReader(body))
	req = withChiID(req, "id", fmt.Sprint(sess.ID)) // existing helper to set chi URL param
	req = auth.WithUserForTests(req, u)
	rec := httptest.NewRecorder()
	h.CreateVote(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var out struct {
		VotedMovieIDs []int64 `json:"voted_movie_ids"`
	}
	unwrap(t, rec, &out)
	if len(out.VotedMovieIDs) != 2 {
		t.Fatalf("want 2 approvals, got %v", out.VotedMovieIDs)
	}

	got, _ := store.GetUserVotes(ctx, sess.ID, u.ID)
	if len(got) != 2 {
		t.Fatalf("store should have 2 votes, got %d", len(got))
	}
}
```

> Reuse the existing helpers in this test package (`newTestHandlers`, `seedUser`, `seedSession`, `seedMovie`, `withChiID`). If their names differ, match what's already in `votes_test.go`/`sessions_test.go` — do NOT invent new infra.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/handlers/votacao/ -run TestCreateVoteApprovesMultiple`
Expected: FAIL (handler still decodes `movie_id` / calls `InsertVote`).

- [ ] **Step 3: Update the handler**

In `apps/api/internal/handlers/votacao/votes.go`, replace `voteBody` and `CreateVote`:

```go
type voteBody struct {
	MovieIDs []int64 `json:"movie_ids"`
}

// CreateVote (logged) replaces the caller's approvals for the session with the
// given movie_ids. Editable until the session closes. Empty set clears votes.
func (h *Handlers) CreateVote(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "Você precisa estar logado.")
		return
	}
	session, err := h.deps.Store.GetVotingSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "Sessão não encontrada.")
			return
		}
		logging.FromContext(r.Context()).Error("vote: load session", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar a sessão.")
		return
	}
	if session.Status == "closed" {
		httpx.Error(w, http.StatusConflict, "session_closed", "Sessão encerrada — votação fechada.")
		return
	}
	var body voteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo da requisição inválido.")
		return
	}
	if err := h.deps.Store.ReplaceUserVotes(r.Context(), sessionID, user.ID, body.MovieIDs); err != nil {
		if errors.Is(err, votacao.ErrMovieNotInSession) {
			httpx.Error(w, http.StatusBadRequest, "movie_not_in_session", "Um dos filmes não pertence a esta sessão.")
			return
		}
		logging.FromContext(r.Context()).Error("vote: replace", "err", err, "session_id", sessionID, "user_id", user.ID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Não foi possível registrar o voto.")
		return
	}
	logging.With(r.Context(), "session_id", sessionID, "user_id", user.ID, "movie_ids", body.MovieIDs).
		Info("votes_replaced")
	httpx.DataMsg(w, http.StatusOK, map[string]any{"voted_movie_ids": body.MovieIDs}, httpx.Success("Voto registrado."))
}
```

Add imports to this file if missing: `"github.com/PiluVitu/api/internal/logging"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/handlers/votacao/ -run TestCreateVoteApprovesMultiple`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/handlers/votacao/votes.go apps/api/internal/handlers/votacao/votes_test.go
git commit -m "feat(api): vote endpoint accepts movie_ids[] (approval voting)"
```

### Task 4.5: `GetSession` → `voted_movie_ids`; `GetResults` → `total_voters`

**Files:**

- Modify: `apps/api/internal/handlers/votacao/sessions.go`
- Modify: `apps/api/internal/handlers/votacao/votes.go` (GetResults)
- Test: `apps/api/internal/handlers/votacao/sessions_test.go`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/internal/handlers/votacao/sessions_test.go`:

```go
func TestGetSessionReturnsVotedMovieIDs(t *testing.T) {
	h, store := newTestHandlers(t)
	u := seedUser(t, store, "gs@example.com")
	sess := seedSession(t, store, u.ID)
	m1 := seedMovie(t, store, sess.ID, "Ação", "A")
	m2 := seedMovie(t, store, sess.ID, "Drama", "B")
	_ = store.ReplaceUserVotes(context.Background(), sess.ID, u.ID, []int64{m1.ID, m2.ID})

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/votacao/sessions/%d", sess.ID), nil)
	req = withChiID(req, "id", fmt.Sprint(sess.ID))
	req = auth.WithUserForTests(req, u)
	rec := httptest.NewRecorder()
	h.GetSession(rec, req)

	var out struct {
		HasVoted      bool    `json:"has_voted"`
		VotedMovieIDs []int64 `json:"voted_movie_ids"`
	}
	unwrap(t, rec, &out)
	if !out.HasVoted || len(out.VotedMovieIDs) != 2 {
		t.Fatalf("want has_voted + 2 ids, got %+v", out)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/handlers/votacao/ -run TestGetSessionReturnsVotedMovieIDs`
Expected: FAIL (response still has `voted_movie_id` singular and calls `GetUserVote`).

- [ ] **Step 3: Update GetSession**

In `apps/api/internal/handlers/votacao/sessions.go`, replace the voted-block + response map in `GetSession`:

```go
	votedMovieIDs := []int64{}
	if user := auth.UserFromContext(r.Context()); user != nil {
		if ids, err := h.deps.Store.GetUserVotes(r.Context(), session.ID, user.ID); err == nil {
			votedMovieIDs = ids
		}
	}

	httpx.Data(w, http.StatusOK, map[string]any{
		"session":         session,
		"movies":          movies,
		"has_voted":       len(votedMovieIDs) > 0,
		"voted_movie_ids": votedMovieIDs,
	})
```

- [ ] **Step 4: Update GetResults to add total_voters**

In `apps/api/internal/handlers/votacao/votes.go`, in `GetResults`, after computing `votes` and before the final `httpx.Data`, add the voter count and include it:

```go
	voters, err := h.deps.Store.CountVoters(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("results: count voters", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar os resultados.")
		return
	}
	httpx.Data(w, http.StatusOK, map[string]any{
		"results":      rows,
		"total_votes":  len(votes),
		"total_voters": voters,
	})
```

(Replace the existing final `httpx.Data(... "results"... "total_votes"...)` line.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && go test ./internal/handlers/votacao/...`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/handlers/votacao/sessions.go apps/api/internal/handlers/votacao/votes.go apps/api/internal/handlers/votacao/sessions_test.go
git commit -m "feat(api): GetSession voted_movie_ids + GetResults total_voters"
```

---

## Phase 5 — Votação: voto de aprovação (frontend)

### Task 5.1: Types + api-client + hook

**Files:**

- Modify: `apps/web/lib/votacao/types.ts`
- Modify: `apps/web/lib/votacao/api-client.ts`
- Modify: `apps/web/hooks/votacao/use-vote-mutation.ts`

- [ ] **Step 1: Update types**

In `apps/web/lib/votacao/types.ts`:

1. In `VotingSession`, add after `WinnerMovieID`:

```ts
  WinnerMethod?: 'votes' | 'roulette' | null
```

2. Replace `SessionDetail.voted_movie_id` field with:

```ts
  /** Movies the current user approved (empty when they haven't voted). */
  voted_movie_ids: number[]
```

3. In `ResultsResponse`, add `total_voters`:

```ts
export interface ResultsResponse {
  results: { movie_id: number; count: number }[]
  total_votes: number
  total_voters: number
}
```

4. Replace `RunoffResponse` with `TiebreakResponse`:

```ts
export interface TiebreakResponse {
  winner_movie_id: number
  tied_movie_ids: number[]
  server_nonce: string
}
```

- [ ] **Step 2: Update the api-client**

In `apps/web/lib/votacao/api-client.ts`:

1. In the type import block, remove `RunoffResponse` and add `TiebreakResponse`.

2. Replace the `vote` method:

```ts
  vote: (id: number, movieIds: number[]) =>
    call<{ voted_movie_ids: number[] }>(`/votacao/sessions/${id}/votes`, {
      method: 'POST',
      body: JSON.stringify({ movie_ids: movieIds }),
    }),
```

3. Replace the `createRunoff` method with `tiebreak`:

```ts
  tiebreak: (id: number, entropy: string) =>
    call<TiebreakResponse>(`/votacao/sessions/${id}/tiebreak`, {
      method: 'POST',
      body: JSON.stringify({ entropy }),
    }),
```

- [ ] **Step 3: Update the vote mutation hook**

Replace `apps/web/hooks/votacao/use-vote-mutation.ts`:

```ts
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useVoteMutation(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (movieIds: number[]) => votacaoApi.vote(sessionId, movieIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions', sessionId] })
      qc.invalidateQueries({
        queryKey: ['votacao', 'sessions', sessionId, 'results'],
      })
    },
  })
}
```

- [ ] **Step 4: Type-check (will reveal downstream breaks — fixed in 5.2/7.x)**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: errors ONLY in files updated by later tasks (`vote-section.tsx`, `results-list.tsx`, `[id]/page.tsx`, `runoff-button.tsx`, `use-create-runoff.ts`). Note them; they're addressed next.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/votacao/types.ts apps/web/lib/votacao/api-client.ts apps/web/hooks/votacao/use-vote-mutation.ts
git commit -m "feat(web): votacao types/api for approval voting + tiebreak"
```

### Task 5.2: Multi-seleção na UI (vote-section, results-list, detail page)

**Files:**

- Modify: `apps/web/components/votacao/vote-section.tsx`
- Modify: `apps/web/components/votacao/vote-section.stories.tsx`
- Modify: `apps/web/components/votacao/results-list.tsx`
- Modify: `apps/web/app/(site)/votacao/[id]/page.tsx`

- [ ] **Step 1: Rewrite VoteSection for multi-select**

Replace `apps/web/components/votacao/vote-section.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MovieCard } from './movie-card'
import { useVoteMutation } from '@/hooks/votacao/use-vote-mutation'
import { errorMessage } from '@/lib/votacao/api-client'
import type { SessionMovie } from '@/lib/votacao/types'

interface Props {
  sessionId: number
  movies: SessionMovie[]
  closed: boolean
  /** Movies the current user already approved. */
  votedMovieIds: number[]
}

export function VoteSection({
  sessionId,
  movies,
  closed,
  votedMovieIds,
}: Props) {
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(votedMovieIds),
  )
  const mutation = useVoteMutation(sessionId)

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {closed && (
        <p className="bg-muted rounded-md border px-4 py-3 text-sm">
          Sessão encerrada — votação fechada.
        </p>
      )}
      {!closed && (
        <p className="text-muted-foreground text-sm">
          Aprove quantos filmes quiser. Você pode mudar seu voto até a sessão
          ser encerrada.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {movies.map((m) => (
          <MovieCard
            key={m.ID}
            movie={m}
            selected={selected.has(m.ID)}
            youVoted={selected.has(m.ID)}
            onSelect={() => !closed && toggle(m.ID)}
            disabled={closed}
          />
        ))}
      </div>
      {!closed && (
        <div className="flex justify-end">
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate(Array.from(selected), {
                onSuccess: () => toast.success('Voto registrado'),
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          >
            {mutation.isPending ? 'Enviando…' : `Votar (${selected.size})`}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update the VoteSection story**

Replace the props in `apps/web/components/votacao/vote-section.stories.tsx` so each story passes `closed` + `votedMovieIds` instead of `alreadyVoted`/`votedMovieId`. Example default story args:

```tsx
  args: {
    sessionId: 1,
    movies: SAMPLE_MOVIES, // keep the existing sample array in the file
    closed: false,
    votedMovieIds: [],
  },
```

Add a second story `WithApprovals` with `votedMovieIds: [SAMPLE_MOVIES[0].ID]`.

- [ ] **Step 3: Update ResultsList for multiple "seu voto"**

In `apps/web/components/votacao/results-list.tsx`:

1. Change the `Props` field `votedMovieId?: number | null` to:

```ts
  /** Movies the current user approved. Tags their rows. */
  votedMovieIds?: number[]
```

2. Change the `total` line to use voters when present (keeps percentages meaningful for approval voting):

```ts
const total = data.total_votes || 1
```

(leave as-is — approval percentages are over total approvals; no change needed.)

3. Replace the `youVoted` computation inside the `.map`:

```ts
const youVoted = (votedMovieIds ?? []).includes(r.movie_id)
```

4. Add a winner-method badge: in the header area above the list, after the tie callout, add:

```tsx
{
  data.results.length > 0 && !analysis.isTie && (
    <p className="text-muted-foreground text-xs">
      Total de votantes: <strong>{data.total_voters}</strong>
    </p>
  )
}
```

- [ ] **Step 4: Update the detail page**

In `apps/web/app/(site)/votacao/[id]/page.tsx`:

1. Change the destructure: `const { session, movies, voted_movie_ids } = detail.data` (drop `has_voted`, `voted_movie_id`).

2. Update the closed branch `<ResultsList>` prop: `votedMovieIds={voted_movie_ids}`.

3. Update the open branch `<VoteSection>`:

```tsx
<VoteSection
  sessionId={id}
  movies={movies}
  closed={closed}
  votedMovieIds={voted_movie_ids}
/>
```

(The `RunoffButton` import/usage is replaced in Phase 7; leave it for now — it still compiles since `runoff-button.tsx` is untouched until then. If `tsc` from Task 5.1 flagged `runoff-button.tsx`/`use-create-runoff.ts`, those are fixed in Phase 7.)

- [ ] **Step 5: Type-check**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: remaining errors only in `runoff-button.tsx` + `use-create-runoff.ts` (removed in Phase 7). vote-section/results-list/detail page clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/votacao/vote-section.tsx apps/web/components/votacao/vote-section.stories.tsx apps/web/components/votacao/results-list.tsx "apps/web/app/(site)/votacao/[id]/page.tsx"
git commit -m "feat(web): approval multi-select voting UI"
```

---

## Phase 6 — Desempate na roleta (backend)

### Task 6.1: Lógica pura do desempate (`tiebreak.go`)

**Files:**

- Create: `apps/api/internal/votacao/tiebreak.go`
- Test: `apps/api/internal/votacao/tiebreak_test.go`

- [ ] **Step 1: Write the failing test**

Create `apps/api/internal/votacao/tiebreak_test.go`:

```go
package votacao_test

import (
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestTiebreakSeedIsDeterministicAndOrderIndependent(t *testing.T) {
	ce := []byte{1, 2, 3}
	sn := []byte{9, 8, 7}
	a := votacao.TiebreakSeed(ce, sn, 5, []int64{30, 10, 20})
	b := votacao.TiebreakSeed(ce, sn, 5, []int64{10, 20, 30})
	if string(a) != string(b) {
		t.Fatal("seed must be independent of tied id order")
	}
	if len(a) != 32 {
		t.Fatalf("want 32-byte seed, got %d", len(a))
	}
}

func TestPickTiebreakIndexDeterministicAndInRange(t *testing.T) {
	seed := votacao.TiebreakSeed([]byte("client"), []byte("server"), 1, []int64{1, 2, 3})
	idx := votacao.PickTiebreakIndex(seed, 3)
	if idx != votacao.PickTiebreakIndex(seed, 3) {
		t.Fatal("must be deterministic for same seed")
	}
	if idx < 0 || idx >= 3 {
		t.Fatalf("index out of range: %d", idx)
	}
}

func TestPickTiebreakIndexRoughlyUniform(t *testing.T) {
	n := 4
	counts := make([]int, n)
	const N = 20000
	for i := 0; i < N; i++ {
		seed := votacao.TiebreakSeed([]byte{byte(i), byte(i >> 8)}, []byte{0x5a}, 1, []int64{1, 2, 3, 4})
		counts[votacao.PickTiebreakIndex(seed, n)]++
	}
	for _, c := range counts {
		if c < int(float64(N/n)*0.85) || c > int(float64(N/n)*1.15) {
			t.Fatalf("non-uniform distribution: %v", counts)
		}
	}
}

func TestPickTiebreakIndexHandlesPowerOfTwo(t *testing.T) {
	// n=2 divides 2^32 — must not infinite-loop nor go out of range.
	seed := votacao.TiebreakSeed([]byte("x"), []byte("y"), 1, []int64{1, 2})
	idx := votacao.PickTiebreakIndex(seed, 2)
	if idx < 0 || idx >= 2 {
		t.Fatalf("index out of range: %d", idx)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/votacao/ -run 'Tiebreak'`
Expected: FAIL (undefined `TiebreakSeed`/`PickTiebreakIndex`).

- [ ] **Step 3: Implement the pure logic**

Create `apps/api/internal/votacao/tiebreak.go`:

```go
package votacao

import (
	"crypto/sha256"
	"encoding/binary"
	"sort"
)

// TiebreakSeed derives a 32-byte seed from the client entropy, the server nonce,
// the session id and the tied movie ids. The ids are sorted internally so the
// seed is independent of their input order (reproducible/auditable).
func TiebreakSeed(clientEntropy, serverNonce []byte, sessionID int64, tiedIDs []int64) []byte {
	ids := append([]int64(nil), tiedIDs...)
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	h := sha256.New()
	h.Write(clientEntropy)
	h.Write(serverNonce)
	var sid [8]byte
	binary.BigEndian.PutUint64(sid[:], uint64(sessionID))
	h.Write(sid[:])
	for _, id := range ids {
		var b [8]byte
		binary.BigEndian.PutUint64(b[:], uint64(id))
		h.Write(b[:])
	}
	return h.Sum(nil)
}

// PickTiebreakIndex maps a seed to an unbiased index in [0, n) using rejection
// sampling over 32-bit windows of the seed (re-hashing if the bytes are
// exhausted, which is astronomically unlikely). n must be >= 1.
func PickTiebreakIndex(seed []byte, n int) int {
	if n <= 1 {
		return 0
	}
	// Largest multiple of n that fits in 2^32, kept in uint64 so powers of two
	// (where it equals 2^32 exactly) don't wrap to 0.
	limit := (uint64(1) << 32) / uint64(n) * uint64(n)
	cur := seed
	for {
		for off := 0; off+4 <= len(cur); off += 4 {
			x := uint64(binary.BigEndian.Uint32(cur[off : off+4]))
			if x < limit {
				return int(x % uint64(n))
			}
		}
		next := sha256.Sum256(cur)
		cur = next[:]
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/votacao/ -run 'Tiebreak'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/votacao/tiebreak.go apps/api/internal/votacao/tiebreak_test.go
git commit -m "feat(api): pure tiebreak seed + unbiased index selection"
```

### Task 6.2: Store de tiebreaks + winner setter

**Files:**

- Create: `apps/api/internal/votacao/tiebreaks.go`
- Test: `apps/api/internal/votacao/tiebreaks_test.go`

- [ ] **Step 1: Write the failing test**

Create `apps/api/internal/votacao/tiebreaks_test.go`:

```go
package votacao_test

import (
	"context"
	"testing"

	"github.com/PiluVitu/api/internal/votacao"
)

func TestCreateTiebreakAndSetWinner(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "tb-sub", "tb@example.com")
	sess := mustSession(t, s, u.ID)
	m1 := mustMovie(t, s, sess.ID, "Ação", "A")
	m2 := mustMovie(t, s, sess.ID, "Drama", "B")

	tb := votacao.TiebreakRecord{
		SessionID:     sess.ID,
		TriggeredBy:   u.ID,
		TiedIDsJSON:   "[1,2]",
		ClientEntropy: "deadbeef",
		ServerNonce:   "cafef00d",
		WinnerMovieID: m2.ID,
	}
	if err := s.CreateTiebreak(ctx, tb); err != nil {
		t.Fatalf("create tiebreak: %v", err)
	}
	if err := s.SetSessionWinner(ctx, sess.ID, m2.ID, "roulette"); err != nil {
		t.Fatalf("set winner: %v", err)
	}

	got, err := s.GetVotingSession(ctx, sess.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if got.WinnerMovieID == nil || *got.WinnerMovieID != m2.ID {
		t.Fatalf("winner not set: %+v", got)
	}
	_ = m1
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/votacao/ -run TestCreateTiebreakAndSetWinner`
Expected: FAIL (undefined `TiebreakRecord`/`CreateTiebreak`/`SetSessionWinner`; and `VotingSession` may need a `WinnerMethod` field).

- [ ] **Step 3: Implement the store**

Create `apps/api/internal/votacao/tiebreaks.go`:

```go
package votacao

import (
	"context"
	"fmt"
	"time"
)

// TiebreakRecord is one audit row for a roulette draw.
type TiebreakRecord struct {
	ID            int64
	SessionID     int64
	TriggeredBy   int64
	TiedIDsJSON   string
	ClientEntropy string
	ServerNonce   string
	WinnerMovieID int64
	CreatedAt     time.Time
}

// CreateTiebreak persists a roulette draw for auditability.
func (s *Store) CreateTiebreak(ctx context.Context, t TiebreakRecord) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO tiebreaks
			(session_id, triggered_by, tied_ids_json, client_entropy, server_nonce, winner_movie_id)
		VALUES (?, ?, ?, ?, ?, ?)
	`, t.SessionID, t.TriggeredBy, t.TiedIDsJSON, t.ClientEntropy, t.ServerNonce, t.WinnerMovieID)
	if err != nil {
		return fmt.Errorf("votacao: insert tiebreak: %w", err)
	}
	return nil
}

// GetTiebreakBySession returns the most recent tiebreak for the session, if any.
func (s *Store) GetTiebreakBySession(ctx context.Context, sessionID int64) (*TiebreakRecord, error) {
	var t TiebreakRecord
	err := s.db.QueryRowContext(ctx, `
		SELECT id, session_id, triggered_by, tied_ids_json, client_entropy, server_nonce, winner_movie_id, created_at
		FROM tiebreaks WHERE session_id=? ORDER BY created_at DESC LIMIT 1
	`, sessionID).Scan(&t.ID, &t.SessionID, &t.TriggeredBy, &t.TiedIDsJSON, &t.ClientEntropy, &t.ServerNonce, &t.WinnerMovieID, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// SetSessionWinner records the winner and the method ('votes' | 'roulette')
// on an already-closed session.
func (s *Store) SetSessionWinner(ctx context.Context, sessionID, winnerMovieID int64, method string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE voting_sessions SET winner_movie_id=?, winner_method=? WHERE id=?
	`, winnerMovieID, method, sessionID)
	if err != nil {
		return fmt.Errorf("votacao: set session winner: %w", err)
	}
	return nil
}
```

- [ ] **Step 4: Add WinnerMethod to the VotingSession struct + scans**

In `apps/api/internal/votacao/sessions.go`, add to the `VotingSession` struct (after `WinnerMovieID *int64`):

```go
	WinnerMethod *string
```

Then update **every** `SELECT`/`Scan` of voting_sessions in that file to include `winner_method`. For each query, add `winner_method` to the column list and a matching `&v.WinnerMethod` (use `sql.NullString` → assign) in the Scan. Concretely, where the existing code scans a session, change e.g.:

```go
// before:
// SELECT id, title, status, created_by, created_at, closed_at, winner_movie_id, sort_options_json
// after:
// SELECT id, title, status, created_by, created_at, closed_at, winner_movie_id, winner_method, sort_options_json
```

and in the Scan add a `var wm sql.NullString` then `&wm` in position, and after scanning: `if wm.Valid { v.WinnerMethod = &wm.String }`. Apply to `GetVotingSession`, `ListVotingSessions`, and any other session reader in the file. (Add `"database/sql"` import if missing.)

- [ ] **Step 5: Run tests**

Run: `cd apps/api && go test ./internal/votacao/...`
Expected: PASS (new tiebreak test + existing session tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/votacao/tiebreaks.go apps/api/internal/votacao/tiebreaks_test.go apps/api/internal/votacao/sessions.go
git commit -m "feat(api): tiebreaks store + winner_method on sessions"
```

### Task 6.3: `CloseSession` sem desempate determinístico

**Files:**

- Modify: `apps/api/internal/handlers/votacao/votes.go`
- Test: `apps/api/internal/handlers/votacao/votes_test.go`

- [ ] **Step 1: Write the failing test**

Append to `apps/api/internal/handlers/votacao/votes_test.go`:

```go
func TestCloseSessionLeavesTieUnresolved(t *testing.T) {
	h, store := newTestHandlers(t)
	ctx := context.Background()
	admin := seedUser(t, store, "admin-close@example.com")
	v2 := seedUser(t, store, "v2-close@example.com")
	sess := seedSession(t, store, admin.ID)
	m1 := seedMovie(t, store, sess.ID, "Ação", "A")
	m2 := seedMovie(t, store, sess.ID, "Drama", "B")
	// 1 vote each → tie.
	_ = store.ReplaceUserVotes(ctx, sess.ID, admin.ID, []int64{m1.ID})
	_ = store.ReplaceUserVotes(ctx, sess.ID, v2.ID, []int64{m2.ID})

	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/votacao/sessions/%d/close", sess.ID), nil)
	req = withChiID(req, "id", fmt.Sprint(sess.ID))
	req = auth.WithUserForTests(req, admin)
	rec := httptest.NewRecorder()
	h.CloseSession(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var out struct {
		WinnerMovieID *int64 `json:"winner_movie_id"`
	}
	unwrap(t, rec, &out)
	if out.WinnerMovieID != nil {
		t.Fatalf("tie must leave winner null, got %v", *out.WinnerMovieID)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/handlers/votacao/ -run TestCloseSessionLeavesTieUnresolved`
Expected: FAIL (current `ComputeWinner` picks lowest id on tie → returns a winner).

- [ ] **Step 3: Update CloseSession**

In `apps/api/internal/handlers/votacao/votes.go`, replace the winner computation in `CloseSession`:

```go
	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("close: tally", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao apurar os votos.")
		return
	}
	// Approval voting: a clear top => winner now; a tie => leave it null for the
	// roulette tiebreak (the deterministic lowest-id break is gone).
	top, _ := votacao.ComputeTopMovies(votes)
	var winner *int64
	if len(top) == 1 {
		winner = &top[0]
	}
	if err := h.deps.Store.CloseVotingSession(r.Context(), sessionID, winner); err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "session_not_open", "Sessão não está aberta.")
			return
		}
		logging.FromContext(r.Context()).Error("close: persist", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao encerrar a sessão.")
		return
	}
	// Record winner_method='votes' when there was a clear winner.
	if winner != nil {
		_ = h.deps.Store.SetSessionWinner(r.Context(), sessionID, *winner, "votes")
	}
	logging.With(r.Context(), "session_id", sessionID, "tie", len(top) > 1, "top", top).Info("session_closed")
```

Keep the existing backup goroutine block and the final response block (`winner_movie_id`). Remove the now-unused `votacao.ComputeWinner` call.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && go test ./internal/handlers/votacao/ -run TestCloseSessionLeavesTieUnresolved`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/internal/handlers/votacao/votes.go apps/api/internal/handlers/votacao/votes_test.go
git commit -m "feat(api): close leaves ties unresolved for the roulette tiebreak"
```

### Task 6.4: Endpoint `POST /tiebreak` + remoção do runoff

**Files:**

- Modify: `apps/api/internal/handlers/votacao/votes.go`
- Modify: `apps/api/internal/router/router.go`
- Test: `apps/api/internal/handlers/votacao/tiebreak_test.go`

- [ ] **Step 1: Write the failing test**

Create `apps/api/internal/handlers/votacao/tiebreak_test.go`:

```go
package votacao_test

import (
	"context"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/PiluVitu/api/internal/auth"
)

func TestTiebreakPicksAmongTiedAndPersists(t *testing.T) {
	h, store := newTestHandlers(t)
	ctx := context.Background()
	admin := seedUser(t, store, "admin-tb@example.com")
	v2 := seedUser(t, store, "v2-tb@example.com")
	sess := seedSession(t, store, admin.ID)
	m1 := seedMovie(t, store, sess.ID, "Ação", "A")
	m2 := seedMovie(t, store, sess.ID, "Drama", "B")
	_ = store.ReplaceUserVotes(ctx, sess.ID, admin.ID, []int64{m1.ID})
	_ = store.ReplaceUserVotes(ctx, sess.ID, v2.ID, []int64{m2.ID})
	// Close it first (tie → winner null).
	_ = store.CloseVotingSession(ctx, sess.ID, nil)

	entropy := hex.EncodeToString(make([]byte, 32)) // 64 hex chars
	body := fmt.Sprintf(`{"entropy":%q}`, entropy)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/votacao/sessions/%d/tiebreak", sess.ID), strings.NewReader(body))
	req = withChiID(req, "id", fmt.Sprint(sess.ID))
	req = auth.WithUserForTests(req, admin)
	rec := httptest.NewRecorder()
	h.Tiebreak(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("want 200, got %d (%s)", rec.Code, rec.Body.String())
	}
	var out struct {
		WinnerMovieID int64   `json:"winner_movie_id"`
		TiedMovieIDs  []int64 `json:"tied_movie_ids"`
		ServerNonce   string  `json:"server_nonce"`
	}
	unwrap(t, rec, &out)
	if out.WinnerMovieID != m1.ID && out.WinnerMovieID != m2.ID {
		t.Fatalf("winner must be one of the tied movies, got %d", out.WinnerMovieID)
	}
	if out.ServerNonce == "" {
		t.Fatal("server_nonce must be returned for audit")
	}
	// Winner persisted on the session.
	got, _ := store.GetVotingSession(ctx, sess.ID)
	if got.WinnerMovieID == nil || *got.WinnerMovieID != out.WinnerMovieID {
		t.Fatalf("winner not persisted: %+v", got)
	}
	// Audit row written.
	if _, err := store.GetTiebreakBySession(ctx, sess.ID); err != nil {
		t.Fatalf("tiebreak audit row missing: %v", err)
	}
}

func TestTiebreakRejectsNoTie(t *testing.T) {
	h, store := newTestHandlers(t)
	ctx := context.Background()
	admin := seedUser(t, store, "admin-nt@example.com")
	sess := seedSession(t, store, admin.ID)
	m1 := seedMovie(t, store, sess.ID, "Ação", "A")
	_ = seedMovie(t, store, sess.ID, "Drama", "B")
	_ = store.ReplaceUserVotes(ctx, sess.ID, admin.ID, []int64{m1.ID}) // clear winner m1
	_ = store.CloseVotingSession(ctx, sess.ID, &m1.ID)

	entropy := hex.EncodeToString(make([]byte, 32))
	body := fmt.Sprintf(`{"entropy":%q}`, entropy)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/votacao/sessions/%d/tiebreak", sess.ID), strings.NewReader(body))
	req = withChiID(req, "id", fmt.Sprint(sess.ID))
	req = auth.WithUserForTests(req, admin)
	rec := httptest.NewRecorder()
	h.Tiebreak(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422 no_tie, got %d (%s)", rec.Code, rec.Body.String())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && go test ./internal/handlers/votacao/ -run 'TestTiebreak'`
Expected: FAIL (undefined `h.Tiebreak`).

- [ ] **Step 3: Implement the handler + remove CreateRunoff**

In `apps/api/internal/handlers/votacao/votes.go`:

1. Add imports if missing: `"crypto/rand"`, `"encoding/hex"`, `"encoding/json"` (already there).

2. Delete the entire `CreateRunoff` function.

3. Add:

```go
type tiebreakBody struct {
	Entropy string `json:"entropy"`
}

// Tiebreak (admin) resolves a tie on a CLOSED session via a provably-fair draw:
// it mixes the client entropy (a hash; the photo never leaves the browser) with
// a server nonce, picks one tied movie without bias, persists the winner and an
// audit row, and returns the winner + nonce so anyone can recompute the draw.
func (h *Handlers) Tiebreak(w http.ResponseWriter, r *http.Request) {
	sessionID, ok := parseID(w, r)
	if !ok {
		return
	}
	user := auth.UserFromContext(r.Context())
	if user == nil {
		httpx.Error(w, http.StatusUnauthorized, "not_authenticated", "Você precisa estar logado.")
		return
	}
	var body tiebreakBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_json", "Corpo da requisição inválido.")
		return
	}
	clientEntropy, err := hex.DecodeString(body.Entropy)
	if err != nil || len(clientEntropy) < 16 {
		httpx.Error(w, http.StatusBadRequest, "invalid_entropy", "Entropia inválida.")
		return
	}

	session, err := h.deps.Store.GetVotingSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, votacao.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "session_not_found", "Sessão não encontrada.")
			return
		}
		logging.FromContext(r.Context()).Error("tiebreak: load session", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao carregar a sessão.")
		return
	}
	if session.Status != "closed" {
		httpx.Error(w, http.StatusConflict, "session_not_closed", "Encerre a sessão antes do desempate.")
		return
	}
	if session.WinnerMovieID != nil {
		httpx.Error(w, http.StatusConflict, "winner_already_set", "Esta sessão já tem vencedor.")
		return
	}

	votes, err := h.deps.Store.ListVotesBySession(r.Context(), sessionID)
	if err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: tally", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao apurar os votos.")
		return
	}
	tied, _ := votacao.ComputeTopMovies(votes)
	if len(tied) < 2 {
		httpx.Error(w, http.StatusUnprocessableEntity, "no_tie", "Não há empate para desempatar.")
		return
	}

	serverNonce := make([]byte, 32)
	if _, err := rand.Read(serverNonce); err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: nonce", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao sortear.")
		return
	}
	seed := votacao.TiebreakSeed(clientEntropy, serverNonce, sessionID, tied)
	idx := votacao.PickTiebreakIndex(seed, len(tied))
	winner := tied[idx]

	tiedJSON, _ := json.Marshal(tied)
	nonceHex := hex.EncodeToString(serverNonce)
	if err := h.deps.Store.CreateTiebreak(r.Context(), votacao.TiebreakRecord{
		SessionID:     sessionID,
		TriggeredBy:   user.ID,
		TiedIDsJSON:   string(tiedJSON),
		ClientEntropy: body.Entropy,
		ServerNonce:   nonceHex,
		WinnerMovieID: winner,
	}); err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: audit", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao registrar o desempate.")
		return
	}
	if err := h.deps.Store.SetSessionWinner(r.Context(), sessionID, winner, "roulette"); err != nil {
		logging.FromContext(r.Context()).Error("tiebreak: set winner", "err", err, "session_id", sessionID)
		httpx.Error(w, http.StatusInternalServerError, "internal_error", "Falha ao gravar o vencedor.")
		return
	}

	logging.With(r.Context(),
		"event", "tiebreak_draw",
		"session_id", sessionID,
		"user_id", user.ID,
		"tied_ids", tied,
		"client_entropy", body.Entropy,
		"server_nonce", nonceHex,
		"index", idx,
		"winner_movie_id", winner,
	).Info("tiebreak_draw")

	httpx.DataMsg(w, http.StatusOK, map[string]any{
		"winner_movie_id": winner,
		"tied_movie_ids":  tied,
		"server_nonce":    nonceHex,
	}, httpx.Success("Desempate concluído."))
}
```

- [ ] **Step 4: Swap the route**

In `apps/api/internal/router/router.go`, inside the `/votacao` route block, replace the runoff line:

```go
// remove:
//   r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/sessions/{id}/runoff", deps.VotacaoHandlers.CreateRunoff)
// add:
   r.With(auth.RequireAdmin(deps.Sessions, deps.Store)).Post("/sessions/{id}/tiebreak", deps.VotacaoHandlers.Tiebreak)
```

- [ ] **Step 5: Run tests + vet (whole api)**

Run: `cd apps/api && go vet ./... && go test ./...`
Expected: PASS. (If a runoff test exists in this package referencing `CreateRunoff`, delete that test — the feature is intentionally removed.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/internal/handlers/votacao/votes.go apps/api/internal/handlers/votacao/tiebreak_test.go apps/api/internal/router/router.go
git commit -m "feat(api): provably-fair tiebreak endpoint; remove runoff"
```

---

## Phase 7 — Desempate na roleta (frontend)

### Task 7.1: Hook + remoção do runoff client

**Files:**

- Create: `apps/web/hooks/votacao/use-create-tiebreak.ts`
- Delete: `apps/web/hooks/votacao/use-create-runoff.ts`

- [ ] **Step 1: Create the tiebreak hook**

Create `apps/web/hooks/votacao/use-create-tiebreak.ts`:

```ts
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function useCreateTiebreak(sessionId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entropy: string) => votacaoApi.tiebreak(sessionId, entropy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['votacao', 'sessions', sessionId] })
      qc.invalidateQueries({
        queryKey: ['votacao', 'sessions', sessionId, 'results'],
      })
    },
  })
}
```

- [ ] **Step 2: Delete the runoff hook**

Run: `git rm apps/web/hooks/votacao/use-create-runoff.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/votacao/use-create-tiebreak.ts
git commit -m "feat(web): useCreateTiebreak hook; drop runoff hook"
```

### Task 7.2: Componente `TiebreakRoulette` + remoção do `RunoffButton`

**Files:**

- Create: `apps/web/components/votacao/tiebreak-roulette.tsx`
- Create: `apps/web/components/votacao/tiebreak-roulette.stories.tsx`
- Delete: `apps/web/components/votacao/runoff-button.tsx`
- Modify: `apps/web/app/(site)/votacao/[id]/page.tsx`

- [ ] **Step 1: Create the TiebreakRoulette component**

Create `apps/web/components/votacao/tiebreak-roulette.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useResults } from '@/hooks/votacao/use-session-detail'
import { useCreateTiebreak } from '@/hooks/votacao/use-create-tiebreak'
import { analyzeResults } from '@/lib/votacao/results'
import { errorMessage } from '@/lib/votacao/api-client'
import { CameraEntropyCapture } from '@/components/entropy/camera-entropy-capture'
import {
  RouletteWheel,
  type WheelOption,
} from '@/components/entropy/roulette-wheel'
import type { SessionMovie } from '@/lib/votacao/types'
import type { EntropyResult } from '@/hooks/use-camera-entropy'

/**
 * Admin tie-break via roulette. Mount only in the closed branch so useResults
 * doesn't fire for open sessions. Captures camera entropy locally (photo never
 * leaves the browser), asks the server to draw, then animates to the winner.
 */
export function TiebreakRoulette({
  sessionId,
  movies,
}: {
  sessionId: number
  movies: SessionMovie[]
}) {
  const { data } = useResults(sessionId)
  const tiebreak = useCreateTiebreak(sessionId)
  const [winnerId, setWinnerId] = useState<number | null>(null)
  const [spinning, setSpinning] = useState(false)

  if (!data) return null
  const { isTie, topMovieIds } = analyzeResults(data.results)
  if (!isTie) return null

  const options: WheelOption[] = topMovieIds.map((id) => ({
    id,
    label: movies.find((m) => m.ID === id)?.Title ?? `Filme ${id}`,
  }))

  function draw(entropy: string) {
    tiebreak.mutate(entropy, {
      onSuccess: (res) => {
        setWinnerId(res.winner_movie_id)
        setSpinning(true)
      },
      onError: (err) => toast.error(errorMessage(err)),
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {topMovieIds.length} filmes empatados. Gire a roleta — a entropia da sua
        câmera reforça o sorteio (a foto não sai do navegador).
      </p>
      <RouletteWheel
        options={options}
        winnerId={winnerId}
        spinning={spinning}
        onSpinEnd={(id) => {
          setSpinning(false)
          const title = options.find((o) => o.id === id)?.label
          toast.success(`Vencedor do desempate: ${title}`)
        }}
      />
      {winnerId == null && (
        <CameraEntropyCapture
          label={
            tiebreak.isPending ? 'Sorteando…' : '🎲 Girar a roleta de desempate'
          }
          disabled={tiebreak.isPending}
          onEntropy={(r: EntropyResult) => draw(r.digestHex)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the story**

Create `apps/web/components/votacao/tiebreak-roulette.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TiebreakRoulette } from './tiebreak-roulette'
import type { SessionMovie } from '@/lib/votacao/types'

const MOVIES: SessionMovie[] = [
  {
    ID: 1,
    SessionID: 1,
    Category: 'Ação',
    Title: 'Duna',
    Type: 'filme',
    PosterURL: '',
    WasWatched: false,
  },
  {
    ID: 2,
    SessionID: 1,
    Category: 'Drama',
    Title: 'Matrix',
    Type: 'filme',
    PosterURL: '',
    WasWatched: false,
  },
]

const meta: Meta<typeof TiebreakRoulette> = {
  title: 'Votacao/TiebreakRoulette',
  component: TiebreakRoulette,
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof TiebreakRoulette>

// Note: results come from useResults; in Storybook the query stays pending so
// this demonstrates the empty/loading guard. Wheel behavior is covered by the
// RouletteWheel story.
export const Default: Story = {
  args: { sessionId: 1, movies: MOVIES },
}
```

- [ ] **Step 3: Delete RunoffButton + wire detail page**

Run: `git rm apps/web/components/votacao/runoff-button.tsx`

In `apps/web/app/(site)/votacao/[id]/page.tsx`:

1. Replace the import `import { RunoffButton } from '@/components/votacao/runoff-button'` with:

```tsx
import { TiebreakRoulette } from '@/components/votacao/tiebreak-roulette'
```

2. Replace the admin+closed block:

```tsx
{
  user.data?.is_admin && closed && (
    <div className="border-t pt-4">
      <TiebreakRoulette sessionId={id} movies={movies} />
    </div>
  )
}
```

- [ ] **Step 4: Type-check**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS (no remaining references to runoff or `voted_movie_id`).

- [ ] **Step 5: Add the roulette winner badge to ResultsList**

In `apps/web/components/votacao/results-list.tsx`, add an optional prop and badge so a roulette-decided winner is labeled. Add to `Props`:

```ts
  /** 'roulette' when the winner came from a tie-break draw. */
  winnerMethod?: 'votes' | 'roulette' | null
  winnerMovieId?: number | null
```

Then in the row, after the `isWinner` badge, add:

```tsx
{
  winnerMovieId === r.movie_id && winnerMethod === 'roulette' && (
    <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs font-semibold text-white">
      🎲 Vencedor no desempate
    </span>
  )
}
```

In `[id]/page.tsx`, pass the new props to the closed-branch `<ResultsList>`:

```tsx
<ResultsList
  sessionId={id}
  movies={movies}
  votedMovieIds={voted_movie_ids}
  winnerMethod={session.WinnerMethod}
  winnerMovieId={session.WinnerMovieID}
/>
```

- [ ] **Step 6: Type-check + commit**

Run (from `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/web/components/votacao/tiebreak-roulette.tsx apps/web/components/votacao/tiebreak-roulette.stories.tsx apps/web/components/votacao/results-list.tsx "apps/web/app/(site)/votacao/[id]/page.tsx"
git commit -m "feat(web): tiebreak roulette UI + roulette-winner badge; remove runoff button"
```

---

## Phase 8 — E2E, docs e verificação final

### Task 8.1: E2E de votação (multi-voto + desempate)

**Files:**

- Modify: `apps/web/app/(site)/votacao/votacao.e2e.ts`

- [ ] **Step 1: Update the existing mocks for the new shapes**

In `apps/web/app/(site)/votacao/votacao.e2e.ts`, update the mocked session-detail payloads to use `voted_movie_ids: []` (instead of `voted_movie_id`), and results payloads to include `total_voters`. Add `WinnerMethod: null` to mocked sessions. (Find the existing `mockSessionDetail`/results constants and adjust.)

- [ ] **Step 2: Add the approval-vote test**

Add a test that selects two movies and votes. The mocked `POST **/votacao/sessions/*/votes` route should assert the body has `movie_ids` and return `envelope({ voted_movie_ids: [...] })`:

```ts
test('approval voting: selects multiple movies and submits', async ({
  page,
}) => {
  // ... reuse the suite's beforeEach route mocks (auth/me admin, session detail open with 2 movies)
  await page.route('**/votacao/sessions/*/votes', async (route) => {
    const body = route.request().postDataJSON() as { movie_ids: number[] }
    expect(Array.isArray(body.movie_ids)).toBe(true)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({ voted_movie_ids: body.movie_ids }),
    })
  })

  await page.goto('/votacao/1')
  await page.getByText('Duna').click()
  await page.getByText('Matrix').click()
  await page.getByRole('button', { name: /Votar \(2\)/ }).click()
  await expect(page.getByText('Voto registrado')).toBeVisible()
})
```

(Use the movie titles your suite's `mockSession` movies actually carry.)

- [ ] **Step 3: Add the tiebreak test**

Mock a closed, tied session with `results` returning a tie, and `POST **/votacao/sessions/*/tiebreak` returning a winner. Drive it through the crypto-only path is not exposed in `TiebreakRoulette` (it always uses the capture button) — so stub `getUserMedia` to reject via `addInitScript`, forcing the crypto-only fallback inside the hook:

```ts
test('tiebreak roulette: admin draws a winner', async ({ page }) => {
  await page.addInitScript(() => {
    // Force the crypto-only entropy path (no camera in CI).
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.reject(new Error('no camera')) },
      configurable: true,
    })
  })
  // ... route mocks: auth/me admin; GET session detail (closed); GET results (tie 1-1);
  //     POST tiebreak → envelope({ winner_movie_id: 1, tied_movie_ids: [1,2], server_nonce: 'ab' })
  await page.route('**/votacao/sessions/*/tiebreak', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: envelope({
        winner_movie_id: 1,
        tied_movie_ids: [1, 2],
        server_nonce: 'abcd',
      }),
    })
  })

  await page.goto('/votacao/1')
  await page.getByTestId('capture-entropy').click()
  await expect(page.getByText(/Vencedor do desempate/)).toBeVisible({
    timeout: 10000,
  })
})
```

- [ ] **Step 4: Run the votação e2e**

Run: `pnpm --filter @piluvitu/web test:e2e -- votacao`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(site)/votacao/votacao.e2e.ts"
git commit -m "test(web): e2e for approval voting + tiebreak roulette"
```

### Task 8.2: Atualizar CLAUDE.md

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new flows**

In `CLAUDE.md`, under the Votação section, update/append:

- **Voto de aprovação:** `votes` agora é `UNIQUE(session_id,user_id,movie_id)`; `POST /votacao/sessions/{id}/votes` recebe `{movie_ids:[]}` e **substitui** o conjunto do usuário (editável até fechar). `GetSession` retorna `voted_movie_ids`; `GetResults` retorna `total_voters`. Store: `ReplaceUserVotes`, `GetUserVotes`, `CountVoters`.
- **Desempate na roleta:** no fechamento, empate deixa `winner_movie_id` nulo. `POST /votacao/sessions/{id}/tiebreak` (admin) recebe `{entropy:"<hex>"}`, mistura com `crypto/rand`, escolhe sem viés (`votacao.PickTiebreakIndex`), grava vencedor (`winner_method='roulette'`) + linha em `tiebreaks` (auditoria provably-fair). Runoff removido.
- **Módulo de entropia:** `@piluvitu/tools` ganha `prng` (sfc32), `entropy` (`mixEntropy` SHA-256 + CSPRNG obrigatório), `roleta` (sorteio puro). UI: `hooks/use-camera-entropy.ts` (captura local, descarta imagem), `components/entropy/{roulette-wheel,camera-entropy-capture}.tsx`. Página `/tools/roleta`.
- **Logging:** Go API usa `log/slog` (JSON prod / texto dev) + `middleware.RequestID`; `internal/logging.FromContext`. Erros logam no ponto da falha; `tiebreak_draw` é logado e persistido.
- Adicionar `winner_method`, tabela `tiebreaks`, e o env de logging na lista relevante.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: approval voting + roulette tiebreak + entropy module + slog logging"
```

### Task 8.3: Verificação final completa

- [ ] **Step 1: Backend**

Run: `cd apps/api && go vet ./... && go test ./...`
Expected: PASS.

- [ ] **Step 2: Pure package + web unit**

Run: `pnpm --filter @piluvitu/tools test && pnpm --filter @piluvitu/web test`
Expected: PASS.

- [ ] **Step 3: Lint + format + type + build**

Run: `pnpm prettier:fix && pnpm lint && pnpm --filter @piluvitu/web build`
Expected: PASS (build compiles all routes including `/tools/roleta` and `/votacao/[id]`).

- [ ] **Step 4: E2E (full)**

Run: `pnpm --filter @piluvitu/web test:e2e`
Expected: PASS.

- [ ] **Step 5: Dev DB note (manual, do not run migrations)**

Lembrar (não executar): em dev local, apagar o SQLite antigo se quiser começar limpo — `rm apps/api/tmp/votacao.db`. Em prod o rebuild idempotente roda no deploy.

- [ ] **Step 6: Final commit (if prettier changed anything)**

```bash
git add -A
git commit -m "chore: prettier + final verification for approval voting + roulette" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:** voto de aprovação (Tasks 4.1–4.5, 5.1–5.2) ✓; roleta de desempate provably-fair (6.1–6.4, 7.1–7.2) ✓; entropia de foto in-browser, só hash trafega (2.1, 6.4 mistura server) ✓; módulo reutilizável + `/tools/roleta` (1.1–1.4, 2.2–2.3, 3.1–3.3) ✓; logging/auditoria (0.1, logs nas Tasks 4–6, `tiebreaks` table) ✓; migration idempotente (4.2) ✓; testes Jest/Go/Storybook/Playwright ✓; docs (8.2) ✓.

**Type consistency:** `voted_movie_ids` (backend `sessions.go` + types.ts + vote-section + results-list + page) ✓; `total_voters` (GetResults + ResultsResponse + ResultsList) ✓; `WinnerMethod`/`winner_method` (Go struct + scans + types.ts + ResultsList) ✓; `tiebreak(id, entropy)` (api-client + hook + component) ✓; `ReplaceUserVotes`/`GetUserVotes`/`CountVoters` consistentes entre store, handlers e testes ✓; `RouletteWheel` props (`winnerId`, `spinning`, `onSpinEnd`) idênticas em todos os consumidores ✓.

**Placeholder scan:** sem TBD/TODO; cada step com código real. Pontos que dependem de helpers de teste existentes (`newTestHandlers`, `seedUser/seedSession/seedMovie`, `withChiID`, `mustUser/mustSession/mustMovie`) estão marcados para reaproveitar a infra já presente nos `*_test.go` (não inventar) — verificar nomes reais ao abrir cada arquivo de teste.
