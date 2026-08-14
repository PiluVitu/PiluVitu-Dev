# promeia — revisão de artigo (proofread + refine)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, task a task, com revisão entre elas.

**Goal:** Portar a **inferência** da revisão de artigo da API Go para o promeia — `proofread` (corrigir texto) e `refine` (refinar chamada social) — mantendo o contrato de corpo e as mensagens, para o admin não mudar.

**Architecture:** §7.2 do spec: _"os prompts e a inferência vão para promeia; o estado e a publicação ficam em ramielle"_. Esta fatia entrega **só o lado promeia**. Quem chama continua sendo a Go, até o ramielle ganhar as rotas de orquestração (fatia seguinte).

**Tech Stack:** Python 3.13, FastAPI, httpx, Ollama local (`/api/chat`), pytest, ruff.

---

## Por que agora, e por que só a inferência

O `CLAUDE.md` do promeia registra, no topo de `ollama.py`:

> ⚠️ Usa `/api/generate` (prompt único), não `/api/chat` (system+user). […] `chat` entra quando a revisão de artigo migrar — **depois do ramielle**, por decisão do dono. **Não antecipar.**

O ramielle ficou pronto na fatia ④. É a hora.

⚠️ **A regra de corte do promeia (o `CLAUDE.md` dele) vale aqui e define o escopo:** entra no promeia o que precisa de **GPU/modelo local/disco**. Proofread e refine são inferência local ⇒ promeia. **Publicar em dev.to/Hashnode/Bluesky/Mastodon é HTTP pra API de terceiro ⇒ ramielle**, mesmo que o texto tenha saído de um LLM. Esta fatia não toca em publicação.

---

## Fatos medidos (lidos do Go, 2026-08-13)

- **O nível de revisão JÁ EXISTE e é porte, não feature.** `Proofread(ctx, text, careful bool)` (`internal/llm/client.go:104`): `careful=false` ⇒ `qwen2.5:3b-instruct`; `careful=true` ⇒ `qwen2.5:7b-instruct`. Exposto no corpo como `{"text": "...", "careful": bool}`.
- **Proofread NÃO manda o artigo inteiro pro modelo.** Ele divide em blocos e envia **só a prosa**, pulando código, tabelas, HTML/JSX, citações e imagens (`internal/llm/chunk.go`). Motivo duplo: velocidade em artigo longo, e não deixar o LLM estragar o que não é texto.
- ⚠️ **A invariante do splitter:** `join(blocks.text) == input`, **byte a byte**. Blocos de código cercado (```) são **atômicos** — linha em branco dentro deles não os quebra.
- **`restoreEdges`** reanexa o espaço em branco de borda do bloco original ao texto corrigido (que o chat devolve trimado), preservando o espaçamento na remontagem.
- **Temperaturas diferentes:** proofread usa `0.1` (correção deve ser conservadora), refine usa `0.7` (reescrita precisa de variação). Não uniformizar.
- **`refine` sem instrução** usa o default `"Melhore o engajamento mantendo o sentido."` (`client.go:170-172`).
- **Limite por plataforma** (`platformLimit`): `bluesky` 300, `mastodon` 500, **default 280**.
- **Contrato de erro do Go** (`internal/handlers/llm/handlers.go`), a ser espelhado:

| Situação                      | Status | `code`            | Mensagem                                   |
| ----------------------------- | ------ | ----------------- | ------------------------------------------ |
| LLM indisponível              | 503    | `llm_unavailable` | `LLM local indisponível (Ollama offline).` |
| corpo inválido / `text` vazio | 400    | `invalid_json`    | `Corpo inválido: 'text' é obrigatório.`    |
| falha no proofread            | 502    | `llm_failed`      | `Falha ao corrigir o texto.`               |
| falha no refine               | 502    | `llm_failed`      | `Falha ao refinar o texto.`                |

- Sucesso: `{"data":{"corrected":"..."}}` e `{"data":{"refined":"..."}}`.
- Os 4 prompts vivem em `internal/llm/prompts.go`: `proofreadSystem`, `hooksSystemTmpl`, `refineSystem`, `shortenSystem`. **Esta fatia porta os dois primeiros que usa** (`proofreadSystem`, `refineSystem`); `hooksSystemTmpl`/`shortenSystem` são da fatia de distribuição.

---

## Global Constraints

- **Paridade com o Go**: mesmo contrato de corpo, mesmo `code`, mesma mensagem — o admin do `apps/web` não pode mudar.
- ⚠️ **Os prompts são contrato byte a byte.** São texto que o dono já revisou e calibrou. Copiar **literalmente**, sem "melhorar", sem reindentar, sem quebrar linha (é por isso que `insight.py` tem `E501` desligado — o mesmo vale aqui).
- **`PROMEIA_TOKEN` em toda rota**, por middleware — já é assim; a prova (`test_TODA_rota_registrada_recusa_sem_token`) cobre rota nova sozinha. **Não adicionar guarda por rota.**
- **Nenhum teste chama o Ollama de verdade.**
- Colocation (`x.py` → `x_test.py`), comentários e mensagens em **português**.
- Gates: `uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .` — os três, sempre. ⚠️ O gate de **format** é separado do de lint e já quebrou o CI uma vez nesta migração com o pytest verde.

---

## Task 1: `chat()` no cliente Ollama

**Files:** `src/promeia/ollama.py`, `src/promeia/ollama_test.py`

**Interfaces:** produz `chat(*, model, system, user, temperature, base_url, client=None) -> str`.

⚠️ `/api/chat` é uma API **diferente** de `/api/generate`: corpo com `messages: [{role, content}]`, resposta em `message.content` (não `response`). O `generate` existente **fica** — o insight usa.

- [ ] **Step 1: Teste primeiro.** Reusar o estilo de `ollama_test.py`. Cobrir: caminho feliz; `messages` montado com `system` e `user` nas posições certas; `temperature` repassada; Ollama desligado ⇒ `OllamaUnreachable`; modelo ausente ⇒ `OllamaModelMissing`; resposta não-objeto ⇒ `OllamaFailed`; `message.content` ausente ⇒ `OllamaFailed`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar, **reaproveitando** o tratamento de erro do `generate` (as 4 classes de exceção e o `_MODELO_AUSENTE_RE` já existem — não duplicar a lógica, extrair o que der).
- [ ] **Step 4:** Rodar e ver passar. `ruff check` + `ruff format --check`.
- [ ] **Step 5: Commit.**

---

## Task 2: O splitter de blocos

**Files:** `src/promeia/markdown_blocos.py` (+ teste)

Porte de `internal/llm/chunk.go`. **Leia o arquivo.**

**Interfaces:** produz `dividir_blocos(texto) -> list[Bloco]` (com `.tipo` prosa/passthrough e `.texto`) e `restaurar_bordas(original, corrigido) -> str`.

- [ ] **Step 1: Teste primeiro.** ⚠️ **A invariante é o teste mais importante desta fatia:** para qualquer entrada, `"".join(b.texto for b in dividir_blocos(entrada)) == entrada`, **byte a byte**. Escreva-o primeiro e cubra com entradas hostis: bloco de código com linha em branco dentro; código não fechado no fim do arquivo; CRLF; texto começando/terminando com linha em branco; arquivo vazio; só espaço em branco.

Além da invariante, classificar como **passthrough**: código cercado (atômico), tabela (`|`), HTML/JSX (`<`), citação (`>`), imagem (`![`), e bloco só de espaço em branco. Prosa: o resto.

- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. ⚠️ O Go usa `strings.SplitAfter(input, "\n")`, que **mantém o `\n` no fim de cada linha** — é o que faz a invariante fechar. Um `splitlines()` ingênuo em Python **perde** os separadores e quebra a invariante em silêncio.
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Mutação obrigatória.** Faça o splitter descartar um `\n` (ex.: trocar por `splitlines()`) e confirme que o **teste de invariante falha**. Se ficar verde, ele não está comparando byte a byte. Reverter.
- [ ] **Step 6: Commit.**

---

## Task 3: `proofread` e `refine`

**Files:** `src/promeia/revisao.py` (+ teste)

**Interfaces:** consome `chat` (T1) e `dividir_blocos`/`restaurar_bordas` (T2). Produz `proofread(texto, *, careful, ...)` e `refine(plataforma, texto, instrucao, ...)`.

- [ ] **Step 1: Teste primeiro.** Cubra, com `chat` injetado (nunca Ollama real):
  - proofread manda ao modelo **só os blocos de prosa** — um artigo com código+tabela+prosa gera N chamadas, e o código/tabela saem **idênticos** na saída;
  - `careful=False` ⇒ modelo `3b`; `careful=True` ⇒ modelo `7b` (⚠️ use nomes de modelo **distinguíveis** na asserção — a lição da fatia ④: valor esperado igual ao default não prova nada);
  - a saída remontada preserva o espaçamento entre blocos (`restaurar_bordas`);
  - temperatura `0.1` no proofread, `0.7` no refine;
  - refine sem instrução usa o default do Go, literalmente;
  - limites: bluesky 300, mastodon 500, desconhecida 280.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar. Os prompts vão num módulo próprio ou no topo deste, **copiados literalmente** do Go.
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Commit.**

---

## Task 4: As rotas `POST /llm/proofread` e `POST /llm/refine`

**Files:** `src/promeia/llm_rotas.py` (+ teste), `src/promeia/app.py`

- [ ] **Step 1: Teste primeiro.** Status, `code` e **mensagem literal** da tabela de erro acima — os quatro casos. Mais: 401 sem token (a prova por middleware já cobre; confirme que a rota nova aparece em `_rotas_registradas`).
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar e montar em `app.py` via `include_router`.
- [ ] **Step 4:** Rodar e ver passar.
- [ ] **Step 5: Mutação obrigatória.** Troque uma mensagem de erro por outra e confirme que o teste **falha** — é a paridade que o `apps/web` mostra em `toast.error`.
- [ ] **Step 6:** Atualizar `apps/promeia/CLAUDE.md`: o aviso do topo de `ollama.py` ("`chat` entra quando a revisão de artigo migrar — não antecipar") **cumpriu seu papel e precisa ser reescrito**, não apagado; e a contagem de testes.
- [ ] **Step 7: Commit.**

---

## Estado ao fim desta fatia

**Pronto:** a inferência da revisão de artigo roda no promeia, com paridade de contrato e mensagem.

**Não muda:** nada em produção. O admin continua chamando a Go — `NEXT_PUBLIC_ATELIER_URL` só passa a apontar pro promeia quando o **ramielle** ganhar as rotas de orquestração (o navegador nunca fala com o promeia direto, §3 do spec).

**Depois:** (a) as rotas de orquestração no ramielle, que chamam o promeia; (b) a distribuição (dev.to/Hashnode/Bluesky/Mastodon + `hooksSystemTmpl`/`shortenSystem`), que é **ramielle**, não promeia, pela regra de corte.
