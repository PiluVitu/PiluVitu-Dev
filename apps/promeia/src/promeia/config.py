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
    # Os três modelos da revisão de artigo. Separados do `ollama_model` (que é
    # do insight) porque o Go já os tratava como três configurações distintas:
    # o proofread rápido roda num modelo menor de propósito, e o `careful`
    # existe justamente pra trocar por um maior quando o dono quer precisão.
    #
    # ⚠️ COM DEFAULT, ao contrário dos campos acima, e não é descuido: os
    # valores de `model_proofread`/`model_proofread_careful` são os MESMOS
    # que o Go já usa em produção (log de boot:
    # `proofread=qwen2.5:3b-instruct proofread_careful=qwen2.5:7b-instruct`),
    # então um ambiente que não os declare continua se comportando como a Go
    # se comporta hoje. Sem default, acrescentá-los quebraria toda construção
    # existente de `Settings` — inclusive as dos testes — por um motivo que
    # não é do dono.
    #
    # ⚠️ **I4 (revisão): `model_hooks` é DIVERGÊNCIA CONSCIENTE, não
    # paridade** — o parágrafo acima citava o mesmo log de boot como
    # justificativa pros três campos, mas aquele log NUNCA menciona `hooks`,
    # só `proofread`/`proofread_careful`. O Go de verdade usa
    # `qwen2.5:14b-instruct` pra hooks (`OLLAMA_MODEL_HOOKS`,
    # `apps/api/cmd/api/main.go:83`, também em `apps/api/.env.example` e
    # `process-compose.yaml`). `qwen2.5:14b-instruct` NÃO está instalado
    # nesta máquina (ver "Pendências do dono" no `CLAUDE.md` deste app) —
    # ~9 GB de download. `7b-instruct` aqui é a escolha PRÁTICA até o dono
    # baixar o 14b (`ollama pull qwen2.5:14b-instruct`); depois disso,
    # `MODEL_HOOKS`/este default devem virar `qwen2.5:14b-instruct` pra bater
    # com o Go de verdade. Registrado como divergência a resolver, não como
    # paridade já alcançada.
    model_proofread: str = "qwen2.5:3b-instruct"
    model_proofread_careful: str = "qwen2.5:7b-instruct"
    model_hooks: str = "qwen2.5:7b-instruct"


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
        # Defaults iguais aos do Go em produção (log de boot da API:
        # `proofread=qwen2.5:3b-instruct proofread_careful=qwen2.5:7b-instruct`).
        model_proofread=src.get("MODEL_PROOFREAD", "qwen2.5:3b-instruct"),
        model_proofread_careful=src.get(
            "MODEL_PROOFREAD_CAREFUL", "qwen2.5:7b-instruct"
        ),
        # ⚠️ I4: divergência CONSCIENTE do Go (que usa `qwen2.5:14b-instruct`
        # aqui) — ver o comentário completo no campo `model_hooks` de
        # `Settings` acima.
        model_hooks=src.get("MODEL_HOOKS", "qwen2.5:7b-instruct"),
    )
