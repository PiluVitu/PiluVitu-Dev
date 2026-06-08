# CLAUDE.md — `packages/tools` (`@piluvitu/tools`)

Guidance for the **pure-logic package**. O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz. Os **consumidores React** (UI das ferramentas) vivem em `apps/web` — ver `apps/web/CLAUDE.md`, seção "Tools dashboard".

## Propósito

`@piluvitu/tools` é **TypeScript puro, sem React/Next/DOM** — funções determinísticas testáveis em Jest e portáveis (CLI futura). É a camada de lógica por trás do dashboard `/tools` do web.

- **Fonte:** `packages/tools/src/*` — `cpf`, `cnpj`, `base64`, `json-format`, `jwt-decode`, `uuid`, `qr-encode`, `qr-decode`, e o módulo de entropia/roleta (`prng`, `entropy`, `roleta`). Barrel em `index.ts`; alguns expostos por subpaths.
- **Testes colocated:** `*.test.ts` ao lado do fonte (lei de colocation na raiz). `jest.config.ts` + `jest.setup.ts` (jsdom; `jest.setup.ts` injeta `webcrypto` pra `crypto.subtle`).
- **Rodar:** `pnpm --filter @piluvitu/tools test` ou `pnpm -r test` / `make test` na raiz.

## Módulo de entropia + roleta (lógica pura)

- **`prng`** — PRNG determinístico sfc32 + `seedFromBytes`.
- **`entropy`** — `toHex`/`fromHex`, `cryptoRandomBytes`, `mixEntropy`/`mixEntropyHex` — digest SHA-256 que **sempre** dobra um sample fresco de CSPRNG, então nunca fica mais fraco que `crypto.getRandomValues` mesmo com fonte de baixa entropia.
- **`roleta`** — `normalizeOptions`, `drawWinnerIndex` — sorteio puro determinístico a partir de um digest hex.

Exportados via subpaths (`@piluvitu/tools/prng|entropy|roleta`). Testados em Jest/jsdom.

> A captura de câmera, a roda visual e o logger client (`hooks/use-camera-entropy.ts`, `components/entropy/*`, `lib/log.ts`) são **UI** e ficam em `apps/web` — a imagem nunca sai do browser; só o hash de 32 bytes chega aqui/no backend.

## Dependency policy

Adição de deps segue a política da raiz (pnpm ≥ 11, `allowBuilds`, `minimumReleaseAge`). Manter o pacote **sem React/DOM** — se precisar de browser API, isso é UI e mora no web.
