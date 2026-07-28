"""Configuração do promeia, lida do ambiente. Recusa subir sem o token."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field


class ConfigError(Exception):
    """Configuração inválida — o serviço não deve subir."""


@dataclass(frozen=True)
class Settings:
    # repr=False nos dois segredos: ninguém loga `settings` hoje, mas o
    # dataclass gera __repr__ com todos os campos por padrão, e este objeto
    # carrega os dois únicos segredos do serviço. Hardening que não custa
    # nada — não depende de ninguém lembrar de nunca logar o objeto inteiro.
    promeia_token: str = field(repr=False)
    ollama_url: str
    ollama_model: str
    ramielle_url: str
    ingest_token: str = field(repr=False)


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
            "Sem esse token, qualquer um que descubra o hostname roda "
            "inferência no seu Mac. Defina antes de iniciar, ex.: "
            "export PROMEIA_TOKEN=$(openssl rand -base64 32)"
        )

    return Settings(
        promeia_token=token,
        ollama_url=src.get("OLLAMA_URL", "http://localhost:11434").rstrip("/"),
        ollama_model=src.get("OLLAMA_MODEL", "qwen2.5:7b-instruct"),
        ramielle_url=src.get("RAMIELLE_URL", "https://financas.piluvitu.com.br").rstrip(
            "/"
        ),
        ingest_token=src.get("INGEST_TOKEN", ""),
    )
