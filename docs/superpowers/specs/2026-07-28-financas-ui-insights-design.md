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

## 3. Insight: roda no Mac, resultado vive no D1

⚠️ **Correção de rumo (2026-07-28).** A §0 mediu que o Workers AI _funciona_ nesta conta, e eu tratei isso como se fosse gratuito. **Não é** — há cota livre pequena e depois é pago. O dono foi explícito: **zero custo de AI, usando a infra local**.

### O desenho

O Mac **empurra**, o app **lê**. Não há chamada do app para o Mac.

1. Um comando roda no MacBook (Ollama, custo zero) — sob demanda ou agendado
2. Ele lê os dados via API, calcula e gera o texto
3. Faz `POST` do resultado para a API, que grava no D1
4. A tela do app **lê do D1**, com a data de geração

**A consequência é o ponto:** o app nunca depende do Mac estar ligado. Do celular, com o laptop fechado, a tela abre e mostra o último insight dizendo quando foi feito. O túnel vira detalhe de como o Mac alcança a API — não dependência de runtime de nenhuma tela.

Isso é melhor que puxar pelo túnel, que faria toda abertura da tela depender de outro computador acordado.

### A separação que continua valendo

- **A aritmética não é AI.** "Onde gastei mais", "quanto subiu contra o mês passado" são consultas exatas, calculadas no Worker, e a tela as mostra **sempre** — mesmo sem nunca ter rodado o comando no Mac.
- **A AI escreve a leitura** por cima de números já calculados. Ela não recebe lançamento cru para "descobrir" padrão.

⚠️ **Nenhum número exibido pode vir do modelo.** Os valores são renderizados a partir dos dados; o modelo escreve o texto ao redor. LLM erra aritmética com confiança, e aqui erro de número é erro financeiro.

### Frescor, não silêncio

A tela mostra **quando** o insight foi gerado. Insight de três semanas atrás apresentado como se fosse de hoje é pior que insight nenhum — o dono tomaria decisão sobre um retrato velho sem saber.

### Autenticação do Mac

O app usa sessão do Better Auth (cookie de navegador). Um comando de terminal não tem sessão.

**Decisão:** um segredo dedicado (`INGEST_TOKEN`, via `wrangler secret put`) checado por middleware **só nas rotas de ingestão**. O caminho de sessão do navegador fica intocado — nada do que já existe passa a aceitar token.

⚠️ Escopo mínimo: esse token **escreve insight**, não lê nem escreve lançamento. Se vazar, o estrago é texto errado numa tela, não acesso ao livro-caixa.

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
