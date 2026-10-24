"""Configuração do promeia, lida do ambiente. Recusa subir sem o token."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field


class ConfigError(Exception):
    """Configuração inválida — o serviço não deve subir."""


@dataclass(frozen=True)
class Settings:
    # repr=False no segredo: o dataclass gera __repr__ com todos os campos.
    promeia_token: str = field(repr=False)


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    """Monta o Settings a partir do ambiente.

    ⚠️ Lança ConfigError quando PROMEIA_TOKEN está ausente ou vazio — de
    propósito, e mais forte que o fail-closed em tempo de request que o
    middleware também faz. Motivo medido neste projeto: o Better Auth, sem
    BETTER_AUTH_SECRET, cai num segredo default publicado no próprio pacote
    e NÃO avisa — deploy e login parecem saudáveis com tudo assinado por uma
    constante pública. Aqui o token é a ÚNICA proteção de um serviço que o
    túnel torna alcançável pela internet inteira: subir sem ele seria
    publicar a GPU do dono. Falhar alto no boot é o comportamento correto.
    """
    src = os.environ if env is None else env

    token = src.get("PROMEIA_TOKEN", "")
    if not token:
        raise ConfigError(
            "PROMEIA_TOKEN não está definido — o promeia não sobe sem ele. "
            "Sem esse token, qualquer um que descubra o hostname usa "
            "a GPU do seu Mac. Defina antes de iniciar, ex.: "
            "export PROMEIA_TOKEN=$(openssl rand -base64 32)"
        )

    return Settings(
        promeia_token=token,
    )
