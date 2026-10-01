# Botaí multinavegador, lojas e PiluLabs: contrato entre as fases

- **Spec:** `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md`.
- **Pesquisa:** `docs/superpowers/research/2026-10-01-botai-multinavegador/`.

Nenhum plano renomeia o que está aqui. Se algo precisar mudar, muda primeiro aqui.

## Branches e worktrees

| Fase              | Branch                                          | Worktree                                | Base                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 multinavegador  | `feat/botai-multinavegador`                     | `/Users/piluvitu/WWW/PiluVitu-Dev`      | `origin/main`, que já tem o squash do #45 (`4caeca8`). Se a `main` andar: `git rebase origin/main`. Nunca `git rebase --onto origin/main feat/extensao-dados-teste`: com a branch já sobre o squash, ele reaplicaria o #45 |
| 2 site PiluLabs   | `feat/pilulabs-site`                            | `/Users/piluvitu/WWW/PiluVitu-Dev-site` | `origin/main` (independe do `apps/botai`)                                                                                                                                                                                  |
| 3 release e lojas | `feat/botai-multinavegador` (continua a fase 1) | `/Users/piluvitu/WWW/PiluVitu-Dev`      | fase 1                                                                                                                                                                                                                     |

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
- **`apps/botai/scripts/`:** `reproduzir-fontes.sh <botai-X-sources.zip> <botai-X-firefox.zip>` (fase 1), a reprodução das fontes que o job `pacotes` roda. Os scripts do release da fase 3 moram na mesma pasta.
- **Makefile:**
  - `zip-botai` (fase 1);
  - `versao-botai`, `release-botai` e `capturas-botai` (fase 3).
- **Workflow `.github/workflows/botai-release.yml`:**
  - job `pacotes` (fase 1, também em PR, com a reprodução das fontes), que sobe os 4 zips no artifact `botai-zips` (pasta `botai-zips/`, porque o `upload-artifact` ignora a pasta oculta `.output`);
  - jobs `release` (o GitHub Release, só no push de tag e o único com `contents: write`) e `lojas` (fase 3), que baixam o artifact `botai-zips`.
- **`.gitignore` da raiz:** `.env.submit` (fase 1), o arquivo de credenciais que o `wxt submit` da fase 3 lê sozinho.
- **Documentos para os revisores das lojas:** `apps/botai/SOURCE-CODE-REVIEW.md` (inglês) e `apps/botai/LICENSE` (MIT, © PiluTech), ambos da fase 1.

## Fase 3 → fase 2 (assets do site, sem dependência de código)

- A fase 3 grava as imagens que o site usa em `apps/web/public/pilulabs/botai/`, com `make capturas-botai` (versionadas; ninguém as edita à mão):
  - `icone-128.png`;
  - `capturas/<NN>-<nome>.png` (1280×800, temas claro e escuro), com `NN` dando a ordem.
- A fase 2 **descobre** as capturas no build, com `listarCapturas('botai')` em `apps/web/lib/pilulabs.ts`:
  - lê `public/pilulabs/<slug>/capturas/*.png`, em ordem natural do `NN` (`2-` antes de `10-`);
  - devolve `[]` se a pasta não existir;
  - o `alt` vem do nome do arquivo (`altDaCaptura`), com o mapa de rótulos `ROTULOS_CAPTURA` em `lib/pilulabs.ts` (`01-pagina-preenchida-escuro.png` → "Captura de tela: página preenchida (tema escuro)").

  Assim a página mostra as capturas quando elas chegarem à `main`, sem mudar código.

- O `icone` da collection `produtos` aponta para `/pilulabs/botai/icone-128.png`. A fase 2 já versiona uma cópia do PNG de 128 do `apps/botai/public/icon/128.png`, e a fase 3 só a substitui pela versão com margem da loja. As duas branches criam o arquivo: no rebase da que chegar à `main` depois (conflito add/add), fica sempre o da fase 3.

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

## Integração na `main`

As duas branches chegam à `main` por squash, em qualquer ordem. A que chegar depois faz `git rebase origin/main` e resolve:

- **`apps/web/public/pilulabs/botai/icone-128.png`** (add/add): fica o da fase 3 (ver acima). No rebase da `feat/pilulabs-site` é o `--ours` (a `main`); no da `feat/botai-multinavegador`, o `--theirs` (o commit reaplicado).
- **Tabela de workspaces do `CLAUDE.md` da raiz:** a fase 1 reescreve a linha do `apps/botai`, mais larga que a coluna, e o prettier realinha a tabela inteira; a fase 2 muda a linha do `apps/web`. Fique com as duas mudanças e rode o prettier no arquivo.
- **Este contrato e a spec** estão commitados nas duas branches com o mesmo conteúdo. Mudou aqui, copie igual para a outra worktree e commite nas duas, senão o rebase dá conflito add/add.
