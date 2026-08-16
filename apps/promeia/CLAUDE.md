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

Ou seja: o insight (que usa `generate`) **não** tem o bug de resposta vazia —
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

⚠️ **`OLLAMA_MODEL` (o insight) NÃO mudou, e isso é decisão, não esquecimento.**
A tarefa dele é redigir um parágrafo sobre números **já calculados** pelo
Worker; o gargalo medido é o **prompt** e a quantidade de dado, não o modelo.
Evidência: o insight de 2026-08 saiu afirmando _"mantendo-se igual ao mesmo
período do ano anterior"_ sobre um banco que **não tem ano anterior** — modelo
maior nenhum conserta um prompt que deixa essa frase ser possível. Pinado por
`test_o_modelo_do_insight_NAO_acompanha_os_da_revisao` (`config_test.py`), pra
ninguém "uniformizar" os quatro slots numa próxima passada.

## Resposta vazia do modelo é FALHA, nunca sucesso silencioso

`ollama.chat` levanta **`OllamaVazio`** quando `message.content` volta vazio.
Antes, a guarda era só `isinstance(texto, str)` — e **`""` É `str`**, então
passava reto: o `proofread` devolvia o bloco vazio pro `restaurar_bordas`, que
remontava um markdown que ainda **parecia válido**, e o artigo saía com um
parágrafo comido sem nada ter falhado em lugar nenhum. O teste que existia
(`test_chat_sem_message_content_vira_failed`) cobria o campo **ausente**, nunca
o vazio.

- **`OllamaVazio` herda de `OllamaFailed`** (que herda de `OllamaError`), e não
  é uma exceção solta nem o `InsightVazio` de `insight.py` reusado. Dois
  motivos: `revisao_rotas.py` tem **um** `except ollama.OllamaError` por rota —
  algo fora dessa árvore viraria **500 com stack trace**, o que _Erros são o
  produto_ proíbe; e `insight.py` já importa `ollama`, então importar de volta
  seria ciclo. Duas classes irmãs, uma em cada camada. Herdar de `OllamaFailed`
  (não direto de `OllamaError`) mantém a régua honesta: o Ollama foi
  **alcançado** e respondeu ⇒ 502, nunca o 503 de "suba o Ollama".
- ⚠️ **Só-espaço-em-branco CONTA como vazio** — decisão, não descuido. Todo
  consumidor de produção já trima antes de usar (`proofread` antes do
  `restaurar_bordas`; `refine`/`gerar_hooks` antes de medir o limite), então
  pra todos eles `"\n \t "` e `""` são o mesmo nada.
- ⚠️ **E isso NÃO quebra o "sem trim" (achado I3):** o `.strip()` é do **teste**,
  nunca do valor — o `return` segue devolvendo o texto CRU. Pinado por
  `test_chat_NAO_trima_o_retorno_apesar_da_guarda_de_vazio`, que falha na hora
  se alguém "arrumar" o retorno pra `texto.strip()`.

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
- **Suíte hoje: 210 testes** (`uv run pytest`, linha final `N passed`). Os
  **+16** da task do `POST /insight` por HTTP: **+4** em `config_test.py` (o
  fail-open deliberado do `INGEST_TOKEN` no boot, `exigir_ingest_token`
  levantando/devolvendo, e a mensagem dizendo que NÃO é rede) e **+12** em
  `insight_test.py` (a guarda antes de qualquer I/O, os 9 ramos parametrizados
  de `test_NENHUM_erro_da_rota_sai_como_502`, o `ingest_token_missing` pela
  rota e o `publish_failed` preservando `data.texto`). Composição anterior,
  **194** (por arquivo): `app_test.py` 9, `cli_test.py` 12, `config_test.py`
  10, `dates_test.py` 16,
  `insight_test.py` 20, `markdown_blocos_test.py` 29, `money_test.py` 15,
  `ollama_test.py` 23, `ramielle_test.py` 8, `revisao_rotas_test.py` 20,
  `revisao_test.py` 32). Os **+2** da correção dos modelos são a trava de
  família (`test_nenhum_slot_da_revisao_usa_a_familia_qwen3_5`,
  `config_test.py`) e a premissa de medição
  (`test_proofread_manda_o_TITULO_SOZINHO_sem_contexto_ao_redor`,
  `revisao_test.py`). ⚠️ **M7 (revisão): este número já tinha ficado pra
  trás uma vez** — dizia "171 testes" enquanto a suíte real já estava em 180
  (o `/llm/hooks`/`gerar_hooks` tinha entrado numa task anterior sem
  atualizar esta contagem). Os **+8** da task dos modelos de 2026 são **+5**
  em `ollama_test.py` (o `"think": false` nos dois endpoints, e as três faces
  da guarda de resposta vazia: vazio, só-espaço, e o retorno seguir cru) e
  **+3** em `config_test.py` (os defaults medidos, o insight NÃO acompanhando
  a revisão, e cada `MODEL_*` lendo a env certa) — o `config_test.py` não
  tinha asserção NENHUMA sobre os três slots de modelo até então. **Recontar
  sempre via `uv run
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
serviço de subir. `/health` respondia, `/llm/proofread` funcionava, e só
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
(`POST /llm/proofread` com `OLLAMA_URL` numa porta fechada: 215 bytes idênticos
local e pelo túnel, 3/3).

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

⚠️ **`revisao_rotas.py` NÃO foi alinhado a isto, e é contrato, não
esquecimento.** `/llm/*` é consumido hoje pelo `apps/ramielle`, cujo
`src/routes/atelier.test.ts` tem um teste explícito — _"502 ollama_failed do
promeia é repassado como 502, intocado"_ — fixando aquele status. Mudá-lo é
decisão dos dois lados, com o teste de lá junto. (Verificado também que
`/insight` **não tem consumidor nenhum** no ramielle: `grep -rn insight
apps/ramielle/src` não devolve nada — por isso a mudança aqui não quebra
ninguém.) Vale registrar que o mesmo defeito existe lá: um `ollama_failed`
(502) pelo túnel chega ao admin como "Suba o promeia no Mac", com o Mac de pé.

## `INGEST_TOKEN`: exigido no PONTO DE USO, não no boot

`load_settings` levanta `ConfigError` sem `PROMEIA_TOKEN`, mas **deixa o
`INGEST_TOKEN` cair em string vazia de propósito** — e a assimetria é decisão
medida rota a rota, não a mesma lacuna com outro nome:

| Rota                  | usa `INGEST_TOKEN`?                        |
| --------------------- | ------------------------------------------ |
| `POST /insight`       | **SIM** — `fetch_numbers` + `post_insight` |
| `POST /llm/proofread` | não — só Ollama                            |
| `POST /llm/refine`    | não — só Ollama                            |
| `POST /llm/hooks`     | não — só Ollama                            |
| `GET /health`         | não                                        |

Três das quatro rotas POST não tocam o ramielle, e `/llm/proofread` está **em
produção** (é o botão "Corrigir texto" do admin, via ramielle). Exigir o token
no boot derrubaria o serviço inteiro por uma credencial que essas três não
usam — trocaria um modo de falha silencioso por uma feature que funciona
caindo. O `PROMEIA_TOKEN` é o caso oposto (protege TODA rota, por middleware):
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
