# Fatia ⑧ — Mapa de fluxo de caixa

**Data:** 2026-07-27
**Antecedente:** `docs/superpowers/specs/2026-07-27-financas-roadmap.md` §3.

## 1. Problema

O brief original pedia um **mapa visual de fluxo de caixa**. A view `v_cashflow` foi criada na migration `0001` com o anti-dupla-contagem correto e **nenhum código de produção a consome** — verificado por grep. É o pedido mais antigo ainda sem tela.

O que existe hoje responde outras perguntas: o Comprometido olha para frente (o que já está prometido), o bloco de categorias olha um mês (para onde foi). Falta a série temporal: **entrou, saiu, sobrou — mês a mês**.

## 2. O que a view já resolve

```sql
CREATE VIEW IF NOT EXISTS v_cashflow AS
SELECT t.*, substr(t.settled_at, 1, 7) AS competence_month
FROM transactions t
WHERE t.settled_at IS NOT NULL
  AND t.transfer_id IS NULL
  AND t.parent_id  IS NULL;
```

Três filtros, cada um com motivo:

- `settled_at IS NOT NULL` — fluxo de caixa é dinheiro que **se moveu**. Parcela prevista é compromisso, não caixa; ela é assunto do Comprometido.
- `transfer_id IS NULL` — as duas pernas de uma transferência se anulam, mas somadas em módulo inflariam entrada e saída.
- `parent_id IS NULL` — o pai do rateio guarda o valor cheio e as filhas repetem.

## 3. O defeito na view, e o que fazer

⚠️ **`competence_month` sai de `substr(settled_at, 1, 7)`, e `settled_at` é timestamp UTC.**

Teresina é UTC−3. Um pagamento liquidado às 22h de 31/01 local é **01h de 01/02 em UTC** — a view o coloca em fevereiro. Nesta base isso desloca dinheiro entre meses no relatório que existe justamente para mostrar entrada e saída por mês.

É a mesma classe de bug que já apareceu duas vezes aqui: a data de compra gravada em UTC (corrigido com `todayInTeresina()`) e a competência de fatura virando o mês seguinte.

**Decisão: não usar `competence_month` da view.** O domínio agrupa aplicando o deslocamento de Teresina antes de cortar o mês. A view continua útil pelos três filtros, que é o que ela tem de valioso.

**Não corrigir a view em migration nova.** Ela está órfã, o `SELECT t.*` já entrega `settled_at` cru, e mexer nela obrigaria a uma `0007` que não paga o próprio custo. Documentar que a coluna existe e **não deve ser usada** é mais barato e mais honesto que reescrever — desde que fique escrito, e não só sabido.

## 4. O que a tela responde

Série mensal com **entrou**, **saiu**, **saldo do mês** (entrou − saiu) e **acumulado**.

O acumulado é o que transforma a tela num mapa em vez de uma tabela: é onde se vê a reserva sendo construída ou consumida ao longo do tempo.

⚠️ **O acumulado parte do saldo de abertura das contas**, não de zero. Começar em zero desenha uma curva que sobe do nada e não corresponde a dinheiro nenhum.

## 5. Janela

Padrão 12 meses até o mês corrente, via `todayInTeresina()`. Seletor para ampliar.

Meses **sem movimento aparecem zerados**, não somem — um buraco na série mente sobre a continuidade do tempo.

## 6. Fora de escopo

- Projeção futura. Fluxo de caixa aqui é histórico; o futuro é o Comprometido.
- Quebra por conta. A pergunta é "meu dinheiro", não "esta conta".
- Exportar.

## 7. Critérios de aceitação

- Entrada e saída por mês, mais saldo e acumulado
- **Um lançamento liquidado às 22h de Teresina fica no mês local**, não no seguinte — teste com o instante exato
- Transferência entre contas próprias **não** aparece como entrada nem como saída
- Filha de rateio não duplica o valor do pai
- Mês vazio aparece zerado
- O acumulado começa no saldo de abertura
- Dinheiro em `INTEGER` centavos; recharts atrás da fronteira lazy que o gate protege
