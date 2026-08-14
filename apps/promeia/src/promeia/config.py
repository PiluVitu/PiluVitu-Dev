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
    # ⚠️ COM DEFAULT, ao contrário dos campos acima, e não é descuido: sem
    # default, acrescentá-los quebraria toda construção existente de
    # `Settings` — inclusive as dos testes — por um motivo que não é do dono.
    #
    # ⚠️ **A PARIDADE COM A GO ACABOU AQUI, de propósito.** Até esta task os
    # defaults de `model_proofread`/`model_proofread_careful` eram os mesmos
    # da API Go em produção (`qwen2.5:3b-instruct`/`qwen2.5:7b-instruct`, do
    # log de boot dela), e `model_hooks` era registrado como "divergência a
    # resolver" porque o Go usava `qwen2.5:14b-instruct` (`main.go:83`), que
    # nunca foi instalado nesta máquina. **A Go foi APOSENTADA**
    # (`docs/superpowers/ROADMAP.md` §2): não há mais um comportamento de
    # produção do outro lado pra empatar, então "igual ao Go" deixou de ser
    # um critério de qualidade e virou só uma âncora num serviço morto. Os
    # três slots passam a ser ESCOLHA PRÓPRIA, e a divergência do
    # `model_hooks` deixa de existir enquanto conceito — não há mais de quem
    # divergir.
    #
    # ⚠️ **Os valores abaixo foram MEDIDOS**, não escolhidos por tamanho.
    # Corpus com gabarito (9 erros plantados + 18 armadilhas, prompt de
    # produção `PROOFREAD_SYSTEM`, temperatura 0.2, tudo com `"think": false`):
    #
    #   qwen3.5:9b            9/9 erros, 0 violações,  68 s  ← careful e hooks
    #   gemma4:12b            9/9 erros, 0 violações, 139 s  (2x mais lento)
    #   qwen2.5:7b-instruct   8/9 erros, 0 violações,  58 s  (careful ANTIGO)
    #   qwen3.5:4b            8/9 erros, 1 violação,   31 s  ← rápido
    #   qwen2.5:3b-instruct   5/9 erros, 0 violações,  70 s  (rápido ANTIGO)
    #
    # O slot rápido melhorou nos DOIS eixos: o `qwen2.5:3b-instruct` que
    # estava aqui era pior E mais lento que o `qwen3.5:4b` (5/9 em 70 s
    # contra 8/9 em 31 s). O `gemma4:12b` empata em qualidade com o
    # `qwen3.5:9b` e perde feio no relógio (artigo real de 5.778 chars pelo
    # caminho real do `proofread`: 381 s contra 232 s, pior bloco de 35,9 s
    # contra 20,6 s) — por isso o careful é o 9b, com 89% de folga contra o
    # `read=180.0` de `ollama.TIMEOUT`.
    #
    # ⚠️ Os três são modelos de RACIOCÍNIO (`capabilities` inclui
    # `"thinking"`): só funcionam porque `ollama.chat` manda `"think": false`.
    # Sem esse campo, os números acima viram `message.content` VAZIO — ver o
    # cabeçalho de `ollama.py`.
    model_proofread: str = "qwen3.5:4b"
    model_proofread_careful: str = "qwen3.5:9b"
    model_hooks: str = "qwen3.5:9b"


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
        # ⚠️ `OLLAMA_MODEL` (o insight, acima) segue em `qwen2.5:7b-instruct`
        # DE PROPÓSITO, e não por esquecimento de atualizar junto: a tarefa do
        # insight é redigir um parágrafo sobre números JÁ CALCULADOS pelo
        # Worker, e o gargalo medido dele é o PROMPT e a quantidade de dado,
        # não a capacidade do modelo. Evidência: o insight de 2026-08 saiu
        # afirmando "mantendo-se igual ao mesmo período do ano anterior" sobre
        # um banco que não TEM ano anterior — nenhum modelo maior conserta um
        # prompt que deixa essa afirmação ser possível. Trocar o modelo aqui
        # seria gastar GPU pra fingir que o problema é outro.
        #
        # Os três de baixo são os medidos nesta task — ver `Settings` acima.
        model_proofread=src.get("MODEL_PROOFREAD", "qwen3.5:4b"),
        model_proofread_careful=src.get("MODEL_PROOFREAD_CAREFUL", "qwen3.5:9b"),
        model_hooks=src.get("MODEL_HOOKS", "qwen3.5:9b"),
    )
