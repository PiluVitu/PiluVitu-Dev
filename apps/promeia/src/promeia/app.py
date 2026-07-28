"""Factory do app FastAPI do promeia."""

from __future__ import annotations

from fastapi import FastAPI

from promeia.auth import TokenMiddleware
from promeia.config import Settings, load_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Monta o app. `settings` injetado nos testes, lido do ambiente em prod."""
    cfg = settings if settings is not None else load_settings()

    # openapi_url=None: NÃO é correção de autenticação — MEDIDO que
    # TokenMiddleware (add_middleware, abaixo) já envolve o app ASGI inteiro
    # antes do roteamento, então /openapi.json já respondia 401 mesmo sem
    # isto. É YAGNI/superfície: um serviço privado de usuário único, atrás de
    # um túnel, não tem por que publicar o próprio mapa de rotas, nem para
    # quem tem o token.
    app = FastAPI(title="promeia", docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(TokenMiddleware, esperado=cfg.promeia_token)
    app.state.settings = cfg

    @app.get("/health")
    def health() -> dict:
        # Não sonda o Ollama: /health responde "o promeia está de pé", que é
        # a pergunta que o chamador precisa distinguir de "não alcancei"
        # (spec §5). Saúde do modelo é outra pergunta, e tem custo — o Ollama
        # carrega o modelo sob demanda.
        return {"ok": True, "service": "promeia"}

    return app
