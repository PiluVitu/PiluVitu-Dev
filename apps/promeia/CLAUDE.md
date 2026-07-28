# CLAUDE.md — apps/promeia

Serviço Python (FastAPI) que roda no MacBook do dono, atrás de um túnel — o
processamento que precisa de GPU, modelo local ou acesso a arquivo em disco.
Hoje: o insight financeiro (lê números do ramielle, gera texto via Ollama
local, publica de volta). Depois: PDF e transcrição (§9.3 do spec da fatia).

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

## `PROMEIA_TOKEN` — toda rota, por middleware, sem exceção

`TokenMiddleware` (`src/promeia/auth.py`) é instalado via `app.add_middleware`
em `create_app` (`src/promeia/app.py`) — isso o coloca **em torno do app ASGI
inteiro**, antes de qualquer roteamento do FastAPI. O serviço **recusa subir**
sem `PROMEIA_TOKEN` (`load_settings` lança `ConfigError` — ver
`src/promeia/config.py`), e toda requisição sem o token correto (`Authorization:
Bearer <token>`) recebe 401 antes de qualquer rota ser alcançada.

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

- **`uv`** — gerenciador de pacotes/venv. `uv.lock` é **commitado**; CI e
  qualquer instalação reprodutível usam `uv sync --frozen` (nunca resolve
  versão nova sem editar o lock explicitamente).
- **pytest com `python_files = ["*_test.py"]`** (`pyproject.toml`) — o default
  do pytest é `test_*.py`, que **briga com a lei de colocation** deste
  monorepo (teste ao lado do fonte, nomeado a partir dele: `money.py` →
  `money_test.py`, nunca `test_money.py` num diretório `tests/`).
- **`ruff`** para lint (`select = ["E", "F", "I", "UP", "B", "SIM"]`) e format.
  Único per-file-ignore: `src/promeia/insight.py` tem `E501` desligado porque
  o prompt que ele monta é contrato byte-a-byte com o que o dono já revisou —
  quebrar linha ali inseriria uma quebra real no texto mandado pro modelo.

## Comandos

| Comando             | Propósito                                                  |
| ------------------- | ---------------------------------------------------------- |
| `make dev-promeia`  | `uvicorn` com `--reload` na porta **8082**                 |
| `make test-promeia` | `cd apps/promeia && uv run pytest`                         |
| `make lint-promeia` | `uv run ruff check .` + `uv run ruff format --check .`     |
| `make insight`      | `uv run promeia-insight` — gera e publica o insight do mês |

De dentro de `apps/promeia`, sem o `make`: `uv run pytest` / `uv run ruff
check .` / `uv run ruff format --check .` / `uv run promeia-insight`.

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

## Pendências do dono, sem rodeio

- **Gerar `PROMEIA_TOKEN`** (`openssl rand -base64 32`) e colocá-lo no
  ambiente onde o serviço roda.
- **O hostname `promeia.piluvitu.com.br` ainda é da API Go.**
  `NEXT_PUBLIC_API_URL` (Vercel) e o redirect URI (Google Console) continuam
  apontando pra ela. O promeia só assume esse hostname quando a Go sair do ar
  — o que depende do ramielle (§9.4 do plano geral) estar pronto. Até lá o
  promeia **não recebe requisição nenhuma pela internet** — só empurra, pela
  rede local/túnel, para o ramielle.
- **`process-compose.yaml` puxa `qwen2.5:14b-instruct`, que não está
  instalado nesta máquina** (hoje: `qwen2.5:3b-instruct` e
  `qwen2.5:7b-instruct`). `make stack` baixaria ~9 GB na primeira execução —
  decidir se corrige o arquivo ou aceita o download fica com o dono.
