# Finanças PJ — pente fino do pedido vs. entregue, e o plano até o fim

**Data:** 2026-07-27
**Estado:** levantado contra o código e o banco reais, não de memória.

## 1. O que foi pedido, o que existe

Legenda: ✅ entregue e em produção · 🟡 parcial · ❌ nunca começou

| #   | Pedido (com a data em que foi feito)                                                       | Estado                                                                                          |
| --- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1   | Dívidas com pessoas, com **sub-itens** ("devo 1.360 ao pai, dentro: Steam Deck, MacBook")  | ✅                                                                                              |
| 2   | Despesas **parceladas**                                                                    | ✅                                                                                              |
| 3   | Custo zero, free tier                                                                      | ✅                                                                                              |
| 4   | Login sem Zero Trust (cartão não verificável)                                              | ✅ Better Auth + Google                                                                         |
| 5   | UI rica, com gráficos, home modular                                                        | ✅                                                                                              |
| 6   | Configurações do app                                                                       | ✅                                                                                              |
| 7   | **Excluir** dívida                                                                         | ✅                                                                                              |
| 8   | Textos explicativos ensinando a usar                                                       | ✅ ajuda em 7 pontos                                                                            |
| 9   | **Métrica de risco** considerando o freela volátil de R$ 2.000                             | 🟡 Comprometido existe, mas **incompleto** — ver §2.1                                           |
| 10  | **Mapa visual de fluxo de caixa**                                                          | ❌ `v_cashflow` existe no banco desde o `0001` e **nenhum código a usa**                        |
| 11  | **Reserva de emergência como prioridade matemática absoluta**, antes de ativo que deprecia | ❌ nada. Nem meta, nem acompanhamento, nem tela                                                 |
| 12  | Agregar fatura de **vários cartões** — a dor original                                      | ❌ `imported_id`/`import_source`/`uq_tx_imported` existem no `0001` **sem uma linha de código** |
| 13  | Extração automática de valores e categorias                                                | ❌                                                                                              |
| 14  | Open Banking / conexão automática                                                          | ❌ bloqueado, ver §3.5                                                                          |
| 15  | Despesa **recorrente**                                                                     | ❌                                                                                              |
| 16  | Recorrente com **faixa** (Simples de R$ 12 a R$ 600)                                       | ❌                                                                                              |

### O que existe hoje, verificado

**Tabelas:** `accounts`, `categories`, `payees`, `transactions`, `installment_plans`, `installments`, `debts`, `debt_items`, `debt_payments`, `debt_payment_allocations`, `settings` + as 4 do Better Auth.
**Views:** `v_cashflow` (**órfã**), `v_debt_item_balance`.
**Telas:** home (4 blocos), Contas, Dívidas, Dívida-detalhe, Lançar, Comprometido, Configurações.

## 2. As duas descobertas que ordenam o resto

### 2.1 O Comprometido está otimista por construção

Ele soma **parcelas previstas** e **dívidas em aberto**. Não soma Starlink R$ 189, DAS, contador nem INSS — porque não existe onde cadastrá-los.

Isso não é bug: é escopo. Mas significa que a tela que justifica o projeto **subestima o comprometimento hoje**, e o dono não tem como saber de quanto. Toda decisão que ele tomar olhando esse número está olhando um número incompleto.

Some-se a isso a análise inicial: R$ 1.000/mês de custo PJ declarado contra DAS 378 + INSS ~167 + contador ~275 = **R$ 820**. Os ~R$ 180 de diferença são invisíveis até existir cadastro.

**Por isso a fatia de recorrentes vem primeiro.** Tudo que se construir em cima de um Comprometido incompleto herda o erro.

### 2.2 A faixa não pode virar média

Um Simples que varia de R$ 12 a R$ 600 não entra como R$ 306. A média é o número que **nunca acontece**.

A tela passa a mostrar **intervalo**: "comprometido: R$ 2.400 a R$ 2.988". O piso é o mínimo garantido; o teto é o pior mês. É a mesma disciplina que já fixou o denominador em R$ 3.600 e não R$ 5.300 — não deixar o cenário bom esconder o risco.

Consequência de design que um valor fixo fecharia: como o app já registra receita, um dia dá para **estimar** o DAS a partir do faturamento em vez de o dono chutar a faixa.

## 3. O plano, em cinco fatias ordenadas

A ordem não é preferência — é dependência e valor por esforço.

### Fatia ⑥ — Despesas recorrentes com faixa

**Primeira porque todo o resto lê o Comprometido.**

- Tabela `recurring_expenses`: descrição, categoria, conta, dia do mês, `amount_min_cents`/`amount_max_cents` (iguais quando é valor fixo), início, fim opcional, ativo
- **Decisão de design a tomar no spec:** materializar ocorrências como `transactions` previstas (como o parcelamento faz) **ou** calcular na leitura. O parcelamento materializa; seguir o precedente tem peso, mas recorrente sem fim definido não pode materializar infinito
- `commitments()` passa a devolver **faixa** (`min`/`max`), e a UI mostra intervalo
- Tela de cadastro + ajuda explicando faixa
- Casos reais de teste: Starlink R$ 189 fixo; DAS R$ 12–600; contador R$ 275; INSS R$ 167

**Entrega:** o Comprometido para de mentir por omissão.

### Fatia ② — Import de fatura (CSV/OFX)

**A dor original: "meu problema é aglutinar tudo com vários cartões".** Não depende de terceiro, não tem cadastro, não tem cartão — os bancos já exportam.

- Parser CSV e OFX, com detecção de layout por banco (Nubank, Inter, Itaú…)
- **Deduplicação por `imported_id`** — o índice `uq_tx_imported` já existe no `0001` exatamente para isso, reimportar o mesmo arquivo não pode duplicar
- Matching de estabelecimento por `payees.norm_name` (o `normalizeName` já existe)
- ⚠️ **Pendência conhecida, registrada na fatia ①:** `normalizeName` corta o último token de cidade, então `'Comercial SP'` vira `'COMERCIAL'`. A recomendação da revisão foi tratar `norm_name` como chave **candidata** com confirmação humana no import — decidir isso no spec desta fatia
- Tela de conferência antes de gravar: o import propõe, o dono confirma

**Entrega:** parar de digitar lançamento a lançamento.

### Fatia ⑦ — Reserva de emergência

**Pedida no brief original e nunca construída**, apesar de o dono a ter chamado de _prioridade matemática absoluta antes de ativos que depreciam_.

- Meta configurável (a análise inicial apontou R$ 15.900–31.800 = 3 a 6 meses de custo fixo)
- **Depende da ⑥:** "quantos meses de sobrevivência eu tenho" só é calculável com o custo fixo mensal completo, recorrentes inclusos
- Acompanhamento: quanto tem, quanto falta, em quantos meses chega no ritmo atual
- O confronto que o dono pediu explicitamente: **reserva antes de carro**. A tela deve mostrar o custo de oportunidade de uma decisão de veículo contra a reserva

**Entrega:** a métrica que ele disse ser a mais importante, e que hoje não existe.

### Fatia ⑧ — Mapa de fluxo de caixa

`v_cashflow` está no banco desde o `0001`, **órfã**. Foi criada com o anti-dupla-contagem certo (ignora perna de transferência e filha de rateio) e nunca consumida.

- Série temporal: entrou, saiu, saldo acumulado, mês a mês
- Reusa a fronteira lazy do recharts que já existe
- **Depende da ②** para ter volume de dado que torne o gráfico informativo

**Entrega:** o "mapa visual" do pedido original.

### Fatia ③ — Leitura de PDF com LLM local

Fatura que só vem em PDF. Ollama no MacBook, fora do Worker (Cloudflare Containers não oferece GPU).

- **Depende da ②:** é outra entrada para o mesmo pipeline de import, não um pipeline novo

### Fatia ④ — Open Finance

**Bloqueada, e a honestidade sobre isso importa.** Participação direta exige **R$ 1.000.000 de capital** — descartada na pesquisa da fatia ①. A saída é agregador (Pluggy), com duas incógnitas: uma contradição não resolvida sobre o trial, e o risco de o cadastro exigir cartão verificado — o mesmo bloqueio que tirou o Zero Trust do projeto.

**Antes de virar promessa, precisa de um spike de ~1h** que responda as duas.

## 4. Fora deste roadmap

- **Reescrever a Go API em TS/Worker.** Intenção declarada pelo dono, escopo próprio (votação, Sheets, TMDb, Drive, backup, túnel), sem relação com o finanças.
- **Reabrir dívida baixada.** `written_off` é porta de mão única hoje; sem rota de reabertura e sem filtro na lista. Registrado, não bloqueante.

## 5. Estimativa honesta

As fatias ⑥, ②, ⑦ e ⑧ são grandes o suficiente para cada uma ter spec, plano e execução própria — o mesmo rito que entregou as anteriores. "Tudo de uma vez" na prática significa **quatro ciclos encadeados sem parar entre eles**, não um plano único: um plano de 40 tasks encadeadas não sobrevive a revisão, e a fatia ⑥ muda o contrato do `commitments()` que a ⑦ vai consumir.

A ③ e a ④ ficam depois porque dependem de decisões que só a ② toma, e a ④ pode simplesmente não ser viável.

---

## Adendo (2026-07-28) — direção arquitetural pedida pelo dono

Depois da fatia ⑨ (UI/UX + insight), duas frentes, nesta ordem:

### A. Migrar a API Go para TS/Worker

Intenção já declarada pelo dono. Escopo real de `apps/api`: votação, auth Google
com sessão, integrações Sheets/TMDb/Drive, backup diário `VACUUM INTO`→Drive, e o
túnel Cloudflare.

⚠️ **O Ollama é o único item que NÃO migra** — exige GPU/Metal, e nenhum instance
type de Cloudflare Containers oferece GPU. Ele é justamente o que motiva a frente B.

### B. Híbrido: base na nuvem, fluxos de AI locais pelo túnel

O dono descreveu: base na web, fluxos de AI com API pública no Mac exportada por
Cloudflare Tunnel.

⚠️ **O corte precisa ser por necessidade, não por conveniência** — e a medição de
2026-07-28 muda o desenho:

**Workers AI está disponível nesta conta** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`
responde; `llama-3.1-8b` foi descontinuado em 2026-05-30). Então:

| Fluxo                                                 | Onde              | Por quê                                                   |
| ----------------------------------------------------- | ----------------- | --------------------------------------------------------- |
| Insight, classificação, resumo                        | **Workers AI**    | Funciona de qualquer aparelho, sem depender do Mac ligado |
| Ollama com modelos próprios, PDF com arquivo em disco | **Mac via túnel** | Exige GPU local ou acesso ao sistema de arquivos          |

**A regra:** um fluxo só vai para o túnel quando o Workers AI genuinamente não dá
conta. Mandar tudo para o Mac faz o app inteiro depender de um laptop acordado —
exatamente o acoplamento que o CLI de PDF evitou de propósito (ver
`2026-07-27-financas-pdf-ollama-design.md` §2).

**Consequência de produto a decidir no spec:** todo fluxo que dependa do Mac precisa
de comportamento definido para "Mac desligado". Degradar com aviso, nunca tela em
branco.

---

## Deploy automatizado (2026-07-28)

`.github/workflows/deploy-financas.yml` — dispara depois do CI verde na `main`, ou manualmente.

**A migration É aplicada pela CI.** Decisão do dono, com fundamento: existe revisão antes do merge, então o SQL chega vetado. Isso substitui a regra anterior de "migration é informada, nunca rodada" **no contexto da pipeline** — no terminal, a regra segue valendo.

Duas salvaguardas, porque revisão não cobre tudo:

**1. Dump antes de migrar, guardado como artifact por 30 dias.** No D1 não existe down migration e índice não é alterável — o único caminho de volta é reimportar um dump anterior. Sem isso, "aplicar automático" seria aplicar sem rede.

**2. Migration destrutiva ainda pede humano.** `DROP TABLE/COLUMN/INDEX/VIEW`, `DELETE FROM` e `TRUNCATE` barram o deploy. Revisão pega SQL errado; ela não pega _"esta migration é destrutiva contra dado real que só existe em produção"_. As sete migrations do projeto até hoje são todas aditivas — o guard só age quando isso mudar.

⚠️ O detector ignora comentário (`sed 's/--.*//'` antes do grep), então `-- DROP TABLE seria ruim` não gera falso positivo. Testado nos três casos.

**Ordem: migration → deploy.** Código novo contra schema velho quebra, e a `0006` já seria esse caso: a tela de Comprometido lê a tabela de recorrentes.

**Fica skipado** até `CLOUDFLARE_ACCOUNT_ID` entrar em Variables e `CLOUDFLARE_API_TOKEN` em Secrets — mesmo padrão do `deploy-api.yml`, que espera `GCP_PROJECT_ID`.

⚠️ `workflow_run` **não herda o resultado** do workflow que o disparou. Sem checar `conclusion == 'success'` explicitamente, um CI vermelho ainda dispararia deploy.

### Pendente: ambiente de dev para o Worker

Hoje **produção é o primeiro lugar onde uma migration roda** — não existe onde testar contra dado realista antes. Enquanto isso não existir, o dump da salvaguarda 1 é a única rede.
