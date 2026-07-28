# Fatia ② — Import de fatura e extrato (CSV/OFX)

**Data:** 2026-07-27
**Antecedente:** `docs/superpowers/specs/2026-07-27-financas-roadmap.md` §3, que ordena esta fatia como a segunda das restantes.

## 1. Problema

A dor original, nas palavras do dono: _"eu tenho várias contas e o meu problema é aglutinar tudo com vários cartões"_.

Hoje só existe lançamento manual. Cada compra de cada cartão de cada mês é digitada à mão — o que significa que, na prática, o livro-caixa fica incompleto e o Comprometido opera sobre dado parcial.

Esta é a fatia que menos avançou e a que mais resolve o pedido original. Não depende de terceiro, não tem cadastro e não tem cartão: os bancos já exportam CSV e OFX.

## 2. O que a fatia ① já deixou pronto

Verificado no schema, não suposto:

```sql
imported_id   TEXT,
import_source TEXT CHECK (import_source IS NULL OR
                import_source IN ('manual','ofx','csv','pdf','pluggy','share-target')),
```

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_imported
  ON transactions(account_id, imported_id) WHERE imported_id IS NOT NULL;
```

O comentário na migration diz literalmente: _"FITID do OFX, ou hash estável da linha do CSV. Coluna + índice único parcial criados JÁ na fatia 1 porque índice no D1 não pode ser alterado depois."_

A idempotência é **por conta**, não global — o mesmo FITID em bancos diferentes é legítimo.

`normalizeName` e `payees.norm_name` também já existem, para casar estabelecimento.

## 3. Onde o arquivo é lido — e por que não no Worker

**Decisão: o arquivo é lido no navegador. O Worker nunca vê o arquivo.**

Três razões, em ordem de peso:

1. **O Worker tem teto de 10 ms de CPU por invocação no free tier.** Parsear um OFX de alguns milhares de linhas é trabalho de CPU real. É o mesmo teto que já justificou memoizar a instância do Better Auth e evitar `Intl.DateTimeFormat` no cálculo de fuso.
2. **Não há motivo para o arquivo trafegar.** A SPA lê, parseia, mostra a conferência, e envia **só as linhas confirmadas** — que é payload estruturado e pequeno.
3. **Extrato bancário é dado sensível.** Quanto menos lugares por onde ele passa, melhor. O arquivo não sobe, não é armazenado, não aparece em log.

Consequência: o `POST` de import recebe **linhas já estruturadas**, não um arquivo. O Worker valida e grava; ele não confia no cliente (revalida tudo), mas também não parseia.

## 4. Onde a lógica mora

**`packages/tools`** — TS puro, sem React e sem DOM, o precedente que já existe para lógica compartilhada (`money`, e a entropia/roleta).

Isso dá três coisas: testável com Jest sem subir navegador nem Worker; reusável por um CLI futuro; e impossível de acoplar a detalhe de UI por acidente.

```
packages/tools/src/import/
  ofx.ts        parseOfx(texto): LinhaImportada[]
  csv.ts        parseCsv(texto, mapa): LinhaImportada[]
  id.ts         idEstavel(linha): string
  index.ts      tipos compartilhados
```

## 5. Idempotência — o coração da fatia

Reimportar o mesmo arquivo **não pode duplicar nada**. É o requisito que decide o resto.

- **OFX:** usa o `FITID`, que o banco garante único por conta. É para isso que ele existe no padrão.
- **CSV:** não tem id. Sintetizar um **hash estável e determinístico** de `data | valor | descrição normalizada`, com SHA-256 via WebCrypto (disponível no navegador e no Worker, sem dependência nova).

⚠️ **O hash tem uma limitação real e precisa ser documentada, não escondida:** duas compras genuinamente idênticas no mesmo dia, mesmo valor e mesma descrição (dois cafés de R$ 8 na mesma padaria) geram o mesmo hash, e a segunda seria tratada como duplicata. A tela de conferência mostra o que foi considerado duplicado, então o dono **vê e pode forçar**. Esconder isso seria pior que a limitação.

## 6. Layouts de CSV

Detectar layout por adivinhação é frágil e erra em silêncio — a classe de defeito que este projeto passou a sessão inteira caçando.

**Decisão: o dono mapeia as colunas uma vez por banco, e o mapa fica salvo.** A tela mostra as primeiras linhas do arquivo e pergunta qual coluna é data, qual é valor, qual é descrição. O mapa vai para `settings` com chave por banco.

Na segunda importação daquele banco, o mapa já está lá e a etapa some.

OFX não precisa disso: é formato padronizado.

## 7. Estabelecimento

`normalizeName` gera o `norm_name` que casa "PADARIA X LTDA 12/03" com "PADARIA X".

⚠️ **Limitação conhecida, registrada na fatia ① e nunca resolvida:** `normalizeName` corta o último token quando parece sigla de estado, então `'Comercial SP'` vira `'COMERCIAL'`. A revisão da fatia ① recomendou tratar `norm_name` como chave **candidata**, com confirmação humana.

**Esta fatia adota essa recomendação:** o import **sugere** o payee, a tela de conferência mostra a sugestão e o dono confirma ou troca. Nada é gravado por adivinhação.

## 8. Fluxo

1. Escolher a conta de destino e o arquivo
2. A SPA parseia no navegador
3. CSV sem mapa salvo ⇒ etapa de mapeamento de colunas
4. **Tela de conferência**: cada linha com data, valor, descrição, payee sugerido e categoria sugerida. Linhas já importadas aparecem marcadas e desmarcadas por padrão
5. O dono ajusta e confirma
6. `POST /api/transactions/import` com as linhas confirmadas
7. O Worker revalida e grava num `db.batch()`

⚠️ **Teto de 100 bound params por statement no D1** — medido na fatia ①. `transactions` tem 19 colunas bound, o que dá **5 linhas por statement**. Um extrato de 200 linhas vira 40 statements. A fatia ① mediu que `batch()` de 200 statements passa, mas o import precisa de **lotes**, com o progresso visível.

## 9. Fora de escopo

- **PDF** — é a fatia ③, com o Ollama local
- **Categorização automática por LLM** — idem
- Regra de categorização aprendida ("toda vez que for PADARIA X, categoria Alimentação") — desejável, mas é fatia própria; esta grava o que o dono confirmar

## 10. Critérios de aceitação

- Importar o mesmo arquivo duas vezes **não cria linha nova** — provado contando `transactions` antes e depois
- Um FITID que já existe **naquela conta** é pulado; o mesmo FITID em **outra** conta é aceito
- O hash de CSV é estável entre execuções — mesmo arquivo, mesmos ids
- A tela de conferência mostra o que será pulado, e por quê
- Payee é **sugestão confirmável**, nunca gravação automática
- Um extrato de 200 linhas importa sem estourar o teto de params, com progresso
- O arquivo nunca sobe para o Worker — verificável na aba de rede
