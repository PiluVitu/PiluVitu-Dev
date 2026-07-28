# Fatia ⑨ — UI/UX, gráficos shadcn e insight de AI

**Data:** 2026-07-28

## 0. Fatos medidos (2026-07-28)

- **Workers AI funciona nesta conta.** Testado com Worker descartável: `@cf/meta/llama-3.1-8b-instruct` devolve `5028: This model was deprecated on 2026-05-30`, e **`@cf/meta/llama-3.3-70b-instruct-fp8-fast` responde normalmente**. Ou seja, o binding `AI` está disponível e o insight pode rodar **no Worker** — de qualquer aparelho, sem depender do MacBook.
- **`packages/ui` não tem componente de gráfico.** Os 15 componentes atuais não incluem o `chart` do shadcn.
- **O menu são links sublinhados crus** — `text-primary text-sm underline underline-offset-4` em `App.tsx`.
- **A tela de import não menciona PDF** e não o aceita (`.ofx`, `.qfx`, `.csv`).

## 1. Problemas

Três, relatados pelo dono usando o app em produção.

**A UI está simples demais.** Menu de links sublinhados, telas sem hierarquia visual, e no import o rótulo cola no input (`Arquivo (.ofx, .qfx ou .csv)Choose File No file chosen`).

**Faltam os gráficos pedidos.** Existem dois (barras do comprometido, categorias) mas o pedido era mais rico. O dono indicou os **charts do shadcn**, especificamente area chart.

**Não há insight.** Ele quer um relatório dizendo onde está gastando mais.

## 2. O PDF é invisível — falha de descoberta

O CLI de PDF existe e funciona, mas **a tela de import não diz que ele existe**. O dono foi procurar PDF ali e não achou.

Correção: a tela explica o caminho — rodar o CLI no Mac gera um CSV que entra ali mesmo — e diz por que é assim (Ollama exige GPU; nenhum tipo de instância do Cloudflare Containers tem). **Sem prometer botão que não existe.**

⚠️ E precisa deixar claro que **nenhum servidor precisa estar ligado**: o Ollama roda só durante o comando, na máquina do dono. A dúvida do dono foi exatamente essa.

## 3. Insight: onde roda, e o que é AI de verdade

A §0 mede que Workers AI está disponível. Então o insight roda **no Worker**, não no Mac.

Mas há uma separação que precisa ser explícita, senão a tela vira adivinhação com verniz:

- **A aritmética não é AI.** "Onde gastei mais", "quanto subiu contra o mês passado", "qual categoria cresceu" são consultas. Elas são calculadas, exatas, e funcionam **mesmo se a AI falhar ou a cota acabar**.
- **A AI escreve a leitura.** Ela recebe os números já calculados e produz o texto que conecta os pontos. Ela **não** recebe lançamento cru para "descobrir" padrão, e **não** inventa número.

⚠️ **A tela funciona sem AI.** Se a chamada falhar, os números continuam lá e só o parágrafo some — com aviso. Uma tela de análise que fica em branco porque um modelo não respondeu é pior que uma tabela.

⚠️ **Nenhum número no texto pode vir do modelo.** Os valores são renderizados pelo código a partir dos dados; o modelo escreve o texto ao redor. LLM erra aritmética com confiança, e aqui erro de número é erro financeiro.

### Cota

Workers AI tem cota diária no plano gratuito. O insight é **sob demanda** (botão), nunca automático ao abrir a tela — carregar a home não pode consumir cota. E o último insight fica salvo em `settings` com data, para reabrir sem gastar de novo.

## 4. Gráficos

Adotar o componente `chart` do shadcn em `packages/ui` — ele é construído sobre recharts, que já está no projeto atrás de fronteira lazy protegida por gate.

⚠️ **Não criar um terceiro chunk de recharts.** O build hoje emite exatamente um (`GraficoComprometido-*.js`, ~368 KB) e o bundle principal tem zero ocorrências. Exportar dali, como o gráfico de categorias fez.

Onde entra area chart: **fluxo de caixa acumulado** — é a série que mais ganha com área, porque a leitura é "a reserva subindo ou sendo consumida ao longo do tempo".

## 5. UI/UX — o que muda e o que não

**Não é redesign.** O design system fica: mesmos tokens, mesmos componentes, mesmo tema escuro. O que muda é aplicação.

- **Navegação** vira navegação de verdade, não lista de links sublinhados. Com estado ativo.
- **Hierarquia**: título, subtítulo e ação com peso diferente
- **Densidade**: espaçamento consistente entre cards e seções
- **Formulários**: rótulo e campo com respiro — o bug visível no print
- **Estados vazios** com a mesma qualidade dos que a fatia ⑥ já entregou

⚠️ **390 px continua sendo alvo.** Navegação com mais peso visual é onde é mais fácil estourar largura no celular.

## 6. Fora de escopo

- Trocar biblioteca de gráfico. recharts fica.
- Tema claro como padrão. Escuro continua.
- Insight preditivo ("você vai estourar em setembro"). Primeiro descrever o passado com precisão.

## 7. Critérios de aceitação

- Componente `chart` do shadcn em `packages/ui`, **sem** terceiro chunk de recharts — verificado no build
- Fluxo de caixa com area chart de acumulado
- Navegação com estado ativo, funcionando a 390 px
- Import explica o caminho do PDF e que **nada precisa estar ligado**
- Insight sob demanda, com os números calculados e só o texto vindo do modelo
- **A tela de insight funciona com a AI fora do ar** — provado por teste
- Nenhum número exibido tem origem no modelo
- Suítes verdes; os dois gates silenciosos
