# CLAUDE.md — `packages/ia` (`@piluvitu/ia`)

Base comum da IA dos Workers (`apps/financas` e `apps/ramielle`). O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz. Plano de origem: `docs/superpowers/plans/2026-10-24-ia-fase-1-claude.md`.

## Propósito

TypeScript puro, sem Hono e sem D1 por enquanto: o que os dois Workers precisam igual para falar com a Claude, com o mesmo custo, os mesmos erros e o mesmo teto.

- **Fonte:** `src/custo.ts` (modelos, preços, custo e estimativa) e `src/erros.ts` (classes de erro e `codigoDoErro`). Um export por subpath, sem barrel: `@piluvitu/ia/custo`, `@piluvitu/ia/erros`.
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
