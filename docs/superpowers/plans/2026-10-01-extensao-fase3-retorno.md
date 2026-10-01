# Extensão de dados de teste, fase 3: retorno e acabamento — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar retorno ao usuário depois do "Preencher": estados 1c, 1d e 1e do popup com a máquina de estados da spec §8, "Mostrar na página" pela mira do 1c (o rolar e o piscar já vêm da fase 2), 2ª passada contra a busca de CEP do site, avisos de falha sem popup, stories e E2E de todos os estados, e o workflow `extensao-e2e.yml`.

**Architecture:** A escolha da tela do popup vira uma função pura (`src/lib/estado-popup.ts`) alimentada pela situação da página ao abrir e pela `RespostaPreencher` do background; o `App` só liga essa função aos componentes de apresentação novos (`ResultadoPreenchimento`, `NenhumCampo`, `PaginaProibida`). No content script, o `__pv.preencher` passa a guardar os campos que escreveu e agenda por `ctx.setTimeout` uma 2ª passada que regrava só o que o site mudou. No background, `inserirNoCampo` e o Y = 0 de `preencherPagina` passam a avisar a falha no frame 0 pelo `avisar` que a fase 2 já criou.

**Tech Stack:** WXT 0.21.4 · React 19 + `@piluvitu/ui` · Font Awesome 7 · Vitest 4 (`WxtVitest` + `fakeBrowser`) + Testing Library + jsdom · Storybook 10.3.1 (react-vite, porta 6018) · Playwright 1.59.1 (`channel: 'chromium'`) · GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md` (esta fase é a §14.3; as regras vêm das §6.1, §6.3, §7, §8, §9 e §12). Contrato de nomes e tipos entre as fases: `docs/superpowers/plans/2026-10-01-extensao-interfaces.md`. **Este plano roda sobre a fase 2 implementada** (`docs/superpowers/plans/2026-10-01-extensao-fase2-extensao.md`) e usa os nomes dela sem renomear nada. Protótipo de partida dos estados: `docs/superpowers/research/2026-10-01-extensao-dados-teste/popup/Estados.tsx` (abreviado **`R/popup/Estados.tsx`**).

---

## Pré-requisitos e convenções de execução

- **A fase 2 precisa estar concluída nesta branch** (`feat/extensao-dados-teste`). Confira antes da Task 1:

  ```bash
  cd /Users/piluvitu/WWW/PiluVitu-Dev && /bin/ls apps/extensao/src/entrypoints/background/acoes.ts apps/extensao/src/entrypoints/preencher.content/api.ts \
     apps/extensao/src/entrypoints/preencher.content/contornos.ts apps/extensao/src/entrypoints/preencher.content/preencher.ts \
     apps/extensao/src/entrypoints/popup/App.tsx apps/extensao/src/test/extensao.fixture.ts apps/extensao/CLAUDE.md \
    && /usr/bin/grep -q 'export async function avisar' apps/extensao/src/entrypoints/background/acoes.ts \
    && /usr/bin/grep -q 'piscando' apps/extensao/src/entrypoints/preencher.content/contornos.ts \
    && /usr/bin/grep -q 'SUFIXO_RECUSADO' apps/extensao/src/lib/resultado.ts \
    && /usr/bin/grep -q 'export async function pessoaGuardada' apps/extensao/src/test/extensao.fixture.ts \
    && echo "fase 2 ok"
  pnpm --filter @piluvitu/extensao test; echo "exit=$?"
  ```

  Esperado: `fase 2 ok` e `exit=0`. Se faltar algo, pare: este plano edita `acoes.ts`, `api.ts`, `preencher.ts`, `App.tsx`, `resultado.ts`, `textos.ts`, `paginas.ts`, `tipografia.ts` e a fixture do Playwright como a fase 2 os deixou.

- **Diretório:** todo comando começa com um `cd` **absoluto** na mesma linha: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && …` para os do app, `cd /Users/piluvitu/WWW/PiluVitu-Dev && …` para os que usam caminho a partir da raiz (`git add`, `actionlint`, `python3`). Assim cada linha roda certo tanto numa chamada de shell própria quanto com as linhas do bloco coladas numa chamada só (um `cd apps/extensao` relativo repetido falharia na 2ª linha). `pnpm --filter …` roda de qualquer pasta do workspace.
- **O shell tem um wrapper (rtk) que falsifica a saída de git, prettier e vitest, e também de `grep`, `diff`, `find` e `ls`** (são funções/aliases do shell; medido na fase 2: `grep -v padrão arquivo > saida` grava o resumo do rtk no lugar das linhas). Por isso: git é sempre `/usr/bin/git`, grep é sempre `/usr/bin/grep`, ls é `/bin/ls`, e para comparar arquivos use `cmp` (`/usr/bin/cmp`, sem wrapper); vitest, tsc, eslint, wxt e playwright rodam pelo binário direto em `apps/extensao/node_modules/.bin/` (ou por `pnpm --filter @piluvitu/extensao <script>`); **todo** comando de verificação termina com `; echo "exit=$?"` e o que vale é o `exit=`.
- **Commits:** mensagem convencional em português, no estilo do repo, com `/usr/bin/git`, na branch atual. **Nunca `git push`.** O pre-commit (`lint-staged`: `eslint --fix` + `prettier --write`) roda sozinho; se ele reformatar um arquivo, é esperado.
- **Antes de cada commit** (regra do dono): `pnpm --filter @piluvitu/extensao lint; echo "exit=$?"` precisa dar `exit=0` (é `wxt prepare && tsc --noEmit && eslint .`).

## Global Constraints

- Nomes e tipos do contrato e da fase 2 não mudam. Acréscimos desta fase aparecem marcados como **acréscimo** nos blocos **Interfaces**.
- Quando cada estado aparece (spec §8): página proibida (pela URL ou por "Preencher" que falhou) → **1e**, pílula **cadeado**; sem pessoa → **1a**, ok; com pessoa → **1b**, ok; "Preencher" pelo popup com X + recusados ≥ 1 → **1c** (a lista "Não reconhecidos" e a dica "Para esses…" só com k ≥ 1), ok; com X + recusados = 0 → **1d** (com Y = 0, o texto de "sem formulário"), **warn**.
- **A pílula mostra o estado da página, não o da tela:** cadeado se a página é proibida, mesmo no 1b aberto a partir do 1e; warn depois de um preenchimento com X = 0; ok nos outros casos.
- **Ao abrir, o popup decide o 1e só pela URL, sem injetar nada.** PDF e outras recusas só viram 1e quando um "Preencher" falha (o background da fase 2 já devolve `{ ok: false, motivo }`).
- "Ver os dados" (1c, 1d, 1e) leva ao 1b; com página proibida, o "Preencher" do 1b continua desabilitado. "Tentar de novo" (1d) preenche outra vez.
- Rodapé: 1a "preenche sem abrir o popup"; 1b "preenche sem abrir" + "alterar"; 1c "preenche de novo"; 1d "preenche sem abrir"; **1e sem rodapé**. Sem atalho, o rodapé vira "definir atalho" (componente `Rodape` da fase 2).
- Textos exatos (spec §8): 1d com Y = 0: título "Nenhum formulário nesta página", corpo "Não achei campos de formulário visíveis. Formulários dentro de iframe de outro domínio ficam de fora."; 1e em `file:` sem acesso: título "Falta liberar o acesso a arquivos", corpo "Em chrome://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo."; 1e sem pessoa: "Gere uma pessoa para copiar os dados à mão." + botão "Gerar pessoa"; singulares "1 de 1 campo preenchido", "Encontrei 1 campo, mas…", "1 não reconhecido"; avisos de falha "Não deu para inserir aqui: nenhum campo em foco" / "…: iframe de outro domínio" / "…: o campo recusou o valor" e "Nenhum campo nesta página". Textos do design para 1c/1d/1e copiados de `R/popup/Estados.tsx`.
- **Mostrar na página:** mensagem `mostrar` → `mostrarCampo` → `__pv.mostrar(idx)` no `documentId` da linha, **sem reinjetar**; a página rola com `scrollIntoView({block: 'center'})` e o contorno âmbar **pisca**. O rolar sem `smooth` e o pisco já vêm prontos da fase 2 (`api.ts` e `contornos.ts`, usados pelo texto âmbar do aviso); esta fase liga a mira do 1c e torna o `mostrarCampo` resistente a documento que já não existe, sem reescrever `contornos.ts`.
- **2ª passada do CEP:** ~1 s depois (`ctx.setTimeout(…, 1000)`), a mesma instância regrava **só os campos que nós escrevemos e que o site mudou**; não altera X, Y, k, o 1c nem o aviso.
- **Falhas sem popup** (atalho, menu, Inserir): aviso de uma linha no frame 0, no visual do 1f, sem 2ª linha (`__pv.aviso({titulo, erro: true})`). Página proibida: nada acontece. **Sem badge.**
- E2E: `*.e2e.ts` ao lado do código, `channel: 'chromium'`, build `--mode e2e` (`host_permissions` só para `http://teste.local/*`), páginas servidas por `context.route`; costuras `?aba=` e mensagem `inserir` só no build e2e.
- Workflow `extensao-e2e.yml`: paths `apps/extensao/**` e `packages/tools/**`, `playwright install --with-deps --no-shell chromium`, **fora do workflow `CI`** (o deploy do finanças espera o `CI`).
- Stories só com props (sem `browser.*`), nos temas claro e escuro (`globals: { tema: 'claro' }`).
- Lei de comentários do `CLAUDE.md` raiz: em produção, comentário só para um porquê não óbvio, de 1 a 3 linhas. Testes podem explicar. Colocation: teste, story e E2E ao lado do fonte. Identificadores em português.
- **Nunca escreva o nome da classe sentinela do gate em nenhum arquivo de `apps/extensao`**: referencie `SENTINEL_SELECTOR`.

## Review Focus

1. **Mira clicada depois que a página recarregou ou navegou** (o `documentId` da linha não existe mais): o usuário espera que nada quebre e nada aconteça; hoje o `executeScript` rejeita e o service worker registra erro. Teste: `acoes.test.ts` "documento que já não existe devolve false sem lançar" (Task 6).
2. **Site com máscara que reformata o valor na hora** (CEP `01310100` → `01310-100` no `input`): a 2ª passada não pode tomar isso por "o site mudou" e regravar, o que dispararia outra busca de CEP. Teste: `segunda-passada.test.ts` "compara com o valor lido, não com o escrito" (Task 7).
3. **Framework que troca o `<input>` (re-render) ou desabilita o campo antes da 2ª passada:** ignorado sem erro, sem escrever num nó solto. Teste: `segunda-passada.test.ts` "ignora campo que saiu da página ou ficou desabilitado" (Task 7).
4. **Dois campos com o mesmo seletor em frames diferentes** (`input:nth-of-type(1)` no topo e num iframe da mesma origem): as duas linhas aparecem no 1c e cada mira vai para o seu `documentId`, sem chave React duplicada. Teste: `resultado-preenchimento.test.tsx` "mesmo seletor em frames diferentes" (Task 2).

---

## Estrutura de arquivos

```
apps/extensao/
  src/lib/estado-popup.ts (+ .test.ts)           NOVO  tela do popup, pílula e rodapé (puro)
  src/lib/resultado.ts (+ .test.ts)              EDITA exporta SUFIXO_RECUSADO, contarRecusados
  src/lib/textos.ts (+ .test.ts)                 EDITA encontreiCampos, AVISO_SEM_CAMPOS, avisoFalhaInserir
  src/lib/paginas.ts (+ .test.ts)                EDITA caminhoDaUrl
  src/test/resumos.ts                            NOVO  resumos de exemplo para testes e stories
  src/test/extensao.fixture.ts                   EDITA idDaAbaAtiva, exigirPessoa
  src/components/tipografia.ts                   EDITA H1_ESTADO, CODIGO
  src/components/icone-tile.tsx (+ .test, .stories)                   NOVO
  src/components/resultado-preenchimento.tsx (+ .test, .stories)      NOVO  1c
  src/components/nenhum-campo.tsx (+ .test, .stories)                 NOVO  1d
  src/components/pagina-proibida.tsx (+ .test, .stories)              NOVO  1e
  src/entrypoints/popup/App.tsx (+ App.test.tsx, popup.e2e.ts)        EDITA máquina de estados
  src/entrypoints/popup/retorno.e2e.ts                                NOVO  1c + Mostrar, 1d, 1e
  src/entrypoints/background/acoes.ts (+ .test.ts)                    EDITA avisos de falha, mostrar resiliente
  src/entrypoints/background/avisos.e2e.ts                            NOVO
  src/entrypoints/preencher.content/api.ts (+ .test.ts)               EDITA 2ª passada
  src/entrypoints/preencher.content/preencher.ts (+ .test.ts)         EDITA avisa o que escreveu
  src/entrypoints/preencher.content/segunda-passada.ts (+ .test.ts, .e2e.ts)  NOVO
  CLAUDE.md                                                           EDITA fluxos novos e checklist manual
.github/workflows/extensao-e2e.yml                                    NOVO
CLAUDE.md (raiz)                                                      EDITA tabela de workflows
```

---

### Task 1: Tela do popup, textos novos e caminho da página (lógica pura)

**Files:**

- Create: `apps/extensao/src/lib/estado-popup.ts`, `apps/extensao/src/lib/estado-popup.test.ts`
- Create: `apps/extensao/src/test/resumos.ts`
- Modify: `apps/extensao/src/lib/resultado.ts`, `apps/extensao/src/lib/resultado.test.ts`
- Modify: `apps/extensao/src/lib/textos.ts`, `apps/extensao/src/lib/textos.test.ts`
- Modify: `apps/extensao/src/lib/paginas.ts`, `apps/extensao/src/lib/paginas.test.ts`

**Interfaces:**

- Consumes: `ResumoPreenchimento`, `LinhaCampo`, `somarFrames` (fase 2, `src/lib/resultado.ts`); `RespostaPreencher` (fase 2, `src/lib/mensagens.ts`); `SituacaoPagina` (fase 2, `src/lib/paginas.ts`); `StatusHost` (fase 2, `src/components/pilula-host.tsx`).
- Produces (**acréscimos**):
  - `src/lib/estado-popup.ts`: `type Tela = 'dados' | 'resultado' | 'nenhum-campo' | 'proibida'`; `interface EstadoPopup { tela: Tela; situacao: SituacaoPagina; resumo: ResumoPreenchimento | null }`; `interface TextoRodape { texto: string; comAlterar: boolean }`; `estadoAoAbrir(situacao: SituacaoPagina): EstadoPopup`; `aposPreencher(resposta: RespostaPreencher): EstadoPopup`; `verDados(estado: EstadoPopup): EstadoPopup`; `statusDoHost(estado: EstadoPopup): StatusHost`; `rodapeDaTela(tela: Tela, temPessoa: boolean): TextoRodape | null`. A tela `'dados'` é o 1a ou o 1b, conforme exista pessoa.
  - `src/lib/resultado.ts`: `export const SUFIXO_RECUSADO = ' (recusou o valor)'` (já existia, passa a ser exportado); `contarRecusados(resumo: Pick<ResumoPreenchimento, 'naoReconhecidos'>): number`.
  - `src/lib/textos.ts`: `type MotivoFalhaInserir = 'sem-foco' | 'iframe' | 'recusado'`; `AVISO_SEM_CAMPOS = 'Nenhum campo nesta página'`; `avisoFalhaInserir(motivo: MotivoFalhaInserir): string`; `encontreiCampos(y: number): string`.
  - `src/lib/paginas.ts`: `caminhoDaUrl(url: string | undefined): string` (o `pathname` da meta do 1c).
  - `src/test/resumos.ts`: `LINHAS_DO_DESIGN: LinhaCampo[]`, `resumoDe(x: number, naoReconhecidos?: LinhaCampo[]): ResumoPreenchimento`, `RESUMO_DO_DESIGN: ResumoPreenchimento` (12 de 14, os dois não reconhecidos do design).

- [ ] **Step 1: Criar os resumos de exemplo**

`apps/extensao/src/test/resumos.ts`:

```ts
import type { LinhaCampo, ResumoPreenchimento } from '../lib/resultado'

export const LINHAS_DO_DESIGN: LinhaCampo[] = [
  {
    documentId: 'doc-0',
    idx: 13,
    rotulo: 'Código de indicação',
    seletor: 'input[name="ref_code"]',
  },
  {
    documentId: 'doc-0',
    idx: 14,
    rotulo: 'Como nos conheceu?',
    seletor: 'select#origem',
  },
]

export function resumoDe(
  x: number,
  naoReconhecidos: LinhaCampo[] = [],
): ResumoPreenchimento {
  const k = naoReconhecidos.length
  return {
    x,
    y: x + k,
    k,
    naoReconhecidos,
    contentType: 'text/html',
    iframesDeFora: 0,
  }
}

export const RESUMO_DO_DESIGN = resumoDe(12, LINHAS_DO_DESIGN)
```

- [ ] **Step 2: Escrever os testes que falham**

`apps/extensao/src/lib/estado-popup.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LINHAS_DO_DESIGN, resumoDe } from '../test/resumos'
import {
  aposPreencher,
  estadoAoAbrir,
  rodapeDaTela,
  statusDoHost,
  verDados,
} from './estado-popup'
import type { LinhaCampo } from './resultado'

const RECUSADO: LinhaCampo = {
  documentId: 'doc-0',
  idx: 3,
  rotulo: 'Senha (recusou o valor)',
  seletor: 'input[name="senha"]',
}

describe('estadoAoAbrir', () => {
  it('página comum abre nos dados (o 1a ou o 1b, conforme a pessoa)', () => {
    expect(estadoAoAbrir('ok')).toEqual({
      tela: 'dados',
      situacao: 'ok',
      resumo: null,
    })
  })

  it('página proibida pela URL abre direto no 1e, sem injetar nada', () => {
    expect(estadoAoAbrir('proibida')).toEqual({
      tela: 'proibida',
      situacao: 'proibida',
      resumo: null,
    })
    expect(estadoAoAbrir('arquivo-sem-acesso')).toEqual({
      tela: 'proibida',
      situacao: 'arquivo-sem-acesso',
      resumo: null,
    })
  })
})

describe('aposPreencher', () => {
  it('com algum campo preenchido vai para o 1c', () => {
    const resumo = resumoDe(12, LINHAS_DO_DESIGN)
    expect(aposPreencher({ ok: true, resumo })).toEqual({
      tela: 'resultado',
      situacao: 'ok',
      resumo,
    })
  })

  it('só recusados (X = 0) ainda é 1c: a lista mostra o que recusou', () => {
    expect(
      aposPreencher({ ok: true, resumo: resumoDe(0, [RECUSADO]) }).tela,
    ).toBe('resultado')
  })

  it('nada preenchido nem recusado vai para o 1d', () => {
    expect(
      aposPreencher({ ok: true, resumo: resumoDe(0, LINHAS_DO_DESIGN) }).tela,
    ).toBe('nenhum-campo')
  })

  it('Y = 0 também é 1d', () => {
    expect(aposPreencher({ ok: true, resumo: resumoDe(0) }).tela).toBe(
      'nenhum-campo',
    )
  })

  it('"Preencher" recusado pelo Chrome (PDF, Web Store, file: sem acesso) vira 1e', () => {
    expect(aposPreencher({ ok: false, motivo: 'proibida' })).toEqual({
      tela: 'proibida',
      situacao: 'proibida',
      resumo: null,
    })
    expect(
      aposPreencher({ ok: false, motivo: 'arquivo-sem-acesso' }),
    ).toMatchObject({
      tela: 'proibida',
      situacao: 'arquivo-sem-acesso',
    })
  })
})

describe('verDados', () => {
  it('volta ao 1b sem esquecer a situação da página nem o último preenchimento', () => {
    const resumo = resumoDe(0, LINHAS_DO_DESIGN)
    expect(verDados({ tela: 'nenhum-campo', situacao: 'ok', resumo })).toEqual({
      tela: 'dados',
      situacao: 'ok',
      resumo,
    })
    expect(verDados(estadoAoAbrir('proibida'))).toEqual({
      tela: 'dados',
      situacao: 'proibida',
      resumo: null,
    })
  })
})

describe('statusDoHost', () => {
  it('cadeado na página proibida, inclusive no 1b aberto a partir do 1e', () => {
    expect(statusDoHost(estadoAoAbrir('proibida'))).toBe('lock')
    expect(statusDoHost(verDados(estadoAoAbrir('arquivo-sem-acesso')))).toBe(
      'lock',
    )
  })

  it('warn depois de um preenchimento com X = 0, inclusive depois de "Ver os dados"', () => {
    const depois = aposPreencher({
      ok: true,
      resumo: resumoDe(0, LINHAS_DO_DESIGN),
    })
    expect(statusDoHost(depois)).toBe('warn')
    expect(statusDoHost(verDados(depois))).toBe('warn')
    expect(
      statusDoHost(
        aposPreencher({ ok: true, resumo: resumoDe(0, [RECUSADO]) }),
      ),
    ).toBe('warn')
  })

  it('ok nos outros casos', () => {
    expect(statusDoHost(estadoAoAbrir('ok'))).toBe('ok')
    expect(statusDoHost(aposPreencher({ ok: true, resumo: resumoDe(1) }))).toBe(
      'ok',
    )
  })
})

describe('rodapeDaTela', () => {
  it('muda o texto por estado, e o 1e não tem rodapé', () => {
    expect(rodapeDaTela('dados', false)).toEqual({
      texto: 'preenche sem abrir o popup',
      comAlterar: false,
    })
    expect(rodapeDaTela('dados', true)).toEqual({
      texto: 'preenche sem abrir',
      comAlterar: true,
    })
    expect(rodapeDaTela('resultado', true)).toEqual({
      texto: 'preenche de novo',
      comAlterar: false,
    })
    expect(rodapeDaTela('nenhum-campo', true)).toEqual({
      texto: 'preenche sem abrir',
      comAlterar: false,
    })
    expect(rodapeDaTela('proibida', true)).toBeNull()
  })
})
```

Em `apps/extensao/src/lib/resultado.test.ts`, troque a linha de import do `./resultado` por:

```ts
import {
  contarRecusados,
  primeiroNaoReconhecido,
  somarFrames,
  type ResultadoFrame,
} from './resultado'
```

e acrescente no fim do arquivo:

```ts
describe('contarRecusados', () => {
  it('conta só as linhas marcadas como recusadas', () => {
    const resumo = somarFrames([
      { documentId: 'topo', frameId: 0, result: TOPO },
    ])
    expect(contarRecusados(resumo)).toBe(1)
    expect(contarRecusados({ naoReconhecidos: [] })).toBe(0)
  })
})
```

Em `apps/extensao/src/lib/textos.test.ts`, troque a linha de import do `./textos` por:

```ts
import {
  AVISO_SEM_CAMPOS,
  avisoFalhaInserir,
  encontreiCampos,
  linhaNaoReconhecidos,
  tituloPreenchimento,
} from './textos'
```

e acrescente no fim do arquivo:

```ts
describe('encontreiCampos', () => {
  it('concorda com Y', () => {
    expect(encontreiCampos(3)).toBe('Encontrei 3 campos')
    expect(encontreiCampos(1)).toBe('Encontrei 1 campo')
  })
})

describe('avisos de falha', () => {
  it('o Inserir diz por que não deu', () => {
    expect(avisoFalhaInserir('sem-foco')).toBe(
      'Não deu para inserir aqui: nenhum campo em foco',
    )
    expect(avisoFalhaInserir('iframe')).toBe(
      'Não deu para inserir aqui: iframe de outro domínio',
    )
    expect(avisoFalhaInserir('recusado')).toBe(
      'Não deu para inserir aqui: o campo recusou o valor',
    )
  })

  it('página sem campo', () => {
    expect(AVISO_SEM_CAMPOS).toBe('Nenhum campo nesta página')
  })
})
```

Em `apps/extensao/src/lib/paginas.test.ts`, troque a linha de import do `./paginas` por:

```ts
import {
  caminhoDaUrl,
  erroEhPaginaProibida,
  rotuloDoHost,
  situacaoDaUrl,
} from './paginas'
```

e acrescente no fim do arquivo:

```ts
describe('caminhoDaUrl', () => {
  it.each([
    ['http://localhost:3000/cadastro?x=1#topo', '/cadastro'],
    ['https://staging.app.dev/', '/'],
    [undefined, '/'],
    ['não é url', '/'],
  ])('%s vira %s', (url, caminho) => {
    expect(caminhoDaUrl(url)).toBe(caminho)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/lib/estado-popup.test.ts src/lib/resultado.test.ts src/lib/textos.test.ts src/lib/paginas.test.ts; echo "exit=$?"
```

Esperado: FAIL — `Failed to resolve import "./estado-popup"`, e `contarRecusados`/`encontreiCampos`/`avisoFalhaInserir`/`caminhoDaUrl` "is not a function" (ou `AVISO_SEM_CAMPOS` `undefined`); `exit=1`.

- [ ] **Step 4: Implementar**

Em `apps/extensao/src/lib/resultado.ts`, troque `const SUFIXO_RECUSADO = ' (recusou o valor)'` por `export const SUFIXO_RECUSADO = ' (recusou o valor)'` e acrescente no fim do arquivo:

```ts
export function contarRecusados(
  resumo: Pick<ResumoPreenchimento, 'naoReconhecidos'>,
): number {
  return resumo.naoReconhecidos.filter((linha) =>
    linha.rotulo.endsWith(SUFIXO_RECUSADO),
  ).length
}
```

No fim de `apps/extensao/src/lib/textos.ts`, acrescente:

```ts
export type MotivoFalhaInserir = 'sem-foco' | 'iframe' | 'recusado'

const MOTIVOS_DA_FALHA: Record<MotivoFalhaInserir, string> = {
  'sem-foco': 'nenhum campo em foco',
  iframe: 'iframe de outro domínio',
  recusado: 'o campo recusou o valor',
}

export const AVISO_SEM_CAMPOS = 'Nenhum campo nesta página'

export function avisoFalhaInserir(motivo: MotivoFalhaInserir): string {
  return `Não deu para inserir aqui: ${MOTIVOS_DA_FALHA[motivo]}`
}

export function encontreiCampos(y: number): string {
  return y === 1 ? 'Encontrei 1 campo' : `Encontrei ${y} campos`
}
```

No fim de `apps/extensao/src/lib/paginas.ts`, acrescente:

```ts
export function caminhoDaUrl(url: string | undefined): string {
  return (url && lerUrl(url)?.pathname) || '/'
}
```

(`lerUrl` é a função privada que a fase 2 já tem no mesmo arquivo e devolve `null` para texto que não é URL.)

`apps/extensao/src/lib/estado-popup.ts`:

```ts
import type { StatusHost } from '../components/pilula-host'
import type { RespostaPreencher } from './mensagens'
import type { SituacaoPagina } from './paginas'
import { contarRecusados, type ResumoPreenchimento } from './resultado'

export type Tela = 'dados' | 'resultado' | 'nenhum-campo' | 'proibida'

export interface EstadoPopup {
  tela: Tela
  situacao: SituacaoPagina
  resumo: ResumoPreenchimento | null
}

export interface TextoRodape {
  texto: string
  comAlterar: boolean
}

export function estadoAoAbrir(situacao: SituacaoPagina): EstadoPopup {
  return {
    tela: situacao === 'ok' ? 'dados' : 'proibida',
    situacao,
    resumo: null,
  }
}

export function aposPreencher(resposta: RespostaPreencher): EstadoPopup {
  if (!resposta.ok)
    return { tela: 'proibida', situacao: resposta.motivo, resumo: null }
  const { resumo } = resposta
  const tela =
    resumo.x + contarRecusados(resumo) >= 1 ? 'resultado' : 'nenhum-campo'
  return { tela, situacao: 'ok', resumo }
}

export function verDados(estado: EstadoPopup): EstadoPopup {
  return { ...estado, tela: 'dados' }
}

export function statusDoHost(estado: EstadoPopup): StatusHost {
  if (estado.situacao !== 'ok') return 'lock'
  return estado.resumo !== null && estado.resumo.x === 0 ? 'warn' : 'ok'
}

export function rodapeDaTela(
  tela: Tela,
  temPessoa: boolean,
): TextoRodape | null {
  switch (tela) {
    case 'proibida':
      return null
    case 'resultado':
      return { texto: 'preenche de novo', comAlterar: false }
    case 'nenhum-campo':
      return { texto: 'preenche sem abrir', comAlterar: false }
    case 'dados':
      return temPessoa
        ? { texto: 'preenche sem abrir', comAlterar: true }
        : { texto: 'preenche sem abrir o popup', comAlterar: false }
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/lib/estado-popup.test.ts src/lib/resultado.test.ts src/lib/textos.test.ts src/lib/paginas.test.ts; echo "exit=$?"
```

Esperado: `Test Files  4 passed`, `Tests  57 passed` (12 + 7 + 5 + 33), `exit=0`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/lib/estado-popup.ts apps/extensao/src/lib/estado-popup.test.ts apps/extensao/src/test/resumos.ts \
  apps/extensao/src/lib/resultado.ts apps/extensao/src/lib/resultado.test.ts apps/extensao/src/lib/textos.ts apps/extensao/src/lib/textos.test.ts \
  apps/extensao/src/lib/paginas.ts apps/extensao/src/lib/paginas.test.ts \
  && /usr/bin/git commit -m "feat(extensao): máquina de estados do popup e textos do retorno"; echo "exit=$?"
```

---

### Task 2: Estado 1c (`ResultadoPreenchimento`) e o ícone de estado

**Files:**

- Create: `apps/extensao/src/components/icone-tile.tsx`, `icone-tile.test.tsx`, `icone-tile.stories.tsx`
- Create: `apps/extensao/src/components/resultado-preenchimento.tsx`, `resultado-preenchimento.test.tsx`, `resultado-preenchimento.stories.tsx`

Porte de `IconeTile` e `FillResult` de `R/popup/Estados.tsx`. Mudanças: o componente recebe o `ResumoPreenchimento` inteiro; o título sai de `tituloPreenchimento` (plural certo) e vira `h1` (como o 1a e o 1b da fase 2), e "Não reconhecidos" vira `h2`; a mira recebe a `LinhaCampo` (com `documentId`), e a chave da linha é `documentId:idx` (o protótipo usava o seletor, que repete entre frames); campo sem rótulo mostra só o seletor; acima de 40 campos os segmentos viram duas barras proporcionais (um segmento por campo fica com menos de 5 px); botões ganham `focus-visible`.

**Interfaces:**

- Consumes: `ResumoPreenchimento`, `LinhaCampo` (fase 2); `tituloPreenchimento` (fase 2); `BOTAO_SM`, `META_MONO`, `OVERLINE` (fase 2, `tipografia.ts`); `RESUMO_DO_DESIGN`, `LINHAS_DO_DESIGN`, `resumoDe` (Task 1); `PESSOA_DOURADA`, `PopupShell`, `Rodape` (fase 2, nas stories).
- Produces: `IconeTile({ tom?: 'neutro' | 'ok'; children: ReactNode })`; `interface ResultadoPreenchimentoProps { resumo: ResumoPreenchimento; caminho: string; nome: string; onMostrar: (linha: LinhaCampo) => void; onAbrirCaixa: () => void; onVerDados: () => void }`; `ResultadoPreenchimento(props)`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/components/icone-tile.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IconeTile } from './icone-tile'

describe('IconeTile', () => {
  it('é neutro por padrão, com o ícone dentro', () => {
    render(
      <IconeTile>
        <span>ícone</span>
      </IconeTile>,
    )
    expect(screen.getByText('ícone').parentElement).toHaveClass(
      'bg-card',
      'text-muted-foreground',
    )
  })

  it('no tom ok fica verde', () => {
    render(
      <IconeTile tom="ok">
        <span>ícone</span>
      </IconeTile>,
    )
    expect(screen.getByText('ícone').parentElement).toHaveClass(
      'bg-ok/12',
      'text-ok',
    )
  })
})
```

`apps/extensao/src/components/resultado-preenchimento.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LinhaCampo } from '../lib/resultado'
import { LINHAS_DO_DESIGN, RESUMO_DO_DESIGN, resumoDe } from '../test/resumos'
import {
  ResultadoPreenchimento,
  type ResultadoPreenchimentoProps,
} from './resultado-preenchimento'

function props(
  extra: Partial<ResultadoPreenchimentoProps> = {},
): ResultadoPreenchimentoProps {
  return {
    resumo: RESUMO_DO_DESIGN,
    caminho: '/cadastro',
    nome: 'Maria Eduarda Souza',
    onMostrar: vi.fn(),
    onAbrirCaixa: vi.fn(),
    onVerDados: vi.fn(),
    ...extra,
  }
}

// Os ícones do Font Awesome também têm role="img", mas com aria-hidden: o único img visível é a barra.
const segmentos = () =>
  Array.from(screen.getByRole('img').children) as HTMLElement[]

afterEach(() => vi.restoreAllMocks())

describe('ResultadoPreenchimento (1c)', () => {
  it('mostra X de Y, o caminho da página e quem preencheu', () => {
    render(<ResultadoPreenchimento {...props()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '12 de 14 campos preenchidos',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('/cadastro · com Maria Eduarda Souza'),
    ).toBeInTheDocument()
  })

  it('um segmento por campo: sólido para os preenchidos, tracejado para os demais', () => {
    render(<ResultadoPreenchimento {...props()} />)
    expect(
      screen.getByRole('img', { name: '12 de 14 campos preenchidos' }),
    ).toBeInTheDocument()
    expect(segmentos()).toHaveLength(14)
    expect(
      segmentos().filter((s) => s.classList.contains('bg-ok')),
    ).toHaveLength(12)
    expect(
      segmentos().filter((s) => s.classList.contains('border-dashed')),
    ).toHaveLength(2)
  })

  it('com mais de 40 campos os segmentos viram duas barras proporcionais', () => {
    const linhas = Array.from({ length: 10 }, (_, i) => ({
      documentId: 'doc-0',
      idx: 100 + i,
      rotulo: `Campo ${i}`,
      seletor: `input#c${i}`,
    }))
    render(
      <ResultadoPreenchimento {...props({ resumo: resumoDe(50, linhas) })} />,
    )
    expect(segmentos()).toHaveLength(2)
    expect(segmentos()[0]).toHaveStyle({ flexGrow: '50' })
    expect(segmentos()[1]).toHaveStyle({ flexGrow: '10' })
  })

  it('lista os não reconhecidos com rótulo e seletor; a mira manda a linha inteira', async () => {
    const mostrar = vi.fn()
    render(<ResultadoPreenchimento {...props({ onMostrar: mostrar })} />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'Não reconhecidos' }),
    ).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
    const itens = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(itens.map((item) => item.textContent)).toEqual([
      'Código de indicaçãoinput[name="ref_code"]',
      'Como nos conheceu?select#origem',
    ])
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', {
          name: 'Mostrar na página: Como nos conheceu?',
        }),
      )
    expect(mostrar).toHaveBeenCalledWith(LINHAS_DO_DESIGN[1])
    expect(
      screen.getByText(/Para esses, clique com o botão direito no campo e use/),
    ).toHaveTextContent(
      'Para esses, clique com o botão direito no campo e use piluvitu › Inserir.',
    )
  })

  it('mesmo seletor em frames diferentes: as duas linhas aparecem e cada mira vai para o seu documento', async () => {
    const erroDoReact = vi.spyOn(console, 'error')
    const mostrar = vi.fn()
    const linhas: LinhaCampo[] = [
      {
        documentId: 'topo',
        idx: 1,
        rotulo: 'Cupom',
        seletor: 'input:nth-of-type(1)',
      },
      {
        documentId: 'quadro',
        idx: 1,
        rotulo: 'Cupom do parceiro',
        seletor: 'input:nth-of-type(1)',
      },
    ]
    render(
      <ResultadoPreenchimento
        {...props({ resumo: resumoDe(3, linhas), onMostrar: mostrar })}
      />,
    )
    expect(
      within(screen.getByRole('list')).getAllByRole('listitem'),
    ).toHaveLength(2)
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', {
          name: 'Mostrar na página: Cupom do parceiro',
        }),
      )
    expect(mostrar).toHaveBeenCalledWith(linhas[1])
    expect(erroDoReact).not.toHaveBeenCalled()
  })

  it('campo sem rótulo mostra só o seletor', () => {
    const linha = {
      documentId: 'doc-0',
      idx: 9,
      rotulo: '',
      seletor: 'input:nth-of-type(3)',
    }
    render(
      <ResultadoPreenchimento {...props({ resumo: resumoDe(1, [linha]) })} />,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent(
      /^input:nth-of-type\(3\)$/,
    )
    expect(
      screen.getByRole('button', {
        name: 'Mostrar na página: input:nth-of-type(3)',
      }),
    ).toBeInTheDocument()
  })

  it('tudo reconhecido: sem lista e sem dica, e o título no singular', () => {
    render(<ResultadoPreenchimento {...props({ resumo: resumoDe(1) })} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '1 de 1 campo preenchido',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Não reconhecidos')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText(/Para esses/)).toBeNull()
  })

  it('"Caixa de entrada" e "Ver os dados" chamam os callbacks', async () => {
    const caixa = vi.fn()
    const dados = vi.fn()
    const user = userEvent.setup()
    render(
      <ResultadoPreenchimento
        {...props({ onAbrirCaixa: caixa, onVerDados: dados })}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Caixa de entrada' }))
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(caixa).toHaveBeenCalledTimes(1)
    expect(dados).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/components/icone-tile.test.tsx src/components/resultado-preenchimento.test.tsx; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./icone-tile"` e `"./resultado-preenchimento"`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/components/icone-tile.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import type { ReactNode } from 'react'

export function IconeTile({
  tom = 'neutro',
  children,
}: {
  tom?: 'neutro' | 'ok'
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex size-10 flex-none items-center justify-center rounded-[14px] border',
        tom === 'ok'
          ? 'border-ok/40 bg-ok/12 text-ok'
          : 'bg-card text-muted-foreground',
      )}
    >
      {children}
    </div>
  )
}
```

`apps/extensao/src/components/resultado-preenchimento.tsx`:

```tsx
import {
  faCheck,
  faCrosshairs,
  faInbox,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import type { LinhaCampo, ResumoPreenchimento } from '../lib/resultado'
import { tituloPreenchimento } from '../lib/textos'
import { IconeTile } from './icone-tile'
import { BOTAO_SM, META_MONO, OVERLINE } from './tipografia'

const MAX_SEGMENTOS = 40
const SEGMENTO = 'h-1.5 rounded-[3px]'
const PREENCHIDO = 'bg-ok'
const FALTANDO = 'border-warn border border-dashed'

export interface ResultadoPreenchimentoProps {
  resumo: ResumoPreenchimento
  caminho: string
  nome: string
  onMostrar: (linha: LinhaCampo) => void
  onAbrirCaixa: () => void
  onVerDados: () => void
}

function Segmentos({ x, y, titulo }: { x: number; y: number; titulo: string }) {
  if (y > MAX_SEGMENTOS) {
    return (
      <div className="flex gap-[3px]" role="img" aria-label={titulo}>
        {x > 0 && (
          <span
            className={cn(SEGMENTO, PREENCHIDO)}
            style={{ flexGrow: x, flexBasis: 0 }}
          />
        )}
        {y > x && (
          <span
            className={cn(SEGMENTO, FALTANDO)}
            style={{ flexGrow: y - x, flexBasis: 0 }}
          />
        )}
      </div>
    )
  }
  return (
    <div className="flex gap-[3px]" role="img" aria-label={titulo}>
      {Array.from({ length: y }, (_, i) => (
        <span
          key={i}
          className={cn(SEGMENTO, 'flex-1', i < x ? PREENCHIDO : FALTANDO)}
        />
      ))}
    </div>
  )
}

function LinhaNaoReconhecida({
  linha,
  onMostrar,
}: {
  linha: LinhaCampo
  onMostrar: (linha: LinhaCampo) => void
}) {
  return (
    <li className="border-warn/50 flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-[9px]">
      <div className="flex min-w-0 flex-col gap-0.5">
        {linha.rotulo && (
          <span className="text-[13px] font-semibold">{linha.rotulo}</span>
        )}
        <span className="text-muted-foreground font-mono text-[11px] font-medium [overflow-wrap:anywhere]">
          {linha.seletor}
        </span>
      </div>
      <button
        type="button"
        title="Mostrar na página"
        aria-label={`Mostrar na página: ${linha.rotulo || linha.seletor}`}
        onClick={() => onMostrar(linha)}
        className="text-muted-foreground hover:bg-accent focus-visible:ring-ring -my-1 ml-auto flex size-7 flex-none cursor-pointer items-center justify-center rounded-[8px] focus-visible:ring-1 focus-visible:outline-none"
      >
        <FontAwesomeIcon icon={faCrosshairs} className="text-xs" />
      </button>
    </li>
  )
}

export function ResultadoPreenchimento({
  resumo,
  caminho,
  nome,
  onMostrar,
  onAbrirCaixa,
  onVerDados,
}: ResultadoPreenchimentoProps) {
  const titulo = tituloPreenchimento(resumo.x, resumo.y)
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
      <div className="flex items-center gap-3">
        <IconeTile tom="ok">
          <FontAwesomeIcon icon={faCheck} />
        </IconeTile>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h1 className="m-0 text-[16px] font-bold tracking-[-0.01em]">
            {titulo}
          </h1>
          <div className={META_MONO}>
            {caminho} · com {nome}
          </div>
        </div>
      </div>
      <Segmentos x={resumo.x} y={resumo.y} titulo={titulo} />
      {resumo.naoReconhecidos.length > 0 && (
        <>
          <div className="mt-1 flex items-center gap-2.5">
            <h2 className={cn(OVERLINE, 'text-muted-foreground m-0')}>
              Não reconhecidos
            </h2>
            <span className="text-warn font-mono text-[10.5px] font-medium">
              {String(resumo.naoReconhecidos.length).padStart(2, '0')}
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {resumo.naoReconhecidos.map((linha) => (
              <LinhaNaoReconhecida
                key={`${linha.documentId}:${linha.idx}`}
                linha={linha}
                onMostrar={onMostrar}
              />
            ))}
          </ul>
          <p className="text-muted-foreground m-0 text-xs leading-normal text-pretty">
            Para esses, clique com o botão direito no campo e use{' '}
            <span className="text-foreground font-mono">
              piluvitu › Inserir
            </span>
            .
          </p>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" className={BOTAO_SM} onClick={onAbrirCaixa}>
          <FontAwesomeIcon icon={faInbox} className="text-xs" />
          Caixa de entrada
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={BOTAO_SM}
          onClick={onVerDados}
        >
          Ver os dados
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/components/icone-tile.test.tsx src/components/resultado-preenchimento.test.tsx; echo "exit=$?"
```

Esperado: `Test Files  2 passed`, `Tests  10 passed`, `exit=0`.

- [ ] **Step 5: Stories (claro e escuro, singular, só recusados, muitos campos, sem atalho)**

`apps/extensao/src/components/icone-tile.stories.tsx`:

```tsx
import { faCheck, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconeTile } from './icone-tile'

const meta = {
  title: 'Popup/Ícone de estado',
  component: IconeTile,
  args: {
    tom: 'neutro',
    children: <FontAwesomeIcon icon={faMagnifyingGlass} />,
  },
  decorators: [
    (Story) => (
      <div className="flex p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IconeTile>

export default meta
type Story = StoryObj<typeof meta>

export const Neutro: Story = {}
export const Ok: Story = {
  args: { tom: 'ok', children: <FontAwesomeIcon icon={faCheck} /> },
}
export const Claro: Story = { globals: { tema: 'claro' } }
```

`apps/extensao/src/components/resultado-preenchimento.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { RESUMO_DO_DESIGN, resumoDe } from '../test/resumos'
import { PopupShell } from './popup-shell'
import { ResultadoPreenchimento } from './resultado-preenchimento'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1c · Resultado',
  component: ResultadoPreenchimento,
  args: {
    resumo: RESUMO_DO_DESIGN,
    caminho: '/cadastro',
    nome: PESSOA_DOURADA.nome.completo,
    onMostrar: fn(),
    onAbrirCaixa: fn(),
    onVerDados: fn(),
  },
  parameters: { atalho: 'Alt+Shift+P' },
  render: (args, { parameters }) => (
    <PopupShell
      host="localhost:3000"
      status={args.resumo.x === 0 ? 'warn' : 'ok'}
      rodape={
        <Rodape
          atalho={parameters.atalho as string}
          texto="preenche de novo"
          onAlterarAtalho={fn()}
        />
      }
    >
      <ResultadoPreenchimento {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof ResultadoPreenchimento>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const TudoReconhecido: Story = { args: { resumo: resumoDe(9) } }
export const Singular: Story = { args: { resumo: resumoDe(1) } }
export const SoRecusados: Story = {
  args: {
    resumo: resumoDe(0, [
      {
        documentId: 'doc-0',
        idx: 1,
        rotulo: 'Senha (recusou o valor)',
        seletor: 'input[name="senha"]',
      },
    ]),
  },
}
export const MuitosCampos: Story = {
  args: {
    resumo: resumoDe(
      52,
      Array.from({ length: 4 }, (_, i) => ({
        documentId: 'doc-0',
        idx: 53 + i,
        rotulo: `Campo extra ${i + 1}`,
        seletor: `input[name="extra_${i + 1}"]`,
      })),
    ),
  },
}
export const SemAtalho: Story = { parameters: { atalho: '' } }
```

```bash
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && node -e "
const assert = require('node:assert')
const indice = require('./storybook-static/index.json')
const nomes = new Set(Object.values(indice.entries).filter((e) => e.type === 'story').map((e) => e.title + ' / ' + e.name))
for (const n of ['Popup/Ícone de estado / Neutro', 'Popup/Ícone de estado / Ok', 'Popup/1c · Resultado / Escuro', 'Popup/1c · Resultado / Claro', 'Popup/1c · Resultado / Tudo Reconhecido', 'Popup/1c · Resultado / Singular', 'Popup/1c · Resultado / So Recusados', 'Popup/1c · Resultado / Muitos Campos', 'Popup/1c · Resultado / Sem Atalho']) assert.ok(nomes.has(n), 'falta a story ' + n)
console.log(nomes.size + ' stories ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0` e a contagem impressa (as stories da fase 2 mais as 10 novas).

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/components/icone-tile.tsx apps/extensao/src/components/icone-tile.test.tsx apps/extensao/src/components/icone-tile.stories.tsx \
  apps/extensao/src/components/resultado-preenchimento.tsx apps/extensao/src/components/resultado-preenchimento.test.tsx apps/extensao/src/components/resultado-preenchimento.stories.tsx \
  && /usr/bin/git commit -m "feat(extensao): estado 1c com X de Y, não reconhecidos e a mira"; echo "exit=$?"
```

---

### Task 3: Estado 1d (`NenhumCampo`), inclusive a página sem formulário

**Files:**

- Modify: `apps/extensao/src/components/tipografia.ts`
- Create: `apps/extensao/src/components/nenhum-campo.tsx`, `nenhum-campo.test.tsx`, `nenhum-campo.stories.tsx`

Porte de `NenhumCampo` de `R/popup/Estados.tsx`. Mudanças: recebe `y` e usa `encontreiCampos` (singular); com Y = 0 troca título e corpo pelos textos "sem formulário" da spec §8 e mantém o cartão "Dá para inserir campo a campo" (o Inserir também serve a contenteditable, que não entra na contagem); o título vira `h1`.

**Interfaces:**

- Consumes: `encontreiCampos` (Task 1); `IconeTile` (Task 2); `BOTAO_SM`, `CORPO`, `PAINEL` (fase 2).
- Produces: em `tipografia.ts`, **acréscimos** `H1_ESTADO = 'm-0 text-[17px] leading-[1.25] font-bold tracking-[-0.01em]'` e `CODIGO = 'font-mono text-xs'`; `interface NenhumCampoProps { y: number; onTentarDeNovo: () => void; onVerDados: () => void }`; `NenhumCampo(props)`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/extensao/src/components/nenhum-campo.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NenhumCampo } from './nenhum-campo'

const CORPO_COM_CAMPOS =
  'mas nenhum com name, id, label ou autocomplete que eu conheça. Formulários dentro de iframe de outro domínio também ficam de fora.'

describe('NenhumCampo (1d)', () => {
  it('conta os campos achados e explica por que nenhum foi reconhecido', () => {
    render(<NenhumCampo y={3} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Nenhum campo reconhecido nesta página',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/mas nenhum com/)).toHaveTextContent(
      `Encontrei 3 campos, ${CORPO_COM_CAMPOS}`,
    )
  })

  it('com um campo só, fala no singular', () => {
    render(<NenhumCampo y={1} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(screen.getByText(/mas nenhum com/)).toHaveTextContent(
      `Encontrei 1 campo, ${CORPO_COM_CAMPOS}`,
    )
  })

  it('com Y = 0 diz que não há formulário na página', () => {
    render(<NenhumCampo y={0} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Nenhum formulário nesta página',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Não achei campos de formulário visíveis. Formulários dentro de iframe de outro domínio ficam de fora.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Encontrei/)).toBeNull()
  })

  it('ensina o caminho do Inserir', () => {
    render(<NenhumCampo y={3} onTentarDeNovo={vi.fn()} onVerDados={vi.fn()} />)
    expect(
      screen.getByText('Dá para inserir campo a campo:'),
    ).toBeInTheDocument()
    for (const passo of ['botão direito', 'piluvitu', 'Inserir', 'CPF']) {
      expect(screen.getByText(passo)).toBeInTheDocument()
    }
  })

  it('"Tentar de novo" e "Ver os dados" chamam os callbacks', async () => {
    const tentar = vi.fn()
    const dados = vi.fn()
    const user = userEvent.setup()
    render(<NenhumCampo y={3} onTentarDeNovo={tentar} onVerDados={dados} />)
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(tentar).toHaveBeenCalledTimes(1)
    expect(dados).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/components/nenhum-campo.test.tsx; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./nenhum-campo"`; `exit=1`.

- [ ] **Step 3: Implementar**

No fim de `apps/extensao/src/components/tipografia.ts`, acrescente:

```ts
export const H1_ESTADO =
  'm-0 text-[17px] leading-[1.25] font-bold tracking-[-0.01em]'
export const CODIGO = 'font-mono text-xs'
```

`apps/extensao/src/components/nenhum-campo.tsx`:

```tsx
import {
  faMagnifyingGlass,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { encontreiCampos } from '../lib/textos'
import { IconeTile } from './icone-tile'
import { BOTAO_SM, CODIGO, CORPO, H1_ESTADO, PAINEL } from './tipografia'

const CAMINHO_DO_INSERIR = ['botão direito', 'piluvitu', 'Inserir'] as const

export interface NenhumCampoProps {
  y: number
  onTentarDeNovo: () => void
  onVerDados: () => void
}

export function NenhumCampo({
  y,
  onTentarDeNovo,
  onVerDados,
}: NenhumCampoProps) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
      <IconeTile>
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      </IconeTile>
      {y === 0 ? (
        <>
          <h1 className={H1_ESTADO}>Nenhum formulário nesta página</h1>
          <p className={CORPO}>
            Não achei campos de formulário visíveis. Formulários dentro de
            iframe de outro domínio ficam de fora.
          </p>
        </>
      ) : (
        <>
          <h1 className={H1_ESTADO}>Nenhum campo reconhecido nesta página</h1>
          <p className={CORPO}>
            {encontreiCampos(y)}, mas nenhum com{' '}
            <span className={CODIGO}>name</span>,{' '}
            <span className={CODIGO}>id</span>, label ou{' '}
            <span className={CODIGO}>autocomplete</span> que eu conheça.
            Formulários dentro de iframe de outro domínio também ficam de fora.
          </p>
        </>
      )}
      <Card className={cn(PAINEL, 'flex flex-col gap-2.5')}>
        <span className="text-muted-foreground text-[12px]">
          Dá para inserir campo a campo:
        </span>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-medium">
          {CAMINHO_DO_INSERIR.map((passo) => (
            <span key={passo} className="contents">
              <span className="rounded-full border px-2 py-[3px]">{passo}</span>
              <span className="text-muted-foreground">›</span>
            </span>
          ))}
          <span className="border-accent-line bg-accent-soft text-primary rounded-full border px-2 py-[3px]">
            CPF
          </span>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className={BOTAO_SM}
          onClick={onTentarDeNovo}
        >
          <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
          Tentar de novo
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={BOTAO_SM}
          onClick={onVerDados}
        >
          Ver os dados
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/components/nenhum-campo.test.tsx; echo "exit=$?"
```

Esperado: `Tests  5 passed`, `exit=0`.

- [ ] **Step 5: Stories (claro e escuro, um campo, sem formulário, sem atalho)**

`apps/extensao/src/components/nenhum-campo.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { NenhumCampo } from './nenhum-campo'
import { PopupShell } from './popup-shell'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1d · Nenhum campo',
  component: NenhumCampo,
  args: { y: 3, onTentarDeNovo: fn(), onVerDados: fn() },
  parameters: { atalho: 'Alt+Shift+P' },
  render: (args, { parameters }) => (
    <PopupShell
      host="staging.app.dev"
      status="warn"
      rodape={
        <Rodape
          atalho={parameters.atalho as string}
          texto="preenche sem abrir"
          onAlterarAtalho={fn()}
        />
      }
    >
      <NenhumCampo {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof NenhumCampo>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const UmCampo: Story = { args: { y: 1 } }
export const SemFormulario: Story = { args: { y: 0 } }
export const SemAtalho: Story = { parameters: { atalho: '' } }
```

```bash
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && node -e "
const assert = require('node:assert')
const indice = require('./storybook-static/index.json')
const nomes = new Set(Object.values(indice.entries).filter((e) => e.type === 'story').map((e) => e.title + ' / ' + e.name))
for (const n of ['Popup/1d · Nenhum campo / Escuro', 'Popup/1d · Nenhum campo / Claro', 'Popup/1d · Nenhum campo / Um Campo', 'Popup/1d · Nenhum campo / Sem Formulario', 'Popup/1d · Nenhum campo / Sem Atalho']) assert.ok(nomes.has(n), 'falta a story ' + n)
console.log(nomes.size + ' stories ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/components/tipografia.ts apps/extensao/src/components/nenhum-campo.tsx \
  apps/extensao/src/components/nenhum-campo.test.tsx apps/extensao/src/components/nenhum-campo.stories.tsx \
  && /usr/bin/git commit -m "feat(extensao): estado 1d, inclusive a página sem formulário"; echo "exit=$?"
```

---

### Task 4: Estado 1e (`PaginaProibida`), com a variante de `file:` e a de sem pessoa

**Files:**

- Create: `apps/extensao/src/components/pagina-proibida.tsx`, `pagina-proibida.test.tsx`, `pagina-proibida.stories.tsx`

Porte de `PaginaProibida` de `R/popup/Estados.tsx`. Mudanças: `motivo` escolhe entre o texto do design e o de `file:` sem acesso (spec §8); sem pessoa, o cartão vira "Gere uma pessoa para copiar os dados à mão." + "Gerar pessoa" (no mesmo `Button` outline sm do "Ver os dados"); o título vira `h1`. O "Preencher esta página" fica sempre desabilitado e sem o chip do atalho, como no design.

**Interfaces:**

- Consumes: `SituacaoPagina` (fase 2); `IconeTile` (Task 2); `H1_ESTADO`, `CODIGO` (Task 3); `CORPO`, `PAINEL` (fase 2).
- Produces: `interface PaginaProibidaProps { motivo: Exclude<SituacaoPagina, 'ok'>; nome: string | null; onVerDados: () => void; onGerarPessoa: () => void }`; `PaginaProibida(props)`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/extensao/src/components/pagina-proibida.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PaginaProibida, type PaginaProibidaProps } from './pagina-proibida'

function props(extra: Partial<PaginaProibidaProps> = {}): PaginaProibidaProps {
  return {
    motivo: 'proibida',
    nome: 'Maria Eduarda Souza',
    onVerDados: vi.fn(),
    onGerarPessoa: vi.fn(),
    ...extra,
  }
}

describe('PaginaProibida (1e)', () => {
  it('explica a recusa do Chrome e deixa o Preencher desabilitado', () => {
    render(<PaginaProibida {...props()} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/a Chrome Web Store e o leitor de PDF/),
    ).toHaveTextContent(
      'Vale para páginas chrome://, a Chrome Web Store e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
    )
    expect(
      screen.getByRole('button', { name: 'Preencher esta página' }),
    ).toBeDisabled()
  })

  it('em file: sem acesso, ensina a liberar o acesso a arquivos', () => {
    render(<PaginaProibida {...props({ motivo: 'arquivo-sem-acesso' })} />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Falta liberar o acesso a arquivos',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/nos detalhes da extensão/)).toHaveTextContent(
      "Em chrome://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo.",
    )
    expect(
      screen.getByRole('button', { name: 'Preencher esta página' }),
    ).toBeDisabled()
  })

  it('com pessoa, o cartão leva aos dados para copiar', async () => {
    const dados = vi.fn()
    render(<PaginaProibida {...props({ onVerDados: dados })} />)
    expect(screen.getByText('Maria Eduarda Souza')).toBeInTheDocument()
    expect(
      screen.getByText('Os dados continuam aqui para copiar.'),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(dados).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Gerar pessoa' })).toBeNull()
  })

  it('sem pessoa, o cartão vira "Gerar pessoa"', async () => {
    const gerar = vi.fn()
    render(<PaginaProibida {...props({ nome: null, onGerarPessoa: gerar })} />)
    expect(
      screen.getByText('Gere uma pessoa para copiar os dados à mão.'),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Gerar pessoa' }))
    expect(gerar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Ver os dados' })).toBeNull()
  })

  it('o Preencher desabilitado não mostra o atalho', () => {
    render(<PaginaProibida {...props()} />)
    expect(
      screen
        .getByRole('button', { name: 'Preencher esta página' })
        .querySelector('kbd'),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/components/pagina-proibida.test.tsx; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./pagina-proibida"`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/components/pagina-proibida.tsx`:

```tsx
import { faBolt, faLock } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import type { SituacaoPagina } from '../lib/paginas'
import { IconeTile } from './icone-tile'
import { CODIGO, CORPO, H1_ESTADO, PAINEL } from './tipografia'

const BOTAO_DO_CARTAO = 'ml-auto flex-none gap-2 rounded-[14px] text-[13px]'

export interface PaginaProibidaProps {
  motivo: Exclude<SituacaoPagina, 'ok'>
  nome: string | null
  onVerDados: () => void
  onGerarPessoa: () => void
}

export function PaginaProibida({
  motivo,
  nome,
  onVerDados,
  onGerarPessoa,
}: PaginaProibidaProps) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
      <IconeTile>
        <FontAwesomeIcon icon={faLock} />
      </IconeTile>
      {motivo === 'arquivo-sem-acesso' ? (
        <>
          <h1 className={H1_ESTADO}>Falta liberar o acesso a arquivos</h1>
          <p className={CORPO}>
            Em <span className={CODIGO}>chrome://extensions</span>, nos detalhes
            da extensão, ative {"'Permitir acesso a URLs de arquivo'"} e tente
            de novo.
          </p>
        </>
      ) : (
        <>
          <h1 className={H1_ESTADO}>
            O Chrome não deixa extensões mexerem nesta página
          </h1>
          <p className={CORPO}>
            Vale para páginas <span className={CODIGO}>chrome://</span>, a
            Chrome Web Store e o leitor de PDF, e para qualquer extensão. Abra o
            formulário numa aba comum e tente de novo.
          </p>
        </>
      )}
      <Button size="lg" disabled className="w-full gap-2">
        <FontAwesomeIcon icon={faBolt} className="text-[13px]" />
        Preencher esta página
      </Button>
      <Card className={cn(PAINEL, 'flex items-center gap-3')}>
        {nome ? (
          <>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{nome}</span>
              <span className="text-muted-foreground text-[12px]">
                Os dados continuam aqui para copiar.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={BOTAO_DO_CARTAO}
              onClick={onVerDados}
            >
              Ver os dados
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground min-w-0 text-[12px]">
              Gere uma pessoa para copiar os dados à mão.
            </span>
            <Button
              variant="outline"
              size="sm"
              className={BOTAO_DO_CARTAO}
              onClick={onGerarPessoa}
            >
              Gerar pessoa
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/components/pagina-proibida.test.tsx; echo "exit=$?"
```

Esperado: `Tests  5 passed`, `exit=0`.

- [ ] **Step 5: Stories (claro e escuro, sem pessoa, arquivo sem acesso)**

O "1b vindo do 1e" (Preencher desabilitado e cadeado) já é a story `Popup/1b · Pessoa pronta / Vindo Da Pagina Proibida` da fase 2.

`apps/extensao/src/components/pagina-proibida.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { PaginaProibida } from './pagina-proibida'
import { PopupShell } from './popup-shell'

const meta = {
  title: 'Popup/1e · Página proibida',
  component: PaginaProibida,
  args: {
    motivo: 'proibida',
    nome: PESSOA_DOURADA.nome.completo,
    onVerDados: fn(),
    onGerarPessoa: fn(),
  },
  render: (args) => (
    <PopupShell
      host={
        args.motivo === 'arquivo-sem-acesso'
          ? 'arquivo local'
          : 'chrome://settings'
      }
      status="lock"
    >
      <PaginaProibida {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof PaginaProibida>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemPessoa: Story = { args: { nome: null } }
export const ArquivoSemAcesso: Story = {
  args: { motivo: 'arquivo-sem-acesso' },
}
```

```bash
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && node -e "
const assert = require('node:assert')
const indice = require('./storybook-static/index.json')
const nomes = new Set(Object.values(indice.entries).filter((e) => e.type === 'story').map((e) => e.title + ' / ' + e.name))
for (const n of ['Popup/1e · Página proibida / Escuro', 'Popup/1e · Página proibida / Claro', 'Popup/1e · Página proibida / Sem Pessoa', 'Popup/1e · Página proibida / Arquivo Sem Acesso', 'Popup/1b · Pessoa pronta / Vindo Da Pagina Proibida']) assert.ok(nomes.has(n), 'falta a story ' + n)
console.log(nomes.size + ' stories ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/components/pagina-proibida.tsx apps/extensao/src/components/pagina-proibida.test.tsx \
  apps/extensao/src/components/pagina-proibida.stories.tsx \
  && /usr/bin/git commit -m "feat(extensao): estado 1e, com as variantes de arquivo e de sem pessoa"; echo "exit=$?"
```

---

### Task 5: Popup com a máquina de estados (1a–1e) e a mira

**Files:**

- Modify (substitui o arquivo inteiro): `apps/extensao/src/entrypoints/popup/App.tsx`
- Modify: `apps/extensao/src/entrypoints/popup/App.test.tsx`
- Modify: `apps/extensao/src/entrypoints/popup/popup.e2e.ts`

O `App` da fase 2 continuava no 1b depois do "Preencher" e mostrava o 1b com "Preencher" desabilitado em página proibida. Agora a tela sai do `EstadoPopup` (Task 1): abre no 1e se a URL é proibida, vai para 1c/1d/1e conforme a `RespostaPreencher`, "Ver os dados" volta ao 1b, "Tentar de novo" preenche outra vez e a mira manda a mensagem `mostrar`. Resposta `undefined` (o background registrou um erro inesperado) deixa o popup onde está. Os hooks `usePessoa` e `useAtalho` da fase 2 ficam iguais.

**Interfaces:**

- Consumes: `estadoAoAbrir`, `aposPreencher`, `verDados`, `statusDoHost`, `rodapeDaTela`, `EstadoPopup`, `caminhoDaUrl` (Task 1); `ResultadoPreenchimento` (Task 2); `NenhumCampo` (Task 3); `PaginaProibida` (Task 4); `PopupShell`, `Rodape`, `PrimeiroUso`, `PessoaPronta`, `pessoaItem`, `gerarPessoaNova`, `hojeISO`, `idadeEm`, `enviar`, `RespostaPreencher`, `rotuloDoHost`, `useAbaAlvo`, `AbaAlvo` (fase 2); `resumoDe`, `LINHAS_DO_DESIGN` (Task 1, nos testes).
- Produces: `App()` (mesma assinatura da fase 2).

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/extensao/src/entrypoints/popup/App.test.tsx`:

1. Troque a linha `import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'` por:

```tsx
import type { RespostaPreencher } from '../../lib/mensagens'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { LINHAS_DO_DESIGN, resumoDe } from '../../test/resumos'
```

2. Troque o título do teste `'"Preencher esta página" manda a mensagem para a aba-alvo e o popup continua no 1b'` por `'sem resposta do background (erro inesperado), o Preencher deixa o popup no 1b'` (o corpo do teste fica igual: o ouvinte responde `undefined`).

3. Acrescente no fim do arquivo:

```tsx
function simularBackground(resposta: RespostaPreencher | undefined) {
  const recebidas: { tipo: string }[] = []
  fakeBrowser.runtime.onMessage.addListener(
    (mensagem, _remetente, responder) => {
      recebidas.push(mensagem as { tipo: string })
      responder(
        (mensagem as { tipo: string }).tipo === 'preencher' ? resposta : true,
      )
      return true
    },
  )
  return recebidas
}

const cabecalho = () => screen.getByRole('banner')
const temCadeado = () =>
  cabecalho().querySelector('svg[data-icon="lock"]') !== null

describe('App do popup: retorno do Preencher', () => {
  it('com campos preenchidos mostra o 1c com o caminho, a lista e o rodapé "preenche de novo"', async () => {
    simularBackground({ ok: true, resumo: resumoDe(12, LINHAS_DO_DESIGN) })
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '12 de 14 campos preenchidos',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`/cadastro · com ${P.nome.completo}`),
    ).toBeInTheDocument()
    expect(screen.getByText('preenche de novo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
    expect(cabecalho().querySelector('.bg-ok')).not.toBeNull()
  })

  it('a mira do 1c pede ao background para mostrar aquele campo, naquele documento', async () => {
    const recebidas = simularBackground({
      ok: true,
      resumo: resumoDe(12, LINHAS_DO_DESIGN),
    })
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    await user.click(
      await screen.findByRole('button', {
        name: 'Mostrar na página: Código de indicação',
      }),
    )
    await vi.waitFor(() =>
      expect(recebidas).toContainEqual({
        tipo: 'mostrar',
        tabId: 7,
        documentId: 'doc-0',
        idx: 13,
      }),
    )
  })

  it('"Ver os dados" do 1c volta ao 1b, e "Caixa de entrada" abre a caixa da pessoa', async () => {
    simularBackground({ ok: true, resumo: resumoDe(12, LINHAS_DO_DESIGN) })
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    await user.click(
      await screen.findByRole('button', { name: 'Caixa de entrada' }),
    )
    expect(abrir).toHaveBeenCalledWith({ url: P.email.caixaUrl })
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
  })

  it('nenhum campo reconhecido: 1d com pílula warn; "Tentar de novo" preenche outra vez; o warn fica no 1b', async () => {
    const recebidas = simularBackground({
      ok: true,
      resumo: resumoDe(0, LINHAS_DO_DESIGN),
    })
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Nenhum campo reconhecido nesta página',
      }),
    ).toBeInTheDocument()
    expect(cabecalho().querySelector('.bg-warn')).not.toBeNull()
    expect(screen.getByText('preenche sem abrir')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await vi.waitFor(() =>
      expect(recebidas.filter((m) => m.tipo === 'preencher')).toHaveLength(2),
    )
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    expect(cabecalho().querySelector('.bg-warn')).not.toBeNull()
  })

  it('página sem formulário (Y = 0): 1d "Nenhum formulário nesta página"', async () => {
    simularBackground({ ok: true, resumo: resumoDe(0) })
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Nenhum formulário nesta página',
      }),
    ).toBeInTheDocument()
    expect(cabecalho().querySelector('.bg-warn')).not.toBeNull()
  })

  it('Preencher recusado pelo Chrome: 1e sem rodapé; "Ver os dados" leva ao 1b com Preencher desabilitado e cadeado', async () => {
    simularBackground({ ok: false, motivo: 'proibida' })
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(temCadeado()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    expect(await botaoPreencher()).toBeDisabled()
    expect(temCadeado()).toBe(true)
  })

  it('Preencher em file: sem acesso vira o 1e de arquivo', async () => {
    simularBackground({ ok: false, motivo: 'arquivo-sem-acesso' })
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Falta liberar o acesso a arquivos',
      }),
    ).toBeInTheDocument()
  })

  it('aberto numa página proibida pela URL, vai direto ao 1e, sem rodapé e com cadeado', async () => {
    urlDaAba = 'chrome://settings'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(P.nome.completo)).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(temCadeado()).toBe(true)
  })

  it('1e sem pessoa: "Gerar pessoa" guarda uma e o cartão passa a mostrar o nome', async () => {
    urlDaAba = 'chrome://settings'
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Gerar pessoa' }))
    const gerada = await vi.waitFor(async () => {
      const pessoa = await pessoaItem.getValue()
      if (!pessoa) throw new Error('ainda sem pessoa')
      return pessoa
    })
    expect(await screen.findByText(gerada.nome.completo)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
  })

  it('aberto num file: sem acesso liberado, mostra o 1e de arquivo', async () => {
    urlDaAba = 'file:///Users/eu/form.html'
    Object.assign(fakeBrowser.extension, {
      isAllowedFileSchemeAccess: vi.fn(async () => false),
    })
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Falta liberar o acesso a arquivos',
      }),
    ).toBeInTheDocument()
    expect(within(cabecalho()).getByText('arquivo local')).toBeInTheDocument()
  })
})
```

Em `apps/extensao/src/entrypoints/popup/popup.e2e.ts`, troque a **última** linha do teste (a que confere o `h1` com o nome da pessoa **depois** do "Preencher") por:

```ts
await expect(
  popup.getByRole('heading', { level: 1, name: '1 de 1 campo preenchido' }),
).toBeVisible()
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/popup/App.test.tsx; echo "exit=$?"
```

Esperado: FAIL nos testes novos (o `App` da fase 2 continua no 1b e não conhece 1c/1d/1e); os 9 testes da fase 2 passam; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/entrypoints/popup/App.tsx` (substitui o arquivo inteiro):

```tsx
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { useEffect, useState, type ReactNode } from 'react'
import { browser } from 'wxt/browser'
import { NenhumCampo } from '../../components/nenhum-campo'
import { PaginaProibida } from '../../components/pagina-proibida'
import { PessoaPronta } from '../../components/pessoa-pronta'
import { PopupShell } from '../../components/popup-shell'
import { PrimeiroUso } from '../../components/primeiro-uso'
import { ResultadoPreenchimento } from '../../components/resultado-preenchimento'
import { Rodape } from '../../components/rodape'
import { gerarPessoaNova, pessoaItem } from '../../lib/armazenamento'
import {
  aposPreencher,
  estadoAoAbrir,
  rodapeDaTela,
  statusDoHost,
  verDados,
  type EstadoPopup,
} from '../../lib/estado-popup'
import { hojeISO, idadeEm } from '../../lib/hoje'
import { enviar, type RespostaPreencher } from '../../lib/mensagens'
import { caminhoDaUrl, rotuloDoHost } from '../../lib/paginas'
import type { LinhaCampo } from '../../lib/resultado'
import { useAbaAlvo, type AbaAlvo } from './use-aba-alvo'

const PAGINA_DE_ATALHOS = 'chrome://extensions/shortcuts'
const COMANDO_PREENCHER = 'preencher-pagina'

function usePessoa(): Pessoa | null | undefined {
  const [pessoa, setPessoa] = useState<Pessoa | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void pessoaItem.getValue().then((guardada) => {
      if (vivo) setPessoa(guardada)
    })
    const pararDeOuvir = pessoaItem.watch((nova) => setPessoa(nova))
    return () => {
      vivo = false
      pararDeOuvir()
    }
  }, [])
  return pessoa
}

function useAtalho(): string | undefined {
  const [atalho, setAtalho] = useState<string | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void browser.commands.getAll().then((comandos) => {
      if (vivo)
        setAtalho(
          comandos.find((c) => c.name === COMANDO_PREENCHER)?.shortcut ?? '',
        )
    })
    return () => {
      vivo = false
    }
  }, [])
  return atalho
}

export function App() {
  const pessoa = usePessoa()
  const aba = useAbaAlvo()
  const atalho = useAtalho()
  if (pessoa === undefined || aba === undefined || atalho === undefined)
    return null
  return <TelaDoPopup pessoa={pessoa} aba={aba} atalho={atalho} />
}

function TelaDoPopup({
  pessoa,
  aba,
  atalho,
}: {
  pessoa: Pessoa | null
  aba: AbaAlvo | null
  atalho: string
}) {
  const [estado, setEstado] = useState<EstadoPopup>(() =>
    estadoAoAbrir(aba?.situacao ?? 'ok'),
  )
  const abrirAtalhos = () =>
    void browser.tabs.create({ url: PAGINA_DE_ATALHOS })
  const abrirCaixa = (dono: Pessoa) =>
    void browser.tabs.create({ url: dono.email.caixaUrl })
  const irParaOsDados = () => setEstado(verDados)

  async function preencher() {
    if (!aba) return
    const resposta = (await enviar({ tipo: 'preencher', tabId: aba.id })) as
      | RespostaPreencher
      | undefined
    if (resposta) setEstado(aposPreencher(resposta))
  }

  function mostrar(linha: LinhaCampo) {
    if (aba)
      void enviar({
        tipo: 'mostrar',
        tabId: aba.id,
        documentId: linha.documentId,
        idx: linha.idx,
      })
  }

  let conteudo: ReactNode
  if (estado.tela === 'proibida') {
    conteudo = (
      <PaginaProibida
        motivo={
          estado.situacao === 'arquivo-sem-acesso'
            ? 'arquivo-sem-acesso'
            : 'proibida'
        }
        nome={pessoa?.nome.completo ?? null}
        onVerDados={irParaOsDados}
        onGerarPessoa={() => void gerarPessoaNova()}
      />
    )
  } else if (estado.tela === 'resultado' && estado.resumo && pessoa) {
    conteudo = (
      <ResultadoPreenchimento
        resumo={estado.resumo}
        caminho={caminhoDaUrl(aba?.url)}
        nome={pessoa.nome.completo}
        onMostrar={mostrar}
        onAbrirCaixa={() => abrirCaixa(pessoa)}
        onVerDados={irParaOsDados}
      />
    )
  } else if (estado.tela === 'nenhum-campo' && estado.resumo) {
    conteudo = (
      <NenhumCampo
        y={estado.resumo.y}
        onTentarDeNovo={() => void preencher()}
        onVerDados={irParaOsDados}
      />
    )
  } else if (pessoa === null) {
    conteudo = <PrimeiroUso onGerar={() => void gerarPessoaNova()} />
  } else {
    conteudo = (
      <PessoaPronta
        pessoa={pessoa}
        idade={idadeEm(pessoa.nascimento.iso, hojeISO())}
        atalho={atalho}
        preencherDesabilitado={aba === null || estado.situacao !== 'ok'}
        onPreencher={() => void preencher()}
        onNovaPessoa={() => void gerarPessoaNova()}
        onAbrirCaixa={() => abrirCaixa(pessoa)}
        onCopiar={(valor) => navigator.clipboard.writeText(valor)}
      />
    )
  }

  const rodape = rodapeDaTela(estado.tela, pessoa !== null)
  return (
    <PopupShell
      host={rotuloDoHost(aba?.url)}
      status={statusDoHost(estado)}
      rodape={
        rodape && (
          <Rodape
            atalho={atalho}
            texto={rodape.texto}
            comAlterar={rodape.comAlterar}
            onAlterarAtalho={abrirAtalhos}
          />
        )
      }
    >
      {conteudo}
    </PopupShell>
  )
}
```

- [ ] **Step 4: Rodar e ver passar (e a suíte inteira)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/popup/App.test.tsx; echo "exit=$?"
pnpm --filter @piluvitu/extensao test; echo "exit=$?"
```

Esperado: `Tests  19 passed` no primeiro (9 da fase 2 + 10 novos); a suíte inteira verde no segundo; os dois `exit=0`.

- [ ] **Step 5: Lint, build e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
pnpm --filter @piluvitu/extensao build; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/entrypoints/popup/App.tsx apps/extensao/src/entrypoints/popup/App.test.tsx apps/extensao/src/entrypoints/popup/popup.e2e.ts \
  && /usr/bin/git commit -m "feat(extensao): popup troca de estado depois do Preencher (1c, 1d, 1e) e manda a mira"; echo "exit=$?"
```

(O E2E alterado roda na Task 8, junto com os novos.)

---

### Task 6: Background: avisos de falha (Inserir e Y = 0) e "Mostrar" que não quebra

**Files:**

- Modify (substitui o arquivo inteiro): `apps/extensao/src/entrypoints/background/acoes.ts`
- Modify: `apps/extensao/src/entrypoints/background/acoes.test.ts`

`preencherPagina` passa a avisar "Nenhum campo nesta página" quando Y = 0 (a fase 2 não avisava). `inserirNoCampo` passa a ler o `ResultadoInsercao` e a classificar as recusas do Chrome: falha no frame do clique que não é o topo vira "iframe de outro domínio"; falha no próprio topo é página proibida e não avisa nada; qualquer outro erro sobe, como antes. O aviso de falha vai sempre para o frame 0: se o Inserir foi num iframe, o frame 0 é injetado antes (spec §7: toda ação injeta antes de chamar a API). `mostrarCampo` devolve `false` quando o documento já não existe, em vez de rejeitar.

**Interfaces:**

- Consumes: `avisar`, `ARQUIVO_CONTENT` (fase 2, mesmo arquivo); `erroEhPaginaProibida` (fase 2); `AVISO_SEM_CAMPOS`, `avisoFalhaInserir`, `MotivoFalhaInserir` (Task 1); `ResultadoInsercao` (fase 2, `preencher.content/inserir.ts`); `ComPv` (fase 2).
- Produces: as mesmas assinaturas do contrato (`preencherPagina`, `inserirNoCampo`, `mostrarCampo`, `avisar`, `ARQUIVO_CONTENT`); comportamento novo descrito acima.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/extensao/src/entrypoints/background/acoes.test.ts`, substitua o teste `'com Y = 0 não mostra aviso nesta fase'` inteiro por:

```ts
it('com Y = 0 avisa "Nenhum campo nesta página" numa linha só, no frame 0', async () => {
  simularPagina({ ...RESULTADO, preenchidos: [], naoReconhecidos: [] })
  const resposta = await preencherPagina(7)
  expect(executar).toHaveBeenCalledTimes(3)
  expect(chamada(2)).toMatchObject({
    target: { tabId: 7, frameIds: [0] },
    args: [{ titulo: 'Nenhum campo nesta página', erro: true }],
  })
  expect(resposta).toMatchObject({ ok: true, resumo: { x: 0, y: 0, k: 0 } })
})
```

No `describe('mostrarCampo', …)`, acrescente:

```ts
it('documento que já não existe (a página navegou) devolve false sem lançar', async () => {
  executar.mockRejectedValue(
    new Error('No document with id doc-9 in tab with id 7'),
  )
  await expect(mostrarCampo(7, 'doc-9', 12)).resolves.toBe(false)
})
```

No fim do arquivo, acrescente:

```ts
describe('inserirNoCampo: avisos de falha', () => {
  const RECUSA_DO_CHROME =
    'Cannot access contents of url "http://outro.local/quadro". Extension manifest must request permission to access this host.'

  // frames recusados lançam como o Chrome; a chamada do Inserir (args [pessoa, kind]) devolve `resultado`.
  function simularInsercao({
    resultado,
    recusados = [],
  }: {
    resultado?: unknown
    recusados?: number[]
  }) {
    executar.mockImplementation(async (injecao) => {
      const frames = (injecao.target.frameIds as number[] | undefined) ?? []
      if (frames.some((frame) => recusados.includes(frame)))
        throw new Error(RECUSA_DO_CHROME)
      const resposta = injecao.args?.length === 2 ? resultado : undefined
      return [{ documentId: 'doc', frameId: frames[0], result: resposta }]
    })
  }

  const injecoes = () =>
    executar.mock.calls.map(([i]) => i).filter((i) => i.files)
  const avisos = () =>
    executar.mock.calls
      .map(([i]) => i)
      .filter((i) => !i.files && i.args?.length === 1)

  it('campo que aceitou o valor: nenhum aviso', async () => {
    simularInsercao({ resultado: { ok: true } })
    await inserirNoCampo(7, 0, 'cpf')
    expect(avisos()).toEqual([])
  })

  it('sem campo em foco no topo: avisa no frame 0, sem injetar de novo', async () => {
    simularInsercao({ resultado: { ok: false, motivo: 'sem-foco' } })
    await inserirNoCampo(7, 0, 'cpf')
    expect(injecoes().map((i) => i.target)).toEqual([
      { tabId: 7, frameIds: [0] },
    ])
    expect(avisos()).toEqual([
      expect.objectContaining({
        target: { tabId: 7, frameIds: [0] },
        args: [
          {
            titulo: 'Não deu para inserir aqui: nenhum campo em foco',
            erro: true,
          },
        ],
      }),
    ])
  })

  it('campo de um iframe da mesma origem recusou o valor: injeta no frame 0 e avisa lá', async () => {
    simularInsercao({ resultado: { ok: false, motivo: 'recusado' } })
    await inserirNoCampo(7, 3, 'senha')
    expect(injecoes().map((i) => i.target)).toEqual([
      { tabId: 7, frameIds: [3] },
      { tabId: 7, frameIds: [0] },
    ])
    expect(avisos()[0]).toMatchObject({
      target: { tabId: 7, frameIds: [0] },
      args: [
        {
          titulo: 'Não deu para inserir aqui: o campo recusou o valor',
          erro: true,
        },
      ],
    })
  })

  it('iframe de outro domínio: o Chrome recusa o frame, e o aviso sai no topo', async () => {
    simularInsercao({ recusados: [3] })
    await inserirNoCampo(7, 3, 'cpf')
    expect(avisos()[0]).toMatchObject({
      target: { tabId: 7, frameIds: [0] },
      args: [
        {
          titulo: 'Não deu para inserir aqui: iframe de outro domínio',
          erro: true,
        },
      ],
    })
  })

  it('página proibida (o topo também recusa): não avisa nada e não lança', async () => {
    simularInsercao({ recusados: [0, 3] })
    await expect(inserirNoCampo(7, 3, 'cpf')).resolves.toBeUndefined()
    await expect(inserirNoCampo(7, 0, 'cpf')).resolves.toBeUndefined()
    expect(avisos()).toEqual([])
  })

  it('erro que não é recusa do Chrome sobe, como antes', async () => {
    executar.mockRejectedValue(new Error('No tab with id: 7.'))
    await expect(inserirNoCampo(7, 0, 'cpf')).rejects.toThrow(
      'No tab with id: 7.',
    )
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/background/acoes.test.ts; echo "exit=$?"
```

Esperado: FAIL no Y = 0 (só 2 chamadas), no `mostrarCampo` que rejeita e nos avisos de falha do Inserir; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/entrypoints/background/acoes.ts` (substitui o arquivo inteiro; `avisar` e `motivoDaRecusa` ficam como a fase 2 deixou):

```ts
import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { browser } from 'wxt/browser'
import { obterOuGerarPessoa } from '../../lib/armazenamento'
import { hojeISO } from '../../lib/hoje'
import type { RespostaPreencher } from '../../lib/mensagens'
import { erroEhPaginaProibida } from '../../lib/paginas'
import { somarFrames } from '../../lib/resultado'
import {
  AVISO_SEM_CAMPOS,
  avisoFalhaInserir,
  linhaNaoReconhecidos,
  tituloPreenchimento,
  type MotivoFalhaInserir,
} from '../../lib/textos'
import type { ComPv } from '../preencher.content/api'
import type { ResultadoInsercao } from '../preencher.content/inserir'

export const ARQUIVO_CONTENT = '/content-scripts/preencher.js'

interface Aviso {
  titulo: string
  linha2?: string
  erro?: boolean
}

const mensagemDo = (erro: unknown) =>
  erro instanceof Error ? erro.message : String(erro)

export async function avisar(tabId: number, aviso: Aviso): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (a: Aviso) => {
      ;(globalThis as ComPv).__pv?.aviso(a)
    },
    args: [aviso],
  })
}

async function motivoDaRecusa(
  tabId: number,
): Promise<'proibida' | 'arquivo-sem-acesso'> {
  const aba = await browser.tabs.get(tabId)
  return aba.url?.startsWith('file:') ? 'arquivo-sem-acesso' : 'proibida'
}

export async function preencherPagina(
  tabId: number,
): Promise<RespostaPreencher> {
  const pessoa = await obterOuGerarPessoa()
  try {
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [ARQUIVO_CONTENT],
    })
    const resultados = await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (p: Pessoa, hoje: string) =>
        (globalThis as ComPv).__pv?.preencher(p, hoje) ?? null,
      args: [pessoa, hojeISO()],
    })
    const resumo = somarFrames(
      resultados.map(({ documentId, frameId, result }) => ({
        documentId,
        frameId,
        result,
      })),
    )
    if (resumo.contentType === 'application/pdf')
      return { ok: false, motivo: 'proibida' }
    await avisar(
      tabId,
      resumo.y === 0
        ? { titulo: AVISO_SEM_CAMPOS, erro: true }
        : {
            titulo: tituloPreenchimento(resumo.x, resumo.y),
            linha2: resumo.k > 0 ? linhaNaoReconhecidos(resumo.k) : undefined,
          },
    )
    return { ok: true, resumo }
  } catch (erro) {
    if (!erroEhPaginaProibida(mensagemDo(erro))) throw erro
    return { ok: false, motivo: await motivoDaRecusa(tabId) }
  }
}

async function avisarFalhaAoInserir(
  tabId: number,
  frameIdDoClique: number,
  motivo: MotivoFalhaInserir,
): Promise<void> {
  try {
    if (frameIdDoClique !== 0) {
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: [ARQUIVO_CONTENT],
      })
    }
    await avisar(tabId, { titulo: avisoFalhaInserir(motivo), erro: true })
  } catch (erro) {
    if (!erroEhPaginaProibida(mensagemDo(erro))) throw erro
  }
}

export async function inserirNoCampo(
  tabId: number,
  frameId: number,
  kind: FieldKind,
): Promise<void> {
  const pessoa = await obterOuGerarPessoa()
  let resultado: ResultadoInsercao | null | undefined
  try {
    await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [ARQUIVO_CONTENT],
    })
    const [injecao] = await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: (p: Pessoa, k: FieldKind) =>
        (globalThis as ComPv).__pv?.inserir(p, k) ?? null,
      args: [pessoa, kind],
    })
    resultado = injecao?.result
  } catch (erro) {
    if (!erroEhPaginaProibida(mensagemDo(erro))) throw erro
    if (frameId !== 0) await avisarFalhaAoInserir(tabId, frameId, 'iframe')
    return
  }
  if (resultado && !resultado.ok)
    await avisarFalhaAoInserir(tabId, frameId, resultado.motivo)
}

export async function mostrarCampo(
  tabId: number,
  documentId: string,
  idx: number,
): Promise<boolean> {
  try {
    const [resultado] = await browser.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      func: (i: number) => (globalThis as ComPv).__pv?.mostrar(i) ?? false,
      args: [idx],
    })
    return resultado?.result === true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Rodar e ver passar (o background inteiro)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/background; echo "exit=$?"
```

Esperado: `Test Files  3 passed`, `Tests  38 passed` (31 da fase 2 + 7 novos), `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/entrypoints/background/acoes.ts apps/extensao/src/entrypoints/background/acoes.test.ts \
  && /usr/bin/git commit -m "feat(extensao): avisos de falha do Inserir e da página sem campo, e Mostrar que não quebra"; echo "exit=$?"
```

---

### Task 7: 2ª passada contra a busca de CEP do site

**Files:**

- Create: `apps/extensao/src/entrypoints/preencher.content/segunda-passada.ts`, `segunda-passada.test.ts`
- Modify: `apps/extensao/src/entrypoints/preencher.content/preencher.ts`, `preencher.test.ts`
- Modify: `apps/extensao/src/entrypoints/preencher.content/api.ts`, `api.test.ts`

Muitos formulários chamam o ViaCEP no `input`/`blur` do CEP e sobrescrevem rua, bairro e **complemento** (o ViaCEP devolve "de 612 a 1510 - lado par" para 01310-100). `preencherDocumento` passa a avisar, por um callback opcional, cada campo que **escreveu** e leu de volta com sucesso (`{el, valor, lido}`); `__pv.preencher` junta esses campos e agenda, por `ctx.setTimeout(…, 1000)`, uma passada que regrava só os que mudaram desde a leitura. A comparação é com o valor **lido** logo depois da escrita (uma máscara que reformatou na hora não é "o site mudou"). A 2ª passada não mexe no `ResultadoFrame` já devolvido nem nos contornos, e os eventos dela são sintéticos (não tiram os contornos). Reinjetar invalida o `ctx`, que cancela a passada pendente da instância antiga.

**Interfaces:**

- Consumes: `escrever`, `type Campo` (fase 2, `dom.ts`); `preencherDocumento` (fase 2); `criarApi` (fase 2).
- Produces (**acréscimos**): em `segunda-passada.ts`: `interface Escrito { el: Campo; valor: string; lido: string }`, `SEGUNDA_PASSADA_MS = 1000`, `regravarAlterados(escritos: readonly Escrito[]): void`, `agendarSegundaPassada(escritos: readonly Escrito[], agendar: (acao: () => void, ms: number) => void): void`; `preencherDocumento(pessoa, hojeISO, registro, contornos, aoEscrever?: (escrito: Escrito) => void): ResultadoFrame` (5º parâmetro opcional; quem chama com 4 continua igual).

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/entrypoints/preencher.content/segunda-passada.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agendarSegundaPassada,
  regravarAlterados,
  SEGUNDA_PASSADA_MS,
  type Escrito,
} from './segunda-passada'

beforeEach(() => {
  document.body.innerHTML =
    '<input name="complemento"><input name="rua"><input name="cep">'
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const campo = (nome: string) =>
  document.querySelector(`[name="${nome}"]`) as HTMLInputElement

// Simula o que preencherDocumento entrega: o campo já escrito, com o valor lido logo depois.
function escrito(nome: string, valor: string): Escrito {
  campo(nome).value = valor
  return { el: campo(nome), valor, lido: campo(nome).value }
}

describe('regravarAlterados', () => {
  it('regrava o campo que o site mudou depois da nossa escrita, com os eventos de input', () => {
    const complemento = escrito('complemento', 'Apto 81')
    const ouvinte = vi.fn()
    campo('complemento').addEventListener('input', ouvinte)
    campo('complemento').value = 'de 612 a 1510 - lado par'
    regravarAlterados([complemento])
    expect(campo('complemento').value).toBe('Apto 81')
    expect(ouvinte).toHaveBeenCalledTimes(1)
  })

  it('não toca no campo que ficou como estava, nem dispara de novo a busca de CEP', () => {
    const cep = escrito('cep', '01310-100')
    const busca = vi.fn()
    campo('cep').addEventListener('input', busca)
    regravarAlterados([cep])
    expect(busca).not.toHaveBeenCalled()
  })

  it('compara com o valor lido, não com o escrito: máscara que reformatou na hora não conta como mudança', () => {
    campo('cep').value = '01310-100'
    const cep: Escrito = {
      el: campo('cep'),
      valor: '01310100',
      lido: '01310-100',
    }
    const busca = vi.fn()
    campo('cep').addEventListener('input', busca)
    regravarAlterados([cep])
    expect(busca).not.toHaveBeenCalled()
    expect(campo('cep').value).toBe('01310-100')
  })

  it('ignora campo que saiu da página ou ficou desabilitado', () => {
    const rua = escrito('rua', 'Avenida Paulista')
    const complemento = escrito('complemento', 'Apto 81')
    const ruaSolta = campo('rua')
    ruaSolta.value = 'outra'
    ruaSolta.remove()
    campo('complemento').value = 'outro'
    campo('complemento').disabled = true
    expect(() => regravarAlterados([rua, complemento])).not.toThrow()
    expect(ruaSolta.value).toBe('outra')
    expect(campo('complemento').value).toBe('outro')
  })
})

describe('agendarSegundaPassada', () => {
  it('agenda uma passada só, ~1 s depois', () => {
    vi.useFakeTimers()
    const complemento = escrito('complemento', 'Apto 81')
    agendarSegundaPassada([complemento], (acao, ms) => setTimeout(acao, ms))
    campo('complemento').value = 'de 612 a 1510 - lado par'
    vi.advanceTimersByTime(SEGUNDA_PASSADA_MS - 1)
    expect(campo('complemento').value).toBe('de 612 a 1510 - lado par')
    vi.advanceTimersByTime(1)
    expect(campo('complemento').value).toBe('Apto 81')
  })

  it('sem nada escrito não agenda nada', () => {
    const agendar = vi.fn()
    agendarSegundaPassada([], agendar)
    expect(agendar).not.toHaveBeenCalled()
  })
})
```

Em `apps/extensao/src/entrypoints/preencher.content/preencher.test.ts`, dentro do `describe('preencherDocumento', …)`, acrescente:

```ts
it('avisa cada campo que escreveu, com o valor lido logo depois; não avisa o que já estava certo nem o recusado', () => {
  campo('nome').value = P.nome.completo
  const escritos: { nome: string; valor: string; lido: string }[] = []
  preencherDocumento(
    P,
    HOJE,
    criarRegistro(),
    criarContornos((acao, ms) => setTimeout(acao, ms)),
    (e) => escritos.push({ nome: e.el.name, valor: e.valor, lido: e.lido }),
  )
  const cpfSoDigitos = P.cpf.replace(/\D/g, '')
  expect(escritos).toEqual([
    { nome: 'email', valor: P.email.endereco, lido: P.email.endereco },
    { nome: 'cpf', valor: cpfSoDigitos, lido: cpfSoDigitos },
  ])
})
```

Em `apps/extensao/src/entrypoints/preencher.content/api.test.ts`, acrescente no fim do arquivo:

```ts
describe('2ª passada do CEP', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<label>CEP <input name="cep"></label><label>Rua <input name="rua"></label><label>Complemento <input name="complemento"></label>'
  })

  afterEach(() => vi.useRealTimers())

  // Como um formulário que chama o ViaCEP no input do CEP e sobrescreve o complemento 200 ms depois.
  function simularBuscaDeCep() {
    const buscas = vi.fn()
    const cep = document.querySelector('[name="cep"]') as HTMLInputElement
    cep.addEventListener('input', () => {
      buscas()
      setTimeout(() => {
        ;(
          document.querySelector('[name="complemento"]') as HTMLInputElement
        ).value = 'de 612 a 1510 - lado par'
      }, 200)
    })
    return buscas
  }

  const complemento = () =>
    (document.querySelector('[name="complemento"]') as HTMLInputElement).value

  it('a busca do site troca o complemento e, ~1 s depois, a mesma instância devolve o da pessoa', () => {
    const buscas = simularBuscaDeCep()
    const resultado = criarApi(new ContentScriptContext('preencher')).preencher(
      P,
      HOJE,
    )
    const devolvido = structuredClone(resultado)
    vi.advanceTimersByTime(200)
    expect(complemento()).toBe('de 612 a 1510 - lado par')
    vi.advanceTimersByTime(800)
    expect(complemento()).toBe(P.endereco.complemento)
    expect(buscas).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual(devolvido)
  })

  it('reinjetar antes de 1 s cancela a 2ª passada da instância antiga', () => {
    simularBuscaDeCep()
    criarApi(new ContentScriptContext('preencher')).preencher(P, HOJE)
    vi.advanceTimersByTime(200)
    new ContentScriptContext('preencher')
    vi.advanceTimersByTime(800)
    expect(complemento()).toBe('de 612 a 1510 - lado par')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/segunda-passada.test.ts src/entrypoints/preencher.content/preencher.test.ts src/entrypoints/preencher.content/api.test.ts; echo "exit=$?"
```

Esperado: FAIL — `Failed to resolve import "./segunda-passada"`, o callback de `preencherDocumento` nunca é chamado, e o complemento fica com o texto do site; `exit=1`. O "reinjetar antes de 1 s cancela a 2ª passada" **passa** já agora (sem 2ª passada nada regrava): ele é a trava contra uma passada que sobreviva à reinjeção.

- [ ] **Step 3: Implementar**

`apps/extensao/src/entrypoints/preencher.content/segunda-passada.ts`:

```ts
import { escrever, type Campo } from './dom'

export interface Escrito {
  el: Campo
  valor: string
  lido: string
}

export const SEGUNDA_PASSADA_MS = 1000

export function regravarAlterados(escritos: readonly Escrito[]): void {
  for (const { el, valor, lido } of escritos) {
    if (el.isConnected && !el.disabled && el.value !== lido) escrever(el, valor)
  }
}

export function agendarSegundaPassada(
  escritos: readonly Escrito[],
  agendar: (acao: () => void, ms: number) => void,
): void {
  if (escritos.length > 0)
    agendar(() => regravarAlterados(escritos), SEGUNDA_PASSADA_MS)
}
```

Em `apps/extensao/src/entrypoints/preencher.content/preencher.ts`:

1. Acrescente aos imports:

```ts
import type { Escrito } from './segunda-passada'
```

2. Troque a assinatura de `preencherDocumento` por:

```ts
export function preencherDocumento(
  pessoa: Pessoa,
  hojeISO: string,
  registro: Registro,
  contornos: Contornos,
  aoEscrever?: (escrito: Escrito) => void,
): ResultadoFrame {
```

3. Dentro do `elementos.forEach`, troque o bloco `if (valor !== null && cabe(valor, d)) { … }` por:

```ts
if (valor !== null && cabe(valor, d)) {
  const escreveu = el.value !== valor
  if (escreveu) escrever(el, valor)
  if (leuDeVolta(el, valor)) {
    if (escreveu) aoEscrever?.({ el, valor, lido: el.value })
    resultado.preenchidos.push(linha)
    contornos.marcar(el, 'preenchido')
    return
  }
}
```

Em `apps/extensao/src/entrypoints/preencher.content/api.ts`:

1. Acrescente aos imports:

```ts
import { agendarSegundaPassada, type Escrito } from './segunda-passada'
```

2. Troque o método `preencher` do objeto devolvido por `criarApi` por:

```ts
    preencher(pessoa, hojeISO) {
      contornos.limpar()
      const escritos: Escrito[] = []
      ultimo = preencherDocumento(pessoa, hojeISO, registro, contornos, (escrito) => escritos.push(escrito))
      agendarSegundaPassada(escritos, (acao, ms) => ctx.setTimeout(acao, ms))
      if (window !== window.top) ctx.setTimeout(() => contornos.limpar(), LIMPEZA_NOS_FRAMES_FILHOS_MS)
      return ultimo
    },
```

- [ ] **Step 4: Rodar e ver passar (e o content script inteiro)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/segunda-passada.test.ts src/entrypoints/preencher.content/preencher.test.ts src/entrypoints/preencher.content/api.test.ts; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content; echo "exit=$?"
```

Esperado: `Tests  25 passed` no primeiro (segunda-passada 6, preencher 11, api 8); o content script inteiro verde no segundo; os dois `exit=0`.

- [ ] **Step 5: Lint, build e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
pnpm --filter @piluvitu/extensao build; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/entrypoints/preencher.content/segunda-passada.ts apps/extensao/src/entrypoints/preencher.content/segunda-passada.test.ts \
  apps/extensao/src/entrypoints/preencher.content/preencher.ts apps/extensao/src/entrypoints/preencher.content/preencher.test.ts \
  apps/extensao/src/entrypoints/preencher.content/api.ts apps/extensao/src/entrypoints/preencher.content/api.test.ts \
  && /usr/bin/git commit -m "feat(extensao): 2ª passada regrava o que a busca de CEP do site sobrescreveu"; echo "exit=$?"
```

---

### Task 8: E2E do popup: 1c com a mira, 1d (com e sem formulário) e 1e

**Files:**

- Modify: `apps/extensao/src/test/extensao.fixture.ts`
- Create: `apps/extensao/src/entrypoints/popup/retorno.e2e.ts`

O popup é aberto como aba com `?aba=<tabId>` (costura do build e2e). Para o 1e, a página fica em `http://outro.local`, que o build e2e **não** tem em `host_permissions`: o popup não enxerga a URL (abre no 1b, como a spec manda para URL desconhecida), e o "Preencher" recebe do Chrome `Cannot access contents of the page…`, que a fase 2 já classifica como página proibida. Como o `tabs.query({url})` não acha aba sem permissão, a fixture ganha `idDaAbaAtiva`. As variantes que o Playwright não alcança (`chrome://`, `file:` e PDF, cuja URL o popup só vê com o gesto real do activeTab) ficam no `App.test.tsx` (Task 5) e no checklist manual (Task 10).

**Interfaces:**

- Consumes: `test`, `expect`, `ORIGEM`, `servir`, `idDaAba`, `abrirPopup`, `pessoaGuardada` (fase 2, fixture); o popup das Tasks 2–5; o `mostrarCampo` da Task 6 e o `__pv.mostrar` da fase 2 (rola sem `smooth` e pisca).
- Produces (**acréscimos** na fixture): `idDaAbaAtiva(sw: Worker): Promise<number>`; `exigirPessoa(sw: Worker): Promise<Pessoa>` (lança se a extensão não guardou ninguém).

- [ ] **Step 1: Acrescentar os dois helpers à fixture**

No fim de `apps/extensao/src/test/extensao.fixture.ts`, acrescente:

```ts
export async function idDaAbaAtiva(sw: Worker): Promise<number> {
  const id = await sw.evaluate(
    async () =>
      (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
        ?.id,
  )
  if (id === undefined) throw new Error('nenhuma aba ativa')
  return id
}

export async function exigirPessoa(sw: Worker): Promise<Pessoa> {
  const pessoa = await pessoaGuardada(sw)
  if (!pessoa) throw new Error('a extensão não guardou nenhuma pessoa')
  return pessoa
}
```

- [ ] **Step 2: Escrever o E2E**

`apps/extensao/src/entrypoints/popup/retorno.e2e.ts`:

```ts
import type { Page } from '@playwright/test'
import {
  abrirPopup,
  exigirPessoa,
  expect,
  idDaAba,
  idDaAbaAtiva,
  ORIGEM,
  servir,
  test,
} from '../../test/extensao.fixture'

const OUTRA_ORIGEM = 'http://outro.local'

// O "Código de indicação" fica abaixo da dobra; a página guarda a cor do contorno a cada mudança no style dele.
const CADASTRO_LONGO = `<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8" />
  <title>Cadastro</title>
  <form>
    <label>Nome completo <input name="nome" /></label>
    <label>E-mail <input type="email" name="email" /></label>
    <label>CPF <input name="cpf" /></label>
    <label>CEP <input name="cep" /></label>
    <div style="height: 2000px"></div>
    <label>Código de indicação <input name="ref_code" placeholder="opcional" /></label>
    <label>Como nos conheceu? <select id="origem"><option value="">Selecione</option><option>Google</option><option>Amigo</option></select></label>
  </form>
  <script>
    window.coresDoContorno = []
    const indicacao = document.querySelector('[name="ref_code"]')
    new MutationObserver(() => window.coresDoContorno.push(getComputedStyle(indicacao).outlineColor)).observe(
      indicacao,
      { attributes: true, attributeFilter: ['style'] },
    )
  </script>
</html>`

// Três campos sem nada que o classificador conheça; a página conta quantos avisos a extensão montou.
const SEM_RECONHECER = `<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8" />
  <title>Interno</title>
  <form><input name="campo_x" /><input name="campo_y" /><input name="campo_z" /></form>
  <script>
    window.avisosMontados = 0
    new MutationObserver((mudancas) => {
      for (const mudanca of mudancas)
        for (const no of mudanca.addedNodes)
          if (no instanceof Element && (no.matches('piluvitu-aviso') || no.querySelector('piluvitu-aviso')))
            window.avisosMontados += 1
    }).observe(document.documentElement, { childList: true, subtree: true })
  </script>
</html>`

const SO_TEXTO =
  '<!doctype html><meta charset="utf-8"><title>Sobre</title><p>Só texto, sem formulário.</p>'

async function gerarEPreencher(popup: Page) {
  await popup.getByRole('button', { name: 'Gerar pessoa' }).click()
  await popup.getByRole('button', { name: /Preencher esta página/ }).click()
}

test('popup → 1c: X de Y, caminho e não reconhecidos; a mira rola a página e pisca o campo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/cadastro': { corpo: CADASTRO_LONGO } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/cadastro`)
  const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)

  await gerarEPreencher(popup)
  const pessoa = await exigirPessoa(sw)

  await expect(
    popup.getByRole('heading', { level: 1, name: '4 de 6 campos preenchidos' }),
  ).toBeVisible()
  await expect(
    popup.getByText(`/cadastro · com ${pessoa.nome.completo}`),
  ).toBeVisible()
  await expect(
    popup
      .getByRole('img', { name: '4 de 6 campos preenchidos' })
      .locator('span'),
  ).toHaveCount(6)
  await expect(popup.getByRole('listitem')).toHaveText([
    /Código de indicação\s*input\[name="ref_code"\]/,
    /Como nos conheceu\?\s*select#origem/,
  ])
  await expect(popup.locator('header .bg-ok')).toHaveCount(1)
  await expect(popup.getByRole('contentinfo')).toContainText('preenche de novo')
  await expect(popup.getByRole('button', { name: 'alterar' })).toHaveCount(0)

  const indicacaoNaTela = () =>
    aba.evaluate(() => {
      const r = document
        .querySelector('[name="ref_code"]')
        ?.getBoundingClientRect()
      return r !== undefined && r.top >= 0 && r.bottom <= window.innerHeight
    })
  expect(await indicacaoNaTela()).toBe(false)

  await popup
    .getByRole('button', { name: 'Mostrar na página: Código de indicação' })
    .click()
  await aba.bringToFront()
  await expect.poll(indicacaoNaTela).toBe(true)
  await expect
    .poll(() =>
      aba.evaluate(
        () =>
          (window as unknown as { coresDoContorno: string[] }).coresDoContorno,
      ),
    )
    .toContain('rgba(0, 0, 0, 0)')
})

test('nenhum campo reconhecido → 1d com pílula warn; "Tentar de novo" preenche outra vez; o warn fica no 1b', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/interno': { corpo: SEM_RECONHECER } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/interno`)
  const tabId = await idDaAba(sw, `${ORIGEM}/interno`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)
  const avisosMontados = () =>
    aba.evaluate(
      () => (window as unknown as { avisosMontados: number }).avisosMontados,
    )

  await gerarEPreencher(popup)
  const pessoa = await exigirPessoa(sw)

  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'Nenhum campo reconhecido nesta página',
    }),
  ).toBeVisible()
  await expect(
    popup.getByText(/Encontrei 3 campos, mas nenhum com/),
  ).toBeVisible()
  await expect(popup.locator('header .bg-warn')).toHaveCount(1)
  await expect(popup.getByRole('contentinfo')).toContainText(
    'preenche sem abrir',
  )
  await expect(popup.getByRole('button', { name: 'alterar' })).toHaveCount(0)
  await expect.poll(avisosMontados).toBe(1)

  await popup.getByRole('button', { name: 'Tentar de novo' }).click()
  await expect.poll(avisosMontados).toBe(2)
  await expect(aba.locator('piluvitu-aviso')).toHaveCount(1)
  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'Nenhum campo reconhecido nesta página',
    }),
  ).toBeVisible()

  await popup.getByRole('button', { name: 'Ver os dados' }).click()
  await expect(
    popup.getByRole('heading', { level: 1, name: pessoa.nome.completo }),
  ).toBeVisible()
  await expect(popup.locator('header .bg-warn')).toHaveCount(1)
})

test('página sem formulário → 1d "Nenhum formulário nesta página", com pílula warn', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/sobre': { corpo: SO_TEXTO } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/sobre`)
  const tabId = await idDaAba(sw, `${ORIGEM}/sobre`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)

  await gerarEPreencher(popup)

  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'Nenhum formulário nesta página',
    }),
  ).toBeVisible()
  await expect(
    popup.getByText(
      'Não achei campos de formulário visíveis. Formulários dentro de iframe de outro domínio ficam de fora.',
    ),
  ).toBeVisible()
  await expect(popup.locator('header .bg-warn')).toHaveCount(1)
})

test('Preencher numa página que o Chrome recusa → 1e sem rodapé; "Ver os dados" → 1b com Preencher desabilitado e cadeado', async ({
  context,
  sw,
  extensionId,
}) => {
  await context.route(`${OUTRA_ORIGEM}/**`, (rota) =>
    rota.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf" /></label>',
    }),
  )
  const aba = await context.newPage()
  await aba.goto(`${OUTRA_ORIGEM}/form`)
  await aba.bringToFront()
  const tabId = await idDaAbaAtiva(sw)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)

  await gerarEPreencher(popup)
  const pessoa = await exigirPessoa(sw)

  await expect(
    popup.getByRole('heading', {
      level: 1,
      name: 'O Chrome não deixa extensões mexerem nesta página',
    }),
  ).toBeVisible()
  await expect(
    popup.getByRole('button', { name: /Preencher esta página/ }),
  ).toBeDisabled()
  await expect(popup.getByRole('contentinfo')).toHaveCount(0)
  await expect(popup.locator('header svg[data-icon="lock"]')).toHaveCount(1)
  await expect(popup.getByText(pessoa.nome.completo)).toBeVisible()
  await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  await expect(aba.locator('piluvitu-aviso')).toHaveCount(0)

  await popup.getByRole('button', { name: 'Ver os dados' }).click()
  await expect(
    popup.getByRole('heading', { level: 1, name: pessoa.nome.completo }),
  ).toBeVisible()
  await expect(
    popup.getByRole('button', { name: /Preencher esta página/ }),
  ).toBeDisabled()
  await expect(popup.locator('header svg[data-icon="lock"]')).toHaveCount(1)
})
```

- [ ] **Step 3: Rodar o E2E novo e o do popup da fase 2**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && pnpm run build:e2e && ./node_modules/.bin/playwright test src/entrypoints/popup; echo "exit=$?"
```

Esperado: `5 passed` (os 4 novos + o `popup.e2e.ts` da fase 2, que agora termina no 1c), `exit=0`. Se o 1c mostrar outra contagem que não 4 de 6, rode o classificador da fase 1 sobre os mesmos rótulos antes de mexer na página: a página foi desenhada com rótulos que o laboratório classificou (`Nome completo`, `E-mail`, `CPF`, `CEP` reconhecidos; `Código de indicação` e `Como nos conheceu?` não).

- [ ] **Step 4: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/test/extensao.fixture.ts apps/extensao/src/entrypoints/popup/retorno.e2e.ts \
  && /usr/bin/git commit -m "test(extensao): E2E do retorno no popup (1c com a mira, 1d e 1e)"; echo "exit=$?"
```

---

### Task 9: E2E da 2ª passada do CEP e dos avisos de falha

**Files:**

- Create: `apps/extensao/src/entrypoints/preencher.content/segunda-passada.e2e.ts`
- Create: `apps/extensao/src/entrypoints/background/avisos.e2e.ts`

A página de endereço simula a busca de CEP do site com `setTimeout` de 200 ms, sobrescrevendo o complemento; a 2ª passada (~1 s) tem de devolver o da pessoa sem disparar outra busca. Os avisos de falha usam a mensagem `inserir` (costura e2e) e a `preencher`, mandadas por uma aba do popup que só serve de mensageira. O "iframe de outro domínio" não entra aqui: o Playwright não tem como saber o `frameId` de um iframe que a extensão não enxerga (ele fica no `acoes.test.ts` da Task 6 e no checklist manual da Task 10).

**Interfaces:**

- Consumes: `test`, `expect`, `ORIGEM`, `servir`, `idDaAba`, `abrirPopup`, `enviarMensagem` (fase 2); `idDaAbaAtiva`, `exigirPessoa` (Task 8); `RespostaPreencher` (fase 2).
- Produces: nenhum código de produção.

- [ ] **Step 1: Escrever o E2E da 2ª passada**

`apps/extensao/src/entrypoints/preencher.content/segunda-passada.e2e.ts`:

```ts
import type { RespostaPreencher } from '../../lib/mensagens'
import {
  abrirPopup,
  enviarMensagem,
  exigirPessoa,
  expect,
  idDaAba,
  ORIGEM,
  servir,
  test,
} from '../../test/extensao.fixture'

// Como um site que chama o ViaCEP no input do CEP: 200 ms depois, sobrescreve o complemento com o do ViaCEP.
const ENDERECO_COM_BUSCA = `<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8" />
  <title>Endereço</title>
  <form>
    <label>CEP <input name="cep" id="cep" /></label>
    <label>Rua <input name="logradouro" /></label>
    <label>Número <input name="numero" /></label>
    <label>Complemento <input name="complemento" /></label>
    <label>Bairro <input name="bairro" /></label>
    <label>Cidade <input name="cidade" /></label>
  </form>
  <script>
    window.buscas = 0
    window.siteSobrescreveu = false
    document.getElementById('cep').addEventListener('input', (evento) => {
      if (evento.target.value.replace(/[^0-9]/g, '').length !== 8) return
      window.buscas += 1
      setTimeout(() => {
        document.querySelector('[name="complemento"]').value = 'de 612 a 1510 - lado par'
        window.siteSobrescreveu = true
      }, 200)
    })
  </script>
</html>`

interface JanelaComBusca {
  buscas: number
  siteSobrescreveu: boolean
}

test('a busca de CEP do site sobrescreve o complemento e a 2ª passada devolve o da pessoa', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/endereco': { corpo: ENDERECO_COM_BUSCA } })
  const popup = await abrirPopup(context, extensionId)
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/endereco`)
  await aba.bringToFront()
  const tabId = await idDaAba(sw, `${ORIGEM}/endereco`)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher
  expect(resposta).toMatchObject({ ok: true, resumo: { x: 6, y: 6, k: 0 } })
  const pessoa = await exigirPessoa(sw)

  await expect
    .poll(() =>
      aba.evaluate(
        () => (window as unknown as JanelaComBusca).siteSobrescreveu,
      ),
    )
    .toBe(true)
  await expect(aba.locator('[name="complemento"]')).toHaveValue(
    pessoa.endereco.complemento,
  )
  await expect(aba.locator('[name="logradouro"]')).toHaveValue(
    pessoa.endereco.logradouro,
  )
  expect(
    await aba.evaluate(() => (window as unknown as JanelaComBusca).buscas),
  ).toBe(1)
})
```

- [ ] **Step 2: Escrever o E2E dos avisos de falha**

`apps/extensao/src/entrypoints/background/avisos.e2e.ts`:

```ts
import type { RespostaPreencher } from '../../lib/mensagens'
import {
  abrirPopup,
  enviarMensagem,
  expect,
  idDaAba,
  idDaAbaAtiva,
  ORIGEM,
  servir,
  test,
} from '../../test/extensao.fixture'

const SO_CPF =
  '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf" /></label>'
const SO_DIGITOS = `<!doctype html>
<meta charset="utf-8" />
<label>Código <input name="codigo" /></label>
<script>
  const codigo = document.querySelector('[name="codigo"]')
  codigo.addEventListener('input', () => {
    codigo.value = codigo.value.replace(/[^0-9]/g, '')
  })
</script>`
const SO_TEXTO =
  '<!doctype html><meta charset="utf-8"><p>Só texto, sem formulário.</p>'

test.describe('avisos de falha, sem popup', () => {
  test('Inserir sem campo em foco: "Não deu para inserir aqui: nenhum campo em foco"', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/so-cpf': { corpo: SO_CPF } })
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/so-cpf`)
    await aba.bringToFront()
    const tabId = await idDaAba(sw, `${ORIGEM}/so-cpf`)

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'cpf',
    })

    await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
      'Não deu para inserir aqui: nenhum campo em foco',
    )
    await expect(aba.locator('piluvitu-aviso .toast')).toHaveAttribute(
      'role',
      'alert',
    )
    await expect(aba.locator('piluvitu-aviso .linha2')).toHaveCount(0)
    await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  })

  test('Inserir num campo que desfaz o valor: "Não deu para inserir aqui: o campo recusou o valor"', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/so-digitos': { corpo: SO_DIGITOS } })
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/so-digitos`)
    await aba.bringToFront()
    const tabId = await idDaAba(sw, `${ORIGEM}/so-digitos`)
    await aba.locator('input[name="codigo"]').focus()

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'nomeCompleto',
    })

    await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
      'Não deu para inserir aqui: o campo recusou o valor',
    )
    await expect(aba.locator('input[name="codigo"]')).toHaveValue('')
  })

  test('Preencher numa página sem campo: "Nenhum campo nesta página", numa linha só', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/so-texto': { corpo: SO_TEXTO } })
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/so-texto`)
    await aba.bringToFront()
    const tabId = await idDaAba(sw, `${ORIGEM}/so-texto`)

    const resposta = (await enviarMensagem(popup, {
      tipo: 'preencher',
      tabId,
    })) as RespostaPreencher

    expect(resposta).toMatchObject({ ok: true, resumo: { x: 0, y: 0, k: 0 } })
    await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
      'Nenhum campo nesta página',
    )
    await expect(aba.locator('piluvitu-aviso .toast')).toHaveAttribute(
      'role',
      'alert',
    )
    await expect(aba.locator('piluvitu-aviso .linha2')).toHaveCount(0)
  })

  test('página que o Chrome recusa: nem Inserir nem Preencher deixam aviso, e o background responde', async ({
    context,
    sw,
    extensionId,
  }) => {
    await context.route('http://outro.local/**', (rota) =>
      rota.fulfill({ contentType: 'text/html; charset=utf-8', body: SO_CPF }),
    )
    const popup = await abrirPopup(context, extensionId)
    const aba = await context.newPage()
    await aba.goto('http://outro.local/form')
    await aba.bringToFront()
    const tabId = await idDaAbaAtiva(sw)
    await aba.locator('input[name="cpf"]').focus()

    await expect(
      enviarMensagem(popup, {
        tipo: 'inserir',
        tabId,
        frameId: 0,
        kind: 'cpf',
      }),
    ).resolves.toBeUndefined()
    const resposta = (await enviarMensagem(popup, {
      tipo: 'preencher',
      tabId,
    })) as RespostaPreencher

    expect(resposta).toEqual({ ok: false, motivo: 'proibida' })
    await expect(aba.locator('piluvitu-aviso')).toHaveCount(0)
    await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  })
})
```

- [ ] **Step 3: Rodar os dois E2E**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && pnpm run build:e2e && ./node_modules/.bin/playwright test src/entrypoints/preencher.content/segunda-passada.e2e.ts src/entrypoints/background/avisos.e2e.ts; echo "exit=$?"
```

Esperado: `5 passed`, `exit=0`.

- [ ] **Step 4: Provar que o E2E da 2ª passada mede de verdade (mutação desfeita)**

Sem agendar a 2ª passada, o complemento tem de ficar com o texto do site:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && cp src/entrypoints/preencher.content/segunda-passada.ts "$TMPDIR/segunda-passada.ts.bak" \
  && sed 's/escritos.length > 0/escritos.length < 0/' "$TMPDIR/segunda-passada.ts.bak" > src/entrypoints/preencher.content/segunda-passada.ts \
  && /usr/bin/grep -c 'escritos.length < 0' src/entrypoints/preencher.content/segunda-passada.ts; echo "mutou=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && pnpm run build:e2e && ./node_modules/.bin/playwright test src/entrypoints/preencher.content/segunda-passada.e2e.ts; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && cp "$TMPDIR/segunda-passada.ts.bak" src/entrypoints/preencher.content/segunda-passada.ts \
  && cmp src/entrypoints/preencher.content/segunda-passada.ts "$TMPDIR/segunda-passada.ts.bak" \
  && pnpm run build:e2e && ./node_modules/.bin/playwright test src/entrypoints/preencher.content/segunda-passada.e2e.ts; echo "exit=$?"
```

Esperado: `1` e `mutou=0` (a mutação entrou; se der `mutou=1`, o `sed` não achou o trecho e o passo não prova nada: confira o texto em `segunda-passada.ts`); depois `exit=1` (o `toHaveValue` do complemento estoura o tempo com "de 612 a 1510 - lado par"); por fim `exit=0`, com o arquivo idêntico ao original.

- [ ] **Step 5: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/extensao/src/entrypoints/preencher.content/segunda-passada.e2e.ts apps/extensao/src/entrypoints/background/avisos.e2e.ts \
  && /usr/bin/git commit -m "test(extensao): E2E da 2ª passada do CEP e dos avisos de falha"; echo "exit=$?"
```

---

### Task 10: Workflow `extensao-e2e.yml`, documentação, checklist manual e verificação final

**Files:**

- Create: `.github/workflows/extensao-e2e.yml`
- Modify: `CLAUDE.md` (raiz), `apps/extensao/CLAUDE.md`

O E2E da extensão ganha workflow próprio, fora do `CI`: o `deploy-financas.yml` só deploya quando o workflow `CI` inteiro passa, e um E2E que nunca rodou no Linux não pode segurar esse deploy. O workflow também roda quando ele próprio muda e pode ser disparado à mão.

**Interfaces:**

- Consumes: o script `test:e2e` do `apps/extensao/package.json` (fase 2: `build && build:e2e && playwright test`); tudo das Tasks 1–9.
- Produces: o workflow `Extensão E2E`; documentação.

- [ ] **Step 1: Criar o workflow**

`.github/workflows/extensao-e2e.yml`:

```yaml
name: Extensão E2E

on:
  push:
    branches: [main]
    paths:
      - 'apps/extensao/**'
      - 'packages/tools/**'
      - '.github/workflows/extensao-e2e.yml'
  pull_request:
    branches: [main]
    paths:
      - 'apps/extensao/**'
      - 'packages/tools/**'
      - '.github/workflows/extensao-e2e.yml'
  workflow_dispatch:

concurrency:
  group: extensao-e2e-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

# Fora do workflow `CI` de propósito: o deploy do finanças espera o `CI` inteiro
# passar, e este E2E (extensão desempacotada no Chromium do Playwright) não pode
# segurar esse deploy.
jobs:
  e2e:
    name: Extensão (Playwright, extensão desempacotada)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # Sem o headless shell: ele não carrega extensão (o teste usa channel: 'chromium').
      - name: Chromium do Playwright
        run: pnpm --filter @piluvitu/extensao exec playwright install --with-deps --no-shell chromium

      - name: E2E (build de produção + build e2e + Playwright)
        run: pnpm --filter @piluvitu/extensao run test:e2e

      - name: Rastros do Playwright
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-extensao
          path: apps/extensao/test-results/
          if-no-files-found: ignore
          retention-days: 7
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && actionlint .github/workflows/extensao-e2e.yml; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && python3 -c "import yaml; d = yaml.safe_load(open('.github/workflows/extensao-e2e.yml')); print(d['name'], sorted(d['jobs']), d[True]['push']['paths'])"; echo "exit=$?"
```

Esperado: `actionlint` sem saída e `exit=0`; `Extensão E2E ['e2e'] ['apps/extensao/**', 'packages/tools/**', '.github/workflows/extensao-e2e.yml']` e `exit=0` (o PyYAML lê a chave `on:` como `True`).

- [ ] **Step 2: `CLAUDE.md` da raiz**

Na tabela "Workflows GitHub Actions", na célula "Faz o quê" da linha `ci.yml`, troque ``O E2E da extensão roda fora do `CI` (`make test-e2e-extensao`).`` por:

```markdown
O E2E da extensão roda fora do `CI`, no workflow `extensao-e2e.yml`.
```

Na mesma tabela, logo depois da linha do `ci.yml`, acrescente:

```markdown
| `extensao-e2e.yml` | push/PR em `main` que toca `apps/extensao/**`, `packages/tools/**` ou o próprio workflow + dispatch | Instala o Chromium do Playwright (`--with-deps --no-shell`) e roda o `test:e2e` da extensão: build de produção, build `--mode e2e` e Playwright com a extensão desempacotada. Fica fora do `CI` de propósito: o deploy do finanças espera o `CI` passar, e este E2E não pode segurá-lo. |
```

- [ ] **Step 3: `apps/extensao/CLAUDE.md`**

1. Na seção "Estrutura", troque a linha `src/entrypoints/popup/            React + @piluvitu/ui (1a e 1b nesta fase)` por:

```
src/entrypoints/popup/            React + @piluvitu/ui (estados 1a–1e; a tela sai de src/lib/estado-popup.ts)
```

2. Na seção "Fluxos", no item **Preencher (modo A)**, troque a frase `Com Y = 0 não há aviso nesta fase (a fase 3 acrescenta "Nenhum campo nesta página").` por:

```markdown
Com Y = 0 o aviso vira o de falha, de uma linha: "Nenhum campo nesta página".
```

3. Na seção "Fluxos", logo depois do item **Inserir (modo B)**, acrescente:

```markdown
- **Retorno no popup (1c, 1d, 1e):** a tela é uma função pura de `src/lib/estado-popup.ts`. Ao abrir, a URL decide sozinha o 1e (sem injetar nada); depois do "Preencher", a `RespostaPreencher` decide: `ok: false` → 1e (PDF e recusas do Chrome só aparecem aqui); X + recusados ≥ 1 → 1c; senão 1d (Y = 0 usa o texto "sem formulário"). A tela `dados` é o 1a ou o 1b, conforme exista pessoa. A pílula mostra o estado da **página**: cadeado se proibida (inclusive no 1b aberto do 1e, com "Preencher" desabilitado), warn depois de preencher com X = 0 (inclusive depois de "Ver os dados"), ok no resto. Os recusados são contados pelo sufixo `SUFIXO_RECUSADO` que `somarFrames` põe no rótulo. Resposta `undefined` (o background registrou um erro inesperado) deixa o popup onde está.
- **Mira do 1c ("Mostrar na página" pelo popup):** a mira manda `{tipo: 'mostrar', tabId, documentId, idx}`; o background chama `__pv.mostrar(idx)` só naquele documento, **sem reinjetar** (reinjetar apagaria o registro de campos). O rolar e o pisco são os do item "Mostrar na página (`__pv.mostrar(idx)`)" acima, os mesmos do texto âmbar do aviso. Documento que já não existe (a página navegou) devolve `false`, sem erro.
- **2ª passada do CEP:** sites que chamam o ViaCEP no `input`/`blur` do CEP sobrescrevem rua, bairro e **complemento** depois que preenchemos. `preencherDocumento` avisa cada campo que **escreveu** (`{el, valor, lido}`) e `__pv.preencher` agenda, por `ctx.setTimeout(…, 1000)`, `regravarAlterados`: regrava só o que mudou desde a leitura (comparar com o valor lido, e não com o escrito, evita tomar uma máscara síncrona por mudança e disparar outra busca), ignorando campo solto ou desabilitado. Não muda X, Y, k, o 1c nem o aviso. Reinjetar invalida o `ctx` e cancela a passada pendente. Campos que só habilitam depois da busca continuam fora (v1.1).
- **Falhas sem popup:** aviso de uma linha no frame 0 (`__pv.aviso({titulo, erro: true})`, marca âmbar, `role="alert"`, sem 2ª linha). Inserir: `sem-foco` e `recusado` vêm do `ResultadoInsercao`; recusa do Chrome no frame do clique que não é o topo vira "iframe de outro domínio" (o frame 0 é injetado antes do aviso); recusa no próprio topo é página proibida e **não avisa nada** (sem badge). Erro que não é recusa do Chrome sobe, como antes.
```

4. Na seção "Testes", depois do item do **Playwright**, acrescente:

```markdown
- **No GitHub**, o E2E roda no workflow próprio `.github/workflows/extensao-e2e.yml` (paths `apps/extensao/**`, `packages/tools/**` e o próprio workflow), fora do `CI`, que só tem lint + Vitest + build da extensão. O que o Playwright não alcança fica no checklist manual: a URL de `chrome://`, `file:` e do leitor de PDF (o popup só a enxerga com o gesto real do activeTab) e o Inserir num iframe de outro domínio (o Playwright não sabe o `frameId` de um frame que a extensão não vê).
```

5. No fim da seção "Checklist manual", acrescente os itens:

```markdown
7. **1c e a mira:** na página do item 2, preencher pelo popup → "21 de 23 campos preenchidos" e a lista com `input[name="ref_code"]` e `select#origem`; a mira de "Código de indicação" rola a página até o campo e o contorno âmbar pisca.
8. **1d:** abrir `http://localhost:8019/` (a listagem do `http.server`, sem formulário) → pelo popup, "Nenhum formulário nesta página" com a pílula em warn; pelo `Alt+Shift+P`, o aviso de uma linha "Nenhum campo nesta página".
9. **1e:** abrir o popup em `chrome://settings` → 1e com cadeado, sem rodapé e com "Preencher" desabilitado; "Ver os dados" → 1b com "Preencher" desabilitado e o cadeado. Num PDF aberto no leitor do Chrome, o "Preencher" leva ao 1e. Em `chrome://settings`, o `Alt+Shift+P` não faz nada (nem aviso, nem badge).
10. **`file:`:** abrir `apps/extensao/src/entrypoints/preencher.content/cadastro.pagina.html` direto do disco com "Permitir acesso a URLs de arquivo" desligado → popup no 1e "Falta liberar o acesso a arquivos"; ligar a opção nos detalhes da extensão em `chrome://extensions`, reabrir o popup → 1b, e o "Preencher" funciona.
11. **Inserir em iframe de outro domínio:** na página do item 2, rodar no console `document.body.prepend(Object.assign(document.createElement('iframe'), { src: 'http://127.0.0.1:8019/cadastro.pagina.html', style: 'width: 600px; height: 300px' }))`, clicar com o botão direito num campo dentro do iframe → `Inserir › CPF` → aviso "Não deu para inserir aqui: iframe de outro domínio" no topo da página.
12. **Busca de CEP de verdade:** num formulário que consulta o ViaCEP (o de staging de um projeto, por exemplo), preencher e conferir, 1 s depois, que o complemento é o "Apto …" da pessoa, e não o texto do ViaCEP.
```

- [ ] **Step 4: Conferir que a documentação não neutraliza o gate**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && pnpm run build; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && cp src/styles.css "$TMPDIR/styles.css.bak" \
  && /usr/bin/grep -v "@source '../../../packages/ui/src'" "$TMPDIR/styles.css.bak" > src/styles.css \
  && /usr/bin/wc -l "$TMPDIR/styles.css.bak" src/styles.css \
  && pnpm run build; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && cp "$TMPDIR/styles.css.bak" src/styles.css && cmp src/styles.css "$TMPDIR/styles.css.bak"; echo "exit=$?"
```

Esperado: `exit=0`; depois o `wc -l` com exatamente uma linha a menos no `styles.css` que no backup (prova de que o `grep -v` tirou só o `@source` e não gravou lixo) e `exit=1` (o gate ainda acusa `@source` quebrado com o `CLAUDE.md` novo na árvore); depois `exit=0` (o `cmp` confirma o arquivo idêntico ao original).

- [ ] **Step 5: Verificação final da fase**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
pnpm --filter @piluvitu/extensao test; echo "exit=$?"
pnpm --filter @piluvitu/extensao build; echo "exit=$?"
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
pnpm --filter @piluvitu/extensao test:e2e; echo "exit=$?"
pnpm --filter @piluvitu/tools lint; echo "exit=$?"
pnpm --filter @piluvitu/tools test; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && actionlint .github/workflows/extensao-e2e.yml .github/workflows/ci.yml; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/extensao && node -e "
const assert = require('node:assert')
const indice = require('./storybook-static/index.json')
const titulos = new Set(Object.values(indice.entries).filter((e) => e.type === 'story').map((e) => e.title))
for (const t of ['Popup/1a · Primeiro uso', 'Popup/1b · Pessoa pronta', 'Popup/1c · Resultado', 'Popup/1d · Nenhum campo', 'Popup/1e · Página proibida', 'Página/1f · Aviso']) assert.ok(titulos.has(t), 'falta o estado ' + t)
console.log('todos os estados do design têm story')
"; echo "exit=$?"
/usr/bin/git status --short; echo "exit=$?"
```

Esperado: todos `exit=0`; Vitest com todas as suítes verdes; E2E `21 passed` (os 12 da fase 2, contados no Step 6 da Task 16 dela, + 4 do retorno + 1 da 2ª passada + 4 dos avisos); `todos os estados do design têm story`; `git status` só com o workflow e os dois `CLAUDE.md` (nada de `.output`, `.wxt` ou `storybook-static`; os planos em `docs/superpowers/plans/` também aparecem se ainda não tiverem sido commitados, e isso não é defeito desta fase). Guarde a saída real desses comandos para o resumo ao dono (regra global: apresentar o output dos testes).

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add .github/workflows/extensao-e2e.yml CLAUDE.md apps/extensao/CLAUDE.md \
  && /usr/bin/git commit -m "ci(extensao): workflow próprio do E2E, e o retorno documentado com o checklist manual"; echo "exit=$?"
```

- [ ] **Step 7: Critério de pronto da fase**

A fase está pronta quando o Step 5 está verde: todos os estados do design (1a–1f) têm story e E2E, e lint + test + build + e2e passam. Os itens 7 a 12 do checklist manual do `apps/extensao/CLAUDE.md` exigem o Chrome do dono (o gesto real do activeTab, `chrome://`, `file:`, PDF e iframe de outro domínio); quem executa o plano por agente os registra como pendentes de verificação manual no resumo, com os comandos exatos do checklist.
