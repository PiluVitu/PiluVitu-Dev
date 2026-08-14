"""Cliente do Ollama local — DOIS endpoints, de propósito.

⚠️ `/api/generate` (prompt único) e `/api/chat` (system+user) são APIs
DIFERENTES do Ollama, e este módulo expõe as duas porque os dois consumidores
precisam de coisas diferentes:

- **`generate`** — o insight (`insight.py`). Prompt único, temperatura fixa
  em 0: é resumo de números já calculados, e variação entre execuções ali é
  DEFEITO, não estilo.
- **`chat`** — a revisão de artigo (`revisao.py`), porte de
  `apps/api/internal/llm/client.go:76`. Precisa separar a instrução (system)
  do texto a tratar (user), e usa temperatura VARIÁVEL (0.1 no proofread,
  0.7 no refine).

⚠️ **`"think": false` no payload do `chat` é OBRIGATÓRIO, e a geração 2026 é
thinking-by-default.** MEDIDO contra o Ollama local, sem o campo: `qwen3.5:4b`
queimou 3.614 tokens e devolveu `message.content` VAZIO; `gemma4:12b` queimou
3.621 tokens com 12.435 caracteres em `message.thinking` e `message.content`
também VAZIO. Não é peculiaridade de uma família — os dois modelos anunciam
`"thinking"` em `capabilities` e o ligam sozinhos. Sem o campo, a revisão não
"fica lenta": ela devolve NADA, gastando GPU. **`gemma4:12b` é hoje o default
de `MODEL_PROOFREAD_CAREFUL` e `MODEL_HOOKS`**, então isto não é hipótese: é o
que faz o botão "Corrigir texto (cuidadoso)" devolver alguma coisa. Ver
`OllamaVazio` abaixo, que é a rede de segurança pro dia em que este campo for
removido por engano.

⚠️ **Modelo SEM thinking IGNORA o campo, não recusa — MEDIDO**, e por isso
aqui não tem fallback (YAGNI): `qwen2.5:7b-instruct` (`capabilities:
["completion","tools"]`, sem `"thinking"`) recebeu `"think": false` em
`/api/chat` e respondeu **HTTP 200** com o `message.content` normal. Isso
também deixou de ser hipótese: **ele é o default de `MODEL_PROOFREAD`** (venceu
a medição de preservação de título, ver `config.py#Settings`), então o campo
convive com os dois tipos de modelo em produção. Um fallback "tenta com, repete
sem" só existiria pra um erro que não acontece — e custaria uma segunda rodada
de inferência pra descobrir isso.

⚠️ A versão anterior deste aviso dizia que `chat` só entraria "quando a
revisão de artigo migrar — depois do ramielle. Não antecipar." Ele cumpriu o
papel: o ramielle ficou pronto na fatia ④ e a revisão de artigo migrou nesta.
Mantido aqui em forma reescrita, e não apagado, porque a pergunta que ele
respondia ("por que este módulo não tem `chat`?") virou outra igualmente
válida: "por que tem os dois?".
"""

from __future__ import annotations

import re

import httpx

# O 404 do Ollama é AMBÍGUO: modelo ausente e path errado devolvem os dois 404.
# Só o corpo distingue — e a distinção não pode ser `"not found" in corpo`,
# porque o 404 genérico do próprio servidor é a string "404 page not found",
# que CONTÉM "not found". Exigir a palavra "model" antes separa os dois.
# Formato medido contra o Ollama real: {"error":"model '<nome>' not found"}.
_MODELO_AUSENTE_RE = re.compile(r"model\b.*\bnot found", re.IGNORECASE | re.DOTALL)

# Generoso no read: modelo frio leva dezenas de segundos pra primeira token.
# Curto no connect: "o Ollama está desligado" tem que ser rápido de descobrir,
# senão a mensagem certa chega tarde demais pra ser útil.
TIMEOUT = httpx.Timeout(connect=5.0, read=180.0, write=10.0, pool=5.0)


class OllamaError(Exception):
    """Base — qualquer falha falando com o Ollama."""


class OllamaUnreachable(OllamaError):
    """Não cheguei no Ollama (desligado, DNS, timeout). Suba o Ollama."""


class OllamaModelMissing(OllamaError):
    """Cheguei no Ollama, o modelo pedido não está instalado."""


class OllamaFailed(OllamaError):
    """Cheguei no Ollama e ele falhou (HTTP de erro, resposta malformada)."""


class OllamaVazio(OllamaFailed):
    """O Ollama respondeu 200 e o texto veio vazio (ou só espaço em branco).

    ⚠️ **Subclasse de `OllamaFailed`, não de `OllamaError` nem uma exceção
    solta, e nada disso é detalhe de estilo:**

    - `revisao_rotas.py` tem UM `except ollama.OllamaError` por rota. Uma
      exceção que não descenda dessa base atravessaria as três rotas e viraria
      500 com stack trace — exatamente o que _Erros são o produto_ proíbe.
    - Herdar de `OllamaFailed` (e não direto de `OllamaError`) mantém a
      classificação honesta pela régua deste módulo: o Ollama foi ALCANÇADO e
      respondeu — não é `OllamaUnreachable` ("suba o Ollama") nem
      `OllamaModelMissing` ("ollama pull X"). Também preserva todo `except
      OllamaFailed` já escrito, incluindo os testes desta suíte.

    ⚠️ **Não é `InsightVazio` (`insight.py`) reusada**, embora o conceito seja
    irmão: `insight.py` importa `ollama`, então importar de volta seria ciclo;
    e `InsightVazio` herda de `Exception` pura — cairia no problema do primeiro
    item acima. Duas classes irmãs, cada uma na sua camada, é o desenho certo.
    """


def _postar(
    *,
    url: str,
    payload: dict,
    model: str,
    client: httpx.Client | None,
) -> dict:
    """POST no Ollama + as quatro traduções de falha. Devolve o corpo JSON.

    Extraído quando `chat` entrou (revisão de artigo): `generate` e `chat` são
    endpoints diferentes com o MESMO tratamento de erro — duplicá-lo era
    garantir que uma das cópias envelhecesse. O que muda entre os dois é só a
    URL, o payload e QUAL campo da resposta interessa; nada disso mora aqui.
    """
    proprio = client is None
    c = client if client is not None else httpx.Client(timeout=TIMEOUT)
    try:
        try:
            resposta = c.post(url, json=payload, timeout=TIMEOUT)
        except httpx.TimeoutException as err:
            raise OllamaUnreachable(
                f"o Ollama em {url} não respondeu a tempo — ele pode estar "
                f"carregando o modelo {model!r} pela primeira vez, ou travado. "
                f"Tente de novo; se repetir, reinicie com 'ollama serve'"
            ) from err
        except httpx.RequestError as err:
            raise OllamaUnreachable(
                f"não consegui conectar ao Ollama em {url} — ele parece estar "
                f'desligado. Inicie com "ollama serve" (ou abra o app Ollama) '
                f"e tente de novo"
            ) from err

        if resposta.status_code != 200:
            corpo = resposta.text[:500]
            # Mandar o dono baixar 5 GB por causa de uma URL errada é
            # exatamente o tipo de mensagem que faz perder tempo no lugar
            # errado (spec §5). Ver _MODELO_AUSENTE_RE, no topo.
            if resposta.status_code == 404 and _MODELO_AUSENTE_RE.search(corpo):
                raise OllamaModelMissing(
                    f"modelo {model!r} não está instalado no Ollama local. "
                    f"Instale com: ollama pull {model}"
                )
            raise OllamaFailed(
                f"Ollama respondeu {resposta.status_code} em {url}: {corpo}"
            )

        try:
            payload_resposta = resposta.json()
        except ValueError as err:
            raise OllamaFailed(
                f"resposta do Ollama em {url} não é JSON válido: {resposta.text[:500]}"
            ) from err

        # /api/generate pode devolver um JSON válido que não é um objeto (ex.:
        # uma lista) — sem esta checagem, o `.get` abaixo levanta AttributeError
        # cru em vez da mensagem acionável que este módulo promete. O irmão
        # ramielle.py já faz o mesmo isinstance antes de tratar o corpo como dict.
        if not isinstance(payload_resposta, dict):
            raise OllamaFailed(
                f"resposta do Ollama em {url} não é um objeto JSON como "
                f"esperado: {payload_resposta!r:.500}"
            )
        return payload_resposta
    finally:
        if proprio:
            c.close()


def generate(
    *,
    model: str,
    prompt: str,
    base_url: str,
    client: httpx.Client | None = None,
) -> str:
    """Um turno não-streaming em `/api/generate`. Devolve o texto CRU (sem trim).

    O trim é de quem chama: quem publica precisa distinguir "veio vazio" de
    "veio só espaço em branco", e essa decisão não é do transporte — aqui ela é
    do `run_insight` (`insight.py`), que já trima e levanta `InsightVazio`.

    ⚠️ **`"think": false` aqui NÃO é o mesmo defeito do `chat`, e mesmo assim
    foi tratado — os dois lados MEDIDOS, com a mesma prompt de uma frase:**

    Tudo com `qwen3.5:4b`, mesma prompt de uma frase. ⚠️ Ele NÃO é mais
    default de slot nenhum (rebaixa o nível dos títulos — ver
    `config.py#Settings`); segue citado aqui porque a medição é sobre
    thinking-by-default, e vale pra qualquer modelo dessa geração:

    | endpoint    | think   | saiu       | tokens      | tempo         |
    | ----------- | ------- | ---------- | ----------- | ------------- |
    | `chat`      | ausente | **VAZIO**  | 3.614       | —             |
    | `generate`  | ausente | preenchido | 248 a 3.481 | 22 s a >120 s |
    | `generate`  | `false` | preenchido | **2 a 21**  | 1 s a 5,4 s   |

    ⚠️ **As faixas do `/api/generate` são largas porque o custo do thinking NÃO
    é reprodutível** — nem com `temperature: 0`. A 1ª medição deu 3.481 tokens
    e >120 s; a verificação independente, mesmo modelo e mesma prompt, deu 248
    tokens e 22,3 s. ~14x de diferença, mesma direção. Um número único aqui
    seria mais preciso do que o fenômeno permite, e quem tentasse reproduzir
    concluiria que este comentário mente. O que se sustenta é a ORDEM DE
    GRANDEZA.

    Ou seja: os dois endpoints do Ollama tratam thinking de forma DIFERENTE —
    `/api/chat` engole a resposta (raciocínio em `message.thinking`, `content`
    vazio), `/api/generate` separa em `thinking` e ainda preenche `response`.
    Então o insight NÃO tem o bug de resposta vazia. O que ele tem é uma a duas
    ordens de grandeza a mais de tokens e de parede contra o `read=180.0` do
    `TIMEOUT` acima, num prompt de UMA frase — o prompt real do insight é muito
    maior, e a margem que sobra vira `OllamaUnreachable` ("não respondeu a
    tempo") no dia em que o dono apontar `OLLAMA_MODEL` pra um modelo de 2026.

    Tratado agora, e não só registrado, porque o campo é uma linha, está
    MEDIDO como inofensivo no modelo que o insight realmente usa
    (`qwen2.5:7b-instruct`, sem `"thinking"` em `capabilities`: HTTP 200 em
    5,0 s), e porque o insight fixa `temperature: 0` justamente por exigir
    determinismo — deixar o modelo raciocinar livre remaria contra isso.
    """
    url = f"{base_url.rstrip('/')}/api/generate"
    corpo = _postar(
        url=url,
        payload={
            "model": model,
            "prompt": prompt,
            "stream": False,
            # Ver a tabela na docstring: aqui é custo/latência, não resposta
            # vazia — mas é o mesmo campo e a mesma medição.
            "think": False,
            "options": {"temperature": 0},
        },
        model=model,
        client=client,
    )
    texto = corpo.get("response")
    if not isinstance(texto, str):
        raise OllamaFailed(
            f'resposta do Ollama não trouxe o campo "response" esperado: {corpo!r:.500}'
        )
    return texto


def chat(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float,
    base_url: str,
    client: httpx.Client | None = None,
) -> str:
    """Um turno system+user em `/api/chat`. Devolve o texto CRU (sem trim).

    ⚠️ Endpoint DIFERENTE do `generate`: corpo com `messages` e resposta em
    `message.content`. É o que a revisão de artigo usa (porte de
    `apps/api/internal/llm/client.go`), porque proofread/refine precisam
    separar a instrução (system) do texto a tratar (user) — no `generate`
    os dois viram um prompt só e o modelo confunde um com o outro.

    ⚠️ `temperature` é PARÂMETRO aqui, ao contrário do `generate` (que fixa 0):
    o Go usa 0.1 no proofread (correção tem que ser conservadora) e 0.7 no
    refine (reescrita precisa de variação). Uniformizar muda o comportamento
    dos dois.
    """
    url = f"{base_url.rstrip('/')}/api/chat"
    corpo = _postar(
        url=url,
        payload={
            "model": model,
            # A ORDEM importa: invertido, o modelo trata a instrução como
            # conteúdo a revisar.
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            # ⚠️ OBRIGATÓRIO, não otimização — ver o cabeçalho do módulo.
            # Sem isto, todo modelo da geração 2026 devolve `message.content`
            # VAZIO e joga o raciocínio em `message.thinking`.
            "think": False,
            "options": {"temperature": temperature},
        },
        model=model,
        client=client,
    )
    mensagem = corpo.get("message")
    if not isinstance(mensagem, dict):
        raise OllamaFailed(
            f'resposta do Ollama não trouxe o objeto "message" esperado: {corpo!r:.500}'
        )
    texto = mensagem.get("content")
    if not isinstance(texto, str):
        raise OllamaFailed(
            'resposta do Ollama não trouxe o campo "message.content" esperado: '
            f"{corpo!r:.500}"
        )
    # ⚠️ `isinstance(str)` acima NÃO cobre isto: "" é str e passava reto. A
    # consequência não é um erro visível — é um SUCESSO FALSO. Na revisão, um
    # bloco vazio volta pro `restaurar_bordas`, que remonta um markdown que
    # ainda PARECE válido, e o dono publica um artigo com um parágrafo comido
    # sem nada ter falhado em lugar nenhum.
    #
    # ⚠️ **Só-espaço-em-branco CONTA como vazio, e isso não briga com o "sem
    # trim" desta função:** o texto devolvido no caminho feliz continua CRU
    # (nenhum `.strip()` no `return` — invariante I3, de que `refine`/
    # `gerar_hooks` dependem). O `.strip()` aqui é do TESTE, não do valor.
    # Conta como vazio porque TODO consumidor de produção já trima antes de
    # usar (`proofread` antes do `restaurar_bordas`, `refine`/`gerar_hooks`
    # antes de medir o limite): pra todos eles "\n  \n" e "" são o mesmo nada,
    # e deixar passar reproduziria o sucesso falso descrito acima.
    if texto.strip() == "":
        raise OllamaVazio(
            f"o modelo {model!r} respondeu sem texto nenhum (message.content "
            f"vazio) em {url} — nada foi gerado. Se este for um modelo de "
            f'raciocínio (gemma4, qwen3.5...), confira se o payload manda "think": '
            f"false: sem isso o modelo escreve tudo em message.thinking e devolve "
            f"content vazio. Caso contrário, tente de novo ou troque o modelo "
            f"(MODEL_PROOFREAD / MODEL_PROOFREAD_CAREFUL / MODEL_HOOKS)"
        )
    return texto
