# Botaí: termos de uso em `/termos` e revisão da política de privacidade (`apps/botai-site`) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Botaí ganha termos de uso em `https://botai.pilutech.com.br/termos` e a política de `https://botai.pilutech.com.br/privacidade` passa a cobrir o que a LGPD pede, em linguagem simples, sem afirmar nada que o código não sustenta e sem dizer que o Botaí já está nas lojas (ele ainda está "Em breve"). Os dois documentos ficam no domínio do projeto e aparecem no rodapé, no sitemap, no JSON-LD, nos textos das lojas e no README.

**Decisões do dono (2026-10-02):** os dois documentos moram no domínio do projeto; responsável: só "PiluTech" + `pilutechinformatica@gmail.com` (sem razão social nem CNPJ); foro dos termos: comarca de Teresina/PI, ressalvado o foro do domicílio do consumidor quando o CDC se aplicar. Grafias: "Botaí" na UI, `botai` no técnico, "Powered by PiluTech".

**Architecture:** As duas páginas usam uma moldura nova, `components/documento.tsx` (topo com o voltar, cabeçalho com rótulo, `h1`, "Em vigor desde" e resumo, corpo `prose`, rodapé), que tira a duplicação e dá a elas uma story (o Storybook do app só lê `components/**`). O texto continua no `page.tsx` de cada rota, fonte única (o da AMO se copia da página). O JSON-LD de trilha vira uma função genérica. Testes Jest travam o texto, e alguns leem arquivos do `apps/botai` (manifesto, `loja/textos.md`, `LICENSE`) para a política não divergir do código; um teste no `apps/botai` trava, do lado da extensão, o que a política promete (sem rede, uma chave de storage).

**Tech Stack:** Next.js 16.3.8 (App Router, metadata files), React 19.2, TypeScript strict, Tailwind 4 + `@tailwindcss/typography`, `@piluvitu/ui`, Jest 30 + Testing Library, Storybook 10.3.1 (`@storybook/nextjs`, porta 6019), Playwright 1.59.1 + `axe-core` (porta 3020); no `apps/botai`, Vitest.

## Global Constraints

- **Branch e escopo:** `feat/botai-termos`, já em checkout. Nunca troque de branch, nunca dê push, nunca toque `/Users/piluvitu/PILUTECH/Sombrai`.
- **Wrapper `rtk`:** falsifica a saída de `git`, `grep`, `diff`, `find`, `ls`, `prettier`, `jest` e `vitest`. Use `/usr/bin/git`, `/usr/bin/grep`, `/usr/bin/find`, `/bin/ls` e os binários de `node_modules/.bin`, terminando com `; echo "exit=$?"`, e julgue pelo exit code.
- **Next 16:** confira APIs em `apps/botai-site/node_modules/next/dist/docs/` (`01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md` e `sitemap.md`). `page.tsx` só exporta `default`, `metadata` e os campos de rota: constantes da página ficam sem `export` (o type check do build recusa campo desconhecido).
- **Portas:** landing 3020, Storybook 6019. Antes do E2E: `lsof -nP -iTCP:3020 -sTCP:LISTEN`; processo que você não subiu, não mate: pare e reporte. Playwright com `CI=1`.
- **`next dev`/`next start` podem anexar regras de agente ao `CLAUDE.md` do app ou criar `AGENTS.md`:** confira `/usr/bin/git status` antes de cada commit e descarte o que eles geraram.
- **Lei de comentários (CLAUDE.md raiz):** em produção, só com as três condições, 1 a 3 linhas. Teste é livre.
- **Colocation:** teste e story ao lado do fonte; E2E `.e2e.ts` ao lado da rota.
- **Texto honesto ("Em breve"):** nenhum texto das páginas diz "disponível" nem "publicado nas lojas". Os termos falam da extensão "distribuída pela PiluTech, pelas lojas de extensões ou pelo código-fonte", o que vale antes e depois das lojas.
- **Data de vigência:** `2026-10-02` nas duas páginas. Se o merge escorregar para outro dia, troque a data (as duas páginas, os testes e os E2E) no último commit: a data é a de quando o texto passa a valer.
- **Nomes de link repetidos:** o rodapé tem "Privacidade" e "Termos de uso", e o corpo das páginas tem "política de privacidade" e "termos de uso". No Testing Library o nome é exato e sensível a maiúsculas; no Playwright é substring sem distinção de maiúsculas: lá, sempre `exact: true` e escopo (`getByRole('contentinfo')`, `getByRole('region', …)`).
- **Commits:** `tipo(escopo): descrição em pt-BR`, um por tarefa, cada um com typecheck, lint e testes verdes. O pre-commit roda o `lint-staged` (pode reformatar; confira `git status` depois).
- **Comandos (de `apps/botai-site`):** Jest `./node_modules/.bin/jest <caminho>`; typecheck `./node_modules/.bin/tsc --noEmit`; lint `./node_modules/.bin/eslint .`; build `pnpm build`; E2E `CI=1 pnpm test:e2e`; Storybook `pnpm build-storybook`. No `apps/botai`: `./node_modules/.bin/vitest run <caminho>` (rode `./node_modules/.bin/wxt prepare` antes se `.wxt/` não existir).

---

## 1. Auditoria (sem mudar código)

### 1.1 O que a extensão (`apps/botai`) trata de verdade

| Fato                                                                                                                                                                                                                                                                                                    | Evidência                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Permissões: `activeTab`, `scripting`, `contextMenus`, `storage` e, só no Firefox, `menus`. Nenhuma `host_permissions` em produção (só no build `--mode e2e`, para `http://teste.local/*`).                                                                                                              | `apps/botai/wxt.config.ts:59-66` e `:75`; manifestos gerados em `apps/botai/.output/chrome-mv3/manifest.json` e `firefox-mv3/manifest.json`; travado por `apps/botai/manifesto.e2e.ts:20-22` e `:102-103`                |
| No Firefox o manifesto declara que não coleta dados: `data_collection_permissions: { required: ['none'] }`.                                                                                                                                                                                             | `apps/botai/wxt.config.ts:54`                                                                                                                                                                                            |
| Toda permissão do manifesto tem justificativa em `loja/textos.md`.                                                                                                                                                                                                                                      | `apps/botai/manifesto.e2e.ts:108-116`; `apps/botai/loja/textos.test.ts:57-69`                                                                                                                                            |
| Storage: uma chave só, `local:botai_pessoa` (a pessoa fictícia inteira, `version: 1`), gerada com entropia do `crypto`. Nada em `sync:`.                                                                                                                                                                | `apps/botai/src/lib/armazenamento.ts:7-19`; `grep` de `'(local\|sync\|session\|managed):` em `src/` (fora de testes) só acha essa                                                                                        |
| Rede: nenhuma chamada a servidor. Não há `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` nem `EventSource` em `src/` (fora de testes). Nos builds, os únicos `fetch` são do WXT e do Vite e leem arquivos do próprio pacote (o CSS do aviso por `runtime.getURL` e o preload de módulos do popup). | `grep` em `apps/botai/src` (exit 1, nenhum resultado); `apps/botai/.output/opera-mv3/content-scripts/preencher.js:440` e `:511`; `apps/botai/.output/opera-mv3/chunks/popup-Dk7-Z2SM.js:46`                              |
| Sites que ela abre, só por clique: a caixa pública `https://tuamaeaquelaursa.com/<usuário>` numa aba (a API do serviço nunca é chamada), `https://pilutech.com.br` e a página de atalhos do navegador.                                                                                                  | `packages/tools/src/nome.ts:129` e `:144`; `apps/botai/src/entrypoints/background/ouvintes.ts:40-43`; `apps/botai/src/entrypoints/popup/App.tsx:31`, `:37-47`, `:105`, `:107`                                            |
| O que ela lê da aba: os campos do formulário (no content script, só no gesto) e a URL da aba ativa (para decidir se pode agir e para a mensagem de recusa), o `contentType` do documento (PDF) e a marca do navegador (`userAgentData`), tudo local.                                                    | `apps/botai/src/entrypoints/popup/use-aba-alvo.ts:20` e `:23`; `apps/botai/src/entrypoints/background/acoes.ts:68`; `apps/botai/src/entrypoints/preencher.content/preencher.ts:41`; `apps/botai/src/lib/navegador.ts:12` |
| Copiar um dado no popup só escreve na área de transferência.                                                                                                                                                                                                                                            | `apps/botai/src/entrypoints/popup/App.tsx:174`                                                                                                                                                                           |
| Nenhum analytics, nenhum código remoto; o background só registra ouvintes (nada abre aba na instalação).                                                                                                                                                                                                | `apps/botai/package.json` (sem SDK de analytics); `apps/botai/src/entrypoints/background/index.ts:12-23`                                                                                                                 |
| Cartão: só os números de teste documentados pela Stripe.                                                                                                                                                                                                                                                | `packages/tools/src/cartao.ts:6-12`                                                                                                                                                                                      |
| O código é MIT, © PiluTech.                                                                                                                                                                                                                                                                             | `apps/botai/LICENSE:1-3`                                                                                                                                                                                                 |
| Ainda "Em breve": as 4 URLs de loja estão vazias no CMS.                                                                                                                                                                                                                                                | `apps/web/content/pilulabs/botai/index.yaml:18-21`                                                                                                                                                                       |

### 1.2 O que a landing (`apps/botai-site`) faz

| Fato                                                                                                                                                                                                                        | Evidência                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hospedagem: projeto próprio na Vercel. A Vercel registra IP, localização derivada do IP e dados do sistema de quem visita, e atua como **operadora** do cliente (a PiluTech é a controladora); pode processar fora do país. | `apps/botai-site/CLAUDE.md`, seção "Deploy"; política da Vercel (https://vercel.com/legal/privacy-policy, em vigor desde 2026-06-01)                                                                            |
| Sem analytics: nenhuma dependência de analytics; a spec da landing a exclui.                                                                                                                                                | `apps/botai-site/package.json` (dependências); `docs/superpowers/plans/2026-10-02-botai-landing.md`, Global Constraints, "Fora (spec §10)"                                                                      |
| Sem cookies: o app não define cookie e não tem `middleware.ts`/`proxy.ts`.                                                                                                                                                  | `grep` de `cookie` em `app/ components/ lib/` só acha o texto da política; `find` sem middleware/proxy                                                                                                          |
| `localStorage`: só a escolha de tema do `next-themes`, chave `theme`.                                                                                                                                                       | `apps/botai-site/components/tema-provider.tsx:9-14`; `apps/botai-site/node_modules/next-themes/dist/index.mjs` (`storageKey` padrão `"theme"`)                                                                  |
| Nenhum recurso de terceiro ao carregar: fontes por `next/font` (servidas pelo próprio site), imagens próprias; o HTML só tem links de navegação para fora.                                                                  | `apps/botai-site/app/layout.tsx:9-18`; `.next/server/app/index.html` e `privacidade.html` (só `href` para o próprio domínio, `pilutech.com.br` e GitHub); nenhum `fonts.gstatic`/`googleapis` no `.next/static` |
| Links externos (só navegação): "Powered by PiluTech" e o histórico no GitHub.                                                                                                                                               | `apps/botai-site/components/rodape.tsx:9-14`; `apps/botai-site/app/privacidade/page.tsx:16-17`                                                                                                                  |

### 1.3 A política atual (`apps/botai-site/app/privacidade/page.tsx`)

**Certo e sustentado pelo código:** responsável e e-mail (`:84-89`); o que a extensão acessa e quando (`:91-113`); o que fica guardado, em `storage.local`, sem sincronizar (`:115-122`); os sites que ela abre por clique (`:132-156`); o aviso de dados fictícios que podem ser de alguém (`:158-164`); a tabela das 5 permissões, `menus` só no Firefox (`:19-50`, `:166-186`); como apagar (`:192-196`); histórico das versões (`:198-206`).

**Afirmações que o código não sustenta (ou sustenta pela metade):**

1. `:127-128` "todo o código está no pacote **publicado nas lojas**": o Botaí ainda não está em loja nenhuma (`apps/web/content/pilulabs/botai/index.yaml:18-21`). Trocar por "no pacote da extensão".
2. `:129` "**Na Firefox Add-ons**, ele declara que não coleta dados": quem declara é o manifesto (`wxt.config.ts:54`), e a listagem na AMO não existe ainda. Trocar por "No Firefox, o próprio pacote declara que não coleta dados".
3. `:188-189` "não lê histórico, **abas**, favoritos nem cookies": ele lê a URL da aba ativa (`use-aba-alvo.ts:20`, `acoes.ts:68`), o que a própria política diz em `:101-102`. Trocar por "não lê o histórico, outras abas, favoritos nem cookies".
4. `:126` "não faz requisições de rede": sustentado no efeito (os únicos `fetch` leem arquivos do próprio pacote, item 1.1), mas "não faz requisições a servidor nenhum" é exato.
5. `:76-80` o resumo ("o Botaí não coleta nem envia dados") vale para a extensão; a página também é a política do site, que tem logs da hospedagem e o tema no `localStorage`, e não fala deles.

**O que falta para a LGPD (arts. 9º, 14, 18, 19 e 33), em linguagem simples:**

- **Responsável e canal:** existe, mas sem dizer que é o canal para pedidos sobre dados pessoais (a PiluTech é ME e pode ser agente de pequeno porte, dispensada de encarregado pela Resolução CD/ANPD nº 2/2022, desde que ofereça um canal; o texto só nomeia o canal, sem afirmar o enquadramento).
- **Dados tratados e não tratados, finalidade e base legal (art. 7º):** a extensão não leva nada à PiluTech (sem base legal a declarar, e isso precisa ser dito); o site tem registros de acesso na Vercel (legítimo interesse, art. 7º, IX); o suporte por e-mail trata endereço, nome e mensagem (legítimo interesse e, nos pedidos de titular, obrigação legal, art. 7º, II); o tema fica só no navegador.
- **Compartilhamento e transferência internacional (art. 33):** Vercel (hospedagem) e Google (Gmail do suporte), as duas operadoras, possivelmente fora do Brasil; a PiluTech não vende nem cede dados.
- **Retenção:** de cada dado (a pessoa, até "Nova pessoa" ou remover; tema, até limpar o site; logs, o prazo da Vercel; e-mails, enquanto o atendimento precisar ou até pedirem para apagar).
- **Direitos do art. 18 e como exercer:** a lista, o e-mail, o prazo de até 15 dias (art. 19, II), a oposição ao legítimo interesse (art. 18, §2º) e a reclamação à ANPD (art. 18, §1º).
- **Segurança:** nada a vazar de servidor; a pessoa fica no perfil do navegador, sem criptografia própria; o site só em HTTPS; código aberto.
- **Crianças e adolescentes (art. 14):** público de devs; nada coletado de ninguém.
- **Mudanças e vigência:** a data vira "Em vigor desde", e a política promete mudar antes de a extensão coletar qualquer coisa.

**Coerência com a AMO:** `apps/botai/loja/textos.md:90-92` manda copiar o texto renderizado da página. A página nova continua a fonte única; a seção "Este site" deixa claro que os logs são do site, não da extensão (um revisor da AMO compara a política com o `data_collection_permissions: none`). `textos.md:33`, `:59` e `:67-73` continuam verdadeiros com o texto novo. O `textos.test.ts` não muda de regra; ganha os testes dos termos (Tarefa 6).

### 1.4 O que os termos de uso precisam dizer

Aceitação; o que é o Botaí (sem dizer que está nas lojas); a licença MIT do código (`apps/botai/LICENSE`) e a regra de que, sobre os direitos no código, vale a MIT (os termos tratam de condutas e do uso da extensão e do site, não restringem copiar, modificar e distribuir); para que serve (só desenvolver, testar e demonstrar, com dados fictícios; ele escreve por cima do que estiver nos campos); o que é proibido (falsidade ideológica, falsa identidade e estelionato, arts. 299, 307 e 171 do Código Penal; cadastro, conta, compra ou crédito reais; burlar verificação de identidade, antifraude e limites de cadastro; SMS, ligação ou birô de crédito com dado gerado; cartão de teste fora do modo de teste; envio em massa); dados que podem ser de alguém (sem faixa reservada; CEP e rua reais); a caixa pública de terceiro (`tuamaeaquelaursa.com`), sem garantia; sem garantia; limite de responsabilidade dentro do que a lei permite, sem afastar o CDC nem a responsabilidade por dolo; marcas de terceiros (Chrome/Chrome Web Store, Firefox, Microsoft Edge, Opera, Stripe e os demais nomes citados na landing: React, Vue, jQuery, Pagar.me); privacidade; mudanças e fim do serviço; lei brasileira, foro de Teresina/PI ressalvado o domicílio do consumidor (CDC, art. 101, I) e cláusulas independentes; contato; data de vigência.

### 1.5 Onde linkar `/termos`

| Lugar                                       | Como                                                                                                                                                           | Tarefa |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Rodapé (landing, `/privacidade`, `/termos`) | `nav` "Documentos" com "Privacidade" e "Termos de uso"                                                                                                         | 4      |
| Seção "Cuidados" da landing                 | link "Termos de uso", como o "Política de privacidade" da seção ao lado                                                                                        | 4      |
| `/privacidade`                              | "termos de uso" em "Dados fictícios e pessoas reais"                                                                                                           | 3      |
| Sitemap                                     | `/termos`                                                                                                                                                      | 2      |
| Metadata                                    | `title`, `description` (140–160), canonical `/termos`, Open Graph e Twitter próprios                                                                           | 2      |
| Imagens OG e Twitter                        | `app/termos/opengraph-image.tsx` e `twitter-image.tsx`                                                                                                         | 2      |
| JSON-LD                                     | `BreadcrumbList` Botaí › Termos de uso                                                                                                                         | 2      |
| Build                                       | `ROTAS` de `scripts/conferir-rotas-estaticas.mjs`                                                                                                              | 2      |
| `apps/botai/loja/textos.md`                 | "Descrição" e "Endereços" (Chrome, Edge e Opera não têm campo para termos)                                                                                     | 6      |
| `apps/botai/loja/README.md`                 | na AMO, **não** preencher o campo EULA (o Firefox tirou o aceite de EULA na instalação, bug 1497087; a licença é a MIT, já declarada); o link vai na descrição | 6      |
| `apps/botai/README.md`                      | seção "Privacidade e termos", antes de "Licença", e um item em "Cuidados"                                                                                      | 6      |

Fora: o popup da extensão (não tem rede nem página de texto; o `homepage_url` já leva ao site) e o `apps/web` (o caminho `/pilulabs/botai/termos` nunca existiu, não há 308 a criar).

---

## Riscos e pontos para o dono (não bloqueiam o plano)

1. **Identificação só como "PiluTech":** a LGPD pede a "identificação do controlador" (art. 9º, III). Uma marca sem razão social pode ser lida como identificação insuficiente. A decisão está tomada; registre que, se a Chrome Web Store exigir a declaração de Trader (README do Botaí, "Publicação", passo 3), a razão social e o endereço aparecem lá de qualquer jeito.
2. **Marco Civil, art. 15:** provedor de aplicação constituído como pessoa jurídica, com fins econômicos, guarda registros de acesso por 6 meses. O texto proposto não promete prazo (diz "o prazo da Vercel"); se o enquadramento valer, o prazo da Vercel no plano contratado pode não bastar. Decisão do dono, de preferência com advogado.
3. **Transferência internacional (art. 33):** o texto informa Vercel e Google fora do Brasil; o mecanismo (cláusulas dos contratos delas) não é afirmado.
4. **Revisão jurídica:** os textos abaixo seguem a lei como a entendo, mas não substituem a leitura de um advogado antes da publicação nas lojas.

## Review Focus

1. **Afirmação sem lastro:** nenhum texto diz "disponível" nem "publicado nas lojas"; "outras abas"; "a servidor nenhum". Testes: `app/privacidade/page.test.tsx` e `app/termos/page.test.tsx` (Tarefas 2 e 3), `lib/seo.test.ts` (Tarefa 2).
2. **Cadeia manifesto ↔ `loja/textos.md` ↔ política:** a tabela de permissões da política é a lista justificada em `textos.md` (que o `manifesto.e2e.ts` já amarra ao manifesto), e "no Firefox o pacote declara que não coleta" lê o `wxt.config.ts`. Teste: `app/privacidade/page.test.tsx` (Tarefa 3). Do lado da extensão, sem rede e uma chave de storage: `apps/botai/loja/textos.test.ts` (Tarefa 6).
3. **O que a política diz do site:** nenhuma requisição a outro host, nenhum cookie, só `theme` no `localStorage`. Teste: `app/privacidade/privacidade.e2e.ts` (Tarefa 5).
4. **320 px:** rodapé com o `nav` novo, `dl` da política e URLs (as externas viram texto descritivo, nunca a URL crua como texto do link). Testes: E2E das duas rotas e o axe a 320 px do `app/seo.e2e.ts` (Tarefa 5).
5. **MIT × termos:** a seção "A licença do código" diz que, sobre os direitos no código, vale a MIT, e as proibições tratam de condutas. Teste: `app/termos/page.test.tsx` (Tarefa 2).

## Mapa de arquivos

**Novos (`apps/botai-site/`):** `components/documento.tsx` (+ `.test.tsx`, `.stories.tsx`); `app/termos/page.tsx` (+ `page.test.tsx`), `app/termos/termos.e2e.ts`, `app/termos/opengraph-image.tsx`, `app/termos/twitter-image.tsx`.

**Modificados (`apps/botai-site/`):** `lib/conteudo.ts` (+ teste), `lib/json-ld.ts` (+ teste), `lib/seo.ts` (+ teste), `app/sitemap.ts` (+ teste), `scripts/conferir-rotas-estaticas.mjs`, `app/privacidade/page.tsx` (+ teste, + E2E), `components/rodape.tsx` (+ teste, story inalterada), `components/landing.tsx` (+ teste), `app/seo.e2e.ts`, `CLAUDE.md`.

**Modificados (`apps/botai/`):** `loja/textos.md`, `loja/textos.test.ts`, `loja/README.md`, `README.md`, `CLAUDE.md`.

---

### Tarefa 1: Moldura `Documento`, utilitários de conteúdo e a trilha genérica do JSON-LD

A `/privacidade` passa a usar a moldura, sem mudar o texto ainda (a data e o rótulo "Em vigor desde" mudam na Tarefa 3, junto com o texto).

**Files:**

- Create: `components/documento.tsx`, `components/documento.test.tsx`, `components/documento.stories.tsx`
- Modify: `lib/conteudo.ts`, `lib/conteudo.test.ts`, `lib/json-ld.ts`, `lib/json-ld.test.ts`, `app/privacidade/page.tsx`

**Interfaces:**

- Produces: `Documento({ rotulo, titulo, vigencia, resumo, children })`, com o rótulo fixo "Em vigor desde"; `Vigencia = { iso: string; texto: string }`; `REPOSITORIO`, `URL_DA_LICENCA`, `DOCUMENTOS`, `historicoDe(arquivo)`; `jsonLdDaTrilha(siteUrl, { nome, caminho })` (substitui `jsonLdDaPrivacidade`).

- [ ] **Step 1: Testes que falham**

`lib/conteudo.test.ts`, acrescente:

```ts
import {
  DOCUMENTOS,
  historicoDe,
  REPOSITORIO,
  URL_DA_LICENCA,
} from './conteudo'

describe('documentos e código-fonte', () => {
  it('o histórico de um arquivo do site no GitHub', () => {
    expect(historicoDe('app/privacidade/page.tsx')).toBe(
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/privacidade/page.tsx',
    )
  })

  // Os termos dizem que o código é MIT: o link e o arquivo têm de bater.
  it('a licença citada nos termos é o LICENSE MIT do Botaí', () => {
    expect(URL_DA_LICENCA).toBe(`${REPOSITORIO}/blob/main/apps/botai/LICENSE`)
    const licenca = readFileSync(
      join(__dirname, '..', '..', 'botai', 'LICENSE'),
      'utf8',
    )
    expect(licenca).toMatch(/^MIT License\n\nCopyright \(c\) \d{4} PiluTech\n/)
  })

  it('o rodapé leva à privacidade e aos termos, nessa ordem', () => {
    expect(DOCUMENTOS).toEqual([
      { href: '/privacidade', rotulo: 'Privacidade' },
      { href: '/termos', rotulo: 'Termos de uso' },
    ])
  })
})
```

`lib/json-ld.test.ts`: troque o import `jsonLdDaPrivacidade` por `jsonLdDaTrilha` e o bloco `describe('jsonLdDaPrivacidade', …)` por:

```ts
describe('jsonLdDaTrilha', () => {
  it.each([
    ['/privacidade', 'Política de privacidade'],
    ['/termos', 'Termos de uso'],
  ])('a trilha Botaí › %s', (caminho, nome) => {
    expect(jsonLdDaTrilha(SITE, { nome, caminho })).toEqual({
      '@context': CONTEXTO,
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Botaí', item: `${SITE}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: nome,
          item: `${SITE}${caminho}`,
        },
      ],
    })
  })
})
```

`components/documento.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { Documento } from './documento'

function renderizar() {
  return render(
    <Documento
      rotulo="~/pilulabs/botai/termos"
      titulo="Termos de uso do Botaí"
      vigencia={{ iso: '2026-10-02', texto: '2 de outubro de 2026' }}
      resumo="o resumo."
    >
      <h2>Primeira seção</h2>
      <p>Corpo.</p>
    </Documento>,
  )
}

describe('Documento', () => {
  it('rótulo, h1, a data de vigência numa <time> e o resumo', () => {
    renderizar()
    expect(screen.getByText('~/pilulabs/botai/termos')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Termos de uso do Botaí',
    )
    const data = screen.getByText('2 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-02')
    expect(data.parentElement).toHaveTextContent(
      'Em vigor desde 2 de outubro de 2026',
    )
    expect(screen.getByText('Em resumo:').parentElement).toHaveTextContent(
      'Em resumo: o resumo.',
    )
  })

  it('o corpo fica no article, dentro do main', () => {
    renderizar()
    const artigo = within(screen.getByRole('main')).getByRole('article')
    expect(
      within(artigo).getByRole('heading', { level: 2, name: 'Primeira seção' }),
    ).toBeInTheDocument()
  })

  it('o voltar leva à landing, e o rodapé fecha a página', () => {
    renderizar()
    expect(screen.getByRole('link', { name: 'Botaí' })).toHaveAttribute(
      'href',
      '/',
    )
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest lib/conteudo lib/json-ld components/documento; echo "exit=$?"` → FAIL (`historicoDe`/`jsonLdDaTrilha` não exportados, `Cannot find module './documento'`), `exit=1`.

- [ ] **Step 2: Implementação**

`lib/conteudo.ts`, depois de `EMAIL_DE_SUPORTE`:

```ts
export const REPOSITORIO = 'https://github.com/PiluVitu/PiluVitu-Dev'
export const URL_DA_LICENCA = `${REPOSITORIO}/blob/main/apps/botai/LICENSE`

export const DOCUMENTOS = [
  { href: '/privacidade', rotulo: 'Privacidade' },
  { href: '/termos', rotulo: 'Termos de uso' },
]

export function historicoDe(arquivo: string): string {
  return `${REPOSITORIO}/commits/main/apps/botai-site/${arquivo}`
}
```

`lib/json-ld.ts`: troque `jsonLdDaPrivacidade` por:

```ts
export type PaginaDaTrilha = { nome: string; caminho: string }

export function jsonLdDaTrilha(
  siteUrl: string,
  pagina: PaginaDaTrilha,
): NoJsonLd {
  return {
    '@context': CONTEXTO,
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: NOME,
        item: urlAbsoluta('/', siteUrl),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: pagina.nome,
        item: urlAbsoluta(pagina.caminho, siteUrl),
      },
    ],
  }
}
```

`components/documento.tsx` (o markup é o do cabeçalho e do corpo da `/privacidade` de hoje, com "Em vigor desde"):

```tsx
import type { ReactNode } from 'react'
import { NOME } from '@/lib/conteudo'
import { Rodape } from './rodape'
import { Topo } from './topo'

export type Vigencia = { iso: string; texto: string }

type DocumentoProps = {
  rotulo: string
  titulo: string
  vigencia: Vigencia
  resumo: ReactNode
  children: ReactNode
}

export function Documento({
  rotulo,
  titulo,
  vigencia,
  resumo,
  children,
}: DocumentoProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-10">
      <Topo voltar={{ href: '/', rotulo: NOME }} />
      <main className="mt-12">
        <article>
          <header className="border-border flex flex-col gap-4 border-b pb-8">
            <p className="text-primary font-mono text-sm break-all">{rotulo}</p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              {titulo}
            </h1>
            <p className="text-muted-foreground font-mono text-xs">
              Em vigor desde{' '}
              <time dateTime={vigencia.iso}>{vigencia.texto}</time>
            </p>
            <p className="bg-accent-soft border-accent-line rounded-lg border p-4 text-pretty">
              <strong>Em resumo:</strong> {resumo}
            </p>
          </header>
          <div className="prose prose-neutral dark:prose-invert prose-a:text-primary prose-code:before:content-none prose-code:after:content-none mt-10 max-w-none">
            {children}
          </div>
        </article>
      </main>
      <Rodape />
    </div>
  )
}
```

`components/documento.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Documento } from './documento'

const meta = {
  title: 'Landing/Documento',
  component: Documento,
  parameters: { layout: 'fullscreen' },
  args: {
    rotulo: '~/pilulabs/botai/termos',
    titulo: 'Termos de uso do Botaí',
    vigencia: { iso: '2026-10-02', texto: '2 de outubro de 2026' },
    resumo:
      'o Botaí é grátis, de código aberto (MIT) e serve só para testar software com dados fictícios.',
    children: (
      <>
        <h2>Aceitação</h2>
        <p>
          Estes termos valem para quem instala ou usa a extensão Botaí e para
          quem usa este site.
        </p>
        <h2>O que é proibido</h2>
        <ul>
          <li>se passar por outra pessoa;</li>
          <li>fazer cadastro real em serviços em produção.</li>
        </ul>
        <h3>Uma subseção</h3>
        <dl>
          <dt>Para quê</dt>
          <dd>Entregar as páginas.</dd>
        </dl>
      </>
    ),
  },
} satisfies Meta<typeof Documento>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
```

`app/privacidade/page.tsx`: troque o `<div>…</div>` externo, o `Topo`, o `main`/`article`/`header` e o `Rodape` pelo `Documento`, mantendo o texto e a data de hoje; o `JsonLd` passa a `jsonLdDaTrilha(urlDoSite(), { nome: 'Política de privacidade', caminho: '/privacidade' })` e o histórico a `historicoDe('app/privacidade/page.tsx')`. Até a Tarefa 3, o `page.test.tsx` segue verde (ele não testa o rótulo da data).

- [ ] **Step 3: Verde**

Run: `./node_modules/.bin/jest; echo "exit=$?"` → PASS, `exit=0`. `./node_modules/.bin/tsc --noEmit; echo "exit=$?"` → `exit=0`. `./node_modules/.bin/eslint .; echo "exit=$?"` → `exit=0`.

- [ ] **Step 4: Commit**

`/usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): moldura Documento para as páginas de texto e a trilha genérica do JSON-LD"; echo "exit=$?"`

---

### Tarefa 2: `/termos`, com metadata, imagens OG e Twitter, JSON-LD, sitemap e rota estática

**Files:**

- Create: `app/termos/page.tsx`, `app/termos/page.test.tsx`, `app/termos/opengraph-image.tsx`, `app/termos/twitter-image.tsx`
- Modify: `lib/seo.ts`, `lib/seo.test.ts`, `app/sitemap.ts`, `app/sitemap.test.ts`, `scripts/conferir-rotas-estaticas.mjs`

**Interfaces:**

- Consumes: `Documento`, `jsonLdDaTrilha`, `historicoDe`, `URL_DA_LICENCA`, `EMAIL_DE_SUPORTE`, `NOME` (Tarefa 1).
- Produces: rota estática `/termos`; `TITULO_DOS_TERMOS`, `DESCRICAO_DOS_TERMOS`; `/termos/opengraph-image` e `/termos/twitter-image`.

- [ ] **Step 1: Testes que falham**

`lib/seo.test.ts`: importe `TITULO_DOS_TERMOS` e `DESCRICAO_DOS_TERMOS`; acrescente ao `describe('textos de busca')`:

```ts
it('os termos têm título e descrição próprios', () => {
  expect(TITULO_DOS_TERMOS).toBe('Termos de uso do Botaí')
  expect(DESCRICAO_DOS_TERMOS.length).toBeGreaterThanOrEqual(140)
  expect(DESCRICAO_DOS_TERMOS.length).toBeLessThanOrEqual(160)
})
```

e some `TITULO_DOS_TERMOS` e `DESCRICAO_DOS_TERMOS` à lista do teste "nenhum texto de busca diz que já está disponível".

`app/sitemap.test.ts`:

```ts
it('lista /, /privacidade e /termos, no domínio de produção', () => {
  expect(sitemap()).toEqual([
    { url: 'https://botai.pilutech.com.br/' },
    { url: 'https://botai.pilutech.com.br/privacidade' },
    { url: 'https://botai.pilutech.com.br/termos' },
  ])
})
```

`app/termos/page.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import TermosPage from './page'

describe('/termos', () => {
  beforeEach(() => {
    render(<TermosPage />)
  })

  it('o título e a data de vigência', () => {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Termos de uso do Botaí',
    )
    const data = screen.getByText('2 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-02')
  })

  it('as seções, na ordem', () => {
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Aceitação',
      'O que é o Botaí',
      'A licença do código',
      'Para que serve',
      'O que é proibido',
      'Dados que podem ser de alguém',
      'A caixa de e-mail pública',
      'Sem garantia',
      'Limite de responsabilidade',
      'Marcas de terceiros',
      'Privacidade',
      'Mudanças',
      'Lei e foro',
      'Contato',
    ])
  })

  // Review Focus 5: os termos não podem tirar o que a MIT dá sobre o código.
  it('a MIT, com o link para o LICENSE, vale sobre o código', () => {
    expect(screen.getByRole('link', { name: 'licença MIT' })).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/blob/main/apps/botai/LICENSE',
    )
    expect(document.body).toHaveTextContent(
      'Se algum trecho destes termos parecer limitar o que a MIT permite fazer com o código, vale a MIT.',
    )
  })

  it('as proibições pedidas pelo dono', () => {
    const itens = within(screen.getByRole('list', { name: 'Proibições' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
      .join('\n')
    expect(itens).toMatch(/falsidade ideológica/)
    expect(itens).toMatch(/cadastro, conta, compra/)
    expect(itens).toMatch(/verificação de identidade/)
    expect(itens).toMatch(/SMS/)
  })

  it('foro de Teresina/PI, com a ressalva do CDC', () => {
    expect(document.body).toHaveTextContent('comarca de Teresina/PI')
    expect(document.body).toHaveTextContent(
      'propor a ação no foro do próprio domicílio (CDC, art. 101, I)',
    )
  })

  it('as marcas de terceiros, com os titulares', () => {
    for (const titular of [
      'Google LLC',
      'Mozilla Foundation',
      'Microsoft Corporation',
      'Opera Norway AS',
      'Stripe, Inc.',
    ])
      expect(document.body).toHaveTextContent(titular)
  })

  it('privacidade, contato e histórico', () => {
    for (const link of screen.getAllByRole('link', {
      name: 'política de privacidade',
    }))
      expect(link).toHaveAttribute('href', '/privacidade')
    expect(
      screen.getByRole('link', { name: 'pilutechinformatica@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:pilutechinformatica@gmail.com')
    expect(
      screen.getByRole('link', { name: 'histórico do código-fonte do site' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/termos/page.tsx',
    )
  })

  // O Botaí ainda está "Em breve": o texto vale antes e depois das lojas.
  it('não diz que já está nas lojas', () => {
    expect(document.body).not.toHaveTextContent(
      /dispon[ií]vel|publicad[oa] nas lojas/i,
    )
  })
})
```

Run: `./node_modules/.bin/jest lib/seo app/sitemap app/termos; echo "exit=$?"` → FAIL, `exit=1`.

- [ ] **Step 2: Implementação**

`lib/seo.ts`, depois de `DESCRICAO_DA_PRIVACIDADE`:

```ts
export const TITULO_DOS_TERMOS = 'Termos de uso do Botaí'
export const DESCRICAO_DOS_TERMOS =
  'Termos de uso do Botaí: dados fictícios só para teste, o que é proibido (fraude, cadastro real, burlar verificação), a licença MIT, garantias e o foro.'
```

(151 caracteres, contados com `[...texto].length`.)

`app/sitemap.ts`:

```ts
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: urlAbsoluta('/') },
    { url: urlAbsoluta('/privacidade') },
    { url: urlAbsoluta('/termos') },
  ]
}
```

`scripts/conferir-rotas-estaticas.mjs`, em `ROTAS`, depois de `'/privacidade/twitter-image'`: `'/termos'`, `'/termos/opengraph-image'`, `'/termos/twitter-image'`.

`app/termos/opengraph-image.tsx`:

```tsx
import { imagemOg } from '@/lib/imagem-og'

export { contentType, size } from '@/lib/imagem-og'
export const alt = 'Termos de uso do Botaí: dados fictícios, só para teste'

export default function Image() {
  return imagemOg({
    rotulo: '~/pilulabs/botai/termos',
    titulo: 'Termos de uso',
    subtitulo: 'Botaí: dados fictícios, só para teste',
  })
}
```

`app/termos/twitter-image.tsx`: `export { alt, contentType, default, size } from './opengraph-image'`.

`app/termos/page.tsx` (o texto proposto):

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Documento } from '@/components/documento'
import { JsonLd } from '@/components/json-ld'
import {
  EMAIL_DE_SUPORTE,
  historicoDe,
  NOME,
  URL_DA_LICENCA,
} from '@/lib/conteudo'
import { jsonLdDaTrilha } from '@/lib/json-ld'
import {
  DESCRICAO_DOS_TERMOS,
  metadataDaPagina,
  TITULO_DOS_TERMOS,
} from '@/lib/seo'
import { urlDoSite } from '@/lib/site'

// Data em texto pronto: formatar "2026-10-02" em BRT mostraria 1º de outubro.
const VIGENCIA = { iso: '2026-10-02', texto: '2 de outubro de 2026' }

export const metadata: Metadata = metadataDaPagina({
  caminho: '/termos',
  titulo: TITULO_DOS_TERMOS,
  descricao: DESCRICAO_DOS_TERMOS,
})

export default function TermosPage() {
  return (
    <>
      <JsonLd
        dados={jsonLdDaTrilha(urlDoSite(), {
          nome: 'Termos de uso',
          caminho: '/termos',
        })}
      />
      <Documento
        rotulo="~/pilulabs/botai/termos"
        titulo={TITULO_DOS_TERMOS}
        vigencia={VIGENCIA}
        resumo={
          <>
            o {NOME} é grátis, de código aberto (MIT) e serve só para testar
            software com dados fictícios. Não use os dados para fraude, cadastro
            real nem para burlar verificação de identidade. Ele vem sem
            garantia, e quem usa responde pelo uso que faz.
          </>
        }
      >
        <h2>Aceitação</h2>
        <p>
          Estes termos valem para quem instala ou usa a extensão {NOME} e para
          quem usa este site. Ao instalar ou usar, você concorda com eles e com
          a <Link href="/privacidade">política de privacidade</Link>. Se não
          concordar, não instale nem use.
        </p>

        <h2>O que é o {NOME}</h2>
        <p>
          O {NOME} é uma extensão gratuita para Chrome, Edge, Opera e Firefox,
          feita pela PiluTech. Ele gera os dados fictícios de uma pessoa
          brasileira de teste e os escreve nos campos de um formulário quando
          você pede, pelo ícone, pelo atalho ou pelo menu do botão direito.
          Estes termos tratam da extensão distribuída pela PiluTech, pelas lojas
          de extensões ou pelo código-fonte, e deste site.
        </p>

        <h2>A licença do código</h2>
        <p>
          O código do {NOME} é aberto, sob a{' '}
          <a href={URL_DA_LICENCA} target="_blank" rel="noopener noreferrer">
            licença MIT
          </a>
          : você pode usar, copiar, modificar e distribuir o código, inclusive
          para fins comerciais, desde que mantenha o aviso de copyright e o da
          licença. Estes termos não tiram nenhum desses direitos. Se algum
          trecho destes termos parecer limitar o que a MIT permite fazer com o
          código, vale a MIT.
        </p>
        <p>
          A MIT cobre o código. Ela não autoriza ninguém a se apresentar como a
          PiluTech nem a distribuir uma versão modificada como se fosse o {NOME}{' '}
          oficial.
        </p>

        <h2>Para que serve</h2>
        <p>
          O {NOME} serve para desenvolver, testar e demonstrar software: em
          localhost, em homologação e em outros ambientes de teste. Todos os
          dados que ele gera são fictícios. Confira o formulário antes de
          enviar: o {NOME} escreve por cima do que já estiver nos campos.
        </p>

        <h2>O que é proibido</h2>
        <p>Você não pode usar o {NOME} nem os dados que ele gera para:</p>
        <ul aria-label="Proibições">
          <li>
            se passar por outra pessoa ou criar uma identidade falsa, o que pode
            ser crime (falsidade ideológica, falsa identidade e estelionato,
            arts. 299, 307 e 171 do Código Penal);
          </li>
          <li>
            fazer cadastro, conta, compra, pedido de crédito ou qualquer
            contratação real em serviços em produção, como bancos, lojas,
            operadoras e órgãos públicos;
          </li>
          <li>
            burlar verificação de identidade, sistemas antifraude ou limites de
            cadastro, como os de período de teste gratuito;
          </li>
          <li>
            mandar SMS, fazer ligação ou consultar birôs de crédito com um CPF,
            um CNPJ ou um celular gerado;
          </li>
          <li>
            tentar pagar com o cartão de teste fora do modo de teste de um meio
            de pagamento;
          </li>
          <li>
            enviar formulários em massa, spam ou cadastros automáticos a sites
            de terceiros sem autorização;
          </li>
          <li>
            qualquer outra coisa que viole a lei ou direitos de terceiros.
          </li>
        </ul>
        <p>
          Essas proibições tratam do que você faz com a extensão e com os dados,
          não dos direitos sobre o código.
        </p>

        <h2>Dados que podem ser de alguém</h2>
        <p>
          Os CPFs, CNPJs e celulares são gerados ao acaso, com dígitos
          verificadores válidos. Não existe faixa reservada para teste, então um
          número gerado pode pertencer a uma pessoa ou a uma empresa de verdade.
          Se isso acontecer, não use o número para contatar, consultar nem
          cadastrar ninguém. Os CEPs e as ruas são reais, para passar nas buscas
          de CEP; o número da casa e o resto da pessoa são inventados.
        </p>

        <h2>A caixa de e-mail pública</h2>
        <p>
          O e-mail gerado usa o domínio <code>tuamaeaquelaursa.com</code>, uma
          caixa de entrada pública de terceiro, que a PiluTech não controla.
          Qualquer pessoa que souber o endereço lê as mensagens. O serviço pode
          mudar, sair do ar ou apagar mensagens a qualquer momento, sem aviso, e
          a PiluTech não garante que ele entregue nada. Nunca use esse e-mail
          para conta real, recuperação de senha ou dado sensível.
        </p>

        <h2>Sem garantia</h2>
        <p>
          O {NOME} é gratuito e vem como está. A PiluTech se esforça para que
          ele funcione, mas não garante que ele reconheça todos os campos, que
          funcione em todo site ou versão de navegador, que os dados passem em
          toda validação nem que continue recebendo atualizações. Sites, lojas e
          navegadores mudam, e o {NOME} pode deixar de funcionar em algum deles.
        </p>

        <h2>Limite de responsabilidade</h2>
        <p>Dentro do que a lei permite, a PiluTech não responde por:</p>
        <ul>
          <li>danos causados por uso fora do que estes termos permitem;</li>
          <li>
            dados enviados a sistemas em produção, a cadastros reais ou a
            serviços de terceiros;
          </li>
          <li>
            o uso de um CPF, um CNPJ ou um celular gerado que pertença a alguém;
          </li>
          <li>
            valores que o {NOME} escreveu por cima do que já estava nos campos;
          </li>
          <li>
            o conteúdo, o funcionamento ou as regras de sites de terceiros, como
            a caixa de e-mail pública e as lojas de extensões;
          </li>
          <li>lucros cessantes e danos indiretos.</li>
        </ul>
        <p>
          Nada nestes termos afasta a responsabilidade por dolo nem os direitos
          que a lei garante e que um contrato não pode afastar, como os do
          Código de Defesa do Consumidor, quando ele se aplicar.
        </p>

        <h2>Marcas de terceiros</h2>
        <p>
          Chrome e Chrome Web Store são marcas da Google LLC; Firefox, da
          Mozilla Foundation; Microsoft Edge, da Microsoft Corporation; Opera,
          da Opera Norway AS; Stripe, da Stripe, Inc. Esses e os demais nomes de
          produtos citados neste site (React, Vue, jQuery, Pagar.me e outros)
          pertencem aos seus titulares e aparecem só para dizer onde e com o que
          o {NOME} funciona. Nenhum deles patrocina, endossa ou tem vínculo com
          o {NOME} ou com a PiluTech. O cartão de teste é o que a Stripe
          documenta para o modo de teste dela.
        </p>

        <h2>Privacidade</h2>
        <p>
          Como a extensão e este site tratam dados está na{' '}
          <Link href="/privacidade">política de privacidade</Link>. Em resumo: a
          extensão não coleta nem envia nada.
        </p>

        <h2>Mudanças</h2>
        <p>
          A PiluTech pode mudar estes termos. A versão em vigor é a desta
          página, a partir da data no topo; as anteriores ficam no{' '}
          <a
            href={historicoDe('app/termos/page.tsx')}
            target="_blank"
            rel="noopener noreferrer"
          >
            histórico do código-fonte do site
          </a>
          . A PiluTech também pode mudar, suspender ou encerrar a extensão e o
          site a qualquer momento; o código continua sob a MIT.
        </p>

        <h2>Lei e foro</h2>
        <p>
          Estes termos seguem as leis do Brasil. Fica eleito o foro da comarca
          de Teresina/PI para qualquer questão sobre eles, ressalvado o direito
          de quem for consumidor, quando o Código de Defesa do Consumidor se
          aplicar, de propor a ação no foro do próprio domicílio (CDC, art. 101,
          I). Se uma cláusula for considerada inválida, as demais continuam
          valendo.
        </p>

        <h2>Contato</h2>
        <p>
          Dúvidas sobre estes termos:{' '}
          <a href={`mailto:${EMAIL_DE_SUPORTE}`}>{EMAIL_DE_SUPORTE}</a>.
        </p>
      </Documento>
    </>
  )
}
```

Notas:

- "O que é o {NOME}" vira o texto "O que é o Botaí" no `h2` (o teste compara o `textContent`).
- Nenhuma URL crua como texto de link (a 320 px ela vazaria); `tuamaeaquelaursa.com` vai em `<code>`, que é curto, e a regra `wrap-anywhere` da política não é necessária aqui.

- [ ] **Step 3: Verde**

Run: `./node_modules/.bin/jest; echo "exit=$?"` → `exit=0`; `./node_modules/.bin/tsc --noEmit; echo "exit=$?"` → `exit=0`; `./node_modules/.bin/eslint .; echo "exit=$?"` → `exit=0`; `pnpm build; echo "exit=$?"` → `exit=0` (o `conferir-rotas-estaticas.mjs` acha `/termos` e as duas imagens como estáticas; o gate do `@source` passa). Confira `/usr/bin/git status`: nada de `AGENTS.md` nem bloco novo no `CLAUDE.md`.

- [ ] **Step 4: Commit**

`/usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): termos de uso em /termos, com SEO, imagens OG e trilha no JSON-LD"; echo "exit=$?"`

---

### Tarefa 3: Política de privacidade completa para a LGPD, sem afirmar o que o código não sustenta

**Files:**

- Modify: `app/privacidade/page.tsx`, `app/privacidade/page.test.tsx`, `lib/seo.ts` (`DESCRICAO_DA_PRIVACIDADE`)

**Interfaces:**

- Consumes: `Documento`, `historicoDe`, `REPOSITORIO`, `EMAIL_DE_SUPORTE`, `NOME`, `jsonLdDaTrilha`.
- Produces: 15 seções `h2`; 5 `h3` em "Cada dado, para quê e por quanto tempo", cada um com um `<dl>` de 4 pares; `<time dateTime="2026-10-02">`.

- [ ] **Step 1: Testes que falham**

`app/privacidade/page.test.tsx` (substitui o atual):

```tsx
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import PrivacidadePage from './page'

const BOTAI = join(__dirname, '..', '..', '..', 'botai')
const ler = (arquivo: string) => readFileSync(join(BOTAI, arquivo), 'utf8')

describe('/privacidade', () => {
  beforeEach(() => {
    render(<PrivacidadePage />)
  })

  it('o título e a data de vigência', () => {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Política de privacidade do Botaí',
    )
    const data = screen.getByText('2 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-02')
  })

  it('as seções da política, na ordem', () => {
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Quem é o responsável',
      'O que o Botaí acessa, e quando',
      'O que fica guardado',
      'O que é enviado',
      'Sites que ele abre, só quando você clica',
      'Dados fictícios e pessoas reais',
      'Permissões',
      'Como apagar os dados',
      'Este site',
      'Quando você escreve para o suporte',
      'Cada dado, para quê e por quanto tempo',
      'Segurança',
      'Seus direitos',
      'Crianças e adolescentes',
      'Mudanças nesta política',
    ])
  })

  it('cada dado com finalidade, base legal, compartilhamento e prazo', () => {
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      'A pessoa fictícia gerada',
      'Os campos e o endereço da aba',
      'A escolha de tema claro ou escuro',
      'Os registros de acesso a este site',
      'O que você manda ao suporte por e-mail',
    ])
    const listas = document.querySelectorAll('dl')
    expect(listas).toHaveLength(5)
    for (const lista of listas)
      expect(
        [...lista.querySelectorAll('dt')].map((dt) => dt.textContent),
      ).toEqual(['Para quê', 'Base legal', 'Com quem', 'Por quanto tempo'])
    expect(listas[3]).toHaveTextContent('art. 7º, IX')
    expect(listas[3]).toHaveTextContent('Vercel')
    expect(listas[4]).toHaveTextContent('art. 7º, II')
    expect(listas[4]).toHaveTextContent('Gmail')
  })

  it('os direitos do art. 18, o prazo e a ANPD', () => {
    expect(document.body).toHaveTextContent('em até 15 dias')
    expect(document.body).toHaveTextContent('art. 18')
    expect(
      screen.getByRole('link', {
        name: 'Autoridade Nacional de Proteção de Dados (ANPD)',
      }),
    ).toHaveAttribute('href', 'https://www.gov.br/anpd/pt-br')
  })

  // A tabela é a lista justificada em loja/textos.md, que o manifesto.e2e.ts do Botaí amarra ao manifesto.
  it('as permissões da tabela são as justificadas nos textos das lojas', () => {
    const justificadas = [
      ...ler('loja/textos.md').matchAll(/^## Justificativa: (.+)$/gm),
    ].map((m) => m[1])
    const linhas = screen.getAllByRole('row').slice(1)
    expect(
      linhas.map((linha) => linha.querySelector('th')?.textContent),
    ).toEqual(justificadas)
    expect(linhas.at(-1)).toHaveTextContent('Só no Firefox')
  })

  it('"no Firefox o pacote declara que não coleta dados" é o que o wxt.config.ts diz', () => {
    expect(ler('wxt.config.ts')).toContain(
      "data_collection_permissions: { required: ['none'] }",
    )
    expect(document.body).toHaveTextContent(
      'No Firefox, o próprio pacote declara que não coleta dados.',
    )
  })

  // Review Focus 1: o Botaí ainda está "Em breve", e ele lê a URL da aba ativa.
  it('não afirma o que o código não sustenta', () => {
    expect(document.body).not.toHaveTextContent(
      /dispon[ií]vel|publicad[oa] nas lojas|Na Firefox Add-ons/i,
    )
    expect(document.body).toHaveTextContent(
      'não lê o histórico, outras abas, favoritos nem cookies',
    )
  })

  it('contato, termos e histórico', () => {
    for (const link of screen.getAllByRole('link', {
      name: 'pilutechinformatica@gmail.com',
    }))
      expect(link).toHaveAttribute(
        'href',
        'mailto:pilutechinformatica@gmail.com',
      )
    expect(screen.getByRole('link', { name: 'termos de uso' })).toHaveAttribute(
      'href',
      '/termos',
    )
    expect(
      screen.getByRole('link', { name: 'histórico do código-fonte do site' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/privacidade/page.tsx',
    )
  })

  it('o voltar leva à landing', () => {
    expect(screen.getByRole('link', { name: 'Botaí' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
```

`lib/seo.test.ts`: o teste "a política tem título e descrição próprios" continua; o valor muda no Step 2 e segue dentro de 140–160.

Run: `./node_modules/.bin/jest app/privacidade; echo "exit=$?"` → FAIL (data, seções, `dl`, ANPD e o "não afirma": a página atual diz "publicado nas lojas" e "Na Firefox Add-ons"), `exit=1`.

- [ ] **Step 2: O texto novo**

`lib/seo.ts`:

```ts
export const DESCRICAO_DA_PRIVACIDADE =
  'Como o Botaí trata seus dados: a extensão não envia nada. O que ela acessa e guarda, as permissões, o que este site registra e seus direitos na LGPD.'
```

(149 caracteres.)

`app/privacidade/page.tsx` (substitui o atual):

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { Documento } from '@/components/documento'
import { JsonLd } from '@/components/json-ld'
import {
  EMAIL_DE_SUPORTE,
  historicoDe,
  NOME,
  REPOSITORIO,
} from '@/lib/conteudo'
import { jsonLdDaTrilha } from '@/lib/json-ld'
import {
  DESCRICAO_DA_PRIVACIDADE,
  metadataDaPagina,
  TITULO_DA_PRIVACIDADE,
} from '@/lib/seo'
import { urlDoSite } from '@/lib/site'

// Data em texto pronto: formatar "2026-10-02" em BRT mostraria 1º de outubro.
const VIGENCIA = { iso: '2026-10-02', texto: '2 de outubro de 2026' }
const POLITICA_DA_VERCEL = 'https://vercel.com/legal/privacy-policy'
const POLITICA_DO_GOOGLE = 'https://policies.google.com/privacy'
const ANPD = 'https://www.gov.br/anpd/pt-br'

const PERMISSOES = [
  // as 5 de hoje (:19-50), sem mudança de texto
]

const TRATAMENTOS = [
  {
    dado: 'A pessoa fictícia gerada',
    paraQue: 'Repetir o mesmo cadastro até você pedir outra pessoa.',
    base: 'Não se aplica: ela é inventada e fica só no seu navegador. A PiluTech não a recebe.',
    comQuem: 'Ninguém.',
    prazo: 'Até você clicar em “Nova pessoa” ou remover a extensão.',
  },
  {
    dado: 'Os campos e o endereço da aba',
    paraQue:
      'Decidir o que escrever em cada campo e saber se o navegador deixa a extensão agir ali.',
    base: 'Não se aplica: são lidos só no seu navegador, no momento em que você aciona a extensão. A PiluTech não os recebe.',
    comQuem: 'Ninguém.',
    prazo: 'Só enquanto a ação dura. Nada é gravado.',
  },
  {
    dado: 'A escolha de tema claro ou escuro',
    paraQue: 'Abrir este site no tema que você escolheu.',
    base: 'Não se aplica: fica só no seu navegador (localStorage) e não é enviada.',
    comQuem: 'Ninguém.',
    prazo: 'Até você limpar os dados do site no navegador.',
  },
  {
    dado: 'Os registros de acesso a este site',
    paraQue: 'Entregar as páginas e proteger o site contra abuso e falhas.',
    base: 'Legítimo interesse da PiluTech em manter o site no ar e seguro (LGPD, art. 7º, IX).',
    comQuem: 'Vercel, a hospedagem, que os trata em nome da PiluTech.',
    prazo:
      'O prazo de retenção da Vercel. A PiluTech não os copia para outro lugar.',
  },
  {
    dado: 'O que você manda ao suporte por e-mail',
    paraQue: 'Responder ao seu pedido.',
    base: 'Legítimo interesse em atender quem nos procura (art. 7º, IX) e, nos pedidos sobre os seus dados, cumprimento de obrigação legal (art. 7º, II).',
    comQuem: 'Google, que hospeda o e-mail da PiluTech (Gmail).',
    prazo:
      'Enquanto for útil para o atendimento. Você pode pedir para apagar a qualquer momento.',
  },
]

export const metadata: Metadata = metadataDaPagina({
  caminho: '/privacidade',
  titulo: TITULO_DA_PRIVACIDADE,
  descricao: DESCRICAO_DA_PRIVACIDADE,
})

function Email() {
  return <a href={`mailto:${EMAIL_DE_SUPORTE}`}>{EMAIL_DE_SUPORTE}</a>
}

export default function PrivacidadePage() {
  return (
    <>
      <JsonLd
        dados={jsonLdDaTrilha(urlDoSite(), {
          nome: 'Política de privacidade',
          caminho: '/privacidade',
        })}
      />
      <Documento
        rotulo="~/pilulabs/botai/privacidade"
        titulo={`Política de privacidade do ${NOME}`}
        vigencia={VIGENCIA}
        resumo={
          <>
            a extensão {NOME} não coleta nem envia dados. Ela só lê os
            formulários da aba em que você a aciona, no seu navegador, e guarda
            nele a pessoa fictícia que gerou. Este site não usa cookies nem
            analytics; a hospedagem registra dados técnicos de acesso, como em
            qualquer site.
          </>
        }
      >
        <h2>Quem é o responsável</h2>
        <p>
          O {NOME} e este site são da PiluTech, que responde pelo tratamento dos
          dados descritos nesta política. Dúvidas, pedidos sobre os seus dados e
          suporte: <Email />.
        </p>

        <h2>O que o {NOME} acessa, e quando</h2>
        {/* a lista e o parágrafo de hoje (:92-113), sem mudança */}

        <h2>O que fica guardado</h2>
        {/* o parágrafo de hoje (:116-122), sem mudança */}

        <h2>O que é enviado</h2>
        <p>
          Nada. A extensão não tem servidor e não faz requisições a servidor
          nenhum. Também não usa analytics, cookies nem anúncios, e não carrega
          código remoto: todo o código está no pacote da extensão. No Firefox, o
          próprio pacote declara que não coleta dados. Copiar um dado no popup
          só o põe na área de transferência do seu computador.
        </p>

        <h2>Sites que ele abre, só quando você clica</h2>
        {/* a lista e o parágrafo de hoje (:133-156), sem mudança */}

        <h2>Dados fictícios e pessoas reais</h2>
        <p>
          Os documentos são gerados ao acaso, com dígitos verificadores válidos.
          Um CPF, um CNPJ ou um celular gerado pode pertencer a alguém de
          verdade: use o {NOME} só em localhost e em ambientes de teste. Os{' '}
          <Link href="/termos">termos de uso</Link> dizem o que é proibido fazer
          com esses dados.
        </p>

        <h2>Permissões</h2>
        {/* a tabela de hoje (:167-186), sem mudança */}
        <p>
          Ele não pede acesso a todos os sites e não lê o histórico, outras
          abas, favoritos nem cookies.
        </p>

        <h2>Como apagar os dados</h2>
        {/* o parágrafo de hoje (:193-196), sem mudança */}

        <h2>Este site</h2>
        <p>
          O site botai.pilutech.com.br não usa cookies, analytics nem anúncios,
          e não carrega nada de terceiros: as fontes e as imagens vêm dele
          mesmo. A escolha de tema claro ou escuro fica guardada no seu
          navegador (<code>localStorage</code>) e não é enviada.
        </p>
        <p>
          A hospedagem é da Vercel Inc., empresa dos Estados Unidos. Como em
          qualquer site, o servidor registra dados técnicos de cada acesso:
          endereço IP, navegador e sistema, página pedida, data e hora, e a
          cidade e o país aproximados a partir do IP. A Vercel trata esses
          registros em nome da PiluTech e pode processá-los fora do Brasil (veja
          a{' '}
          <a
            href={POLITICA_DA_VERCEL}
            target="_blank"
            rel="noopener noreferrer"
          >
            política de privacidade da Vercel
          </a>
          ). A PiluTech só os usa para manter o site no ar e seguro, e não os
          cruza com nada para identificar ninguém.
        </p>

        <h2>Quando você escreve para o suporte</h2>
        <p>
          Se você mandar um e-mail, recebemos o seu endereço, o nome que aparece
          nele e o que você escrever, e usamos isso só para responder. O e-mail
          da PiluTech é hospedado pelo Google (Gmail), que pode guardar as
          mensagens fora do Brasil (veja a{' '}
          <a
            href={POLITICA_DO_GOOGLE}
            target="_blank"
            rel="noopener noreferrer"
          >
            política de privacidade do Google
          </a>
          ). Não mande o que não for necessário, como documentos seus.
        </p>

        <h2>Cada dado, para quê e por quanto tempo</h2>
        {TRATAMENTOS.map((tratamento) => (
          <Fragment key={tratamento.dado}>
            <h3>{tratamento.dado}</h3>
            <dl>
              <dt>Para quê</dt>
              <dd>{tratamento.paraQue}</dd>
              <dt>Base legal</dt>
              <dd>{tratamento.base}</dd>
              <dt>Com quem</dt>
              <dd>{tratamento.comQuem}</dd>
              <dt>Por quanto tempo</dt>
              <dd>{tratamento.prazo}</dd>
            </dl>
          </Fragment>
        ))}
        <p>
          A PiluTech não vende dados, não os usa para publicidade e não os
          compartilha com mais ninguém, salvo por ordem judicial ou obrigação
          legal.
        </p>

        <h2>Segurança</h2>
        <p>
          A extensão não envia nada, então não existe dado dela num servidor
          para vazar. A pessoa fictícia fica no perfil do seu navegador, sem
          criptografia própria: quem usa o seu computador e o seu perfil
          consegue vê-la. Este site só responde por HTTPS. O código da extensão
          e o do site são{' '}
          <a href={REPOSITORIO} target="_blank" rel="noopener noreferrer">
            abertos
          </a>{' '}
          e podem ser conferidos.
        </p>

        <h2>Seus direitos</h2>
        <p>
          A Lei Geral de Proteção de Dados (LGPD, art. 18) garante a você, sobre
          os dados pessoais que a PiluTech tiver:
        </p>
        <ul>
          <li>a confirmação de que tratamos dados seus, e o acesso a eles;</li>
          <li>a correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            a anonimização, o bloqueio ou a eliminação de dados desnecessários,
            excessivos ou tratados em desacordo com a lei;
          </li>
          <li>a portabilidade dos dados;</li>
          <li>
            a eliminação dos dados e a informação de com quem os compartilhamos;
          </li>
          <li>
            a oposição a um tratamento feito por legítimo interesse, se ele
            descumprir a lei.
          </li>
        </ul>
        <p>
          Nenhum tratamento descrito aqui depende do seu consentimento; se um
          dia depender, você poderá negá-lo ou revogá-lo. Para exercer qualquer
          direito, escreva para <Email />. Respondemos em até 15 dias e podemos
          pedir que você confirme que o pedido é seu. Lembre que a PiluTech não
          tem nenhum dado da extensão: o que ela guarda fica no seu navegador, e
          você apaga como explicado em “Como apagar os dados”. Se achar que não
          resolvemos, você pode reclamar à{' '}
          <a href={ANPD} target="_blank" rel="noopener noreferrer">
            Autoridade Nacional de Proteção de Dados (ANPD)
          </a>
          .
        </p>

        <h2>Crianças e adolescentes</h2>
        <p>
          O {NOME} e este site são feitos para quem desenvolve e testa software,
          não para crianças e adolescentes. Nenhum dos dois coleta dados de
          ninguém, crianças inclusive.
        </p>

        <h2>Mudanças nesta política</h2>
        <p>
          Quando esta política mudar, a data no topo muda junto, e a mudança
          vale a partir dela. Se um dia a extensão passar a coletar algum dado,
          isso só vai acontecer numa versão nova, com esta política atualizada
          antes. As versões anteriores ficam no{' '}
          <a
            href={historicoDe('app/privacidade/page.tsx')}
            target="_blank"
            rel="noopener noreferrer"
          >
            histórico do código-fonte do site
          </a>
          .
        </p>
      </Documento>
    </>
  )
}
```

Notas:

- Os trechos marcados "sem mudança" (inclusive o `PERMISSOES`) são copiados literalmente da página atual; os comentários de marcação acima são só deste plano e **não** vão para o código.
- Entre a Tarefa 1 e esta, a página mostra "Em vigor desde 1 de outubro de 2026" (o rótulo é o do `Documento`, a data ainda é a velha); esta tarefa troca a data junto com o texto.
- A ordem dos `h3` segue a do teste (extensão, depois site, depois suporte).
- "em até 15 dias" é o prazo do art. 19, II; a PiluTech pode ter prazo em dobro como agente de pequeno porte, mas promete os 15.
- O teste "os direitos do art. 18" procura "art. 18": está em "A Lei Geral de Proteção de Dados (LGPD, art. 18)".

- [ ] **Step 3: Verde**

Run: `./node_modules/.bin/jest; echo "exit=$?"` → `exit=0`; typecheck e lint `exit=0`.

- [ ] **Step 4: Commit**

`/usr/bin/git add apps/botai-site && /usr/bin/git commit -m "fix(botai-site): política de privacidade completa para a LGPD e sem dizer que o Botaí já está nas lojas"; echo "exit=$?"`

---

### Tarefa 4: Rodapé e "Cuidados" levam à privacidade e aos termos

O dono também pediu ajustes no rodapé ("o app ainda está em breve, ajuste o rodapé"); este plano só acrescenta os documentos. Se outra tarefa do mesmo pedido mexer no `Rodape`, junte as duas mudanças e rode os testes das duas.

**Files:**

- Modify: `components/rodape.tsx`, `components/rodape.test.tsx`, `components/landing.tsx`, `components/landing.test.tsx`

**Interfaces:**

- Consumes: `DOCUMENTOS` (Tarefa 1).
- Produces: `nav` "Documentos" no `contentinfo`; link "Termos de uso" na região "Cuidados".

- [ ] **Step 1: Testes que falham**

`components/rodape.test.tsx`, acrescente:

```tsx
it('leva à política de privacidade e aos termos de uso', () => {
  render(<Rodape />)
  const documentos = within(
    screen.getByRole('navigation', { name: 'Documentos' }),
  )
  expect(documentos.getByRole('link', { name: 'Privacidade' })).toHaveAttribute(
    'href',
    '/privacidade',
  )
  expect(
    documentos.getByRole('link', { name: 'Termos de uso' }),
  ).toHaveAttribute('href', '/termos')
})
```

(importe `within`.)

`components/landing.test.tsx`, acrescente:

```tsx
it('os cuidados levam aos termos de uso', () => {
  renderizar()
  const cuidados = within(screen.getByRole('region', { name: 'Cuidados' }))
  expect(cuidados.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
    'href',
    '/termos',
  )
})
```

Run: `./node_modules/.bin/jest components/rodape components/landing; echo "exit=$?"` → FAIL, `exit=1`.

- [ ] **Step 2: Implementação**

`components/rodape.tsx`:

```tsx
import { faEnvelope } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import Link from 'next/link'
import { DOCUMENTOS, EMAIL_DE_SUPORTE, URL_DA_PILUTECH } from '@/lib/conteudo'

const LINK =
  'text-muted-foreground inline-block py-1.5 font-mono text-xs hover:underline'

export function Rodape() {
  return (
    <footer className="border-border mt-[72px] flex flex-wrap items-center justify-between gap-4 border-t pt-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <a href={URL_DA_PILUTECH} className={LINK}>
          Powered by PiluTech
        </a>
        <nav aria-label="Documentos">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {DOCUMENTOS.map((documento) => (
              <li key={documento.href}>
                <Link href={documento.href} className={LINK}>
                  {documento.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <Button asChild variant="outline" className="gap-2">
        <a href={`mailto:${EMAIL_DE_SUPORTE}`}>
          <FontAwesomeIcon icon={faEnvelope} className="size-[13px]" />
          Suporte
        </a>
      </Button>
    </footer>
  )
}
```

`components/landing.tsx`, na seção "Cuidados", depois do `</ul>` (mesmo markup do link "Política de privacidade" da seção ao lado):

```tsx
<Link
  href="/termos"
  className="text-primary inline-flex items-center gap-2 text-[15px] hover:underline"
>
  Termos de uso
  <FontAwesomeIcon icon={faArrowRight} className="size-3" />
</Link>
```

A story do rodapé (`components/rodape.stories.tsx`) não muda: ela renderiza o componente inteiro, nos dois temas.

- [ ] **Step 3: Verde**

Run: `./node_modules/.bin/jest; echo "exit=$?"` → `exit=0`; typecheck e lint `exit=0`; `pnpm build-storybook; echo "exit=$?"` → `exit=0` (as stories `Landing/Rodape` e `Landing/Documento` montam).

- [ ] **Step 4: Commit**

`/usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): rodapé e Cuidados levam à política de privacidade e aos termos de uso"; echo "exit=$?"`

---

### Tarefa 5: E2E de `/termos`, da política nova e do que ela promete do site

**Files:**

- Create: `app/termos/termos.e2e.ts`
- Modify: `app/privacidade/privacidade.e2e.ts`, `app/seo.e2e.ts`

- [ ] **Step 1: Os testes**

`app/termos/termos.e2e.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('/termos', () => {
  test('h1, vigência, a política e o voltar para a landing', async ({
    page,
  }) => {
    const resposta = await page.goto('/termos')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Termos de uso do Botaí',
    )
    await expect(page.locator('time[datetime="2026-10-02"]')).toHaveText(
      '2 de outubro de 2026',
    )
    await page
      .getByRole('main')
      .getByRole('link', { name: 'política de privacidade', exact: true })
      .first()
      .click()
    await expect(page).toHaveURL('/privacidade')
    await page.goto('/termos')
    await page.getByRole('link', { name: 'Botaí', exact: true }).click()
    await expect(page).toHaveURL('/')
  })

  test('o rodapé da landing leva até aqui', async ({ page }) => {
    await page.goto('/')
    await page
      .getByRole('contentinfo')
      .getByRole('link', { name: 'Termos de uso', exact: true })
      .click()
    await expect(page).toHaveURL('/termos')
  })

  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/termos')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })
  })
})
```

`app/privacidade/privacidade.e2e.ts`:

- no primeiro teste, `time[datetime="2026-10-02"]` com `'2 de outubro de 2026'`;
- acrescente:

```ts
test('o rodapé leva à política, e a política aos termos', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Privacidade', exact: true })
    .click()
  await expect(page).toHaveURL('/privacidade')
  await page
    .getByRole('main')
    .getByRole('link', { name: 'termos de uso', exact: true })
    .click()
  await expect(page).toHaveURL('/termos')
})

// Review Focus 3: o que a seção "Este site" afirma.
test('o site não pede nada a outro host, não grava cookie e só guarda o tema', async ({
  page,
  context,
  baseURL,
}) => {
  const hosts = new Set<string>()
  page.on('request', (pedido) => {
    const url = new URL(pedido.url())
    if (url.protocol.startsWith('http')) hosts.add(url.host)
  })
  for (const caminho of ['/', '/privacidade', '/termos']) {
    await page.goto(caminho)
    await page.waitForLoadState('networkidle')
  }
  await page.getByRole('button', { name: 'Alternar tema' }).click()
  expect([...hosts]).toEqual([new URL(baseURL as string).host])
  expect(await context.cookies()).toEqual([])
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([
    'theme',
  ])
})
```

`app/seo.e2e.ts`:

- importe `TITULO_DOS_TERMOS` e `DESCRICAO_DOS_TERMOS` e some a `ROTAS`:

```ts
{
  caminho: '/termos',
  titulo: TITULO_DOS_TERMOS,
  descricao: DESCRICAO_DOS_TERMOS,
  imagem: '/termos/opengraph-image',
},
```

(os testes de title, canonical, OG/Twitter 1200×630, `h1` único, níveis de título, `alt` e o axe a 1280 e 320 px nos dois temas passam a rodar em `/termos`);

- `'sitemap.xml lista as três rotas'`, com `<loc>${SITE_DE_PRODUCAO}/termos</loc>`;
- acrescente:

```ts
test('JSON-LD de /termos: a trilha Botaí › Termos de uso', async ({ page }) => {
  await page.goto('/termos')
  const [dados] = await lerJsonLd(page)
  expect(dados['@type']).toBe('BreadcrumbList')
  const itens = dados.itemListElement as { name: string }[]
  expect(itens.map((i) => i.name)).toEqual(['Botaí', 'Termos de uso'])
})
```

- [ ] **Step 2: Rodar**

`lsof -nP -iTCP:3020 -sTCP:LISTEN; echo "exit=$?"` → `exit=1` (porta livre). Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && CI=1 pnpm test:e2e; echo "exit=$?"` → as duas passadas verdes, `exit=0`. Se o teste de rede falhar por um host novo, **não** afrouxe o teste: ou o recurso sai, ou a seção "Este site" passa a citá-lo.

Confira `/usr/bin/git status` (o `next start` pode ter mexido no `CLAUDE.md` ou criado `AGENTS.md`).

- [ ] **Step 3: Commit**

`/usr/bin/git add apps/botai-site && /usr/bin/git commit -m "test(botai-site): E2E de /termos e do que a política promete sobre o site"; echo "exit=$?"`

---

### Tarefa 6: `apps/botai`: termos nos textos das lojas e no README, e a trava do que a política promete

**Files:**

- Modify: `apps/botai/loja/textos.md`, `apps/botai/loja/textos.test.ts`, `apps/botai/loja/README.md`, `apps/botai/README.md`

- [ ] **Step 1: Testes que falham**

`apps/botai/loja/textos.test.ts`, acrescente (o arquivo já roda em `node`):

```ts
import { readdirSync } from 'node:fs'

it('a descrição e os endereços apontam para os termos de uso', () => {
  const termos = 'Termos de uso: https://botai.pilutech.com.br/termos'
  expect(textos.get('Descrição')).toContain(termos)
  expect(textos.get('Endereços')).toContain(termos)
})

it('o README do Botaí leva à política e aos termos', () => {
  const readme = ler('../README.md')
  expect(readme).toContain('https://botai.pilutech.com.br/privacidade')
  expect(readme).toContain('https://botai.pilutech.com.br/termos')
})

// A política em botai.pilutech.com.br/privacidade diz que a extensão não envia nada e só
// guarda a pessoa em local:botai_pessoa. Se um destes falhar, atualize a política antes.
describe('o que a política promete, o código da extensão cumpre', () => {
  const src = path.join(import.meta.dirname, '..', 'src')
  const fontes = readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((arquivo) => /\.(ts|tsx)$/.test(arquivo))
    .filter((arquivo) => !/\.(test|stories|e2e)\.tsx?$/.test(arquivo))
    .filter((arquivo) => !arquivo.startsWith(`test${path.sep}`))
    .map((arquivo) => readFileSync(path.join(src, arquivo), 'utf8'))

  it('nenhuma chamada de rede', () => {
    for (const fonte of fontes)
      expect(fonte).not.toMatch(
        /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/,
      )
  })

  it('uma chave de storage só, local:botai_pessoa, e nada em sync', () => {
    const chaves = fontes.flatMap((fonte) =>
      [...fonte.matchAll(/['"`]((?:local|sync|session|managed):[\w-]+)/g)].map(
        (m) => m[1],
      ),
    )
    expect(chaves).toEqual(['local:botai_pessoa'])
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/textos.test.ts; echo "exit=$?"` → FAIL só nos dois primeiros (o descritivo da trava já passa: ela é guarda, não muda código), `exit=1`.

- [ ] **Step 2: Textos**

`apps/botai/loja/textos.md`:

- em "Descrição", entre a linha do código aberto e a do "Powered by PiluTech":

```
Termos de uso: https://botai.pilutech.com.br/termos
```

- em "Endereços", depois da linha da política:

```
Termos de uso: https://botai.pilutech.com.br/termos
```

- em "Política de privacidade (texto para a AMO)":

```
A AMO pede o texto da política mesmo com a versão hospedada. Copie o texto renderizado de https://botai.pilutech.com.br/privacidade inteiro, inclusive "Este site" (os registros de acesso são do site, não da extensão, e a seção diz isso): a página é a única fonte, para as duas não divergirem.
```

`apps/botai/loja/README.md`, na seção "Firefox Add-ons (AMO)", acrescente:

```
- Contrato de licença (EULA): deixe vazio. A licença do código é a MIT (campo Licença), e os termos de uso não são um contrato a aceitar antes de instalar (o Firefox nem mostra mais esse aceite); o link deles vai na Descrição e em Endereços.
```

e, nas seções da Chrome Web Store e do Edge, acrescente ao fim do item "Textos": "Os termos de uso não têm campo próprio nessas lojas: vão na Descrição."

`apps/botai/README.md`:

- em "Cuidados", um terceiro item: `- Os dados são para teste: os [termos de uso](https://botai.pilutech.com.br/termos) dizem o que é proibido fazer com eles.`
- antes de "## Licença", a seção:

```
## Privacidade e termos

O Botaí não coleta nem envia dados: ele só lê os formulários da aba em que você o aciona e guarda no navegador a pessoa fictícia que gerou. A [política de privacidade](https://botai.pilutech.com.br/privacidade) e os [termos de uso](https://botai.pilutech.com.br/termos) moram no site do Botaí; o texto deles fica em `apps/botai-site/app/privacidade/page.tsx` e `apps/botai-site/app/termos/page.tsx`.
```

- [ ] **Step 3: Verde**

Run: `./node_modules/.bin/vitest run; echo "exit=$?"` → `exit=0`. `pnpm --filter @pilutech/botai lint; echo "exit=$?"` → `exit=0`. O `textos.test.ts` também confere que `textos.md` e `README.md` nunca escrevem a marca errada: "Botaí" com acento nas linhas novas.

O `@source not '../*.md'` e `@source not '../loja'` do `styles.css` da extensão garantem que os `.md` não mudam o CSS; nenhum build da extensão precisa rodar por esta tarefa, mas o `botai-release.yml` roda no PR porque `apps/botai/**` mudou.

- [ ] **Step 4: Commit**

`/usr/bin/git add apps/botai && /usr/bin/git commit -m "docs(botai): termos de uso nos textos das lojas e no README, e a trava do que a política promete"; echo "exit=$?"`

---

### Tarefa 7: Documentação e verificação final

**Files:**

- Modify: `apps/botai-site/CLAUDE.md`, `apps/botai/CLAUDE.md`

- [ ] **Step 1: `apps/botai-site/CLAUDE.md`**

- Primeira linha: "Landing do Botaí em `https://botai.pilutech.com.br`: `/`, `/privacidade` e `/termos`."
- "Estrutura": `app/` cita `termos/`; `components/` cita a moldura `documento` das páginas de texto.
- A seção `/privacidade` vira "`/privacidade` e `/termos`":

```
## `/privacidade` e `/termos`

- Os dois textos moram no `page.tsx` de cada rota, fonte única (o da AMO se copia da política). A moldura é o `Documento` (`components/documento.tsx`): topo, rótulo, `h1`, "Em vigor desde" e resumo, corpo `prose`, rodapé. A data é texto pronto (formatar em BRT daria o dia anterior) e é a data em que o texto passa a valer.
- Decisões do dono (2026-10-02): responsável só "PiluTech" + `pilutechinformatica@gmail.com`, sem razão social nem CNPJ; foro de Teresina/PI, ressalvado o domicílio do consumidor quando o CDC se aplicar. Plano: `docs/superpowers/plans/2026-10-02-botai-termos.md` (inclui os riscos jurídicos deixados ao dono).
- Texto honesto: nenhuma das duas diz "disponível" nem "publicado nas lojas" (teste das páginas).
- A política amarra o código: a tabela de permissões é a lista de "Justificativa:" de `apps/botai/loja/textos.md`, e "no Firefox o pacote declara que não coleta" lê o `apps/botai/wxt.config.ts` (`page.test.tsx`); o E2E confere que o site não pede nada a outro host, não grava cookie e só guarda `theme` no `localStorage`. Do lado da extensão, `apps/botai/loja/textos.test.ts` trava "sem rede" e "uma chave de storage". Mudou um deles? Mude a política no mesmo PR.
- O link de histórico aponta para o `page.tsx` de cada rota; as versões da política de antes de 2026-10-02 estão no histórico de `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`.
```

- "SEO": textos próprios também para os termos; JSON-LD "em `/privacidade` e `/termos`, `BreadcrumbList` (`jsonLdDaTrilha`)"; "Sitemap e robots: `/`, `/privacidade` e `/termos`".
- "Deploy", passo 6: `curl -sI https://botai.pilutech.com.br/termos` responde 200; o sitemap lista as três rotas.

- [ ] **Step 2: `apps/botai/CLAUDE.md`**

Em "Publicação", depois do primeiro parágrafo: "Política de privacidade e termos de uso: `https://botai.pilutech.com.br/privacidade` e `/termos` (texto em `apps/botai-site/app/*/page.tsx`); a política descreve o que esta extensão faz, e `loja/textos.test.ts` trava, do lado da extensão, o que ela promete (sem rede, uma chave de storage). Na AMO, o campo EULA fica vazio (ver `loja/README.md`)."

- [ ] **Step 3: Verificação final**

De `apps/botai-site`:

```
./node_modules/.bin/tsc --noEmit; echo "exit=$?"
./node_modules/.bin/eslint .; echo "exit=$?"
./node_modules/.bin/jest && node --test scripts/*.test.mjs; echo "exit=$?"
pnpm build; echo "exit=$?"
pnpm build-storybook; echo "exit=$?"
CI=1 pnpm test:e2e; echo "exit=$?"
```

De `apps/botai`: `./node_modules/.bin/vitest run; echo "exit=$?"` e `pnpm --filter @pilutech/botai lint; echo "exit=$?"`.

Da raiz: `./node_modules/.bin/prettier --check "apps/botai-site/**/*.{ts,tsx,md}" "apps/botai/**/*.md" "docs/superpowers/plans/2026-10-02-botai-termos.md"; echo "exit=$?"`.

Tudo `exit=0`. Abra `http://localhost:3020/privacidade` e `/termos` com `pnpm start` (depois do build) a 1280 e a 320 px, nos dois temas, e leia os textos do começo ao fim. Confira `/usr/bin/git status`.

- [ ] **Step 4: Commit**

`/usr/bin/git add apps/botai-site/CLAUDE.md apps/botai/CLAUDE.md && /usr/bin/git commit -m "docs(botai-site): /termos e a política nova no CLAUDE.md"; echo "exit=$?"`

## Depois do código (passos do dono)

1. Ler os dois textos e, se possível, passá-los por um advogado antes de enviar às lojas (ver "Riscos e pontos para o dono").
2. No deploy, conferir `https://botai.pilutech.com.br/termos` (200, canonical próprio) e o sitemap com as três rotas.
3. No primeiro envio às lojas: política pela URL na Chrome e no Edge; na AMO, o texto copiado da página inteira e o EULA vazio; termos na Descrição.
