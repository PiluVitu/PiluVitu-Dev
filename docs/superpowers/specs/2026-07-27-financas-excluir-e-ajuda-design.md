# Excluir dívidas + ajuda contextual no finanças

**Data:** 2026-07-27
**Branch:** `feat/financas-pj`
**Antecedente:** fatia ① (domínio), troca de auth, e o design system compartilhado — todos entregues e em produção.

## 0. Fatos medidos (2026-07-27) — leia antes

Medidos contra o D1 local, não deduzidos.

1. **Não existe rota de exclusão nenhuma.** `src/routes/debts.ts` tem `GET /debts`, `POST /debts`, `GET /debts/:id`, `POST /debts/:id/items` e `POST /debts/:id/payments`. Zero `DELETE`. O domínio expõe `createDebt`, `addDebtItem`, `debtDetail`, `payDebt`, `listDebts` — nada que remova.

2. **`DELETE FROM debts` NÃO aborta, e deixa lançamento órfão.** As FKs são: `debt_items.debt_id → debts ON DELETE CASCADE`, `debt_payments.debt_id → debts ON DELETE CASCADE`, `debt_payment_allocations.payment_id → debt_payments ON DELETE CASCADE`, `debt_payment_allocations.item_id → debt_items ON DELETE **RESTRICT**`, e `debt_payments.transaction_id → transactions ON DELETE **RESTRICT**`.

   Montei uma dívida completa (item + pagamento `cash` + alocação) e apaguei a dívida. **Resultado:** sucesso, sem erro — o SQLite resolve o CASCADE das alocações antes de esbarrar no RESTRICT dos itens. Sobraram `debts=0, itens=0, pagamentos=0, alocacoes=0` e **`transactions=1`**.

   Ou seja: apagar uma dívida com pagamento em dinheiro **remove a explicação e mantém o dinheiro saído**. O saldo continua certo e a pergunta "para onde foi esse R$ 400" fica sem resposta. É perda de dado silenciosa, e é o fato que decide toda a §2.

3. **`written_off` já existe no schema** — `CHECK (status IN ('open','settled','written_off'))`. Nunca foi usado por nenhum código. É o lugar certo para "essa dívida acabou sem eu pagar", sem apagar histórico.

4. **`hover` não existe em touch.** Já mordeu este projeto: `hover:underline` sai dentro de `@media (hover: hover)` e deixou os links sem sublinhado no Android, corrigido na Task 9 do plano anterior. Qualquer ajuda baseada em `title=` ou hover é **invisível no aparelho principal do dono**.

## 1. Problema

Dois relatos do dono, usando o app em produção:

- **Não há como excluir uma dívida.** Ele criou "Macbook M4 24gb 512gb" e não tem como remover. Hoje qualquer erro de digitação é permanente.
- **Não há nada ensinando a usar.** A tela de detalhe mostra "devo R$ 0,00 de R$ 0,00" numa dívida sem itens, um campo "Dividir entre itens" vazio, e termos como _competência_, _PJ/PF_ e _comprometido_ sem explicação em lugar nenhum.

## 2. Modelo de exclusão

O princípio: **o dono pode desfazer o que criou, e o sistema nunca apaga movimento de dinheiro em silêncio.**

| Ação                              | Quando é permitida                                         | Por quê                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Excluir dívida**                | Só quando não há pagamento em **dinheiro** (`kind='cash'`) | Pagamento em dinheiro tem lançamento 1:1 no caixa. Apagar em cascata deixaria o lançamento órfão (§0.2). Pagamento `offset`/`forgiven` não toca o caixa e pode cascatear. |
| **Baixar dívida** (`written_off`) | Sempre, se estiver `open`                                  | É a saída para a dívida que tem histórico real: preserva itens, pagamentos e lançamentos, e tira do comprometido.                                                         |
| **Excluir item**                  | Só quando não há alocação apontando para ele               | Já é garantido pelo `RESTRICT` no banco; a rota traduz o erro cru numa frase acionável.                                                                                   |
| **Excluir pagamento**             | Sempre — **junto com o lançamento**, no mesmo `batch()`    | É a única forma de não orfanar. Um `batch()` faz rollback real, então ou os dois somem ou nenhum some.                                                                    |

**Recusa de exclusão de dívida** ⇒ `422` com código `debt_has_ledger` e mensagem que aponta para a baixa: _"Esta dívida já tem pagamento em dinheiro registrado no caixa. Excluir apagaria a dívida e deixaria o lançamento sem explicação. Use 'Dar baixa' para encerrá-la preservando o histórico, ou exclua os pagamentos primeiro."_

**Confirmação é obrigatória na UI** para as quatro ações. Exclusão aqui é irreversível — não existe lixeira, e a fatia ① decidiu não ter soft delete em dívidas (só contas têm `archived_at`).

### Convenção herdada

Toda rota de transição de estado devolve **`404 not_found` quando `meta.changes === 0`** — é lei do módulo, documentada no `CLAUDE.md`. Vale para as quatro rotas novas: id inexistente e id já apagado são indistinguíveis de sucesso sem essa checagem.

## 3. Ajuda contextual

### 3.1 O componente

`@piluvitu/ui` ganha **`Ajuda`** — um `?` **tocável** que abre um balão, com o conteúdo em `children`.

**Não é tooltip de hover.** Sobre `@radix-ui/react-popover` (não `react-tooltip`), porque popover abre no clique/toque e funciona igual no Android e no MacBook. `title=` nativo também está descartado pelo mesmo motivo (§0.4), além de ser inacessível a leitor de tela em vários navegadores.

Acessibilidade: o gatilho é `<button type="button">` com `aria-label` próprio, fecha com `Esc`, e o conteúdo é lido por leitor de tela. Um `?` sem `aria-label` é um botão mudo.

### 3.2 Onde entra

Só onde há uma pergunta real. Ajuda em campo óbvio vira ruído e ensina o usuário a ignorar o ícone.

| Tela                           | Termo                   | O que a ajuda diz                                                                                                           |
| ------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Comprometido (e bloco da home) | **Comprometido**        | O que já está prometido dos próximos meses: parcelas previstas + dívidas em aberto.                                         |
| Comprometido / Configurações   | **Renda de referência** | Por que o denominador é R$ 3.600 e não R$ 5.300 — o freela é volátil, e medir contra o mês bom esconde o risco.             |
| Lançar                         | **Competência**         | O mês em que a **fatura fecha**, não o da compra. Compra em 28/07 num cartão que fecha dia 25 cai na competência de agosto. |
| Lançar / Contas                | **PJ / PF**             | `scope` é o padrão da conta; `is_business` é a verdade do lançamento — dá para pagar algo PF pelo cartão PJ.                |
| Dívida (detalhe)               | **Itens**               | Itens são o que compõe a dívida (estoque). Não geram lançamento no caixa — só pagamentos geram.                             |
| Dívida (detalhe)               | **Dividir entre itens** | Um pagamento pode cobrir vários itens. É isso que responde "o Steam Deck já está quitado?".                                 |
| Dívida (detalhe)               | **Dar baixa**           | Encerra sem apagar: preserva itens, pagamentos e lançamentos, e tira do comprometido.                                       |

### 3.3 Estados vazios que explicam

Ajuda também é o texto certo no lugar vazio. Hoje a tela de dívida sem itens mostra **"devo R$ 0,00 de R$ 0,00"** — verdadeiro e inútil.

- Dívida sem item: dizer que o total sai da soma dos itens e que é preciso adicionar o primeiro.
- "Dividir entre itens" sem item: dizer que a divisão aparece depois que existir item, em vez de renderizar um bloco vazio.

## 4. Fora de escopo

- **Excluir conta, lançamento ou parcelamento.** Conta já tem arquivamento; lançamento e parcelamento são outra conversa (parcelamento apaga N lançamentos futuros de uma vez e merece desenho próprio).
- **Lixeira / desfazer.** Confirmação + a baixa como alternativa preservadora cobrem o caso real sem inventar infraestrutura.
- **Open Finance.** Continua fatia ④, com import de fatura (fatia ②) antes.

## 5. Riscos

| Risco                                 | Mitigação                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Exclusão apagar movimento de dinheiro | §2: recusa quando há pagamento `cash`; excluir pagamento leva o lançamento junto no mesmo `batch()`            |
| CASCADE apagar mais do que se espera  | Teste que monta dívida completa, apaga, e **conta linha em todas as cinco tabelas** — inclusive `transactions` |
| Ajuda invisível no Android            | Popover no clique, nunca hover nem `title=`; teste com evento de clique, não `mouseOver`                       |
| Ícone de ajuda virar ruído            | Só nos 7 pontos da §3.2, cada um com pergunta real por trás                                                    |

## 6. Critérios de aceitação

- Excluir uma dívida sem pagamento remove dívida, itens e alocações, e **não deixa lançamento órfão** — provado contando `transactions` antes e depois
- Excluir uma dívida com pagamento em dinheiro é **recusado** com mensagem que ensina a saída
- Dar baixa preserva tudo e tira do comprometido
- Excluir pagamento remove o lançamento junto, atomicamente
- Excluir item alocado é recusado com frase acionável, não com erro cru do D1
- As quatro ações pedem confirmação
- A ajuda abre **no toque** e fecha com `Esc`, em todos os 7 pontos
- Suítes verdes; os dois gates de build silenciosos
