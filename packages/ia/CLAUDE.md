# CLAUDE.md — `packages/ia` (`@piluvitu/ia`)

Base comum da IA dos Workers (`apps/financas` e `apps/ramielle`). O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz. Plano de origem: `docs/superpowers/plans/2026-10-24-ia-fase-1-claude.md`.

## Propósito

TypeScript puro, sem Hono: o que os dois Workers precisam igual para falar com a Claude, com o mesmo custo, os mesmos erros e o mesmo teto. O D1 entra só como parâmetro (`BancoD1`), nunca como binding do pacote.

- **Fonte:** `src/claude.ts` (cliente, `chamarClaude`), `src/custo.ts` (modelos, preços, custo e estimativa), `src/erros.ts` (classes de erro e `codigoDoErro`) e `src/uso.ts` (reserva de orçamento na `uso_ia`, `comOrcamento`). Um export por subpath, sem barrel: `@piluvitu/ia/claude`, `@piluvitu/ia/custo`, `@piluvitu/ia/erros`, `@piluvitu/ia/uso`. O schema da tabela mora em `sql/uso_ia.sql`.
- **SDK:** `@anthropic-ai/sdk` em versão **exata** (`1.1.0`, publicada em 2026-10-21). Subir de versão é decisão explícita, nunca `^`.
- **Testes:** Vitest, colocated (`src/*.test.ts`). `pnpm --filter @piluvitu/ia test` roda duas passadas: `vitest.config.ts` (Node) para `claude`/`custo`/`erros`, e `vitest.workers.config.ts` (`@cloudflare/vitest-pool-workers`, D1 `DB` no Miniflare, `sql/` aplicado com `readD1Migrations` + `applyD1Migrations` após `reset()` em cada teste) só para `uso.test.ts`. O `claude.test.ts` fica no Node porque mexe em `process.env`.
- **Tipos:** `pnpm --filter @piluvitu/ia lint` (`tsc --noEmit`).
- **Consumidores:** `apps/ramielle` e `apps/financas` (`"@piluvitu/ia": "workspace:*"`). Cada um tem o seu `src/lib/ia.ts`, com os tetos da feature (`TETOS_RAMIELLE`, `TETOS_FINANCAS`) e o `respostaDeErroIa`, que liga o `codigoDoErro` ao `errJson` local, e o seu `src/ia-segredo.test.ts`, a sentinela da chave (ver o `CLAUDE.md` de cada Worker).
- **CI:** o job `ramielle` do `ci.yml` roda o `lint` e o `test` daqui.
- Instalar a SDK trouxe `@opentelemetry/api` (dependência dela) para o lock, e isso mudou o sufixo de peer de `next`, `better-auth` e `vitest` nos outros workspaces. É esperado: o lockfile só reescreveu o sufixo, as versões ficaram as mesmas.

## Modelos e preços

| Modelo (`Modelo`)   | Uso                              | Entrada / saída por MTok |
| ------------------- | -------------------------------- | ------------------------ |
| `claude-sonnet-5-5` | insight, proofread               | US$ 2 / 10               |
| `claude-haiku-5-5`  | refine, encurtar, hooks e resumo | US$ 0,10 / 0,50          |

Nada de Opus. Sem `temperature`, `top_p`, `top_k` e `thinking` nas chamadas: Sonnet 5.5 e Haiku 5.5 recusam valor não padrão de amostragem.

O Haiku 5.5 tem uma segunda tabela, de US$ 0,50 / 2,50, para prompt acima de 100K tokens. Nenhuma feature da fase 1 chega perto disso (o resumo corta em 24 000 caracteres), então `PRECOS` só guarda a primeira. Uma feature que mande prompt longo ao Haiku precisa da segunda tabela antes.

## Custo (`custo.ts`)

- Dinheiro é sempre **micro-dólar inteiro** (US$ 1 = `1_000_000`). Nunca float no banco.
- `custoMicroUsd(modelo, usage)` arredonda **o total** para cima. Cache read sai a 0,1× e cache write a 1,25× do preço de entrada. O `input_tokens` da API já vem sem os tokens de cache, então as parcelas somam.
- A conta é feita escalada por 40 para que 0,1× e 1,25× fiquem inteiros; assim o `Math.ceil` não sobe 1 micro por resíduo de float.
- `estimativaMicroUsd(modelo, caracteres, maxTokens)` estima a entrada em `ceil(caracteres / 2)` tokens (português fica perto de 4 caracteres por token, então a folga é de propósito) e a saída no `maxTokens` inteiro. É o valor que a reserva prende contra o teto antes da chamada.

## Cliente (`claude.ts`)

`chamarClaude(apiKey, { modelo, system, user, maxTokens, formatoJson? }, { fetch? })` devolve `{ texto, uso, custoMicro }`: `texto` é a junção dos blocos `text` (thinking ignorado), com trim; `uso` é o `Usage` da SDK; `custoMicro` sai de `custoMicroUsd`.

- Uma chamada `client.messages.create`, sem streaming, `system` como string. Só manda `model`, `max_tokens`, `system`, `messages` e, com `formatoJson`, `output_config.format = { type: 'json_schema', schema }`. Nunca `temperature`, `top_p`, `top_k` nem `thinking` (o teste confere o corpo inteiro).
- `apiKey` vazio ou ausente lança `ClaudeDesligado` antes de criar o cliente.
- `maxRetries: 1`: a SDK tenta de novo uma vez em 408, 409, 429, 5xx e erro de conexão.
- Tradução de erro, sempre com mensagem nossa (o `err.message` da SDK nunca passa adiante):

  | Origem                                                     | Vira                                      |
  | ---------------------------------------------------------- | ----------------------------------------- |
  | conexão (`fetch` lançou, timeout), 408, 409, 429, 5xx/529  | `ClaudeIndisponivel(status?)`             |
  | 401, 403                                                   | `ClaudeRecusou('chave_invalida', status)` |
  | outro 4xx (400, 404, 413, 422)                             | `ClaudeRecusou('requisicao_invalida')`    |
  | `stop_reason: 'refusal'`                                   | `ClaudeRecusou('recusa')`                 |
  | `max_tokens`, `model_context_window_exceeded`, texto vazio | `ClaudeRecusou('formato')`                |
  | qualquer outro erro                                        | `ClaudeIndisponivel()`                    |

- **Onde a chave pode sair:** a SDK 1.1.0 manda a `apiKey` no header `Authorization: Bearer`, **não** em `x-api-key` (medido no teste). Um sentinela de header precisa olhar `authorization`. O cliente fixa `baseURL: 'https://api.anthropic.com'` e `authToken: null`, porque sem isso a SDK lê `ANTHROPIC_BASE_URL` e `ANTHROPIC_AUTH_TOKEN` do `process.env` (que, com `nodejs_compat`, pode vir preenchido com as vars do Worker) e mandaria a chave para outro host; o teste prova com as duas variáveis setadas. `logLevel: 'off'` tira o log da SDK do console do Worker.
- **Haiku 5.5 pensa por padrão:** só tem adaptive thinking, ligado sem precisar mandar `thinking` (segundo a skill `claude-api`), e o cliente não manda `thinking`. O pensamento conta no `max_tokens`: um `maxTokens` apertado pode terminar em `max_tokens` e virar `formato`. Medir nas features do Haiku antes de fixar o valor.
- **Testes:** o `fetch` é injetado (nada vai à rede). Os mocks de 429/5xx mandam `retry-after-ms: 1` para o retry não atrasar. Um `afterAll` confere que nenhuma exceção lançada no arquivo contém a chave sentinela.

## Erros (`erros.ts`)

Os Workers mapeiam com `codigoDoErro(err)` para o envelope `{ok:false, notifications}` de cada um. `null` quer dizer "não é erro da IA": o Worker relança.

| Classe               | Código                | Status | Quando                                                                 |
| -------------------- | --------------------- | ------ | ---------------------------------------------------------------------- |
| `ClaudeDesligado`    | `claude_desligado`    | 503    | Sem `ANTHROPIC_API_KEY`                                                |
| `ClaudeIndisponivel` | `claude_indisponivel` | 503    | Rede, 5xx, 529 (overloaded) ou 429 (rate limit)                        |
| `ClaudeRecusou`      | `claude_recusou`      | 502    | 400, 401 ou 403, `stop_reason: "refusal"`, ou resposta fora do formato |
| `TetoAtingido`       | `teto_atingido`       | 429    | A reserva estouraria o teto do mês da feature                          |

- `ClaudeRecusou.motivo`: `chave_invalida`, `requisicao_invalida`, `recusa` ou `formato`. Cada um tem mensagem própria; a de `chave_invalida` manda conferir o `wrangler secret`.
- As mensagens são montadas aqui, nunca copiadas do erro da SDK: o texto cru da API pode trazer dado da requisição, e a chave não pode vazar por corpo de resposta nem por log.
- A mensagem do `TetoAtingido` traz o teto, o gasto (em `US$ x,yy`) e o mês (`YYYY-MM`).

## Orçamento (`uso.ts` e `sql/uso_ia.sql`)

Uma linha por chamada na tabela `uso_ia` (STRICT, índice `(feature, mes)`): `estado` `reservado` → `concluido` (com `custo_micro` e tokens) ou `falhou`. `tokens_entrada` soma `input_tokens` e os dois campos de cache.

- **Cópia nos Workers:** `apps/ramielle/migrations/0006_uso_ia.sql` e `apps/financas/migrations/0015_uso_ia.sql` são cópias byte a byte de `sql/uso_ia.sql`, travadas pelo `src/schema.test.ts` de cada Worker. Mudar a tabela é mudar aqui, copiar para as duas e escrever migration nova se a anterior já foi para produção.
- **`reservar(db, { feature, mes, modelo, estimativaMicro, tetoMicro })`** é um único `INSERT … SELECT … WHERE gasto + estimativa <= teto`, atômico no D1: de duas reservas concorrentes com espaço para uma, só uma grava (teste com `Promise.allSettled`). O gasto do mês soma `custo_micro` dos `concluido` e `reservado_micro` dos `reservado`; `falhou` conta 0. `meta.changes === 0` vira `TetoAtingido`, com o gasto lido numa segunda consulta só para a mensagem.
- **Reserva órfã conta, de propósito:** se o Worker morre entre reservar e concluir, a linha fica `reservado` e segue prendendo a estimativa contra o teto. Erra para o lado barato; não existe limpeza automática.
- **`concluir(db, id, resposta)`** troca a estimativa pelo custo real; **`liberar(db, id)`** marca `falhou`. Os dois só mexem em linha `reservado` (uma linha concluída não volta).
- **`comOrcamento(db, { feature, tetoMicro, apiKey?, fetch? }, pedido)`:** sem chave lança `ClaudeDesligado` antes de reservar (nenhuma linha). Depois, reserva com `estimativaMicroUsd(modelo, system.length + user.length, maxTokens)` e `mes = mesFortaleza()`, chama a Claude e conclui. Se a Claude falha: `ClaudeRecusou` com motivo `recusa` ou `formato` veio de uma resposta que a API **já cobrou** (o uso real não chega até aqui), então a linha fica `concluido` com `custo_micro = reservado_micro`; qualquer outro erro (rede, 429, 5xx, 401, 400) chama `liberar`. Em todos os casos o erro é relançado. Se o `concluir` falhar depois de uma chamada boa, a linha fica `reservado` (conta a estimativa).
- **`mesFortaleza(agora?)`:** `YYYY-MM` em America/Fortaleza, UTC-3 fixo (sem horário de verão desde 2001): `2026-11-01T02:00Z` ainda é `2026-10`.
- **`BancoD1`** é um tipo estrutural mínimo (`prepare` → `bind`/`run`/`first`), para o pacote não depender de `@cloudflare/workers-types`. O `D1Database` real dos Workers é atribuível a ele (conferido com `tsc` no ramielle).

## Chave

`ANTHROPIC_API_KEY` é secret de cada Worker (`wrangler secret put ANTHROPIC_API_KEY`), nunca `vars` do `wrangler.jsonc` nem `.dev.vars` commitado. Nenhum agente escreve a chave real.
