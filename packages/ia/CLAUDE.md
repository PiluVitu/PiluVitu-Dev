# CLAUDE.md — `packages/ia` (`@piluvitu/ia`)

Base comum da IA dos Workers (`apps/financas` e `apps/ramielle`). O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz. Plano de origem: `docs/superpowers/plans/2026-10-24-ia-fase-1-claude.md`.

## Propósito

TypeScript puro, sem Hono e sem D1 por enquanto: o que os dois Workers precisam igual para falar com a Claude, com o mesmo custo, os mesmos erros e o mesmo teto.

- **Fonte:** `src/claude.ts` (cliente, `chamarClaude`), `src/custo.ts` (modelos, preços, custo e estimativa) e `src/erros.ts` (classes de erro e `codigoDoErro`). Um export por subpath, sem barrel: `@piluvitu/ia/claude`, `@piluvitu/ia/custo`, `@piluvitu/ia/erros`.
- **SDK:** `@anthropic-ai/sdk` em versão **exata** (`1.1.0`, publicada em 2026-10-21). Subir de versão é decisão explícita, nunca `^`.
- **Testes:** Vitest, colocated (`src/*.test.ts`). `pnpm --filter @piluvitu/ia test`.
- **Tipos:** `pnpm --filter @piluvitu/ia lint` (`tsc --noEmit`).
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

## Chave

`ANTHROPIC_API_KEY` é secret de cada Worker (`wrangler secret put ANTHROPIC_API_KEY`), nunca `vars` do `wrangler.jsonc` nem `.dev.vars` commitado. Nenhum agente escreve a chave real.
