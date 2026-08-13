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
    "veio só espaço em branco", e essa decisão não é do transporte.
    """
    url = f"{base_url.rstrip('/')}/api/generate"
    corpo = _postar(
        url=url,
        payload={
            "model": model,
            "prompt": prompt,
            "stream": False,
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
    return texto
