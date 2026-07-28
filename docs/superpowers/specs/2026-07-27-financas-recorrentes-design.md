# Fatia ⑥ — Despesas recorrentes com faixa

**Data:** 2026-07-27
**Antecedente:** `docs/superpowers/specs/2026-07-27-financas-roadmap.md` §3, que ordena esta fatia como a primeira das cinco restantes.

## 1. Problema

O Comprometido soma **parcelas previstas** e **dívidas em aberto**. Não soma Starlink R$ 189, DAS, contador nem INSS — porque não existe onde cadastrá-los.

A tela que justifica o projeto **subestima o comprometimento**, e o dono não tem como saber de quanto. Não é bug: é escopo. Mas é escopo que contamina toda decisão tomada olhando aquele número, e a fatia ⑦ (reserva de emergência) depende de um custo fixo mensal completo para calcular meses de sobrevivência.

Some-se a análise inicial: R$ 1.000/mês de custo PJ declarado contra DAS 378 + INSS ~167 + contador ~275 = **R$ 820**. Os ~R$ 180 de diferença só ficam mensuráveis quando houver cadastro.

## 2. A faixa não pode virar média

O Simples varia de R$ 12 a R$ 600 conforme o faturamento. Entrar como R$ 306 seria o número que **nunca acontece**.

Toda recorrente tem `amount_min_cents` e `amount_max_cents`. Valor fixo é o caso em que os dois são iguais — não existe um tipo "fixo" separado, porque isso duplicaria caminho de código para nada.

O Comprometido passa a devolver e mostrar **intervalo**: "R$ 2.400 a R$ 2.988". Piso é o mínimo garantido; teto é o pior mês. Mesma disciplina que fixou o denominador em R$ 3.600 e não R$ 5.300 — não deixar o cenário bom esconder o risco.

**Porta que a faixa deixa aberta e um valor fixo fecharia:** o app já registra receita, então um dia dá para estimar o DAS a partir do faturamento em vez de o dono chutar.

## 3. Projeção, não materialização — e por quê

O parcelamento **materializa**: cria N `transactions` previstas de uma vez, porque N é finito (1..360) e conhecido na criação.

Recorrente **não tem fim**. Materializar exigiria escolher um horizonte arbitrário e um processo que estende esse horizonte com o tempo — um cron que o projeto não tem, ou um "estende ao ler" que é materialização disfarçada de projeção, com o pior dos dois.

**Decisão: recorrente é projeção, calculada na leitura, dentro da janela pedida.** Não cria linha em `transactions`.

Consequência que precisa ser explícita: **uma recorrente não é um fato, é uma expectativa.** Quando o dinheiro sai de verdade, existe um `transaction` real — lançado à mão ou importado na fatia ②. A recorrente nunca vira lançamento sozinha.

### 3.1 O risco de dupla contagem, e a solução exata

Se a projeção diz "Starlink R$ 189 em agosto" **e** o lançamento real de agosto já existe, o Comprometido contaria os dois.

Solução heurística (casar por categoria + valor aproximado) é frágil e erra em silêncio — exatamente a classe de defeito que este projeto passou a sessão inteira caçando.

**Solução exata:** `transactions` ganha `recurring_expense_id` (nullable, `REFERENCES recurring_expenses(id) ON DELETE SET NULL`). A projeção de uma competência é **suprimida** quando já existe lançamento com aquele `recurring_expense_id` naquela competência.

O vínculo é explícito: a tela Lançar oferece "este lançamento é o Starlink de agosto". A fatia ② pode vincular no import depois. Sem vínculo, a projeção continua aparecendo — que é o comportamento correto: sem prova de que o gasto aconteceu, ele continua previsto.

⚠️ `ON DELETE SET NULL`, nunca CASCADE. Apagar a definição de uma recorrente **não pode apagar movimento de dinheiro** — a lição medida da fatia de exclusão.

## 4. Schema

Migration `0006`:

```sql
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id                TEXT PRIMARY KEY,
  description       TEXT NOT NULL,
  category_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
  account_id        TEXT REFERENCES accounts(id)   ON DELETE SET NULL,
  scope             TEXT NOT NULL CHECK (scope IN ('PJ','PF')),
  day_of_month      INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  amount_min_cents  INTEGER NOT NULL CHECK (amount_min_cents > 0),
  amount_max_cents  INTEGER NOT NULL,
  starts_on         TEXT NOT NULL,
  ends_on           TEXT,
  active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  notes             TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (amount_max_cents >= amount_min_cents),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
) STRICT;
```

E em `transactions`, a coluna de vínculo mais um índice parcial para a supressão.

**Notas de schema que vêm de erro já cometido neste projeto:**

- Todo `CHECK` de tabela vem **depois** de todas as column-defs. A gramática do SQLite é `column-def* table-constraint*`; um CHECK solto no meio faz a próxima coluna dar `syntax error`. Já aconteceu na `0001`.
- `day_of_month` até 31 é aceito e **aparado** no cálculo, igual ao fechamento de cartão: dia 31 vira 28 em fevereiro. A aritmética já existe em `lib/dates.ts`.
- Índice no D1 é **irreversível**. Decidir os índices agora, com o banco praticamente vazio.

## 5. Efeito no `commitments()`

Hoje devolve `totals` como número por competência. Passa a devolver **faixa**.

⚠️ **Isso muda o contrato consumido por três lugares:** `pages/commitments.tsx`, `blocos/BlocoComprometido.tsx` e `GraficoComprometido.tsx`. O gráfico precisa representar intervalo — barra com faixa, não barra única.

⚠️ **O `%` do líquido fixo também vira faixa.** O limiar de alerta de 50% passa a ser avaliado contra o **teto**, não contra o piso: a tela existe para mostrar risco, e o pior mês é o risco.

## 6. Fora de escopo

- Vincular no import (fatia ②)
- Estimar o DAS a partir do faturamento
- Recorrente de **receita**. Só despesa. Receita recorrente muda o denominador, não o numerador, e isso é decisão da fatia ⑦.

## 7. Critérios de aceitação

- Starlink R$ 189 fixo, DAS R$ 12–600, contador R$ 275 e INSS R$ 167 cadastráveis, e o Comprometido passa a somá-los
- O Comprometido mostra **intervalo**, e o alerta de 50% dispara pelo teto
- Projeção suprimida na competência em que já existe lançamento vinculado — provado com teste que conta o total antes e depois de vincular
- Apagar uma recorrente **não apaga lançamento nenhum** — provado contando `transactions`
- Recorrente encerrada (`ends_on`) ou inativa não entra na projeção
- Dia 31 cai no último dia em fevereiro
