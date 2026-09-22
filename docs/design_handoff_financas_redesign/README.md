# Handoff: remodelação do módulo Finanças (`apps/financas/web`)

## Visão geral

Redesenho visual e de hierarquia das **14 telas** que já existem hoje no módulo Finanças do
`PiluVitu/PiluVitu-Dev` (`apps/financas/web`), em tema **claro e escuro**, com layout **desktop
(sidebar)** e **mobile (top bar + tab bar)**.

**Nenhum recurso novo.** Nenhuma rota nova, nenhum campo novo, nenhuma query nova. Todo conteúdo
do redesenho sai do que as telas atuais já buscam e exibem. O que muda é: hierarquia tipográfica,
anatomia de card, densidade, e a representação gráfica dos números.

## Sobre os arquivos deste pacote

Os arquivos aqui são **referência de design feita em HTML** — um protótipo que mostra a aparência
e o comportamento pretendidos, **não código de produção para copiar**. A tarefa é **recriar estes
desenhos no ambiente que o app já tem**: React + Vite + Tailwind v4 + `@piluvitu/ui` (shadcn/Radix),
usando os componentes e tokens que já existem em `packages/ui/src`. Nada de reescrever com CSS
inline ou introduzir biblioteca nova de UI/gráfico.

Em particular:

- Os `style="…"` inline do protótipo existem porque o protótipo é um arquivo único. **No app, use
  classes Tailwind + os tokens de `packages/ui/src/styles.css`.**
- As variáveis `--pv-*` do protótipo são só um espelho dos tokens reais. O mapa está em
  _Design tokens_ abaixo: cada `--pv-*` corresponde a um token que o app já tem (`--background`,
  `--card`, `--primary`, …). **Não crie tokens novos.**
- O tema escuro no app continua sendo a classe `.dark` em `<html>` via `lib/theme.ts` (já
  implementado, Claro/Escuro/Sistema). O protótipo só simula isso com um botão.

## Fidelidade

**Alta (hifi).** Cores, tipografia, escala numérica, raios, espaçamentos e estados estão definidos.
Recrie a UI fielmente, com os componentes do design system do próprio repo. Onde o protótipo usa
`<div>` cru para algo que o `@piluvitu/ui` já resolve (`Card`, `Button`, `Badge`, `Input`, `Label`,
`Sheet`, `Dialog`, `Ajuda`, `Skeleton`), **use o componente do design system**.

---

## Sistema de layout (vale para todas as telas)

### Shell

| Breakpoint     | Chrome                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `≥ md` (768px) | Sidebar fixa de **248px**: marca (quadrado 34px, raio 12px, `--primary`, letra "P") + 4 grupos de nav com overline mono + rodapé com e-mail e "Sair". Conteúdo em coluna única, `max-width: 940px`, padding `26px 28px 34px`. |
| `< md`         | Top bar de **56px** (marca + título da rota + tema + conta) e tab bar fixa embaixo com **5 slots de 58px** (Início, Lançar, Extrato, Dívidas, Mais). Conteúdo com padding `18px 14px 26px`.                                   |

Isso é exatamente a divisão que `App.tsx` já faz (`useMenorQueMd`, `ROTAS_NA_BARRA`, `GRUPOS`,
`TITULO_DA_ROTA`) — **a estrutura de navegação não muda**, só o estilo:

- Item de nav: altura mínima **40px**, raio **12px**, ícone 16px + label 13.5px.
  Ativo = `bg-primary text-primary-foreground` com `font-weight: 700` (mantém o par medido para
  contraste, como já está no código). Inativo = `text-muted-foreground`, hover tinge para `--accent`.
- Slot da tab bar mantém os **dois canais** de estado ativo já existentes: cor `--primary` **e**
  trilho `border-t-2 border-primary`.
- Grupos de nav: `Dia a dia` (Início, Lançar, Extrato, Dívidas, Comprometido, Importar),
  `Cadastro` (Contas, Categorias, Recorrentes, Regras), `Análise` (Fluxo de caixa, Insight,
  Reserva), `Sistema` (Configurações).

### Cabeçalho de página (novo padrão — a peça que unifica as telas)

Toda tela abre com o mesmo bloco, nesta ordem:

1. **Overline** mono, 10px/600, `letter-spacing: .2em`, uppercase, `--muted-foreground` — o grupo da
   rota ("Dia a dia", "Cadastro", "Análise", "Sistema", "Visão geral").
2. **`<h1>`** 26px/700, `letter-spacing: -.02em`, `line-height: 1.15` (hoje 24px na sidebar/top bar
   — segue vindo de `TITULO_DA_ROTA` em `App.tsx`, não das páginas).
3. **Subtítulo** 13.5px, `line-height: 1.5`, `--muted-foreground`, `max-width: 62ch` — é o mesmo
   texto descritivo que cada página já tem hoje (ex.: "Confira, corrija, marque como pago ou apague
   um lançamento.").
4. **Chip de competência** à direita: pílula com borda 1px, mono 11px, ponto de 7px em `--success`,
   texto "competência set/26".

### Faixa de KPIs (novo padrão)

Antes de qualquer tabela/gráfico/formulário, uma faixa de 2–4 cartões:
`grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px`.
Cada cartão: padding `16px 18px`, borda 1px `--border`, raio **16px**, fundo `--card`;
overline mono 10px + número **28px/700** (`tabular-nums`, `letter-spacing: -.02em`) + contexto 12px
em `--muted-foreground`. O cartão em alerta troca borda por `--destructive` e fundo por
`--destructive / 8%`, com número e contexto em `--destructive`.

### Cartão de seção

Padding **20px**, borda 1px `--border`, raio **18px** (`--radius`), fundo `--card`, sombra
`shadow-sm`. Cabeçalho do cartão = overline mono + (opcional) uma linha de 15px/600. O gatilho de
`Ajuda` (círculo de 22px com "?") fica no canto superior direito do cartão — mesmo componente
`@piluvitu/ui/ajuda` de hoje.

### Listas em vez de tabelas apertadas

Onde hoje existe tabela de 3+ colunas em telas de leitura (Extrato, Dívidas, Contas, Recorrentes),
o redesenho usa **linha de lista** com 1px de separador e blocos flex: isso remove o
`overflow-x-auto` e o markup duplicado card/tabela por breakpoint. Onde a tabela É o dado (matriz do
Comprometido e o mês-a-mês do Fluxo), **a tabela fica**, com cabeçalho mono e `tfoot` com
`border-top: 2px`.

### Escala numérica (mantém a disciplina já medida em `lib/tipografia.ts`)

| Papel                            | Tamanho      | Observação                                                          |
| -------------------------------- | ------------ | ------------------------------------------------------------------- |
| Número herói de tela             | **34px**/700 | só um por tela (Falta pagar, Reserva, Saldo da janela, Total gasto) |
| Número de KPI / manchete de card | **28px**/700 | faixa de KPIs, totais de bloco                                      |
| Número de sub-bloco              | **25px**/700 | saldo PJ/PF, total por escopo em Contas (22px no cabeçalho de card) |
| Valor em linha de lista          | 14px/600     |                                                                     |
| Corpo                            | 13–13.5px    |                                                                     |
| Rótulo mono / meta               | 10–11px      | `letter-spacing` .1–.2em, uppercase                                 |

**`font-variant-numeric: tabular-nums` em todo número**, e `white-space: nowrap` em toda célula de
dinheiro — as duas regras já são lei no código atual e continuam.

---

## Telas

### 1. Início (`#/`) — `pages/home.tsx` + `blocos/*`

- **Faixa de KPIs (4)**: Comprometido `52–68%` (cartão em alerta) · Gasto em set/26
  `R$ 3.412,80` com variação `+R$ 340,00 (+11%)` em `--destructive` · Total que devo `R$ 4.200,00` ·
  Reserva `2,6–3,3 meses` com "abaixo da meta de 6 meses".
- **Grid de 4 blocos**: `repeat(auto-fit, minmax(320px, 1fr)); gap: 16px` (1 coluna no mobile).
  1. **Comprometido** — gráfico de 6 barras (ver _Gráficos_), legenda piso/teto, e a frase de alerta
     dentro de uma faixa `--destructive / 7%`, raio 12px.
  2. **Para onde foi o dinheiro** — rosca de 134px + legenda de 6 categorias (bolinha 9px, nome,
     valor 600, % mono 11px) e o seletor `<input type="month">` no cabeçalho do card.
  3. **Saldos** — dois sub-cartões (PJ, PF) lado a lado, `minmax(200px,1fr)`: badge de escopo
     (pílula mono 10px; PJ em `--primary`, PF em `--secondary`), referência "≈ N meses de custo
     fixo", número 25px e a lista de contas 12.5px com valores à direita. **PJ e PF nunca somados.**
  4. **Dívidas em aberto** — total 28px, "3 dívida(s) em aberto · o que me devem não entra nesta
     soma", e por dívida: título · pessoa, valor que falta, barra de progresso de **8px** e meta mono
     "60% PAGO · R$ 2.700 DE R$ 4.500". Link "ver todas →".

### 2. Lançar (`#/lancar`) — `pages/new-entry.tsx` / `pages/transferir.tsx`

- Abas em pílula (`Lançamento` | `Transferência`) — continuam sendo `<a href>` reais (`#/lancar`,
  `#/lancar/transferir`), como hoje.
- **Coluna do formulário**: Descrição em linha cheia; depois pares em
  `repeat(auto-fit, minmax(140px,1fr))` — Valor/Data, Conta/Categoria, Favorecido/Recorrente.
  Campos: altura **40px**, raio 12px, fundo `--background`/sunken, borda 1px; valores monetários em
  JetBrains Mono 14px.
- **Bloco de flags**: os checkboxes Entrada / PJ / Parcelado viram **pílulas de 44px de alvo**
  dentro de um painel `--sunken` raio 14px, com "Parcelas" à direita. Mantém os 44px de alvo de
  `lib/touch.ts`.
- **Coluna lateral**: card "Prévia das parcelas" (número `3× R$ 114,27` + as três parcelas com
  barra) e card "Efeito no comprometido" (frase + link para `#/comprometido`).
- **Aba Transferência**: De → (seta) → Para, Valor/Data, Descrição, Categoria; ao lado, card
  "Por que não é despesa" com as duas pernas (-R$ 4.300 / +R$ 4.300) e "Efeito no total R$ 0,00".

### 3. Extrato (`#/extrato`) — `pages/extrato.tsx`

- **Faixa de filtro** (uma linha): botão `Filtros` com contador em badge, chip de resumo
  (`Nubank cartão · falta pagar`), link `limpar`, e busca com ícone à direita. O painel de filtros
  segue no `Sheet` (side="bottom") já existente.
- **Faixa de KPIs (3)**: Falta pagar · Falta entrar · Carregados `30 de 84`.
- **Lista** (não tabela): por linha — data mono 11px (46px de largura), descrição 13.5px/600,
  meta "conta · categoria · PJ", **chip de estado** (outline "FALTA PAGAR" / secondary "PAGO 15/09"),
  valor 14px/600 à direita (entrada em `--primary`), e ações `marcar pago / editar / apagar`
  (apagar em `--destructive`, empurrado para a ponta, alvo de 44px).
- **Edição inline** dentro da própria linha: grid de 3 campos (descrição, categoria, valor) +
  checkboxes Entrada/PJ + Salvar/Cancelar + a nota sobre campos protegidos.
- **Rodapé**: "30 de 84 lançamento(s) carregado(s)" + botão `Carregar mais`.

### 4. Dívidas (`#/dividas`) — `pages/DividasPage.tsx`

- KPIs (3): Total que devo · Já pago (`58% do total contraído`) · Me devem (em `--muted-foreground`,
  "não entra na soma acima").
- Lista por dívida: título (link 14px/700), pessoa + data de abertura, rótulo mono `FALTA` + valor
  18px/700, barra de **10px**, e meta mono "TOTAL · PAGO · % QUITADO".
- Card "Nova dívida": Título / Pessoa / Aberta em + botão `Criar dívida`.

### 5. Dívida — detalhe (`#/dividas/:id`) — `pages/debt-detail.tsx` + `NovoItemForm.tsx`

- Voltar ("← todas as dívidas").
- Cabeçalho: herói `R$ 1.800,00` (Falta pagar) + total/pago/itens à direita + barra de **12px** +
  meta mono "60% QUITADO · ABERTA EM … · PAI".
- Duas colunas: **Itens** (valor que falta por item, barra 6px, total/pago, `excluir`) e
  **Pagamentos** (data · conta, valor, rateio indentado com "↳ item — valor", `excluir pagamento`).
- Formulários no pé de cada coluna, em faixa `--sunken`: "Novo item" e "Registrar pagamento"
  (com os campos de rateio por item).

### 6. Comprometido (`#/comprometido`) — `pages/commitments.tsx`

- KPIs (3): Pior mês da janela `68% · set/26` (alerta) · Denominador `R$ 3.600,00` ("líquido fixo,
  mês sem freela") · Livre no melhor caso.
- **Gráfico empilhado** de 6 competências com legenda parcelas/dívidas/recorrentes e linha tracejada
  do limiar de 50% rotulada.
- **Tabela "Por conta"**: uma coluna por competência, `tfoot` com TOTAL e "% do líquido fixo"
  (célula acima do limiar em `--destructive`/700). Mantém o alerta pelo **teto** (`range.max`).

### 7. Importar (`#/importar`) — `pages/importar.tsx`

- **Stepper** de 3 cartões (Origem / Conferência linha a linha / Confirmar), o ativo com borda
  `--primary`.
- Dois cartões de origem: **Por arquivo** (conta de destino + dropzone tracejada com nome do
  arquivo e nº de linhas) e **Por conexão (Pluggy)** (status com ponto verde, `Sincronizar todas`,
  `Trocar conexão`, nota do teto de 40 páginas).
- **Conferência**: por linha — checkbox, data mono, descrição + rótulo da regra aplicada
  (`REGRA: MERCADO`, em `--primary`), select de categoria, checkbox PJ, valor.
  Linha já importada: fundo `--destructive / 12%`, rótulo `JÁ IMPORTADA · MESMO ID DO ARQUIVO`,
  controles desabilitados. Provável duplicata: rótulo em `--warn`.
- **Rodapé de ação**: "39 linhas marcadas · R$ 3.884,20" + `Confirmar import`.

### 8. Contas (`#/contas`) — `pages/accounts.tsx` + `blocos/PagarFatura.tsx`

- Dois cartões (PF, PJ), cada um com badge de escopo no cabeçalho e **total do escopo 22px/700** à
  direita. Lista por conta: nome + tipo em mono ("CONTA CORRENTE", "CARTÃO · FECHA 25 · VENCE 02"),
  saldo à direita (negativo em `--destructive`), `arquivar` na ponta.
- Linha de cartão de crédito ganha faixa `--sunken` com `pagar fatura` + "fatura set/26 · 14
  lançamentos a liquidar".
- Card "Nova conta": Nome / Escopo / Tipo / Saldo inicial / Dia de fechamento / Dia de vencimento
  em `repeat(auto-fit, minmax(160px,1fr))`, com a nota sobre cartão exigir fechamento e vencimento.

### 9. Categorias (`#/categorias`) — `pages/categorias.tsx`

- Lista agrupada por tipo com overline mono + contagem (`Despesa · 7`, `Entrada · 2`,
  `Estruturais · 2 · não se criam à mão`). Raiz = cartão 12px de padding, borda 1px, raio 12px, com
  chip `DESPESA · PJ`. Filha = **indentada** (`margin-left: 16px`, `border-left: 1px`,
  `padding-left: 12px`) com "↳ Nome". Estruturais em **borda tracejada** e sem ações.
- Card "Nova categoria": Nome / Tipo / Escopo padrão / Categoria mãe + nota de tipo imutável e
  hierarquia de 2 níveis.

### 10. Recorrentes (`#/recorrentes`) — `pages/recorrentes.tsx`

- KPIs (3): Custo fixo mensal `R$ 2.070 a 2.610` · Próximo vencimento `dia 25` · Pausadas `1`
  ("não entra no Comprometido").
- Lista com **tile de dia** (44×44, borda 1px, raio 14px, mono) + descrição + meta mono
  "PJ · CATEGORIA · CONTA" + **faixa de valor 20px/700** (`R$ 12,00 a R$ 600,00` — faixa, nunca
  média) + Editar/Excluir. Grupo `Pausadas` em fundo `--sunken`, tile tracejado, chip `PAUSADA`.
- Card "Nova recorrente": Descrição / Categoria / Conta / Escopo / Dia do mês / Valor mínimo /
  Valor máximo / Começa em + pílulas `Varia?` e `Ativa`.

### 11. Regras (`#/regras`) — `pages/regras.tsx`

- Cada regra é um bloco **SE / ENTÃO**: chip mono `SE` (secondary) com as condições em texto
  ("descrição contém **UBER** · qualquer conta · só saídas") e chip mono `ENTÃO` (`--primary`) com as
  ações ("categoria **Transporte** · favorecido **Uber** · PJ não mexe"). Regra pausada em
  `--sunken`, chip `PAUSADA`, chips e texto em `--muted-foreground`.
- Formulário espelha o bloco: painel `Se · pelo menos uma condição` (descrição contém, conta, tipo,
  valor mín./máx.) e painel `Então · pelo menos uma ação` (categoria, favorecido, PJ/PF — cada um com
  a opção "Não mexe"), + pílula `Ativa`.

### 12. Fluxo de caixa (`#/fluxo`) — `pages/fluxo.tsx`

- Herói `R$ 7.842,15` ("Saldo dos últimos 12 meses") com "Entrou … · saiu …"; ao lado, card do
  seletor `Janela` (6/12/24 meses) com a nota de que só entra o que já se moveu.
- **Gráfico**: barras entrou (acima, `--primary`) e saiu (abaixo, `--chart-3`/amber) em torno de uma
  linha-base de 1px, com a **polilinha do acumulado** em `--success` sobreposta (SVG,
  `stroke-width: 2.5`).
- **Tabela mês a mês** com Entrou/Saiu/Saldo/Acumulado; saldo negativo em `--destructive`/600;
  `tfoot` com TOTAL e acumulado como "—" (não se soma saldo corrente).

### 13. Insight (`#/insight`) — `pages/insight.tsx`

- Card **Números** (calculados): herói `R$ 3.412,80`, frase de variação, e Top categorias com barra
  de proporção de **7px** contra o total do mês (não contra a maior categoria), + "O que mais
  cresceu".
- Card **Leitura**: data/idade da geração, o texto do modelo em bloco `--sunken` raio 14px
  (13.5px/1.6), "Modelo: …", botão `Gerar insight deste mês` com a nota dos 20–35s, e a faixa
  lembrando que **nenhum número da tela vem do modelo**.

### 14. Reserva (`#/reserva`) — `pages/reserva.tsx`

- Herói `R$ 6.778,40` + **medidor**: trilho de 16px, faixa piso→teto (piso sólido em `--warn`,
  teto no mesmo tom a 35%), marcas mono 2,6 / 3,3 / 6,0 e a meta calculada em texto. Alerta pelo
  **piso** (mesma inversão do código atual).
- Card "Contas designadas": linhas com alvo de 44px (checkbox + nome + saldo) e
  `Salvar contas designadas`.
- Card "Simulador": dois painéis (`À vista`, `Financiado`) em `minmax(190px,1fr)`, cada um com seus
  campos e o resultado em meses de sobrevivência / % da renda fixa.

### 15. Configurações (`#/configuracoes`) — `pages/config.tsx`

Grid de cartões: Renda fixa de referência (campo mono 16px, "Valor salvo hoje", Salvar) · Tema
(Claro/Escuro/Sistema como botões de 44px, o ativo em `--primary`) · Conta (e-mail + Sair) ·
Backup (`make backup-financas` em `<code>`) · Conectar contas (borda **tracejada**, ausência honesta).

---

## Gráficos

Nenhuma biblioteca nova. Duas opções, nesta ordem de preferência:

1. **Manter `recharts`** (já é o único importador em `blocos/GraficoComprometido.tsx`, carregado
   lazy, e o `scripts/check-financas-lazy-chart.mjs` depende disso) e ajustar a aparência:
   - Comprometido: `<BarChart>` **empilhado** (parcelas / dívidas / recorrentes) +
     `<ReferenceLine y={50%}>` tracejada rotulada "50% DA RENDA FIXA"; rótulo de % acima de cada
     barra; raio de topo 10px; eixo X com `rotuloCompetencia`.
   - Fluxo: `<ComposedChart>` com duas `<Bar>` (entrou positivo / saiu negativo) em torno de
     `<ReferenceLine y={0}>` + `<Line>` do acumulado.
   - Categorias: `<PieChart>` com `innerRadius` ≈ 62% (rosca) e o total no centro.
2. Onde o protótipo usa **barra de proporção simples** (Top categorias do Insight, progresso de
   dívida/item, medidor da Reserva), **não use gráfico nenhum** — são `<div>`s com `width: %`, como
   já é hoje em `insight.tsx`. Custo de bundle zero.

Paleta de dados: `--chart-1..5` + `--primary`, na ordem usada no protótipo
(`--primary` → `--primary` 42% → `--success` → `--warn` → `--win` → rosa). É paleta **neutra de
dados**, não de marca.

Regras de cor que o redesenho preserva (já são decisões medidas do repo):

- **Nada de verde para "gastou menos"** — gastou mais em `--destructive`, gastou menos em
  `--muted-foreground`; o sinal é o `+`/`−` e as palavras.
- Cor nunca é o único canal: alerta sempre acompanha frase (`role="alert"`), e o estado ativo do nav
  tem cor **e** trilho.

---

## Interações e estados

- **Navegação**: hash router existente (`useHash`, `resolveRoute`). O protótipo troca de tela por
  estado só porque é um arquivo único.
- **Tema**: `lib/theme.ts` já resolve claro/escuro/sistema com `.dark` em `<html>` e leitura síncrona
  no `index.html`. O redesenho só acrescenta a **paridade de tokens escuros** (tabela abaixo) e o
  seletor em Configurações; o ciclo no ícone da top bar continua como está.
- **Transições**: só `background-color` ~200ms ease em hover/press (regra do design system). Sem
  scroll-reveal, sem spring.
- **Alvos de toque**: 44px mínimo em toda ação de linha (`lib/touch.ts`, `ALVO_LINK`,
  `ALVO_LINK_FIM`, `ALVO_LINHA`) — o destrutivo continua empurrado para a ponta com `ml-auto`.
- **Estados por bloco**: carregando (`Skeleton` dentro do card), erro (`role="alert"` **dentro** do
  card/linha, nunca no topo da página), vazio (frase que nomeia o recorte e aponta a saída) — tudo
  como já está em `blocos/Bloco.tsx` e `extrato.tsx`.
- **Responsivo**: `< md` troca sidebar por top bar + tab bar; `< sm` os grids caem para 1 coluna
  (todos usam `auto-fit`/`minmax`, então isso é automático). `scroll-padding-bottom` do
  `styles.css` continua necessário por causa da tab bar fixa.

## Design tokens

Todos já existem em `packages/ui/src/styles.css`. Mapa protótipo → token real:

| Protótipo           | Token                         | Claro         | Escuro        |
| ------------------- | ----------------------------- | ------------- | ------------- |
| `--pv-bg`           | `--background`                | `220 50% 98%` | `220 33% 5%`  |
| `--pv-card`         | `--card`                      | `0 0% 100%`   | `222 36% 9%`  |
| `--pv-sunken`       | `--background` / `--muted`    | `220 50% 99%` | `221 35% 7%`  |
| `--pv-fg`           | `--foreground`                | `222 36% 9%`  | `215 33% 93%` |
| `--pv-muted`        | `--muted-foreground`          | `215 18% 35%` | `216 17% 64%` |
| `--pv-border`       | `--border` / `--input`        | `216 30% 88%` | `205 40% 18%` |
| `--pv-primary`      | `--primary`                   | `198 93% 26%` | `198 93% 60%` |
| `--pv-primary-fg`   | `--primary-foreground`        | `0 0% 100%`   | `200 75% 6%`  |
| `--pv-secondary`    | `--secondary`                 | `216 42% 95%` | `221 35% 14%` |
| `--pv-bad`          | `--destructive`               | `0 84% 47%`   | `0 91% 71%`   |
| `--pv-good`         | `--success` / `--ok`          | `158 64% 29%` | `158 64% 52%` |
| `--pv-warn`         | `--warn`                      | `38 92% 31%`  | `43 96% 56%`  |
| `--pv-c1…c6`        | `--primary`, `--chart-1..5`   | —             | —             |
| `--pv-primary-soft` | `--accent-soft` (wash 13–18%) | —             | —             |

**Não clareie** `--primary` / `--destructive` / `--success` / `--warn` no claro: são valores medidos
para WCAG.

- **Tipografia**: `Plus Jakarta Sans` (400–800) para prosa; `JetBrains Mono` só em rótulo, timestamp,
  overline e chip, sempre com `letter-spacing` 0.1–0.2em e uppercase quando é overline.
- **Raios**: `--radius: 18px` (cartão de seção), 16px (KPI), 14px (sub-cartão / painel), 12px
  (campo, botão, item de nav), 10px (campo compacto), `999px` (pílula, badge, barra).
- **Sombras**: `--shadow-xs`/`--shadow-sm` apenas. **Nunca `--shadow-ds`** (é do cartão 3D).
- **Espaçamento**: gap de seção 20–22px, gap de grid 16px, gap de KPI 12px, padding de cartão 20px
  (18px no mobile), padding de linha de lista 14–16px × 18px.
- **Fundo da página**: `radial-gradient(70% 45% at 50% 0%, var(--accent-soft), transparent 70%)`
  sobre `--background` — o mesmo brilho suave do `apps/web`, só no topo.

## Assets

Nenhum asset novo. Ícones = **Font Awesome Free** no protótipo (é o sistema do design system);
**no app, mantenha `lucide-react`**, que é o que `App.tsx` já usa. Equivalências:
`fa-house`→`House`, `fa-plus`→`Plus`, `fa-receipt`→`Receipt`,
`fa-hand-holding-dollar`→`HandCoins`, `fa-gauge-high`→`Gauge`, `fa-file-import`→`Download`,
`fa-wallet`→`Wallet`, `fa-tags`→`Tags`, `fa-rotate`→`Repeat`, `fa-filter`→`Filter`,
`fa-arrow-trend-up`→`TrendingUp`, `fa-wand-magic-sparkles`→`Sparkles`, `fa-piggy-bank`→`PiggyBank`,
`fa-gear`→`Settings`, `fa-bars`→`Menu`. Sem emoji.

Os dados do protótipo (R$ 3.412,80, Starlink R$ 189, DAS R$ 12–600, renda fixa R$ 3.600, dívidas
Pai/Tio/Ramielle) são **exemplos plausíveis** para dimensionar o layout — não são dados reais.

## Arquivos

| Arquivo                            | O que é                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Financas.dc.html`                 | O protótipo das 14 telas (claro/escuro, desktop/mobile). Abra num navegador; os botões do topo trocam tema e dispositivo, e a nav troca de tela. |
| `support.js`                       | Runtime do protótipo (não vai para o app).                                                                                                       |
| `_ds/…/tokens/*.css`, `styles.css` | Os tokens usados no protótipo — espelho de `packages/ui/src/styles.css`.                                                                         |
| `github.md`                        | Mapa tela → arquivos de origem em `apps/financas/web`.                                                                                           |

## Ordem sugerida de implementação

1. Shell (`App.tsx`): nav agrupada, cabeçalho de rota com overline/subtítulo, chip de competência.
2. Primitivos de layout: `Bloco` (cartão de seção com overline + Ajuda) e um `KpiCard` novo em
   `blocos/` substituindo o uso solto de `NumeroCard` nas faixas de KPI.
3. Início (os 4 blocos) → é onde a mudança aparece inteira.
4. Comprometido e Fluxo (os dois gráficos que mudam de forma).
5. Extrato (lista + filtros) → Dívidas/detalhe → Contas.
6. Cadastro (Categorias, Recorrentes, Regras) e Importar.
7. Insight, Reserva, Configurações.

Em cada passo, os testes existentes (`*.test.tsx`) são o contrato: `data-testid`, textos e a árvore
acessível **não devem mudar** — o redesenho é de estilo e de ordem visual, não de conteúdo.
