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

    def exigir_ingest_token(self) -> str:
        """Devolve o `ingest_token`, ou levanta ConfigError se estiver vazio.

        ⚠️ **Por que aqui, no PONTO DE USO, e não no boot como o
        PROMEIA_TOKEN** (a pergunta foi feita e a resposta foi MEDIDA lendo o
        que cada rota precisa, não escolhida por simetria):

        | Rota               | usa `ingest_token`? |
        | ------------------ | ------------------- |
        | `POST /insight`    | **SIM** — `ramielle.fetch_numbers` + `post_insight` |
        | `POST /transcrever` | não — só Whisper  |
        | `GET /health`      | não               |

        `/transcrever` não toca o ramielle: recebe áudio e devolve texto. Exigir
        o token no boot (levantando ConfigError em `load_settings`, como o
        PROMEIA_TOKEN faz) derrubaria o serviço INTEIRO, transcrição inclusa,
        por uma credencial que ela não usa. Seria trocar um modo de falha
        silencioso por uma queda de uma feature que funciona.

        O PROMEIA_TOKEN é o caso oposto, e por isso a assimetria é correta: ele
        protege TODA rota (é middleware), então "subir sem ele" não tem nenhum
        uso legítimo — é publicar a GPU do dono. Não há a quem preservar.

        A regra que sai disso: **credencial que TODA rota precisa ⇒ boot;
        credencial que UMA rota precisa ⇒ ponto de uso, com mensagem que diga
        o que fazer.** Precedente já existente no próprio serviço:
        `cli.py#main` já checa `if not settings.ingest_token` antes de chamar
        `run_insight`, com uma mensagem acionável — este método é a mesma
        decisão, agora também para quem entra por HTTP.
        """
        if not self.ingest_token:
            raise ConfigError(
                "INGEST_TOKEN não está definido — sem ele o promeia não tem "
                "como se autenticar no ramielle para ler os números nem para "
                "publicar o insight. NÃO é problema de rede: o serviço está de "
                "pé, falta configuração. Defina no ambiente onde ele roda, com "
                "o MESMO valor do servidor "
                '("wrangler secret put INGEST_TOKEN" em produção, ou a chave '
                "INGEST_TOKEN de apps/financas/.dev.vars em dev), e reinicie. "
                "Rodando por `make dev-promeia`/`make insight`, basta estar em "
                "apps/promeia/.env — os dois fazem source do arquivo."
            )
        return self.ingest_token


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

    ⚠️ **O INGEST_TOKEN NÃO segue essa regra, e isso é decisão, não a mesma
    lacuna com outro nome.** Ele cai em string vazia aqui de propósito, porque
    só `POST /insight` o usa — `/transcrever` nunca toca o ramielle. Quem
    exige o token é `Settings.exigir_ingest_token()`, no ponto de uso; leia o
    docstring dele
    para a tabela rota-a-rota que sustenta a escolha. Antes disso, o token
    vazio não falhava em lugar nenhum: virava o header `"Bearer "`, que o httpx
    recusa como `Illegal header value b'Bearer '`, e o erro saía classificado
    como `ramielle_unreachable` ("confira a conexão") — mandando o dono
    investigar a rede por um problema de configuração. MEDIDO por HTTP.
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
    )
