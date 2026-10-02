# PiluLabs v2: coleção única, seção da home e subdomínios `*.pilutech.com.br`

Data: 2026-10-01. Workspace principal: `apps/web`. Também toca `apps/botai` (URL da página do produto).

## 1. O que o dono pediu (palavras dele)

- "os produtos da pilutech para ficarem em sub dominios do dominio princial da pilutech, ai ficaria sombrai.pilutech.com.br e botai.pilutech.com.br"
- "na home do meu portifolio a sessao de apps e lá é que devem ficar os projetos mais novos ou que eu escolher que fique ali, como o site tem cms, a parte de projetos deve virar a pilu labs e deve se listar os projetos que eu tenho feito para exibir mais de 4 projetos deve clickar em um saiba mais e ai vai pra pag do pilulabs"
- "Não se esqueça de adicionar o sobrai e o botai e suas desrições logo com a url para acessar eles sendo nesse padrão"
- Decisões nas perguntas:
  - CMS: **uma coleção "PiluLabs"**;
  - home: **"Destaque no CMS, senão os mais novos"**;
  - domínio base: **`pilutech.com.br`**;
  - Sombraí: o texto sai do repositório dele (`/Users/piluvitu/PILUTECH/Sombrai`, `PiluVitu/Sombrai`, privado), que só leio, nunca altero.

## 2. Coleção única `pilulabs` (substitui `projects` e `produtos`)

`content/pilulabs/<slug>/index.yaml`, editável no Keystatic reader (site público) e no `/admin` (CRUD novo em `/admin/pilulabs`, no lugar de `/admin/projetos`). As coleções `projects` e `produtos` saem do `keystatic.config.ts`, do registry do admin e do disco.

| Campo                                            | Tipo                                     | Regra                                                                                               |
| ------------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `slug`                                           | slug (pasta)                             | sem acento, minúsculo, com hífen; é também o subdomínio e a pasta da rota própria                   |
| `order`                                          | inteiro ≥ 0                              | ordem manual (o reorder do admin grava `order`, como nas outras coleções)                           |
| `nome`                                           | texto, obrigatório                       | nome de exibição, com acento ("Botaí")                                                              |
| `subtitulo`                                      | texto                                    | uma linha abaixo do nome                                                                            |
| `descricao`                                      | texto multilinha                         | o texto do card                                                                                     |
| `tipo`                                           | `extensao` \| `mobile` \| `web` \| `cli` | agrupa a vitrine: Extensões, Apps mobile, Apps web, CLIs, nessa ordem                               |
| `tags`                                           | lista de texto                           |                                                                                                     |
| `logo`                                           | caminho em `public/` ou URL              | imagem quadrada                                                                                     |
| `sigla`                                          | texto                                    | fallback do avatar; vazio = 2 primeiras letras do nome em maiúscula                                 |
| `site`                                           | URL `https:` ou vazio                    | onde o produto é acessado (o padrão novo: `https://<slug>.pilutech.com.br`)                         |
| `repo`                                           | URL `https:` ou vazio                    | código-fonte                                                                                        |
| `chromeUrl`, `firefoxUrl`, `edgeUrl`, `operaUrl` | URL da loja ou vazio                     | mesma regra de hoje (`lojasPublicadas`: `https:` + host exato da loja)                              |
| `destaque`                                       | booleano                                 | escolhido pelo dono para a home                                                                     |
| `data`                                           | `AAAA-MM-DD` ou vazio                    | lançamento; "mais novo" = data maior; vazio conta como o mais antigo                                |
| `listado`                                        | booleano                                 | aparece na home e em `/pilulabs` e é indexável; desmarcado = só por link, `noindex` (regra de hoje) |
| `paginaPropria`                                  | booleano                                 | existe `app/(site)/pilulabs/<slug>/page.tsx` no `apps/web` (hoje só o Botaí)                        |

Campo ausente no YAML vira o vazio do tipo (`.default()` no Zod do admin, `normalizarItem` no site), como as outras coleções.

### Conteúdo inicial

| slug       | nome     | tipo       | subtitulo                                               | site                                       | repo                                   | destaque | order | data       | listado | paginaPropria |
| ---------- | -------- | ---------- | ------------------------------------------------------- | ------------------------------------------ | -------------------------------------- | -------- | ----- | ---------- | ------- | ------------- |
| `botai`    | Botaí    | `extensao` | Gerador de dados fake para formulários (CPF, CNPJ, CEP) | `https://botai.pilutech.com.br`            | o de hoje (`.../tree/main/apps/botai`) | sim      | 0     | 2026-10-01 | **sim** | sim           |
| `sombrai`  | Sombraí  | `mobile`   | Plante sombra em Teresina                               | `https://sombrai.pilutech.com.br`          | vazio (repo privado)                   | sim      | 1     | 2026-09-23 | sim     | não           |
| `live-prs` | Live PRs | `web`      | agregador de pull requests                              | `https://pr-live-folder-front.vercel.app/` | vazio                                  | não      | 2     | 2024-08-28 | sim     | não           |

- **Botaí:** `descricao` = "Extensão para Chrome, Edge, Opera e Firefox que gera uma pessoa brasileira de teste, com CPF, CNPJ, RG e CEP válidos, e preenche o formulário da página com um atalho." O `subtitulo` é a descrição curta oficial (regra do `apps/botai/CLAUDE.md`). Tags e logo: os de hoje (`/pilulabs/botai/icone-128.png`). **Passa a `listado: true`**: o dono pediu o Botaí na PiluLabs; sem loja publicada ele mostra "● Em breve", como já previsto.
- **Sombraí:** `descricao` = "App para iPhone e Android que mostra quais árvores e plantas nativas do Piauí cabem no seu quintal, na calçada, na varanda ou no vaso, como cuidar delas no calor de Teresina e quais são seguras para cães e gatos." Tags: Swift, SwiftUI, Kotlin, Jetpack Compose, Next.js. Logo: cópia de `Sombrai/site/src/assets/app-icon.png` reduzida para 256 px em `public/pilulabs/sombrai/icone.png` (origem anotada no `CLAUDE.md`). O site é a landing que já existe no projeto Vercel do Sombraí (hoje `https://sombrai.vercel.app`): o subdomínio é configurado lá, não no `apps/web`.
- **Live PRs:** o texto, as tags e o logo de hoje, migrados sem mudar o conteúdo; `sigla: LPR`.

## 3. Regras de exibição (lógica pura em `lib/pilulabs.ts`, testada no Jest)

- `itensListados(itens)`: só `listado: true`.
- **Home, `selecionarParaHome(itens, max = 4)`:** entre os listados, primeiro os `destaque` por `order` (empate por `slug`), depois os demais pela `data` mais nova (empate por `order`, depois `slug`), até `max`. Mais de 4 destaques: só os 4 primeiros por `order`.
- **`/pilulabs`:** todos os listados, agrupados por `tipo` na ordem da tabela, dentro do grupo por `order` e depois `slug`.
- **Link de cada item, `linkDoItem(item, subdominiosAtivos)`:**
  - `paginaPropria` e subdomínios **desligados** → `/pilulabs/<slug>` (o subdomínio ainda não existe);
  - senão `site`, se houver;
  - senão `/pilulabs/<slug>` se `paginaPropria`;
  - senão `repo`;
  - senão nenhum (card sem botão).
- Status "● Em breve" / "● Disponível" e os ícones de loja só para `tipo: extensao` (as lojas modeladas são de navegador).

## 4. Home: a seção "Projetos" vira "PiluLabs"

- Título "PiluLabs", contagem = total de listados.
- Até 4 cards (`selecionarParaHome`), no `ProjectCard` de hoje (via `itemParaProject`), com o botão "Acessar" (`linkDoItem`) e "Código" (`repo`).
- Abaixo dos cards, sempre: link "Saiba mais no PiluLabs →" para a vitrine (`urlPublica('/pilulabs')`).
- O link PiluLabs do rodapé continua, com o mesmo destino.

## 5. Subdomínios em `pilutech.com.br`

### Roteamento por host (`proxy.ts` do Next 16, na raiz do `apps/web`)

Lógica pura em `lib/pilutech-dominios.ts` (sem `node:fs`: o proxy não pode importar `lib/pilulabs.ts`), embrulhada pelo `proxy.ts`. Hosts reconhecidos, sem porta e sem diferenciar maiúsculas:

- `pilutech.com.br` e `www.pilutech.com.br` → `/` é reescrito para `/pilulabs`;
- `<slug>.pilutech.com.br` → `/` vira `/pilulabs/<slug>` e `/<resto>` vira `/pilulabs/<slug>/<resto>` (então `botai.pilutech.com.br/privacidade` é a política);
- a mesma coisa com `pilutech.localhost` no lugar de `pilutech.com.br`, para ver e testar local (`http://botai.pilutech.localhost:3333`; o Chromium resolve `*.localhost` para o loopback).

Nunca reescreve, em nenhum host: `/_next/*`, `/api/*`, caminho que já começa com `/pilulabs`, arquivo com extensão (`/favicon.ico`, `/pilulabs/botai/icone-128.png`) e as rotas de imagem `opengraph-image*`/`twitter-image*`. O `config.matcher` limita o proxy aos hosts PiluTech e a `/pilulabs/*`; o resto do `piluvitu.com.br` não paga o proxy.

### Chave `PILUTECH_SUBDOMINIOS` (Vercel, Production)

O DNS é passo do dono. Até ele ligar `PILUTECH_SUBDOMINIOS=1` (com redeploy, porque as páginas são estáticas e leem a variável no build), nada muda para quem visita `piluvitu.com.br`. Ligada:

- links (`linkDoItem`, "Saiba mais", rodapé, voltar das páginas PiluLabs, JSON-LD), `alternates.canonical` e `openGraph.url` usam `urlPublica(caminho)`:
  - `/pilulabs` → `https://pilutech.com.br/`;
  - `/pilulabs/<slug>` → `https://<slug>.pilutech.com.br/`;
  - `/pilulabs/<slug>/<resto>` → `https://<slug>.pilutech.com.br/<resto>`;
- `siteName` dessas páginas vira `pilutech.com.br`;
- num host que não é PiluTech, `/pilulabs` e `/pilulabs/<slug>[/<resto>]` respondem **308** para a URL de `urlPublica` (query preservada), com as mesmas exceções de cima (arquivos e imagens OG continuam servidos no `piluvitu.com.br`, porque o `og:image` aponta para lá);
- o voltar da vitrine para a home do autor vira absoluto (`getCanonicalSiteUrl()`), porque `/` no host PiluTech é a própria vitrine.

Desligada (padrão, e em todo preview), `urlPublica` devolve o caminho como está.

### Passos do dono (vão para o `apps/web/CLAUDE.md` e para o resumo)

1. Vercel, projeto do `apps/web`, Settings → Domains: `pilutech.com.br`, `www.pilutech.com.br` (redirecionando para o apex) e `botai.pilutech.com.br`.
2. Cloudflare, zona `pilutech.com.br`, registros **DNS only** (nuvem cinza) com os valores que a Vercel mostrar (`A @`, `CNAME www`, `CNAME botai`). Não criar o Single Redirect 308 que o README do Botaí descrevia; se existir, apagar.
3. Projeto Vercel do Sombraí: domínio `sombrai.pilutech.com.br`, `CNAME sombrai` na Cloudflare e `SITE_URL=https://sombrai.pilutech.com.br` (variável que o site do Sombraí já lê), com redeploy. Até isso, o link do Sombraí na PiluLabs não abre.
4. Com `curl -sI https://botai.pilutech.com.br` respondendo 200: `PILUTECH_SUBDOMINIOS=1` em Production no projeto do `apps/web` e redeploy.

## 6. Botaí aponta para o subdomínio (antes de qualquer tag `botai-v1.0.0`)

- `homepage_url: 'https://botai.pilutech.com.br'` no `wxt.config.ts` (os três navegadores) e em `manifesto.e2e.ts`.
- `loja/textos.md`: site e suporte `https://botai.pilutech.com.br`, política `https://botai.pilutech.com.br/privacidade`; `loja/textos.test.ts`.
- `README.md` ("Publicação"): os passos 1 e 2 passam a ser os do §5; o crédito "Powered by PiluTech" continua em `https://pilutech.com.br`, que agora serve a vitrine (não redireciona mais para `piluvitu.com.br/pilulabs`).
- `apps/botai/CLAUDE.md`: `homepage_url` e a frase sobre o redirecionamento do `pilutech.com.br`.

## 7. Admin

- `/admin/pilulabs` substitui `/admin/projetos`: lista com drag-reorder, criar, editar (modal) e apagar, no padrão das outras coleções (`useContentList('pilulabs')`, `useContentMutations('pilulabs')`).
- Formulário: os campos do §2, `logo` com o `ImageField`, `tipo` em select, `data` em input de data, os três booleanos em checkbox, tags no `TagArrayInput`.
- Zod: `slug` e `nome` obrigatórios; `site`/`repo` vazios ou `https:`; cada URL de loja vazia ou aceita por `ehUrlDaLoja` (a mesma regra da página); `data` vazia ou uma data real `AAAA-MM-DD`.
- Sidebar e dashboard: "Projetos" vira "PiluLabs"; `GET /api/admin/stats` conta a coleção nova.

## 8. Travas

- `lib/pilulabs-conteudo.test.ts` (lê o YAML sem o Keystatic):
  - `paginaPropria` ⇒ existe `app/(site)/pilulabs/<slug>/page.tsx`; `paginaPropria` + `tipo: extensao` ⇒ existe também `privacidade/page.tsx`;
  - toda pasta de rota `app/(site)/pilulabs/<slug>/` com `page.tsx` tem item com `paginaPropria` (o subdomínio depende disso);
  - todo listado tem `descricao`, um link (`linkDoItem` com e sem subdomínios) e, se o `logo` é caminho, o arquivo em `public/`.
- As 3 rotas PiluLabs e as imagens OG continuam estáticas (o comando do `apps/web/CLAUDE.md`).

## 9. Testes

- **Jest:** `lib/pilulabs.test.ts` (normalização, `selecionarParaHome` com 0, 1, 4 e 6 destaques, destaque não listado, data vazia, empates; `linkDoItem` nos 5 ramos; `itemParaProject`); `lib/pilutech-dominios.test.ts` (cada host, porta, maiúscula, `www`, cada exceção, `/pilulabs` exato e com barra final, query, 308 só com a chave ligada e só fora do host PiluTech; `urlPublica`); o matcher do `proxy.ts` pelo utilitário de teste do Next 16, se existir; schema do admin; componentes (vitrine, card, seção da home, formulário do admin) com `renderToStaticMarkup`.
- **Storybook:** story nova ou atualizada para cada componente novo ou mudado (seção PiluLabs da home com 3 e com 6 itens, card de cada tipo, formulário e lista do admin).
- **Playwright:** `home.e2e.ts` (seção PiluLabs, até 4 cards derivados do YAML, "Saiba mais" leva à vitrine); `pilulabs.e2e.ts` (todos os listados, o link externo do Sombraí); um E2E de subdomínio via `pilutech.localhost` (`/` → vitrine, `botai.` → página do Botaí, `botai./privacidade` → política, um asset servido); `admin/pilulabs/pilulabs.e2e.ts` no lugar do de projetos.
- **Botaí:** `manifesto.e2e.ts` e `loja/textos.test.ts` com a URL nova; o job `pacotes` do CI refaz zip e reprodução.

## 10. Fora

- Página própria do Sombraí no `apps/web` (ele tem landing própria).
- Lojas de app mobile (Play Store e App Store) no modelo.
- `sitemap.ts`/`robots.ts`.
- Mudar o repositório do Sombraí.
- Landing própria do Botaí: o dono vai mandar o design depois ("vai ser a mesma coisa" que a do Sombraí). Até lá, `botai.pilutech.com.br` tem um CNAME provisório e o link do Botaí cai em `/pilulabs/botai`, porque a chave está desligada. A landing nova precisa servir também `/privacidade`, que é a URL da política nas lojas e na extensão.
