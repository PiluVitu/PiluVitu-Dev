# Design system compartilhado + UI rica do finanças

**Data:** 2026-07-26
**Branch:** `feat/financas-pj`
**Antecedente:** `docs/superpowers/specs/2026-07-25-financas-pj-design.md` (fatia ①, entregue) e `2026-07-26-financas-auth-better-auth-design.md` (troca de auth, entregue e em produção)

## 0. Resultados do spike (2026-07-26) — leia antes de tudo

Medido em scaffolding descartável, sem tocar no repositório. Relatório completo em `.superpowers/spikes/2026-07-26-packages-ui.md`. **Onde estes fatos contradizem documentação ou intuição, eles governam.**

1. **`apps/web` é Tailwind 4 puro CSS-first.** Não existe `tailwind.config.*`. Os tokens vivem num bloco `@theme` em `apps/web/app/globals.css` (276 linhas), com `@import 'tailwindcss'`, `@plugin '@tailwindcss/typography'` e `@custom-variant dark (&:is(.dark *))`. O wiring é `@tailwindcss/postcss` via `postcss.config.mjs`.

2. **`@source` é OBRIGATÓRIO nos dois consumidores.** Sem ele, uma classe que só existe dentro de `packages/ui` é descartada silenciosamente do CSS emitido — comprovado com utilitário de valor arbitrário presente/ausente no CSS de saída. **A falha é assimétrica:** o dev server do Next/Turbopack quebra igual à produção (você vê na hora), mas o **dev server do Vite serve as classes normalmente sem `@source` e só quebra no build** — "funciona no dev, quebra em produção" é real só do lado do Vite. É o modo de falha mais perigoso deste projeto e a §4 existe por causa dele.

3. **Fonte `.tsx` crua funciona nos dois.** Precedente: `@piluvitu/tools` publica TS cru pelo `exports` map, sem build. **Inconclusivo e sinalizado:** ao remover `transpilePackages` (Next) e `optimizeDeps.exclude` (Vite) e reconstruir, nada quebrou — inclusive testando com os arquivos reais de `@piluvitu/tools` copiados verbatim. Isso **contradiz o comentário que está hoje no `vite.config.ts` real**. Não confiar nem no comentário antigo nem no resultado do spike: retestar contra o `packages/ui` de verdade, e só então escrever a conclusão.

4. **`next-themes` não é obstáculo.** Dos 15 componentes, **só `sonner.tsx` o usa**, e apenas para repassar uma string de tema. Os outros 14 dependem só da classe `.dark`. Além disso, `next-themes@0.4.6` **não depende de `next`** (peers são só react/react-dom), então rodaria na SPA Vite se um dia fizer falta.

5. **Gráficos: recharts 3.10.1.** Declara suporte a React 19 e foi confirmado renderizando (Chromium, 0 erros). Custo marginal medido: **+110 KB gzip** para o primeiro gráfico. Alternativa chart.js custa +55 KB, mas o componente `chart` do shadcn é **hard-wired** ao recharts — "mais leve" implica reescrever a API, não é economia grátis. **Correção de premissa:** o teto de 3 MB da Cloudflare vale para o **script do Worker** (hoje 332 KB gzip), **não** para assets estáticos. O gráfico não ameaça o deploy; o custo é peso de página (baseline atual 75,86 KB gzip).

## 1. Problema

O `apps/financas/web` tem **58 linhas de CSS escrito à mão e zero componentes**. O `apps/web` tem Tailwind 4, 15 componentes shadcn/ui, CVA, `clsx`, `tailwind-merge` e `next-themes`. O finanças nasceu cru porque a fatia ① priorizou o domínio; a consequência é um app que funciona e parece um protótipo.

Além do visual, faltam duas coisas de produto: **não existe home** (a rota default é a lista de contas) e **não existe tela de configurações**.

## 2. Escopo

**Dentro:**

- `packages/ui` — workspace novo com tokens + componentes shadcn, consumido pelo `apps/web` e pelo `apps/financas/web`
- Migração das 5 telas existentes do finanças para o design system
- **Home modular** com quatro blocos: comprometido, saldos, dívidas, para onde foi o dinheiro
- **Tela de configurações**
- Gráficos (recharts)

**Fora, com motivo:**

- **Open Banking / Open Finance** — é a fatia ④. Participação direta exige R$ 1.000.000 de capital (descartada na pesquisa da fatia ①). A alternativa é agregador (Pluggy), com uma contradição não resolvida sobre o trial e risco de exigir cartão verificado — o mesmo bloqueio que tirou o Zero Trust do projeto. **Decisão do dono em 2026-07-26: import de fatura (fatia ②) primeiro**, que não depende de terceiro. Ganha spec próprio.
- Redesenho do `apps/web`. Ele **cede** o design system; o visual dele não muda. Qualquer diferença de pixel no blog é regressão, não melhoria.

## 3. Arquitetura

### 3.1 `packages/ui` (`@piluvitu/ui`)

Segue o precedente de `@piluvitu/tools`: **fonte TS/TSX crua pelo `exports` map, sem build, sem `dist/`**. Um build step aqui só adicionaria uma coisa para quebrar; os dois consumidores compilam TSX nativamente.

```
packages/ui/
  package.json          exports: './styles.css', './cn', './button', './card', …
  src/
    styles.css          @theme (tokens) + @custom-variant dark — SEM @import 'tailwindcss'
    cn.ts               clsx + tailwind-merge
    button.tsx  card.tsx  badge.tsx  input.tsx  label.tsx  …
```

**`styles.css` não importa o `tailwindcss`.** Quem importa é cada app, porque o `@import` é o que dispara o scanner — e o scanner precisa rodar no contexto do app, com os `@source` do app. O pacote exporta só tokens e variantes.

**O que migra:** os 14 componentes que dependem apenas de `.dark`. **`sonner.tsx` fica no `apps/web`** — é o único acoplado ao `next-themes`, e movê-lo obrigaria o pacote compartilhado a carregar um provider que a SPA não tem. Se o finanças precisar de toast, entra depois com o tema por prop.

### 3.2 Consumo

**`apps/web/app/globals.css`** passa a importar os tokens do pacote e declara o `@source`:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../../../packages/ui/src';
@plugin '@tailwindcss/typography';
```

**`apps/financas/web/src/styles.css`** (hoje 58 linhas de CSS puro, some) vira:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../../../../packages/ui/src';
```

O caminho relativo do `@source` é contado a partir do arquivo CSS. Errar o número de `../` é o mesmo que não ter `@source`: **falha silenciosa**.

### 3.3 Tema escuro

`.dark` no `<html>`, igual ao `apps/web`. O `apps/web` continua com `next-themes`. O finanças ganha um toggle de ~20 linhas que grava em `localStorage` e alterna a classe — não vale um provider para um app de usuário único, e a §0.4 mostra que os componentes não precisam de um.

### 3.4 Home modular

`#/` passa a ser a home; `#/contas` deixa de ser default. Quatro blocos, cada um um componente isolado com seu próprio estado de carregamento, erro e vazio — um bloco que falha **não derruba a home**:

| Bloco                        | Fonte                          | Visual                                                                            |
| ---------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| **Comprometido**             | `GET /api/reports/commitments` | Barras por competência + linha de referência nos R$ 3.600. Vermelho acima de 50%. |
| **Saldos**                   | `GET /api/accounts`            | Cards por conta com `balance_cents`, e totais PJ vs PF separados.                 |
| **Dívidas**                  | `GET /api/debts`               | Barra de progresso por dívida, com os itens abertos.                              |
| **Para onde foi o dinheiro** | **rota nova**                  | Pizza/barras por categoria do mês.                                                |

O quarto bloco **não tem endpoint hoje** — `GET /api/reports/by-category?competence=YYYY-MM` é backend novo, não só UI. É o único trabalho de Worker desta spec.

"Modular" é requisito de código, não adjetivo: cada bloco é um arquivo, busca o próprio dado e é montável fora da home (a tela cheia de Comprometido reusa o mesmo componente).

### 3.5 Configurações

`#/config`, com o que hoje não tem lugar:

- **Renda fixa de referência** (`fixed_net_cents`, hoje fixo em R$ 3.600 no backend) — é o denominador de toda a tela de Comprometido e precisa ser editável sem deploy. Persistir por usuário exige tabela; a decisão de schema entra no plano.
- **Tema** (claro/escuro/sistema)
- **Conta logada + sair** (hoje o "Sair" mora no cabeçalho)
- **Backup**: instruções e último backup conhecido
- **Espaço reservado para conectar contas** — a fatia ② vai encostar aqui

## 4. O gate contra a falha silenciosa

A §0.2 é a razão desta seção existir. Um teste que "renderiza e passa" **não** pega classe faltando: o componente monta igual, só sai sem estilo.

**Gate obrigatório, um por app:** depois do build de produção, procurar no CSS emitido uma classe que **só** existe dentro de `packages/ui`. Ausente ⇒ falha o build.

- `apps/financas/web`: roda no `build`, porque é o lado onde o dev mente.
- `apps/web`: mesmo gate no `build`.
- Os dois no CI, no job que já existe.

Escolher uma classe **sentinela** rara e nunca usada por app nenhum, declarada num comentário do `packages/ui`, para o gate não passar por acidente via outro arquivo.

## 5. Riscos

| Risco                                                   | Mitigação                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@source` errado ⇒ produção sem estilo                  | §4, gate no build dos dois apps                                                                               |
| Regressão visual no blog em produção                    | Suíte do `apps/web` verde antes e depois; Storybook é a referência; nenhum componente muda de API na migração |
| `transpilePackages`/`optimizeDeps` (§0.3, inconclusivo) | Retestar contra o `packages/ui` real; documentar o resultado medido, não o suposto                            |
| +110 KB gzip de recharts                                | Aceito e medido. Importar o gráfico com `lazy` para não pesar a primeira pintura da home                      |
| Escopo: 5 telas + home + config numa tacada             | Plano em tasks independentes; cada tela é entregável sozinha                                                  |

## 6. Critérios de aceitação

- `pnpm -r test` e `pnpm -r lint` verdes; suíte do `apps/web` sem regressão
- O gate da §4 falha de propósito quando o `@source` é removido — provado, não afirmado
- `financas.piluvitu.com.br` abre numa home com os quatro blocos, cada um com estado de carregamento e de vazio
- Um bloco com erro não derruba os outros três
- Tema escuro funciona nas duas frentes
- A home é usável no Android (o dono lança gasto pelo celular) e no MacBook
- Nenhuma mudança visual no blog
