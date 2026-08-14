"""Cliente do ramielle — para onde o promeia EMPURRA o resultado.

⚠️ O promeia processa e empurra; a verdade mora no D1 do ramielle. É isso que
faz o app NÃO depender do Mac estar ligado: a tela lê do banco e mostra a data
de geração, nunca chama o Mac ao vivo (spec §1).

Hoje o ramielle é o Worker de finanças (financas.piluvitu.com.br) e o segredo
é o INGEST_TOKEN, que já está em produção. Quando o ramielle absorver a API Go,
a URL muda por configuração — este módulo não muda.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)


class RamielleError(Exception):
    """Base — qualquer falha falando com o ramielle."""


class RamielleUnreachable(RamielleError):
    """Não cheguei no ramielle (rede, DNS, TLS, timeout)."""


class RamielleRefused(RamielleError):
    """Cheguei no ramielle e ele recusou (HTTP de erro, ok:false, envelope torto).

    ⚠️ Separada de RamielleUnreachable de propósito (spec §5): as duas têm
    causas diferentes e exigem AÇÕES diferentes de quem lê a mensagem. Colapsar
    as duas numa frase só manda o dono conferir a rede quando o problema é o
    token — ou o contrário.
    """


def _request(
    method: str,
    url: str,
    *,
    token: str,
    client: httpx.Client | None,
    json_body: dict | None = None,
) -> Any:
    proprio = client is None
    c = client if client is not None else httpx.Client(timeout=TIMEOUT)
    try:
        headers = {"authorization": f"Bearer {token}"}
        try:
            resposta = c.request(
                method, url, headers=headers, json=json_body, timeout=TIMEOUT
            )
        except httpx.RequestError as err:
            raise RamielleUnreachable(
                f"não consegui alcançar a API em {url} — confira a conexão e a "
                f"URL (RAMIELLE_URL). Detalhe: {err}"
            ) from err

        if resposta.status_code == 401:
            raise RamielleRefused(
                f"a API recusou o token (401 em {url}) — confira se o "
                f"INGEST_TOKEN deste serviço é o MESMO configurado no servidor "
                f'("wrangler secret put INGEST_TOKEN" em produção, ou a chave '
                f"INGEST_TOKEN de apps/financas/.dev.vars em dev)"
            )

        if resposta.status_code >= 400:
            raise RamielleRefused(
                f"a API recusou a requisição ({resposta.status_code} em {url}): "
                f"{resposta.text[:500]}"
            )

        try:
            corpo = resposta.json()
        except ValueError as err:
            raise RamielleRefused(
                f"resposta da API em {url} não é JSON válido: {resposta.text[:500]}"
            ) from err

        if not isinstance(corpo, dict) or not isinstance(corpo.get("ok"), bool):
            raise RamielleRefused(
                f"resposta da API em {url} não tem o formato esperado "
                f"(envelope ok/data/notifications): {corpo!r:.500}"
            )

        if not corpo["ok"]:
            notificacoes = corpo.get("notifications") or []
            mensagem = (
                notificacoes[0].get("message")
                if notificacoes and isinstance(notificacoes[0], dict)
                else "motivo não informado"
            )
            raise RamielleRefused(f"a API recusou a requisição em {url}: {mensagem}")

        return corpo.get("data")
    finally:
        if proprio:
            c.close()


def fetch_numbers(
    *,
    base_url: str,
    token: str,
    competence: str,
    client: httpx.Client | None = None,
) -> dict:
    """Lê os agregados já calculados (GET /api/insights/numbers).

    ⚠️ Esta rota devolve SÓ agregado (totais por categoria/período) — nunca um
    lançamento cru. É o que mantém o escopo do INGEST_TOKEN honesto: lê totais,
    escreve prosa, e não alcança o livro-caixa.
    """
    url = f"{base_url.rstrip('/')}/api/insights/numbers?competence={quote(competence)}"
    return _request("GET", url, token=token, client=client)


def post_insight(
    *,
    base_url: str,
    token: str,
    texto: str,
    modelo: str,
    periodo: str,
    client: httpx.Client | None = None,
) -> dict:
    """Publica a leitura (POST /api/insights).

    Manda exatamente três campos. `generated_at` é SEMPRE o relógio do
    servidor — o Worker descarta qualquer valor vindo daqui, e o relógio de um
    laptop atrás de um comando manual não é fonte confiável de frescor.
    """
    url = f"{base_url.rstrip('/')}/api/insights"
    return _request(
        "POST",
        url,
        token=token,
        client=client,
        json_body={"texto": texto, "modelo": modelo, "periodo": periodo},
    )
