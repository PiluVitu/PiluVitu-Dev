# CLAUDE.md — apps/promeia

Serviço Python (FastAPI) que roda no MacBook do dono, atrás de um túnel — o
processamento que precisa de GPU, modelo local ou acesso a arquivo em disco.
Hoje faz uma coisa só: a transcrição de áudio (`POST /transcrever`, Whisper
local via `mlx-whisper`), chamada pelo ramielle (`/admin/transcrever`). Além
dela só existe `GET /health`. Depois: PDF (§9.3 do spec da fatia).

## O que saiu daqui (IA fase 1, 2026-10)

- **Insight financeiro** (PR2): escrito pela Claude no Worker do finanças,
  pelo botão da tela e por um Cron no dia 1 (ver "Insight de IA" em
  `apps/financas/CLAUDE.md`). Saíram `insight.py`, `ramielle.py`, `cli.py` (e
  o console script `promeia-insight`), `money.py`, `dates.py`, a rota
  `POST /insight`, o alvo `make insight` e as settings `ingest_token`,
  `ramielle_url` e `ollama_model`.
- **Revisão de artigo** (PR3): `proofread`, `refine` e `hooks` foram para a
  Claude no ramielle (`apps/ramielle/src/domain/revisao/`, ver o `CLAUDE.md`
  de lá). Saíram `revisao.py`, `revisao_rotas.py`, `prompts.py`,
  `markdown_blocos.py`, os testes deles, o router em `app.py` e as settings
  `model_proofread`, `model_proofread_careful` e `model_hooks`. `app_test.py`
  confere que `/llm/*` responde 404.
- **Ollama**: sem consumidor, saíram `ollama.py`, `ollama_test.py` e a setting
  `ollama_url`. `INGEST_TOKEN`, `RAMIELLE_URL`, `OLLAMA_URL`, `OLLAMA_MODEL` e
  `MODEL_*` no ambiente são ignorados (`config_test.py`). As medições de
  modelo (thinking, escolha por slot) ficam no histórico do git.

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
  verde cobrindo só `/health`, e as rotas montadas via
  `app.include_router(...)` nunca são exercitadas — a prova de "toda
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
  monorepo (teste ao lado do fonte, nomeado a partir dele: `transcricao.py` →
  `transcricao_test.py`, nunca `test_transcricao.py` num diretório `tests/`). Este fato É
  específico do promeia (o default do pytest, não uma regra de dependência),
  por isso mora aqui e não na raiz.
- **`ruff`** para lint (`select = ["E", "F", "I", "UP", "B", "SIM"]`) e format.
  A tabela `per-file-ignores` está vazia: o `E501` desligado era dos arquivos
  de prompt, que saíram com o insight e a revisão.
- **Suíte hoje: 47 testes** (transcrição, auth e config), depois da saída do
  insight, da revisão e do Ollama. Recontar sempre via `uv run pytest` (linha
  final `N passed`), nunca confiar num número solto neste arquivo: ele já
  andou mais de uma vez sem o arquivo acompanhar.

## Comandos

| Comando                        | Propósito                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `make dev-promeia`             | `uvicorn` com `--reload` na porta **8082**                                               |
| `make test-promeia`            | `cd apps/promeia && uv run pytest`                                                       |
| `make lint-promeia`            | `uv run ruff check .` + `uv run ruff format --check .`                                   |
| `make promeia-servico`         | instala o LaunchAgent: promeia sobe no login e reinicia se cair (ver _Serviço no login_) |
| `make promeia-servico-remover` | desinstala o LaunchAgent                                                                 |

De dentro de `apps/promeia`, sem o `make`: `uv run pytest` / `uv run ruff
check .` / `uv run ruff format --check .`.

⚠️ **`.env.example` é decorativo — `uv run` NÃO lê `.env` sozinho** (só com
`--env-file <arquivo>`/`UV_ENV_FILE`, MEDIDO no uv 0.11.32 instalado aqui).
`make dev-promeia` e o LaunchAgent (`scripts/servir.sh`) fazem source
condicional (`set -a && [ -f .env ] && . ./.env; set +a`), que só carrega se
o arquivo existir e nunca quebra quem exporta as vars na mão.

`make test`/`make lint` (raiz) **incluem o promeia** desde esta task — os dois
alvos encadeiam `cd apps/promeia && uv run pytest` / `uv run ruff check . &&
uv run ruff format --check .` depois de rodar `pnpm -r`/`go`.

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
intactos**, inclusive pelo caminho real de uma rota já removida (um 503 de 215
bytes, idêntico local e pelo túnel, 3/3).

**Consequência, e por que ela é grave:** o cliente do outro lado
(`apps/ramielle/src/lib/promeia.ts#chamarPromeia`) trata "erro HTTP sem
`code`/`message` no corpo" como **não alcancei o Mac** — de propósito, porque
é a Cloudflare (não o promeia) quem responde sem esse shape quando o Mac está
desligado. Então **todo 502 daqui chega ao dono como _"Suba o promeia no
Mac"_, com o promeia de pé**: a pior mensagem possível, porque manda arrumar
o que está certo.

O antigo `insight.py` (que saiu em 2026-10) trocou todos os seus 502 por 503
por este motivo: a distinção que importa mora no campo `code`, que viaja
**dentro** do corpo e só sobrevive se o corpo sobreviver. Uma rota nova aqui
segue a mesma regra.

## Serviço no login (LaunchAgent)

`make promeia-servico` deixa o Mac servindo sozinho depois de reiniciar:

- **promeia** — `launchd/com.piluvitu.promeia.plist` → `scripts/servir.sh` (carrega `.env`, `uvicorn` sem `--reload`, `127.0.0.1:8082`). `RunAtLoad` + `KeepAlive`: sobe no login e volta se morrer. Log em `~/Library/Logs/promeia.log`.
- **túnel** — o alvo liga `orbctl config set app.start_at_login true`; o container `cloudflared` tem `restart: unless-stopped`, então volta junto com o OrbStack.

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
promeia.piluvitu.com.br`; hoje só a transcrição passa por ela.
- **`process-compose.yaml` (na raiz, não neste app) é da stack legada da API
  Go**, não uma dependência do promeia. Ainda puxa `qwen2.5:14b-instruct`, não
  instalado (`make stack` baixaria ~9 GB na primeira execução); limpá-lo faz
  parte de aposentar a Go.
