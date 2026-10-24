# CLAUDE.md — apps/promeia

Serviço Python (FastAPI) que roda no MacBook do dono, atrás de um túnel — o
processamento que precisa de GPU, modelo local ou acesso a arquivo em disco.
Hoje: a transcrição de áudio e a revisão de artigo (`proofread`/`refine`/
`hooks`), esta última só até o PR3 da IA fase 1, quando vai para a Claude no
`apps/ramielle`. Depois: PDF.

O insight financeiro **saiu daqui em 2026-10** (PR2 da IA fase 1): é escrito
pela Claude dentro do Worker do finanças, pelo botão da tela e por um Cron no
dia 1 (ver "Insight de IA" em `apps/financas/CLAUDE.md`). Saíram junto
`insight.py`, `ramielle.py`, `cli.py` (e o console script `promeia-insight`),
`money.py`, `dates.py` (só o insight os usava, conferido por grep), a rota
`POST /insight`, o alvo `make insight` e as settings `ingest_token`,
`ramielle_url` e `ollama_model` (`INGEST_TOKEN`, `RAMIELLE_URL` e
`OLLAMA_MODEL` no ambiente são ignorados). `ollama.generate` ficou sem
chamador (a revisão usa `ollama.chat`) e sai com o resto do `ollama.py` no
PR3.

## Revisão de artigo — `POST /llm/proofread`, `POST /llm/refine` e `POST /llm/hooks`

Porte da **inferência** de `apps/api/internal/llm/` (§7.2 do spec: _"os prompts
e a inferência vão para promeia; o estado e a publicação ficam em ramielle"_).
`gerar_hooks`/`POST /llm/hooks` (porte de `GenerateHooks`, `client.go:152`)
gera uma chamada social por plataforma — **sem consumidor no ramielle ainda**
(M6 de uma revisão desta fatia: preparação deliberada, não código morto por
descuido).

⚠️ **Quem chama é o ramielle, não o navegador** (§3). Por isso a forma de erro
destas rotas é a do promeia (`{ok, code, message}`, a mesma de `/transcrever`) e
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
  dono — quebrá-la produz markdown que ainda _parece_ certo. Provado por
  mutação: trocar o split por `splitlines()` (que descarta os separadores)
  derruba 16 testes.
- **`careful`** é porte, não feature: o nível de revisão já existia no Go
  (`Proofread(ctx, text, careful bool)`). `false` ⇒ modelo menor, `true` ⇒
  maior. Configurável por `MODEL_PROOFREAD` / `MODEL_PROOFREAD_CAREFUL` /
  `MODEL_HOOKS`.
  ⚠️ **A PARIDADE DE MODELO COM A GO ACABOU — e a "divergência do
  `MODEL_HOOKS`" deixou de existir junto.** A versão anterior desta seção
  dizia que `MODEL_PROOFREAD`/`MODEL_PROOFREAD_CAREFUL` tinham default IGUAL
  ao da Go em produção e que `MODEL_HOOKS` era a única divergência (porque o
  Go usava `qwen2.5:14b-instruct`, nunca instalado aqui). **As duas frases
  morreram nesta task**, e a razão não é preguiça: a **Go foi aposentada**
  (`docs/superpowers/ROADMAP.md` §2), então não há mais um comportamento de
  produção do outro lado pra empatar — "igual ao Go" virou âncora num serviço
  morto, e o `14b` deixou de ser uma dívida a pagar porque não há mais de quem
  divergir. Os **três slots agora são escolha própria, MEDIDA** (ver a tabela
  em _Modelos de 2026_ abaixo): `qwen2.5:7b-instruct` no rápido, `gemma4:12b`
  no careful e no hooks. ⚠️ **Não confundir com os defaults de sempre:** o
  rápido era `qwen2.5:3b-instruct` e virou o `7b`; o `7b` era o careful e saiu
  de lá. O `qwen3.5` que o `6808f60` pôs nos três **foi revertido** — ele
  rebaixa o nível dos títulos, ver o erro de método em _Modelos de 2026_.
  Comentário completo em `config.py#Settings`.
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
  caracteres). Por isso o arquivo tem `E501` no per-file-ignore: quebrar linha pra caber em 88 colunas insere uma quebra
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

## Transcrição de áudio — `POST /transcrever`

Recebe N áudios por **multipart**, devolve o texto de cada um e um costurado. Chamada pelo ramielle (`POST /admin/transcrever`, ver `apps/ramielle/CLAUDE.md`), nunca pelo navegador — mesma regra de `revisao_rotas.py`. A tela é `/admin/transcricao` no `apps/web`.

⚠️ **`mlx-whisper` NÃO está em `pyproject.toml`, de propósito.** Ele depende do `mlx`, que só existe em macOS/arm64; declará-lo quebraria o `uv sync --locked` do CI, que roda em Ubuntu — o serviço inteiro deixaria de instalar num runner Linux por causa de UMA rota. Por isso `transcricao.py` chama o **binário** por subprocess: a dependência vira requisito de _ambiente_ (a máquina do dono, a única onde a rota faz sentido) e não de pacote. Instalar: `uv tool install mlx-whisper`. `WHISPER_BIN` sobrescreve o caminho.

⚠️ **O executor é injetado (`executar=`) e buscado no MÓDULO pela rota** (`transcricao.executar_mlx_whisper`, não importado direto). É o que deixa o teste trocar o executor sem tocar no binário — e é por isso que a suíte roda no CI Linux sem `mlx`. O caminho real do subprocess **não** é coberto por teste automatizado; foi verificado à mão com áudio de verdade (dois trechos, termos `ramielle, promeia`, ambos grafados corretamente).

**O encadeamento de contexto é o produto do módulo.** Áudios que se complementam precisam grafar o mesmo nome próprio igual nos três: a cauda de cada transcrição vira o `initial_prompt` do seguinte. O `initial_prompt` do Whisper cabe em **224 tokens**, então só entram as últimas `PALAVRAS_DE_CONTEXTO` (120) — passar mais faz a janela cortar em silêncio.

⚠️ **O teto real NÃO é tamanho de arquivo, é TEMPO.** A Cloudflare corta a requisição do navegador em ~100 s (524) e o ramielle desiste em 120 s (`TIMEOUT_MS`). MEDIDO num M4: `large-v3` roda a **4,4x** tempo real e o `turbo` a **13,1x** — ou seja ~7 min e ~20 min de áudio dentro do orçamento, respectivamente. Daí o campo `modo` (`preciso` default, `rapido`). `MAX_AUDIOS`/`MAX_BYTES_TOTAL` são um proxy grosseiro disso: medir duração exigiria ffprobe, uma segunda dependência de ambiente, e o proxy já barra o caso absurdo.

| erro                   | status | quando                                    |
| ---------------------- | ------ | ----------------------------------------- |
| `invalid_body`         | 400    | nenhum áudio enviado                      |
| `too_many_files`       | 400    | acima de `MAX_AUDIOS`                     |
| `audio_too_large`      | 413    | soma acima de `MAX_BYTES_TOTAL`           |
| `whisper_indisponivel` | 503    | binário ausente — instale no Mac          |
| `transcricao_vazia`    | 503    | rodou, saiu vazio (espelha `OllamaVazio`) |
| `transcricao_falhou`   | 503    | rodou e falhou                            |

⚠️ **Nenhum erro desta rota sai como 502** — o túnel troca o corpo de um 502 por `error code: 502`, o ramielle não acha `code` e o admin lia "Suba o promeia no Mac" com o Mac de pé (aconteceu em produção, 2026-09-30; ver _O túnel COME o corpo do 502_). A distinção entre "falta instalar" e "rodou e falhou" mora no `code`, não no status. Travado em `transcricao_rotas_test.py` (`TestFalhas`).

⚠️ **`--output-name` fixo (`NOME_SAIDA`) é obrigatório.** O `mlx_whisper` grava a saída com `Path(nome).with_suffix(".txt")`, que troca só o **último** trecho depois do ponto: `WhatsApp_Ptt_2026-09-30_at_22.15.03` vira `…_22.15.txt`. Procurar `{stem}.txt` falhava em **todo** áudio do WhatsApp (a hora vem com pontos no nome). E o `mlx_whisper` **sai 0 mesmo quando pula o áudio por erro** — por isso a falha volta com a última linha de `Error` que ele imprimiu (`_linha_de_erro`), sem o banner do ffmpeg.

⚠️ **O nome do arquivo vem do cliente e é sanitizado** (`_nome_seguro`): só o basename, só `[A-Za-z0-9._-]`. Sem isso um `../../etc/x.ogg` escaparia do diretório temporário.

## Modelos de 2026: `"think": false` é obrigatório, não otimização

⚠️ **A geração 2026 é thinking-by-default, e no `/api/chat` isso não deixa a
revisão lenta — deixa ela VAZIA.** MEDIDO contra o Ollama local, sem o campo
`think` no payload:

| Modelo       | Tokens gastos | `message.thinking` | `message.content` |
| ------------ | ------------- | ------------------ | ----------------- |
| `qwen3.5:4b` | 3.614         | —                  | **VAZIO**         |
| `gemma4:12b` | 3.621         | 12.435 chars       | **VAZIO**         |

Não é peculiaridade de uma família: os dois anunciam `"thinking"` em
`capabilities` (`GET /api/tags`) e o ligam sozinhos. Por isso `ollama.chat`
manda `"think": false` — sem ele, `MODEL_PROOFREAD_CAREFUL` e `MODEL_HOOKS`
(hoje `gemma4:12b` nos dois) gastariam GPU pra devolver nada. O
`MODEL_PROOFREAD` (`qwen2.5:7b-instruct`) não tem thinking e **ignora** o
campo — os dois tipos convivem sem fallback, como diz o parágrafo seguinte.

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

Ou seja: o insight (que usava `generate` e saiu em 2026-10) **não** tinha o bug de resposta vazia —
tem uma a duas ordens de grandeza a mais de tokens e de parede contra o
`read=180.0` de `ollama.TIMEOUT`, num prompt de UMA frase (o prompt real é bem
maior). `generate` também manda `"think": false` desde esta task: uma linha,
medida como inofensiva no modelo que o insight de fato usa, e coerente com o
`temperature: 0` que aquele caminho fixa justamente por exigir determinismo.

### ⚠️ O erro de método que escolheu os modelos errados (commit `6808f60`)

**O `6808f60` mediu a coisa errada, e o registro disso é a parte útil desta
seção.** Ele elegeu `qwen3.5:4b` (rápido) e `qwen3.5:9b` (careful/hooks) com
base num corpus com gabarito — 9 erros plantados, 18 armadilhas — que mandava
**o artigo INTEIRO numa chamada só**. Nesse formato o `qwen3.5:9b` tirou 9/9 e
pareceu o melhor candidato.

⚠️ **Só que o `proofread` de produção não manda o texto inteiro.** Ele divide
(`dividir_blocos`) e manda **um bloco de prosa por chamada** — então um título
chega ao modelo **SOZINHO**, como `'## Subtitulo\n'`, sem nenhum parágrafo
antes ou depois que indique que `##` é estrutura e não texto. É exatamente
nesse caso que a família qwen3.5 "normaliza" o nível do título, e é exatamente
esse caso que um corpus de texto inteiro **nunca produz**. Um corpus que manda
o texto inteiro numa chamada NÃO mede o que a produção faz — foi por isso que
deu 9/9 pro `qwen3.5:9b`, que na verdade destrói o nível de mais da metade dos
títulos.

**Preservação do NÍVEL do título** — 9 repetições por modelo, blocos
`## Subtitulo` / `### Secao` / `#### Detalhe` mandados isolados, temperatura
0.1, pelo caminho real do `chat()`:

| Modelo                              | Preservou o nível | Amostra do erro                  | s/bloco |
| ----------------------------------- | ----------------- | -------------------------------- | ------- |
| `gemma4:12b` ← careful, hooks       | **9/9**           | —                                | 11,8    |
| `qwen2.5:7b-instruct` ← rápido      | **9/9**           | —                                | **3,7** |
| `qwen2.5:3b-instruct` (rápido ANT.) | 6/9               | `'##\nSubtitulo'` (quebra!)      | 2,1     |
| `qwen3.5:9b` (6808f60)              | 4/9               | `'# Subtítulo'`, `'### Detalhe'` | —       |
| `qwen3.5:4b` (6808f60)              | 1/9               | `'# Subtítulo'`                  | 1,4     |

⚠️ **`'##\nSubtitulo'` NÃO é um título** — com a quebra de linha no meio, o
markdown renderiza `##` como texto literal. O `qwen2.5:3b-instruct`, que era o
rápido desde sempre, já tinha esse defeito.

⚠️ **O `qwen3.5:9b` ainda vazou ESPANHOL** uma vez: `'#### Detalhe'` virou
`'#### Detalle'`.

**A correção ainda MELHORA os dois slots** em relação ao estado anterior ao
`6808f60` — não é um recuo: o rápido sobe de **6/9 pra 9/9** em título e de
**5/9 pra 8/9** no corpus de erros; o careful sobe de **8/9 pra 9/9** no
corpus, mantendo 9/9 em título. O careful paga no relógio (`gemma4:12b` no
artigo REAL do blog, 5.778 chars, 27 blocos, caminho real do `proofread`:
**381 s** contra 232 s do 9b, pior bloco **35,9 s**) — e é o slot cuja razão
de existir é justamente trocar tempo por precisão; 35,9 s deixa **80% de
folga** contra o `read=180.0` de `ollama.TIMEOUT`.

⚠️ **PRA QUEM FOR REMEDIR NO FUTURO: meça pelo CAMINHO REAL** — `dividir_blocos`
e um `chat` por bloco, com títulos entre os blocos —, **nunca o texto inteiro
numa chamada**. Foi essa diferença, e só ela, que separou a escolha errada da
certa. A premissa está pinada por
`test_proofread_manda_o_TITULO_SOZINHO_sem_contexto_ao_redor`
(`revisao_test.py`): se alguém agrupar blocos, o teste cai e avisa que a tabela
acima precisa ser refeita antes de mudar qualquer default.

⚠️ **O que o `6808f60` acertou continua valendo:** o `"think": false` e a
guarda `OllamaVazio` (as duas seções acima e abaixo) não dependem da escolha de
modelo, e o `gemma4:12b` que entrou agora **É** thinking model — sem o campo
ele devolve `content` vazio (3.621 tokens, 12.435 chars em `thinking`). Só os
DEFAULTS estavam errados.

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
  monorepo (teste ao lado do fonte, nomeado a partir dele: `ollama.py` →
  `ollama_test.py`, nunca `test_ollama.py` num diretório `tests/`). Este fato É
  específico do promeia (o default do pytest, não uma regra de dependência),
  por isso mora aqui e não na raiz.
- **`ruff`** para lint (`select = ["E", "F", "I", "UP", "B", "SIM"]`) e format.
  Per-file-ignores: **`prompts.py`** tem `E501` desligado porque monta
  PROMPT, que é contrato byte a byte com o que o
  dono já calibrou contra o modelo real. Quebrar linha ali pra caber em 88
  colunas insere uma quebra **real** no texto mandado pro modelo: não é
  formatação, é mudar a entrada de dados.
- **Suíte hoje: 151 testes** depois da saída do insight (2026-10). Recontar
  sempre via `uv run pytest` (linha final `N passed`), nunca confiar num
  número solto neste arquivo: ele já andou mais de uma vez sem o arquivo
  acompanhar.

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

## Erros são o produto

Nunca uma stack trace, nunca um erro cru de biblioteca — as mensagens abaixo
foram **medidas contra o Ollama real**, não só stubadas em teste:

- **Ollama desligado** (porta fechada/serviço parado): _"não consegui
  conectar ao Ollama em `<url>` — ele parece estar desligado. Inicie com
  `ollama serve` (ou abra o app Ollama) e tente de novo"_.
- **Modelo não instalado**: _"modelo `'<nome>'` não está instalado no Ollama
  local. Instale com: `ollama pull <nome>`"_ — cita o comando exato, nunca só
  "modelo não encontrado".
  ⚠️ **A distinção "não alcancei" vs. "alcancei e recusou" é deliberada e
  estrutural**, não estilo de mensagem: `OllamaUnreachable` (problema de
  transporte — suba o serviço, confira a URL) nunca se confunde com
  `OllamaModelMissing`/`OllamaFailed` (o serviço respondeu, e recusou ou falhou
  — o gargalo é outro). Cada categoria tem sua própria classe de exceção
  (`src/promeia/ollama.py`) e sua própria mensagem; colapsar as duas manda o
  dono conferir a rede quando o problema é outro, ou vice-versa.

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
(`POST /llm/proofread` com `OLLAMA_URL` numa porta fechada: 215 bytes idênticos
local e pelo túnel, 3/3).

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

⚠️ **`revisao_rotas.py` NÃO foi alinhado a isto, e é contrato, não
esquecimento.** `/llm/*` é consumido hoje pelo `apps/ramielle`, cujo
`src/routes/atelier.test.ts` tem um teste explícito — _"502 ollama_failed do
promeia é repassado como 502, intocado"_ — fixando aquele status. Mudá-lo é
decisão dos dois lados, com o teste de lá junto. Vale registrar que o mesmo defeito existe lá: um `ollama_failed`
(502) pelo túnel chega ao admin como "Suba o promeia no Mac", com o Mac de pé.

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
promeia.piluvitu.com.br → Ollama local`. Consequência que vale pra esta
  seção: os defaults de modelo daqui não são mais teoria de laboratório — o
  botão "Corrigir texto" bate neles em produção assim que o Mac está ligado.
- ~~**Baixar o `qwen2.5:14b-instruct` pra bater com o Go**~~ — **OBSOLETA,
  resolvida por não ser mais um problema.** Ela existia só porque
  `MODEL_HOOKS` divergia do Go; a Go foi aposentada e o slot de hooks agora é
  escolha própria (`gemma4:12b`, medido 9/9 em preservação de título). Não há
  mais motivo pra baixar ~9 GB de um modelo de 2024 pra empatar com um serviço
  que saiu do ar.
- **`process-compose.yaml` (na raiz, não neste app) ainda puxa
  `qwen2.5:14b-instruct`**, que continua não instalado — `make stack` baixaria
  ~9 GB na primeira execução. Isto **sobrevive** à pendência acima: é um
  arquivo da stack local da API Go, e limpá-lo faz parte de aposentar a Go, não
  desta task. Instalados hoje: `qwen3.5:4b`, `qwen3.5:9b`, `gemma4:12b`,
  `qwen2.5:3b-instruct` e `qwen2.5:7b-instruct`.
