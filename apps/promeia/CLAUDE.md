# CLAUDE.md — apps/promeia

Serviço Python (FastAPI) que roda no MacBook do dono, atrás de um túnel — o
processamento que precisa de GPU, modelo local ou acesso a arquivo em disco.
Hoje: a transcrição de áudio (`POST /transcrever`, Whisper local) e o insight
financeiro (lê números do ramielle, gera texto via Ollama local, publica de
volta). Depois: PDF (§9.3 do spec da fatia).

## A revisão de artigo saiu daqui (IA fase 1, PR3, 2026-10)

`proofread`, `refine` e `hooks` foram para a Claude, dentro do ramielle
(`apps/ramielle/src/domain/revisao/`, ver o `CLAUDE.md` de lá). Saíram daqui
`revisao.py`, `revisao_rotas.py`, `prompts.py`, `markdown_blocos.py`, os testes
deles, o router em `app.py`, as settings `model_proofread`,
`model_proofread_careful` e `model_hooks` (e as envs `MODEL_*`) e o
`ollama.chat` (com o `OllamaVazio`). `app_test.py` confere que `/llm/*`
responde 404.

⚠️ **O Ollama continua aqui enquanto o insight existir neste branch.** O
`insight.py` usa `ollama.generate`, então `ollama.py` ficou só com o
`generate`, e o Ollama segue no LaunchAgent dele e no `process-compose.yaml`
da raiz (`make stack`). O PR2 da mesma fase (branch `feat/ia-insight`) leva o
insight para a Claude no Worker de finanças. Quando ele e este PR estiverem
juntos na `main`, saem `ollama.py`, `OLLAMA_URL`/`OLLAMA_MODEL` e o Ollama do
`process-compose.yaml`, e o promeia fica só com a transcrição.

## Transcrição de áudio — `POST /transcrever`

Recebe N áudios por **multipart**, devolve o texto de cada um e um costurado. Chamada pelo ramielle (`POST /admin/transcrever`, ver `apps/ramielle/CLAUDE.md`), nunca pelo navegador. A tela é `/admin/transcricao` no `apps/web`.

⚠️ **`mlx-whisper` NÃO está em `pyproject.toml`, de propósito.** Ele depende do `mlx`, que só existe em macOS/arm64; declará-lo quebraria o `uv sync --locked` do CI, que roda em Ubuntu — o serviço inteiro deixaria de instalar num runner Linux por causa de UMA rota. Por isso `transcricao.py` chama o **binário** por subprocess: a dependência vira requisito de _ambiente_ (a máquina do dono, a única onde a rota faz sentido) e não de pacote. Instalar: `uv tool install mlx-whisper`. `WHISPER_BIN` sobrescreve o caminho.

⚠️ **O executor é injetado (`executar=`) e buscado no MÓDULO pela rota** (`transcricao.executar_mlx_whisper`, não importado direto). É o que deixa o teste trocar o executor sem tocar no binário — e é por isso que a suíte roda no CI Linux sem `mlx`. O caminho real do subprocess **não** é coberto por teste automatizado; foi verificado à mão com áudio de verdade (dois trechos, termos `ramielle, promeia`, ambos grafados corretamente).

**O encadeamento de contexto é o produto do módulo.** Áudios que se complementam precisam grafar o mesmo nome próprio igual nos três: a cauda de cada transcrição vira o `initial_prompt` do seguinte. O `initial_prompt` do Whisper cabe em **224 tokens**, então só entram as últimas `PALAVRAS_DE_CONTEXTO` (120) — passar mais faz a janela cortar em silêncio.

⚠️ **O teto real NÃO é tamanho de arquivo, é TEMPO.** A Cloudflare corta a requisição do navegador em ~100 s (524) e o ramielle desiste em 120 s (`TIMEOUT_MS`). MEDIDO num M4: `large-v3` roda a **4,4x** tempo real e o `turbo` a **13,1x** — ou seja ~7 min e ~20 min de áudio dentro do orçamento, respectivamente. Daí o campo `modo` (`preciso` default, `rapido`). `MAX_AUDIOS`/`MAX_BYTES_TOTAL` são um proxy grosseiro disso: medir duração exigiria ffprobe, uma segunda dependência de ambiente, e o proxy já barra o caso absurdo.

| erro                   | status | quando                           |
| ---------------------- | ------ | -------------------------------- |
| `invalid_body`         | 400    | nenhum áudio enviado             |
| `too_many_files`       | 400    | acima de `MAX_AUDIOS`            |
| `audio_too_large`      | 413    | soma acima de `MAX_BYTES_TOTAL`  |
| `whisper_indisponivel` | 503    | binário ausente — instale no Mac |
| `transcricao_vazia`    | 503    | rodou, saiu vazio                |
| `transcricao_falhou`   | 503    | rodou e falhou                   |

⚠️ **Nenhum erro desta rota sai como 502** — o túnel troca o corpo de um 502 por `error code: 502`, o ramielle não acha `code` e o admin lia "Suba o promeia no Mac" com o Mac de pé (aconteceu em produção, 2026-09-30; ver _O túnel COME o corpo do 502_). A distinção entre "falta instalar" e "rodou e falhou" mora no `code`, não no status. Travado em `transcricao_rotas_test.py` (`TestFalhas`).

⚠️ **`--output-name` fixo (`NOME_SAIDA`) é obrigatório.** O `mlx_whisper` grava a saída com `Path(nome).with_suffix(".txt")`, que troca só o **último** trecho depois do ponto: `WhatsApp_Ptt_2026-09-30_at_22.15.03` vira `…_22.15.txt`. Procurar `{stem}.txt` falhava em **todo** áudio do WhatsApp (a hora vem com pontos no nome). E o `mlx_whisper` **sai 0 mesmo quando pula o áudio por erro** — por isso a falha volta com a última linha de `Error` que ele imprimiu (`_linha_de_erro`), sem o banner do ffmpeg.

⚠️ **O nome do arquivo vem do cliente e é sanitizado** (`_nome_seguro`): só o basename, só `[A-Za-z0-9._-]`. Sem isso um `../../etc/x.ogg` escaparia do diretório temporário.

## Modelos de 2026: `"think": false` é obrigatório, não otimização

⚠️ **A geração 2026 é thinking-by-default, e no `/api/chat` (que a revisão de
artigo usava, antes de ir para a Claude) isso não deixava a revisão lenta —
deixava ela VAZIA.** MEDIDO contra o Ollama local, sem o campo `think` no
payload:

| Modelo       | Tokens gastos | `message.thinking` | `message.content` |
| ------------ | ------------- | ------------------ | ----------------- |
| `qwen3.5:4b` | 3.614         | —                  | **VAZIO**         |
| `gemma4:12b` | 3.621         | 12.435 chars       | **VAZIO**         |

Não é peculiaridade de uma família: os dois anunciam `"thinking"` em
`capabilities` (`GET /api/tags`) e o ligam sozinhos.

⚠️ **Modelo SEM thinking IGNORA o campo, não recusa — MEDIDO, e é por isso que
não existe fallback aqui** (seria YAGNI, e custaria uma segunda rodada de
inferência pra descobrir um erro que não acontece): `qwen2.5:7b-instruct`
(`capabilities: ["completion","tools"]`) recebeu `"think": false` em
`/api/chat` **e** em `/api/generate` e respondeu **HTTP 200** normalmente.

⚠️ **Os dois endpoints do Ollama tratam thinking DIFERENTE** — descoberto ao
checar se o insight tinha o mesmo defeito latente. `/api/chat` engole a
resposta; `/api/generate` separa o raciocínio em `thinking` e **ainda preenche
`response`**. Mesma prompt de uma frase, `qwen3.5:4b`:

| Endpoint        | `think` | Resposta   | Tokens      | Tempo             |
| --------------- | ------- | ---------- | ----------- | ----------------- |
| `/api/chat`     | ausente | **VAZIA**  | 3.614       | —                 |
| `/api/generate` | ausente | preenchida | 248 a 3.481 | **22 s a >120 s** |
| `/api/generate` | `false` | preenchida | **2 a 21**  | **1 s a 5,4 s**   |

⚠️ **As faixas do `/api/generate` são largas de propósito: o custo do thinking
NÃO é reprodutível.** A 1ª medição desta task deu 3.481 tokens / >120 s; a
verificação independente, com o mesmo modelo e o mesmo `temperature: 0`, deu
**248 tokens / 22,3 s** — ~14× menos, mesma direção. Um número único aqui seria
mais preciso do que o fenômeno permite, e a próxima pessoa que tentasse
reproduzi-lo concluiria que a tabela mente. O que se sustenta é a ORDEM DE
GRANDEZA: uma a duas ordens a mais de tokens e de tempo, num prompt de UMA
frase.

Ou seja: o insight (que usa `generate`) **não** tem o bug de resposta vazia —
tem uma a duas ordens de grandeza a mais de tokens e de parede contra o
`read=180.0` de `ollama.TIMEOUT`, num prompt de UMA frase (o prompt real é bem
maior). `generate` também manda `"think": false` desde esta task: uma linha,
medida como inofensiva no modelo que o insight de fato usa, e coerente com o
`temperature: 0` que aquele caminho fixa justamente por exigir determinismo.

⚠️ **`OLLAMA_MODEL` (o insight) NÃO mudou, e isso é decisão, não esquecimento.**
A tarefa dele é redigir um parágrafo sobre números **já calculados** pelo
Worker; o gargalo medido é o **prompt** e a quantidade de dado, não o modelo.
Evidência: o insight de 2026-08 saiu afirmando _"mantendo-se igual ao mesmo
período do ano anterior"_ sobre um banco que **não tem ano anterior** — modelo
maior nenhum conserta um prompt que deixa essa frase ser possível. Pinado por
`test_o_modelo_do_insight_e_o_medido` (`config_test.py`).

## Resposta vazia do modelo é FALHA, nunca sucesso silencioso

Vale para os dois consumidores de modelo que sobraram: o insight levanta
`InsightVazio` (`insight.py`) e a transcrição levanta a falha de "rodou, saiu
vazio" (`transcricao.py`). Um texto vazio nunca é publicado nem devolvido como
sucesso.

## O que é promeia, e a regra de corte

**A pergunta que decide se algo entra aqui é: _este trabalho precisa de GPU,
modelo local, ou acesso a arquivo em disco?_** Sim ⇒ promeia. Não ⇒ ramielle
(o Worker de finanças, hoje `apps/financas`, e depois de aposentar a API Go
também o que é hoje `apps/api`).

⚠️ **"Tem a ver com AI" NÃO é o critério.** Publicar num serviço externo
(dev.to, Hashnode, Bluesky, Mastodon) é HTTP para uma API de terceiro — não
precisa de GPU nem de disco local, e é ramielle, mesmo que o texto publicado
tenha sido escrito por um LLM em outra etapa do pipeline. O critério é sobre
_onde o trabalho PRECISA rodar_, não sobre se um modelo está envolvido em
algum ponto do fluxo.

## O Mac empurra, o app lê

O promeia nunca é onde a verdade mora. Ele lê os números já calculados do
ramielle (`GET /api/insights/numbers` — nunca um lançamento cru, só agregado),
manda pro Ollama local escrever uma leitura em texto por cima deles, e
**empurra** o resultado de volta (`POST /api/insights`). A tela que o dono
olha lê do D1 do ramielle — nunca chama o Mac ao vivo, nunca depende do Mac
estar ligado no momento em que alguém abre o app.

Consequência prática: depois que `promeia-insight` termina (publicou com
sucesso, ou falhou com uma mensagem clara), não precisa continuar nada rodando
— pode fechar o Ollama, fechar o terminal, fechar a tampa do MacBook. Não há
processo em segundo plano, não há socket esperando a próxima chamada.

## `PROMEIA_TOKEN` — toda rota HTTP, por middleware, sem exceção

`TokenMiddleware` (`src/promeia/auth.py`) é instalado via `app.add_middleware`
em `create_app` (`src/promeia/app.py`) — isso o coloca **em torno do app ASGI,
antes de qualquer roteamento do FastAPI, para toda requisição HTTP**. O
serviço **recusa subir** sem `PROMEIA_TOKEN` (`load_settings` lança
`ConfigError` — ver `src/promeia/config.py`), e toda requisição HTTP sem o
token correto (`Authorization: Bearer <token>`) recebe 401 antes de qualquer
rota ser alcançada.

⚠️ **"App ASGI inteiro" não inclui WebSocket — MEDIDO em
`starlette/middleware/base.py`:** `BaseHTTPMiddleware.__call__` faz `if
scope["type"] != "http": await self.app(scope, receive, send); return` **antes**
de chamar `dispatch` (onde `TokenMiddleware` checa o token). Um scope
`"websocket"` atravessa direto pro app, sem passar pelo guard — uma rota
WebSocket futura nasceria sem cadeado. Hoje isso não morde por **acaso
feliz, não por proteção**: o app não tem nenhuma rota WebSocket, e se uma
nascesse, `_rotas_registradas` (`app_test.py`) **levantaria** ao tentar
achatar um `WebSocketRoute` (sem `.methods` nem `.routes` compatíveis com o
que a função sabe abrir) — quebrando o teste alto, e não silenciosamente,
antes de a rota chegar a produção sem guarda. Mas o acaso é do teste
denunciar o problema, não do middleware evitá-lo.

**Motivo:** o túnel Cloudflare torna este serviço alcançável pela internet
inteira. Sem o token, seria GPU do dono publicada de graça para qualquer um
que descubra o hostname.

**A prova que não envelhece:** `test_TODA_rota_registrada_recusa_sem_token`
(`src/promeia/app_test.py`) enumera **toda rota que o app de fato registrou**
(via `_rotas_registradas`, ver seção seguinte) e exige 401 em cada uma — uma
rota nova é coberta sozinha, porque a guarda é um middleware, não um decorator
repetido rota a rota (que se esquece).

## Duas coisas MEDIDAS nesta execução, para ninguém redescobrir

- **`include_router()` no FastAPI 0.140.7 põe um `_IncludedRouter` opaco em
  `app.routes`** — sem `.path`, sem `.methods` no próprio objeto. Uma
  enumeração ingênua de rotas (`if getattr(r, "methods", None)` direto em
  `app.routes`) pula esse objeto inteiro **em silêncio**: um teste assim passa
  verde cobrindo só `/health`, e `POST /insight` (montado via
  `app.include_router(insight_router)`) nunca é exercitado — a prova de "toda
  rota exige token" mentiria sobre o que prova. É por isso que `app_test.py`
  tem `_rotas_registradas`, que **LEVANTA** no que não sabe achatar (via
  `entrada.routes` ou `entrada.original_router.routes`) em vez de ignorar —
  um `continue` ali devolveria exatamente a falsa sensação de cobertura que
  esta função existe para impedir.
- **`openapi_url=None` (em `create_app`) é redução de SUPERFÍCIE, não
  proteção.** `/openapi.json` já respondia 401 mesmo no default (com
  `openapi_url` presente) — `TokenMiddleware` entra via `add_middleware` e
  envolve o app ASGI inteiro **antes** do roteamento, então nenhuma rota do
  FastAPI (incluindo as que o próprio framework gera) escapa dele. Setar
  `openapi_url=None`/`docs_url=None`/`redoc_url=None` é YAGNI: um serviço
  privado de usuário único, atrás de um túnel, não tem por que publicar o
  próprio mapa de rotas, nem para quem já tem o token. `test_o_mapa_de_rotas_
nao_e_publicado` (`app_test.py`) prova que nenhum path `/openapi*` aparece na
  lista de rotas registradas — sem essa asserção, remover `openapi_url=None`
  não quebraria nada e o schema voltaria em silêncio.

## Toolchain

- **`uv`** — gerenciador de pacotes/venv deste workspace. Política de
  dependência Python (lock commitado, instalação `--locked`, e o gate de
  `exclude-newer`) **mora na raiz** — ver _Dependency security policy_ em
  `CLAUDE.md` (raiz), não duplicada aqui: cada fato mora num único arquivo,
  regra do próprio `CLAUDE.md` da raiz. O `exclude-newer = "24 hours"` em si
  fica em `pyproject.toml` (comentário ao lado de `[tool.uv]`), porque é
  configuração deste workspace, não fato transversal.
- **pytest com `python_files = ["*_test.py"]`** (`pyproject.toml`) — o default
  do pytest é `test_*.py`, que **briga com a lei de colocation** deste
  monorepo (teste ao lado do fonte, nomeado a partir dele: `money.py` →
  `money_test.py`, nunca `test_money.py` num diretório `tests/`). Este fato É
  específico do promeia (o default do pytest, não uma regra de dependência),
  por isso mora aqui e não na raiz.
- **`ruff`** para lint (`select = ["E", "F", "I", "UP", "B", "SIM"]`) e format.
  Per-file-ignores: **`insight.py`** tem `E501` desligado porque monta PROMPT,
  que é contrato byte a byte com o que o dono já calibrou contra o modelo
  real. Quebrar linha ali pra caber em 88
  colunas insere uma quebra **real** no texto mandado pro modelo: não é
  formatação, é mudar a entrada de dados.
- **Suíte hoje: 145 testes** (`uv run pytest`, linha final `N passed`), depois
  que a revisão de artigo saiu (IA fase 1, PR3). **Recontar sempre via `uv run
pytest -v`, nunca confiar num número solto neste arquivo**: ele já andou
  mais de uma vez sem o arquivo acompanhar.
- A remoção do CLI Node que a fatia do insight substituiu
  (`apps/financas/scripts/insight.mjs`/`insight.test.mjs`) tirou 40 testes
  correspondentes de `apps/financas`: `pnpm --filter @piluvitu/financas run
test:pdf-import` caiu de **117 para 77** (só `pdf-import.test.mjs` continua
  sob esse arquivo de config, `vitest.scripts.config.ts`) — prova de que a
  remoção foi cirúrgica, não um efeito colateral.

## Comandos

| Comando                        | Propósito                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `make dev-promeia`             | `uvicorn` com `--reload` na porta **8082**                                               |
| `make test-promeia`            | `cd apps/promeia && uv run pytest`                                                       |
| `make lint-promeia`            | `uv run ruff check .` + `uv run ruff format --check .`                                   |
| `make insight`                 | `uv run promeia-insight` — gera e publica o insight do mês                               |
| `make promeia-servico`         | instala o LaunchAgent: promeia sobe no login e reinicia se cair (ver _Serviço no login_) |
| `make promeia-servico-remover` | desinstala o LaunchAgent                                                                 |

De dentro de `apps/promeia`, sem o `make`: `uv run pytest` / `uv run ruff
check .` / `uv run ruff format --check .` / `uv run promeia-insight`.

⚠️ **`.env.example` é decorativo — `uv run` NÃO lê `.env` sozinho** (só com
`--env-file <arquivo>`/`UV_ENV_FILE`, MEDIDO no uv 0.11.32 instalado aqui).
Quem fizer `cp .env.example .env` e rodar `uv run promeia-insight` direto
recebe só "PROMEIA_TOKEN não está definido", sem pista de que o `.env`
existe e não foi lido. `make insight` **e `make dev-promeia`** já resolvem
isso — mesmo padrão do `dev-api` da raiz, source condicional (`set -a && [ -f
.env ] && . ./.env; set +a`), só carrega se o arquivo existir, nunca quebra
quem prefere exportar as vars na mão. Rodando `uv run promeia-insight` direto
(sem `make`), a saída é sua: `set -a; source .env; set +a` antes, ou
`uv run --env-file .env promeia-insight`.

⚠️ **`dev-promeia` NÃO fazia esse source até agora, e o defeito era invisível
justamente porque só metade dele aparecia.** `PROMEIA_TOKEN` ausente derruba o
boot (`ConfigError`), então quem subia o serviço sem `.env` percebia na hora e
exportava o token na mão — e seguia com `INGEST_TOKEN=""`, que **não** impede o
serviço de subir. `/health` respondia, a revisão de texto (então aqui) funcionava, e só
`POST /insight` quebrava: **502** com `Illegal header value b'Bearer '`
(o header `"Bearer "` que o httpx recusa), classificado como
`ramielle_unreachable` — "confira a conexão e a URL". MEDIDO por HTTP contra o
serviço que estava de pé havia dois dias. Os dois lados do defeito foram
consertados: o alvo faz source (aqui) e o token vazio agora falha com nome
próprio (§ _INGEST_TOKEN_ abaixo).

`make test`/`make lint` (raiz) **incluem o promeia** desde esta task — os dois
alvos encadeiam `cd apps/promeia && uv run pytest` / `uv run ruff check . &&
uv run ruff format --check .` depois de rodar `pnpm -r`/`go`.

## O comando `promeia-insight` (`src/promeia/cli.py`)

Console script declarado em `[project.scripts]` desde a Task 1
(`promeia-insight = "promeia.cli:main"`). `main(argv=None, *, env=None,
log=print, log_erro=..., executar=None) -> int` — `env`/`log`/`log_erro`/
`executar` são pontos de injeção que permitem testar toda a árvore de decisão
(help, opção desconhecida, token ausente, os quatro tipos de falha de rede) em
`cli_test.py` sem tocar Ollama nem rede real.

```bash
ollama serve   # se ainda não estiver rodando
cd apps/promeia
PROMEIA_TOKEN=... INGEST_TOKEN=... uv run promeia-insight --competencia 2026-07
# ou, da raiz:
make insight
```

Opções: `--competencia YYYY-MM` (default: mês corrente em Teresina) e
`--help`/`-h`.

## Erros são o produto

Nunca uma stack trace, nunca um erro cru de biblioteca — as mensagens abaixo
foram **medidas contra os serviços reais** (Ollama e o Worker de finanças
local), não só stubadas em teste:

- **Ollama desligado** (porta fechada/serviço parado): _"não consegui
  conectar ao Ollama em `<url>` — ele parece estar desligado. Inicie com
  `ollama serve` (ou abra o app Ollama) e tente de novo"_.
- **Modelo não instalado**: _"modelo `'<nome>'` não está instalado no Ollama
  local. Instale com: `ollama pull <nome>`"_ — cita o comando exato, nunca só
  "modelo não encontrado".
- **Token errado** (401 do ramielle): _"a API recusou o token (401 em
  `<url>`) — confira se o INGEST_TOKEN deste serviço é o MESMO configurado no
  servidor (`wrangler secret put INGEST_TOKEN` em produção, ou a chave
  INGEST_TOKEN de `apps/financas/.dev.vars` em dev)"_.
- **API inalcançável** (rede/DNS/porta fechada): _"não consegui alcançar a
  API em `<url>` — confira a conexão e a URL (RAMIELLE_URL)"_, com o detalhe
  técnico anexado, nunca substituindo a frase.
- **Payload da API fora do formato esperado** (envelope `ok:true` sem
  `"data"`, ou `"data"` faltando uma chave que `build_prompt` espera): sem
  guarda, isso é `TypeError`/`KeyError` cru saindo de `build_prompt` — MEDIDO
  executando de verdade. `run_insight` (`insight.py`) embrulha os dois em
  `RamielleRefused` com uma frase acionável, então a rota E o CLI já sabem
  tratar (nenhum `except` novo em nenhum dos dois). Mesma lógica em
  `ollama.py`: `/api/generate` devolvendo um JSON que não é objeto (ex.: uma
  lista) virava `AttributeError` no `.get("response")` — um `isinstance(dict)`
  antes resolve, espelhando o que `ramielle.py` já fazia.

⚠️ **A distinção "não alcancei" vs. "alcancei e recusou" é deliberada e
estrutural**, não estilo de mensagem: `OllamaUnreachable`/`RamielleUnreachable`
(problema de transporte — suba o serviço, confira a URL) nunca se confundem
com `OllamaModelMissing`/`OllamaFailed`/`RamielleRefused` (o serviço respondeu,
e recusou ou falhou — o gargalo é outro). Cada categoria tem sua própria
classe de exceção (`src/promeia/ollama.py`, `src/promeia/ramielle.py`) e sua
própria mensagem; colapsar as duas manda o dono conferir a rede quando o
problema é o token, ou vice-versa.

`PublicacaoFalhou` (`src/promeia/insight.py`) é a exceção que carrega o texto
já gerado quando a publicação falha **depois** de o Ollama já ter rodado — o
CLI imprime esse texto sob `--- texto gerado (NÃO publicado) ---` (`stderr`),
porque ele já custou uma rodada de inferência e perdê-lo obrigaria rodar tudo
de novo. Texto vazio (`InsightVazio`) sai com código ≠ 0 e nunca é publicado —
nunca finge sucesso.

## ⚠️ O túnel COME o corpo do 502 — e só o do 502

MEDIDO contra o túnel real (`promeia.piluvitu.com.br`), 3/3 de cada lado, e
depois **isolado por status** com uma origem descartável em :8082 que só
devolvia um JSON fixo (nenhuma rota do promeia envolvida, então o resultado é
sobre a Cloudflare, não sobre este serviço):

| Status da origem | Local (:8082)               | Pelo túnel                              |
| ---------------- | --------------------------- | --------------------------------------- |
| 400 / 422        | application/json            | **JSON intacto**                        |
| **500**          | application/json, 162 bytes | **JSON intacto, 162 bytes**             |
| **502**          | application/json, 162 bytes | text/plain, 16 bytes: `error code: 502` |
| **503**          | application/json, 162 bytes | **JSON intacto, 162 bytes**             |

A Cloudflare substitui o corpo de um 502 da origem pelo próprio error page.
**500 e 503 — as duas lacunas que a spike tinha deixado abertas — passam
intactos**, incluindo o `ollama_unreachable` (503) verificado pelo caminho real
(a rota de revisão, hoje removida, com `OLLAMA_URL` numa porta fechada: 215
bytes idênticos local e pelo túnel, 3/3).

**Consequência, e por que ela é grave:** o cliente do outro lado
(`apps/ramielle/src/lib/promeia.ts#chamarPromeia`) trata "erro HTTP sem
`code`/`message` no corpo" como **não alcancei o Mac** — de propósito, porque
é a Cloudflare (não o promeia) quem responde sem esse shape quando o Mac está
desligado. Então **todo 502 daqui chega ao dono como _"Suba o promeia no
Mac"_, com o promeia de pé**: a pior mensagem possível, porque manda arrumar
o que está certo.

Por isso **`insight.py` não emite mais nenhum 502** — os sete ramos de erro
(`empty_insight`, `publish_failed`, `ollama_failed`, `ramielle_unreachable`,
`ramielle_refused` e as duas redes de segurança `ollama_error`/
`ramielle_error`) responderam 502 até esta task e agora respondem **503**; o
corpo inválido segue em 422. A distinção que importa nunca morou no status —
mora no campo `code`, que viaja **dentro** do corpo e só sobrevive se o corpo
sobreviver. O caso que mais dependia disso é o `publish_failed`: ele carrega
em `data.texto` a leitura que já custou 20-33 s de GPU, e num 502 ela sumia
sem ninguém saber que existiu. A regra é grepável (nenhum `502` no arquivo) e
travada por `test_NENHUM_erro_da_rota_sai_como_502` (parametrizado sobre os
nove ramos, `insight_test.py`) — inclusive contra o ramo novo nascido de
copiar/colar um existente, que é exatamente como os cinco anteriores nasceram.

## `INGEST_TOKEN`: exigido no PONTO DE USO, não no boot

`load_settings` levanta `ConfigError` sem `PROMEIA_TOKEN`, mas **deixa o
`INGEST_TOKEN` cair em string vazia de propósito** — e a assimetria é decisão
medida rota a rota, não a mesma lacuna com outro nome:

| Rota                | usa `INGEST_TOKEN`?                        |
| ------------------- | ------------------------------------------ |
| `POST /insight`     | **SIM** — `fetch_numbers` + `post_insight` |
| `POST /transcrever` | não — só Whisper                           |
| `GET /health`       | não                                        |

`/transcrever` não toca o ramielle e está **em produção** (a tela de
transcrição do admin, via ramielle). Exigir o token no boot derrubaria o
serviço inteiro por uma credencial que ela não usa — trocaria um modo de falha
silencioso por uma feature que funciona caindo. O `PROMEIA_TOKEN` é o caso oposto (protege TODA rota, por middleware):
subir sem ele não tem nenhum uso legítimo, é publicar a GPU do dono.

**A regra que sai disso: credencial que TODA rota precisa ⇒ boot; credencial
que UMA rota precisa ⇒ ponto de uso, com mensagem que diga o que fazer.**

Quem exige é `Settings.exigir_ingest_token()` (`config.py`), chamado por
`run_insight` **antes de qualquer I/O e antes da rodada de modelo** — nada de
queimar 20-33 s de GPU pra descobrir no fim que não dá pra publicar. `cli.py`
já fazia exatamente isso desde sempre (checa antes de chamar `run_insight`,
com mensagem de terminal) e **continua fazendo**: a dele sai antes das linhas
"==> buscando os números", que seriam mentira; a nova é a rede pra todo
chamador, inclusive o HTTP, que não passa pelo CLI.

⚠️ **A classificação também estava errada, e isso era metade do defeito.** Sem
essa guarda o token vazio virava o header `"Bearer "`, que o httpx recusa
(`Illegal header value b'Bearer '`) — e o `except httpx.RequestError` de
`ramielle.py` o classificava como `RamielleUnreachable`, ou seja **502
`ramielle_unreachable`, "confira a conexão e a URL"**, mandando o dono
investigar uma rede que não tinha problema nenhum. Agora é **503
`ingest_token_missing`**, com uma mensagem que diz explicitamente _"NÃO é
problema de rede: o serviço está de pé, falta configuração"_ e cita o
`wrangler secret put INGEST_TOKEN`. Verificado pelo túnel: 578 bytes idênticos
local e remoto. Um erro só é de transporte se uma requisição chegou a ser
tentada.

## Serviço no login (LaunchAgent)

`make promeia-servico` deixa o Mac servindo sozinho depois de reiniciar:

- **promeia** — `launchd/com.piluvitu.promeia.plist` → `scripts/servir.sh` (carrega `.env`, `uvicorn` sem `--reload`, `127.0.0.1:8082`). `RunAtLoad` + `KeepAlive`: sobe no login e volta se morrer. Log em `~/Library/Logs/promeia.log`.
- **túnel** — o alvo liga `orbctl config set app.start_at_login true`; o container `cloudflared` tem `restart: unless-stopped`, então volta junto com o OrbStack.
- **Ollama** — já sobe sozinho (LaunchAgent do próprio app, `com.ollama.ollama`).

⚠️ **O plist fixa o `PATH`** (`~/.local/bin` incluso): o `launchd` roda com PATH mínimo e sem isso o subprocess do `mlx_whisper` não é achado — a transcrição responde `503 whisper_indisponivel` com o serviço "de pé".

Verificado sob o `launchd`, não só "carregou": transcrição real pelo túnel (200), e `kill -9` no processo → o `launchd` subiu outro em ~10 s, sem uvicorn órfão segurando a porta.

O plist aponta pro script **dentro do repo**: renomear/mover `apps/promeia` exige reinstalar. Para `make dev-promeia` (com `--reload`), desligue o serviço antes — os dois disputam a 8082: `launchctl bootout gui/$(id -u)/com.piluvitu.promeia`.

## Pendências do dono, sem rodeio

- **Gerar `PROMEIA_TOKEN`** (`openssl rand -base64 32`) e colocá-lo no
  ambiente onde o serviço roda.
- ~~**O hostname `promeia.piluvitu.com.br` ainda é da API Go**, e o promeia não
  recebe requisição nenhuma pela internet~~ — **VENCIDA em 2026-08-14**
  (`ROADMAP.md` §2): o promeia **assumiu** o hostname e serve tráfego real.
  Cadeia provada ponta a ponta: `piluvitu.com.br → ramielle.piluvitu.com.br →
promeia.piluvitu.com.br → Ollama local`. Desde a IA fase 1 (PR3) a revisão
  de texto não passa mais por aqui; a transcrição passa.
- ~~**Baixar o `qwen2.5:14b-instruct` pra bater com o Go**~~ — **OBSOLETA**:
  o slot de hooks saiu do promeia junto com a revisão (IA fase 1, PR3).
- **`process-compose.yaml` (na raiz, não neste app) ainda puxa
  `qwen2.5:14b-instruct`**, que continua não instalado — `make stack` baixaria
  ~9 GB na primeira execução. Isto **sobrevive** à pendência acima: é um
  arquivo da stack local da API Go, e limpá-lo faz parte de aposentar a Go, não
  desta task. Instalados hoje: `qwen3.5:4b`, `qwen3.5:9b`, `gemma4:12b`,
  `qwen2.5:3b-instruct` e `qwen2.5:7b-instruct`.
