"""Cliente do Ollama local, usado só pelo insight (`insight.py`).

`generate` manda um prompt único em `/api/generate` com temperatura fixa em 0:
é resumo de números já calculados, e variação entre execuções ali é DEFEITO,
não estilo. A revisão de artigo, que usava `/api/chat`, foi para a Claude no
ramielle; quando o insight sair também, este módulo sai junto.
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


def _postar(
    *,
    url: str,
    payload: dict,
    model: str,
    client: httpx.Client | None,
) -> dict:
    """POST no Ollama + as quatro traduções de falha. Devolve o corpo JSON."""
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

    ⚠️ **`"think": false` aqui NÃO é o defeito de resposta vazia que o
    `/api/chat` tinha (a revisão de artigo usava esse endpoint), e mesmo assim
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
