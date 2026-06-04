# Admin Unificado — Slice ④ Mídia (upload-to-git)

**Data:** 2026-06-04
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Sub-projeto **④ (Mídia)** do admin unificado: biblioteca de imagens (listar/upload/apagar) gravando binário no `public/media/` do repo do site via a engine, + um `<ImageField>` (picker + path manual) fiado nos campos de imagem das telas dos slices ②/③.
**Depende de:** **slice ①** (engine `lib/admin/git-write.ts` + `getLinkedToken`/`jsonError`/`resealIfRefreshed`, cookie linkado), **slice ②** (field primitives, `DeleteConfirmDialog`, padrão de rotas/hooks; campos de imagem `projectLogo`/`image`/`avatarSrc`/social `image`), **slice ③** (campo `coverImage` do post). PRs #36/#37 merged, #38 (slice ③).
**Fonte de design:** mockup "Mídia / biblioteca" (grid de imagens com dimensões + "Enviar arquivo" + filtros PNG·JPG·WEBP·SVG); `next.config.mjs` (`remotePatterns` inclui `raw.githubusercontent.com`); `public/` (imagens na raiz hoje).

---

## 1. Objetivo

Permitir **upload de imagens pelo admin** (commit binário no git) e usá-las nos campos de imagem que hoje são input de texto. Toda mídia vai pro **`public/media/` do repo do site** (`PiluVitu/PiluVitu-Dev`), servida em `/media/<arquivo>` depois do redeploy Vercel (mesmo modelo de publish dos outros slices). Os campos de imagem ganham um `<ImageField>` = preview + botão "Biblioteca" (grid + upload) **+ input de texto manual** (pra URLs externas e paths legados).

### Não-objetivos

- **Processamento de imagem** (resize/otimização/conversão) — sobe como está; o `next/image` faz o sizing na entrega do site público.
- Scan de referências cross-content ao apagar (só aviso genérico).
- Dobrar a votação + apagar `/keystatic` → slice ⑤.
- Mídia em repo separado / storage externo (S3/Cloudinary) — fica no `public/` do site.

---

## 2. Decisões travadas (brainstorming)

| Decisão              | Escolha                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| Escopo               | **Slice ④ inteiro**: engine binário + IO + biblioteca + `<ImageField>` fiado nos 5 forms                 |
| Onde a mídia vai     | **`public/media/` no repo do site**, servida em `/media/<arquivo>` após redeploy                         |
| Engine binário       | **`commitBinary`** (base64 passthrough — sem `Buffer.from(...,'utf8')` que corromperia bytes)            |
| Preview pré-redeploy | Via **GitHub raw URL** (`raw.githubusercontent.com`, já em `remotePatterns`); valor salvo = `/media/...` |
| Campo de imagem      | **`<ImageField>` picker + path manual** (biblioteca + URL externa + path legado)                         |
| Colisão de nome      | Sanitiza (slugify + extensão) + **auto-sufixo** `-1/-2` (upload nunca falha por nome)                    |
| Limites              | ext png/jpg/jpeg/webp/svg/gif; **≤ 4 MB** (limite de body serverless Vercel)                             |
| Dimensões no grid    | **Decode client-side** (mostra 512×512 etc.) + tamanho em bytes da listagem                              |

---

## 3. Arquitetura

### 3.1 Engine binário (`lib/admin/git-write.ts` — extensão)

`commitFile` hoje faz `content: Buffer.from(opts.content, 'utf8').toString('base64')` — isso CORROMPE binário. Adicionar:

- **`commitBinary(auth, { repo, path, base64, message, branch? }): Promise<CommitResult>`** — idêntico a `commitFile` mas passa `opts.base64` **direto** pro `createOrUpdateFileContents({ content: base64 })` (sem re-encode). Reusa o sha-lookup (getContent → overwrite) + retry com refresh em 401 + `refreshed`. `deleteFile` (já existe) remove mídia.

### 3.2 IO de mídia (`lib/admin/media-io.ts`)

```ts
const MEDIA_DIR = 'public/media'
const IMAGE_EXT = /\.(png|jpe?g|webp|svg|gif)$/i
interface MediaItem { filename: string; path: string /* '/media/<file>' */; size: number; sha: string }

listMedia(token): Promise<MediaItem[]>   // Octokit getContent(MEDIA_DIR) → filtra IMAGE_EXT → {filename,path,size,sha}; ordena por filename; [] se a pasta não existe
sanitizeFilename(name): string           // slugify do base + lowercase + mantém a extensão (ex.: "Capa Husky.PNG" → "capa-husky.png")
uniqueFilename(name, existing: string[]): string // colisão → "<base>-1.<ext>", "-2"…
mediaRawUrl(value: string): string       // '/media/x.png' → 'https://raw.githubusercontent.com/<owner>/<repo>/main/public/media/x.png'; URL externa/path legado → retorna como veio
```

`owner/repo` vem de `KEYSTATIC_GITHUB_REPO` (default `PiluVitu/PiluVitu-Dev`), como na `git-write`.

### 3.3 Modelo de publish + preview

Upload → commit em `public/media/<file>` na `main` → redeploy Vercel → servido em `/media/<file>`. O **valor salvo no campo** é `/media/<file>` (estável, same-origin no site público). O **preview** (grid + ImageField), que precisa ser imediato (antes do redeploy), usa `mediaRawUrl()` pro path `/media/*` (raw GitHub, live na hora). Externos/legados renderizam o valor cru.

---

## 4. Rotas (`app/api/admin/media/*`, cookie linkado obrigatório)

Reusa `getLinkedToken`/`jsonError`/`resealIfRefreshed`. `export const dynamic = 'force-dynamic'`.

```
GET    /api/admin/media          → { items: MediaItem[] }   (listMedia, live)
POST   /api/admin/media          → body { filename, base64, contentType } → valida ext+tamanho → sanitize+unique → commitBinary → { path: '/media/<file>' } (201)
DELETE /api/admin/media/[name]   → deleteFile(repo:'site', 'public/media/<name>') → { name, deleted }
```

Validação: extensão em png/jpg/jpeg/webp/svg/gif (por filename E contentType); base64 decodifica pra ≤ 4 MB (senão 400 `too_large`). Erros: 401 `not_linked`, 400 `validation`/`too_large`/`invalid_type`, 502 `github_error`. O `[name]` do DELETE é validado contra path-traversal (regex simples de nome de arquivo, sem `/` nem `..`).

---

## 5. UI (DS V2)

### 5.1 Biblioteca — `/admin/midia` (`app/(admin)/admin/midia/page.tsx`)

Conforme o mockup: grid de cards (`MediaCard`: thumbnail via `mediaRawUrl`, filename mono, **dimensões** decodadas client-side via `Image`/`naturalWidth`, tamanho), botão/zona **"Enviar arquivo"** (input file → lê base64 → upload), copiar-path e apagar (via `DeleteConfirmDialog` com aviso "pode estar em uso") por card. Linha de filtros (PNG·JPG·WEBP·SVG) que filtra o grid por extensão. `PageTopBar`.
Hooks (`hooks/admin/media/`): `use-media-list` (query `['admin','media']`), `use-media-mutations` (upload/delete, otimista + invalida).

### 5.2 Grid reutilizável

`components/admin/media/media-grid.tsx` — o grid de `MediaCard` com modo seleção opcional (`onSelect?`). A página `/admin/midia` o usa em modo gerência (delete/copy); o `MediaPickerDialog` o usa em modo seleção. `MediaCard` (`media-card.tsx`) é puro (recebe item + handlers; story).

### 5.3 `<ImageField>` + `<MediaPickerDialog>`

- `components/admin/content/image-field.tsx` — `ImageField({ label, value, onChange })`: thumbnail (via `mediaRawUrl(value)`) + input de texto (path/URL) + botão "Biblioteca". O botão abre `<MediaPickerDialog>` (Dialog com `MediaGrid` em modo seleção + zona de upload); escolher seta `value = /media/<file>`. Input de texto continua editável (URL externa/legado).
- `components/admin/media/media-picker-dialog.tsx` — Dialog que embrulha `MediaGrid` (seleção) + upload, usando os mesmos hooks.

### 5.4 Fiação nos forms (troca `TextField` → `ImageField`)

- `project-form.tsx`: `projectLogo` (path), `image` (capa).
- `carreira-form.tsx`: `image` (logo).
- `social-form.tsx`: `image` (quando `iconMode='image'`).
- `profile-form.tsx`: `avatarSrc`.
- `post-frontmatter-form.tsx` (slice ③): `coverImage`.
  (Os demais campos seguem `TextField`.)

### 5.5 Sidebar

O item "Mídia" (grupo Site, do slice ①) → `/admin/midia`; adicionar `CRUMB['/admin/midia'] = ['Site', 'Mídia']`.

---

## 6. Testes

- **Jest:** `commitBinary` — assert que o `content` commitado == o base64 de entrada (NÃO re-encodado) + retry 401, com Octokit mockado; `sanitizeFilename`/`uniqueFilename` (slugify, extensão preservada, colisão → sufixo); `listMedia` (filtra ext, mapeia pra `/media/<file>`, size/sha) mockado; `mediaRawUrl` (path `/media/*` → raw URL; externo/legado intocado).
- **Storybook:** `MediaCard`, `MediaGrid` (vazio/povoado/seleção), `ImageField` (vazio/com-imagem/URL-externa), `MediaPickerDialog`.
- **Playwright:** `/admin/midia` lista (mock `**/api/admin/media`) + controle de upload visível + delete-confirm; um `ImageField` num form abre o picker e seta um valor (upload/list mockados). Mocks host-agnósticos.

---

## 7. Fora de escopo / riscos

- Sem resize/otimização/conversão (sobe como está).
- **Apagar mídia em uso quebra a referência** (404) — aviso genérico no dialog; sem scan cross-content.
- **Cap de 4 MB** (limite de body serverless Vercel) — imagens maiores rejeitadas com mensagem clara. Pra imagens grandes, subir via git direto fica como escape.
- **Preview pré-redeploy depende do raw GitHub** estar acessível (repo público) — ok; o valor salvo (`/media/...`) resolve no site após deploy.
- Slice ⑤ (votação + apagar `/keystatic`) continua depois.

---

## 8. Critérios de aceite

1. `/admin/midia` lista `public/media/` (live, token linkado) com thumbnail/dimensões/tamanho; "Enviar arquivo" sobe uma imagem (commit binário **não-corrompido** em `public/media/<file>`) e ela aparece no grid (via raw URL); apagar remove o arquivo (confirm).
2. `commitBinary` grava bytes íntegros (um PNG subido e relido bate byte-a-byte — validado uma vez manual; coberto por teste de passthrough com Octokit mockado).
3. Upload sanitiza o nome e auto-sufixa em colisão; rejeita >4 MB e extensões não-imagem.
4. `<ImageField>` nos 5 forms: escolher da biblioteca seta `/media/<file>`; digitar uma URL externa/path manual também funciona; o preview aparece nos dois casos.
5. Sidebar "Mídia" leva a `/admin/midia`.
6. `pnpm lint`, `pnpm exec tsc --noEmit`, Jest, E2E passam; `pnpm --filter @piluvitu/web build` compila.
