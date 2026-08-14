"""Guard do PROMEIA_TOKEN — aplicado a TODA requisição, por construção."""

from __future__ import annotations

import hmac
from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


def token_valido(header: str | None, esperado: str) -> bool:
    """Confere o header Authorization. Pura, sem HTTP.

    Fail-closed: `esperado` vazio nunca autentica ninguém — mesmo princípio
    de isAllowedEmail/ingestTokenValido no Worker de finanças. Aqui isso é
    defesa em profundidade: load_settings() já recusa subir sem token, então
    este ramo não é alcançável pelo caminho normal.

    compare_digest, não `==`: comparação de string em Python sai no primeiro
    byte diferente, o que vaza o prefixo correto por tempo. É barato evitar.

    ⚠️ Compara BYTES, não str. `hmac.compare_digest` com dois `str` LANÇA
    TypeError se qualquer um tiver caractere fora de ASCII — e um token vindo
    do ambiente é texto livre. Uma exceção aqui subiria como 500 em vez de
    401, e um 500 na rota de autenticação é indistinguível de "o serviço
    quebrou": o dono iria depurar o promeia quando o problema é o token.
    """
    if not esperado:
        return False
    partes = (header or "").split(" ", 1)
    if len(partes) != 2 or partes[0] != "Bearer":
        return False
    return hmac.compare_digest(partes[1].encode("utf-8"), esperado.encode("utf-8"))


class TokenMiddleware(BaseHTTPMiddleware):
    """Exige o token em toda rota — inclusive /health e rotas inexistentes.

    ⚠️ Middleware, NUNCA um Depends por rota. O spec §3 pede "checado em toda
    rota", e um Depends é uma linha que a próxima rota pode esquecer, em
    silêncio, num serviço cujo único cadeado é esse token. O middleware roda
    antes do roteamento, então nem o 404 escapa: quem não autentica não
    descobre o mapa de rotas.
    """

    def __init__(self, app, esperado: str) -> None:
        super().__init__(app)
        self._esperado = esperado

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable]
    ):
        if not token_valido(request.headers.get("authorization"), self._esperado):
            return JSONResponse(
                status_code=401,
                content={
                    "ok": False,
                    "code": "invalid_promeia_token",
                    "message": "token do promeia ausente ou inválido",
                },
            )
        return await call_next(request)
