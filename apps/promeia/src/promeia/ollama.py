"""Cliente do Ollama local.

⚠️ Usa /api/generate (prompt único), não /api/chat (system+user). São duas
APIs diferentes do Ollama: o insight sempre usou `generate`
(scripts/insight.mjs:157) e a revisão de artigo em Go usa `chat`
(internal/llm/client.go:76). `chat` entra quando a revisão de artigo migrar
— depois do ramielle, por decisão do dono. Não antecipar.
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


def generate(
    *,
    model: str,
    prompt: str,
    base_url: str,
    client: httpx.Client | None = None,
) -> str:
    """Um turno não-streaming. Devolve o texto CRU (sem trim).

    O trim é de quem chama: quem publica precisa distinguir "veio vazio" de
    "veio só espaço em branco", e essa decisão não é do transporte.
    """
    url = f"{base_url.rstrip('/')}/api/generate"
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0},
    }

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

        texto = payload_resposta.get("response")
        if not isinstance(texto, str):
            raise OllamaFailed(
                'resposta do Ollama não trouxe o campo "response" esperado: '
                f"{payload_resposta!r:.500}"
            )
        return texto
    finally:
        if proprio:
            c.close()
