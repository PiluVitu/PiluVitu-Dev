# CLAUDE.md — apps/promeia

Serviço Python (FastAPI) que roda no MacBook do dono, atrás de um túnel — o
processamento que precisa de GPU, modelo local ou acesso a arquivo em disco.
Hoje: o insight financeiro (lê números do ramielle, gera texto via Ollama
local, publica de volta) **e a revisão de artigo** (`proofread`/`refine`).
Depois: PDF e transcrição (§9.3 do spec da fatia).

## Revisão de artigo — `POST /llm/proofread`, `POST /llm/refine` e `POST /llm/hooks`

Porte da **inferência** de `apps/api/internal/llm/` (§7.2 do spec: _"os prompts
e a inferência vão para promeia; o estado e a publicação ficam em ramielle"_).
`gerar_hooks`/`POST /llm/hooks` (porte de `GenerateHooks`, `client.go:152`)
gera uma chamada social por plataforma — **sem consumidor no ramielle ainda**
(M6 de uma revisão desta fatia: preparação deliberada, não código morto por
descuido).

⚠️ **Quem chama é o ramielle, não o navegador** (§3). Por isso a forma de erro
destas rotas é a do promeia (`{ok, code, message}`, a mesma de `/insight`) e
**não** o envelope `{ok, data, notifications}` que o `apps/web` consome —
traduzir é trabalho do ramielle, na fatia seguinte. Fazer aqui inverteria a
camada e obrigaria o promeia a conhecer o formato do frontend.

⚠️ **As mensagens daqui são melhores que as do Go, de propósito, e quem
traduzir não pode achatá-las.** O Go dizia `"Falha ao corrigir o texto."` pra
qualquer falha. Aqui a distinção estrutural do serviço (ver _Erros são o
produto_) sobrevive: `ollama_unreachable` (503, "abra o Ollama") ≠
`ollama_model_missing` (503, com o `ollama pull` exato) ≠ `ollama_failed`
(502, o Ollama respondeu e falhou). Só `invalid_json` mantém a mensagem
literal do Go (`"Corpo inválido: 'text' é obrigatório."`), porque é a única
que o admin já mostra em `toast.error` sem intermediação de diagnóstico.

- **`proofread`** manda ao modelo **só os blocos de prosa** — código, tabela,
  HTML/JSX, citação e imagem passam verbatim (`markdown_blocos.py`). Não é
  otimização: é o que impede o LLM de "corrigir" um trecho de código.
  ⚠️ A **invariante** do splitter (concatenar os blocos reproduz a entrada
  byte a byte) é o que permite remontar o artigo sem corromper o texto do
  dono — quebrá-la produz markdown que ainda *parece* certo. Provado por
  mutação: trocar o split por `splitlines()` (que descarta os separadores)
  derruba 16 testes.
- **`careful`** é porte, não feature: o nível de revisão já existia no Go
  (`Proofread(ctx, text, careful bool)`). `false` ⇒ modelo menor, `true` ⇒
  maior. Configurável por `MODEL_PROOFREAD` / `MODEL_PROOFREAD_CAREFUL` /
  `MODEL_HOOKS`. ⚠️ **I4 (revisão): só `MODEL_PROOFREAD`/
  `MODEL_PROOFREAD_CAREFUL` têm default IGUAL ao da Go em produção**
  (`qwen2.5:3b-instruct`/`qwen2.5:7b-instruct`, do log de boot da API Go —
  que nunca menciona hooks). `MODEL_HOOKS` é **divergência CONSCIENTE, não
  paridade**: o Go usa `qwen2.5:14b-instruct` (`main.go:83`,
  `.env.example`, `process-compose.yaml`), que **não está instalado** nesta
  máquina (~9 GB) — o default aqui fica em `qwen2.5:7b-instruct` até o dono
  baixar o 14b (ver "Pendências do dono"). Ver o comentário completo em
  `config.py#Settings.model_hooks`.
- ⚠️ **`refine`/`gerar_hooks` TRIMAM a saída do modelo antes de medir o
  limite** (`I3` de uma revisão desta fatia) — paridade com o Go, cujo
  `chat()` (`client.go:96`) sempre devolve `strings.TrimSpace(...)` pra todo
  chamador. O `chat` injetado aqui (`ollama.py`) devolve texto CRU de
  propósito ("o trim é de quem chama"); sem o `.strip()` em `refine`/
  `gerar_hooks`, espaço em branco nas bordas contava pro limite de
  caracteres — `proofread` já fazia isso certo (`.strip()` antes de
  `restaurar_bordas`), os outros dois não.
- **Três temperaturas diferentes**, medidas no Go: `0.1` no proofread
  (correção conservadora), `0.7` no refine (reescrita precisa variar), `0.3`
  no encurtamento. Uniformizar muda o comportamento das três.
- ⚠️ **Fail-soft no encurtador**, replicando o Go: se o LLM falhar ao encurtar
  uma chamada que estourou o limite, o texto é **truncado** e devolvido, não
  vira erro. Um refine que morre inteiro porque a melhoria opcional falhou
  seria pior que uma chamada um pouco longa.
- **Os prompts** (`prompts.py`) são **contrato byte a byte** com o Go —
  igualdade verificada programaticamente contra `prompts.go` (672/289/168
  caracteres). Por isso o arquivo tem `E501` no per-file-ignore, como
  `insight.py`: quebrar linha pra caber em 88 colunas insere uma quebra
  **real** no texto mandado ao modelo.
- ⚠️ **Uma divergência consciente do Go, registrada:** `truncateRunes`
  (`client.go:205`) compara um índice de **byte** com `limit/2`, que é
  contagem de **runas** — em português acentuado o índice de byte é inflado.
  `truncar` (`revisao.py`) usa índice de **caractere**, que é o que a condição
  quer dizer. ⚠️ **M1 (revisão): a frase antiga aqui tinha a conclusão
  INVERTIDA.** Medido de verdade (`truncateRunes` do Go rodado contra este
  `truncar` em 3.042 casos): 11 divergências, e em 100% delas é o **Go** que
  recua até a palavra inteira (resultado mais curto, texto nunca quebrado) e
  este **porte** que mantém o corte no meio da palavra — o oposto do que a
  versão anterior desta linha afirmava. A conclusão prática segue de pé:
  **0 divergências em 3.000 amostras de português realista** — o efeito só
  aparece em casos adversariais (muito caractere multi-byte concentrado perto
  da metade do limite), não em texto normal.

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
  Per-file-ignores: **`insight.py` e `prompts.py`** têm `E501` desligado, pelo
  mesmo motivo — os dois montam PROMPT, que é contrato byte a byte com o que o
  dono já calibrou contra o modelo real. Quebrar linha ali pra caber em 88
  colunas insere uma quebra **real** no texto mandado pro modelo: não é
  formatação, é mudar a entrada de dados.
- **Suíte hoje: 184 testes** (`uv run pytest`, por arquivo:
  `app_test.py` 9, `cli_test.py` 12, `config_test.py` 6, `dates_test.py` 16,
  `insight_test.py` 20, `markdown_blocos_test.py` 29, `money_test.py` 15,
  `ollama_test.py` 18, `ramielle_test.py` 8, `revisao_rotas_test.py` 20,
  `revisao_test.py` 31). ⚠️ **M7 (revisão): este número já tinha ficado pra
  trás uma vez** — dizia "171 testes" enquanto a suíte real já estava em 180
  (o `/llm/hooks`/`gerar_hooks` tinha entrado numa task anterior sem
  atualizar esta contagem). Os **+4** desta revisão são de I3 (`revisao_
  test.py`): `refine`/`gerar_hooks` trimando a saída do modelo como o Go —
  ver a seção _Revisão de artigo_ acima. **Recontar sempre via `uv run
  pytest -v` (linha final `N passed`), nunca confiar num número solto neste
  arquivo** — mesmo aviso que `apps/ramielle/CLAUDE.md` já registra pra sua
  própria suíte, e pelo mesmo motivo: o número já andou mais de uma vez sem
  o arquivo acompanhar.
- A remoção do CLI Node que a fatia do insight substituiu
  (`apps/financas/scripts/insight.mjs`/`insight.test.mjs`) tirou 40 testes
  correspondentes de `apps/financas`: `pnpm --filter @piluvitu/financas run
  test:pdf-import` caiu de **117 para 77** (só `pdf-import.test.mjs` continua
  sob esse arquivo de config, `vitest.scripts.config.ts`) — prova de que a
  remoção foi cirúrgica, não um efeito colateral.

## Comandos

| Comando             | Propósito                                                  |
| ------------------- | ---------------------------------------------------------- |
| `make dev-promeia`  | `uvicorn` com `--reload` na porta **8082**                 |
| `make test-promeia` | `cd apps/promeia && uv run pytest`                         |
| `make lint-promeia` | `uv run ruff check .` + `uv run ruff format --check .`     |
| `make insight`      | `uv run promeia-insight` — gera e publica o insight do mês |

De dentro de `apps/promeia`, sem o `make`: `uv run pytest` / `uv run ruff
check .` / `uv run ruff format --check .` / `uv run promeia-insight`.

⚠️ **`.env.example` é decorativo — `uv run` NÃO lê `.env` sozinho** (só com
`--env-file <arquivo>`/`UV_ENV_FILE`, MEDIDO no uv 0.11.32 instalado aqui).
Quem fizer `cp .env.example .env` e rodar `uv run promeia-insight` direto
recebe só "PROMEIA_TOKEN não está definido", sem pista de que o `.env`
existe e não foi lido. `make insight` já resolve isso — mesmo padrão do
`dev-api` da raiz, source condicional (`set -a && [ -f .env ] && . ./.env;
set +a`), só carrega se o arquivo existir, nunca quebra quem prefere
exportar as vars na mão. Rodando `uv run promeia-insight` direto (sem
`make`), a saída é sua: `set -a; source .env; set +a` antes, ou
`uv run --env-file .env promeia-insight`.

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
