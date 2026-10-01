# Botaí multinavegador, lojas e PiluLabs: contrato entre as fases

- **Spec:** `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md`.
- **Pesquisa:** `docs/superpowers/research/2026-10-01-botai-multinavegador/`.

Nenhum plano renomeia o que está aqui. Se algo precisar mudar, muda primeiro aqui.

## Branches e worktrees

| Fase              | Branch                                          | Worktree                                | Base                                                                                                                  |
| ----------------- | ----------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1 multinavegador  | `feat/botai-multinavegador`                     | `/Users/piluvitu/WWW/PiluVitu-Dev`      | `feat/extensao-dados-teste` (#45). Depois do squash do #45: `git rebase --onto origin/main feat/extensao-dados-teste` |
| 2 site PiluLabs   | `feat/pilulabs-site`                            | `/Users/piluvitu/WWW/PiluVitu-Dev-site` | `origin/main` (independe do `apps/botai`)                                                                             |
| 3 release e lojas | `feat/botai-multinavegador` (continua a fase 1) | `/Users/piluvitu/WWW/PiluVitu-Dev`      | fase 1                                                                                                                |

As fases 1 e 2 rodam em paralelo. A fase 3 começa quando a 1 termina.

## Fase 1 → fase 3 (`apps/botai`)

- **`src/lib/navegador.ts`:**
  - `export type Navegador = 'chrome' | 'edge' | 'firefox' | 'opera'`;
  - `export function detectarNavegador(): Navegador`, que usa `import.meta.env.FIREFOX`/`OPERA` no build e `navigator.userAgentData.brands` em runtime para separar Edge de Chrome, porque os dois usam o mesmo zip.
- **Scripts do `apps/botai/package.json`:**
  - `zip`: pacotes de Chrome/Edge, Firefox e Opera + o zip de fontes;
  - `zip:firefox`, `zip:opera`;
  - `lint:firefox`: `web-ext lint`;
  - `build:firefox`, `build:opera`.
- **Saídas do WXT:**
  - pastas `.output/chrome-mv3`, `.output/firefox-mv3`, `.output/opera-mv3`;
  - zips `.output/botai-<versão>-chrome.zip`, `-firefox.zip`, `-opera.zip` e `-sources.zip` (com `zip.name: 'botai'`).
- **Makefile:**
  - `zip-botai` (fase 1);
  - `versao-botai` e `release-botai` (fase 3).
- **Workflow `.github/workflows/botai-release.yml`:**
  - job `pacotes` (fase 1, também em PR, com a reprodução das fontes);
  - job `lojas` (fase 3).
- **Documentos para os revisores das lojas:** `apps/botai/SOURCE-CODE-REVIEW.md` (inglês) e `apps/botai/LICENSE` (MIT, © PiluTech), ambos da fase 1.

## Fase 3 → fase 2 (assets do site, sem dependência de código)

- A fase 3 grava as imagens que o site usa em `apps/web/public/pilulabs/botai/`:
  - `icone-128.png`;
  - `capturas/<NN>-<nome>.png` (1280×800, temas claro e escuro), com `NN` dando a ordem.
- A fase 2 **descobre** as capturas no build, com `listarCapturas('botai')` em `apps/web/lib/pilulabs.ts`:
  - lê `public/pilulabs/<slug>/capturas/*.png`, em ordem alfabética;
  - devolve `[]` se a pasta não existir;
  - o `alt` vem do nome do arquivo, com um mapa de rótulos em `lib/pilulabs.ts`.

  Assim a página mostra as capturas quando elas chegarem à `main`, sem mudar código.

- O `icone` da collection `produtos` aponta para `/pilulabs/botai/icone-128.png`. A fase 2 já versiona uma cópia do PNG de 128 do `apps/botai/public/icon/128.png`, e a fase 3 só a substitui pela versão com margem da loja.

## Fase 2 (`apps/web`)

- **Collection Keystatic `produtos`:** `content/produtos/<slug>/index.yaml`, com os campos da spec §6.
- **`lib/pilulabs.ts`:**
  - `type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'`;
  - `lojasPublicadas(produto)`;
  - `fase(produto)`, que devolve `'em-breve' | 'disponivel'`;
  - `listarCapturas(slug)`;
  - `ATALHOS`: o atalho por navegador e sistema, com o Firefox no Linux em `Alt+Shift+P`.
- **Rotas:** `/pilulabs`, `/pilulabs/botai` e `/pilulabs/botai/privacidade`.
- **URLs que a extensão e as lojas usam (fixas):**
  - `homepage_url`: `https://piluvitu.com.br/pilulabs/botai`;
  - política: `https://piluvitu.com.br/pilulabs/botai/privacidade`.
