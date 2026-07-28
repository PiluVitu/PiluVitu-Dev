# Fatia ⑦ — Reserva de emergência

**Data:** 2026-07-27
**Antecedente:** `docs/superpowers/specs/2026-07-27-financas-roadmap.md` §3. Depende da fatia ⑥ (recorrentes), já entregue.

## 1. Problema

No brief original o dono foi explícito: **fundo de emergência como prioridade matemática absoluta, antes de ativos que depreciam.** A análise inicial apontou meta de R$ 15.900 a R$ 31.800 — 3 a 6 meses de custo fixo.

**Nada disso existe.** Não há meta, não há acompanhamento, não há tela. É o item mais antigo do pedido e o único que nunca saiu do papel.

E ele importa mais aqui do que num assalariado: a renda tem R$ 4.300 fixos mais **R$ 2.000 voláteis de freela**. A reserva é o que separa "mês ruim" de "problema".

## 2. Por que só agora

Meses de sobrevivência = reserva ÷ custo fixo mensal. Antes da fatia ⑥ o custo fixo era desconhecido — Starlink, DAS, contador e INSS não tinham onde ser cadastrados. Calcular sobrevivência sobre custo incompleto daria um número **otimista**, exatamente o erro que a ⑥ existiu para corrigir.

## 3. A faixa se propaga

O custo fixo mensal agora é faixa (o DAS varia de R$ 12 a R$ 600). Logo **os meses de sobrevivência também são**.

A tela diz _"entre 2,1 e 4,8 meses"_, não uma média. O piso é o que você garante num mês ruim; o teto é o cenário bom. Mesma disciplina do denominador de R$ 3.600 e do Comprometido em intervalo — **não deixar o cenário bom esconder o risco**.

Note a inversão: no Comprometido, o **teto** é o perigo (gasto máximo). Aqui o **piso** é o perigo (sobrevivência mínima). O alerta tem que olhar o piso.

## 4. De onde sai "quanto eu tenho"

**Contas designadas como reserva**, não um número digitado. Saldo auto-declarado envelhece e mente; saldo de conta é o que existe.

A designação vai para `settings`, chave `emergency_accounts`, com a lista de `account_id`. Sem migration: `settings` já é chave-valor genérica desde a `0005`, e a designação é preferência, não fato estrutural.

⚠️ Consequência a documentar: a reserva sobe e desce sozinha conforme a conta se movimenta. É o comportamento certo — mas quem olhar precisa saber que ninguém "depositou na reserva"; a conta é a reserva.

## 5. O que a tela responde

1. **Quanto tenho** — soma das contas designadas
2. **Quanto é a meta** — configurável; default 3 meses do custo fixo, calculado, não digitado
3. **Quantos meses eu sobrevivo** — faixa
4. **Em quanto tempo chego na meta** no ritmo atual — a partir da sobra mensal observada
5. **O confronto que o dono pediu**: o que uma compra grande faz com isso

## 6. O confronto reserva × ativo que deprecia

Foi o pedido literal: reserva **antes** de ativo que deprecia. O caso real era um Polo Track de R$ 96.000 financiado (72% do líquido) contra uma Pop 110i de R$ 13.000 à vista.

A tela recebe um valor e responde, em números do próprio dono:

- à vista: quantos **meses de reserva** aquilo consome, e como fica a sobrevivência depois
- financiado: quanto entra no **Comprometido** por mês, por quantos meses, e o que sobra da renda fixa

**Não é conselho, é aritmética.** A tela não diz "não compre" — mostra o custo em meses de sobrevivência, que é a unidade que o dono escolheu quando chamou a reserva de prioridade absoluta.

## 7. Fora de escopo

- Rendimento da reserva (CDI, poupança). Projeção de juros é fatia própria e o dono não pediu.
- Múltiplas metas (viagem, equipamento). A meta aqui é **a** reserva.
- Recomendar aporte automático.

## 8. Critérios de aceitação

- Designar contas e ver o total bater com a soma dos saldos delas
- Meses de sobrevivência como **faixa**, e o alerta pelo **piso**
- Sem custo fixo cadastrado, a tela diz que não dá para calcular — **não** mostra "infinito" nem zero
- Sem conta designada, explica o que fazer
- O simulador mostra à vista e financiado lado a lado, em meses de reserva e em % da renda fixa
- Dinheiro em `INTEGER` centavos ponta a ponta
