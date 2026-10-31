"""Factory do app FastAPI do promeia."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from promeia.auth import TokenMiddleware
from promeia.config import Settings, load_settings
from promeia.transcricao_jobs import FilaDeTranscricao, diretorio_padrao
from promeia.transcricao_rotas import router as transcricao_router


def create_app(
    settings: Settings | None = None, *, transcricoes_dir: Path | None = None
) -> FastAPI:
    """Monta o app. `settings` injetado nos testes, lido do ambiente em prod."""
    cfg = settings if settings is not None else load_settings()
    fila = FilaDeTranscricao(transcricoes_dir or diretorio_padrao())

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        fila.iniciar()
        yield
        fila.parar()

    # openapi_url=None: NÃO é correção de autenticação — MEDIDO que
    # TokenMiddleware (add_middleware, abaixo) já envolve o app ASGI inteiro
    # antes do roteamento, então /openapi.json já respondia 401 mesmo sem
    # isto. É YAGNI/superfície: um serviço privado de usuário único, atrás de
    # um túnel, não tem por que publicar o próprio mapa de rotas, nem para
    # quem tem o token.
    app = FastAPI(
        title="promeia",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(TokenMiddleware, esperado=cfg.promeia_token)
    app.state.settings = cfg
    app.state.transcricoes = fila
    app.include_router(transcricao_router)

    @app.get("/health")
    def health() -> dict:
        # Não carrega o Whisper: /health responde "o promeia está de pé", que
        # é a pergunta que o chamador precisa distinguir de "não alcancei".
        return {"ok": True, "service": "promeia"}

    return app
