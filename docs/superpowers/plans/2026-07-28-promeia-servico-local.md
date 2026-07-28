# promeia — serviço local (Python) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o `promeia` — o serviço Python que roda no MacBook e carrega o processamento caro (AI, e depois PDF/OCR/transcrição) — e portar para ele o primeiro fluxo, o insight financeiro, apagando o CLI Node que o fazia.

**Architecture:** Serviço HTTP FastAPI de usuário único, com `PROMEIA_TOKEN` exigido em **toda** rota por _middleware_ (não por decorator, que se esquece). O promeia **empurra** o resultado para o ramielle (hoje, o Worker de finanças em `financas.piluvitu.com.br`), que grava no D1 — o app nunca depende do Mac ligado. Nesta fatia o promeia **não precisa de entrada da internet**: o insight é só saída (Mac → Worker), então nenhuma decisão de túnel/hostname bloqueia a execução.

**Tech Stack:** Python 3.13, uv (gerenciador + lockfile com hashes), FastAPI + uvicorn, httpx (cliente HTTP, testado com `MockTransport`), pytest, ruff (lint + format).

---

## Contexto que decide este plano (não redescobrir)

Fatos **medidos** em 2026-07-28, contra o código e a máquina — não de memória.

| Fato                                                                                                                    | Onde foi medido                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **`promeia.piluvitu.com.br` JÁ EXISTE em produção — é o túnel da API Go**, não um nome livre                            | `infra/docker-compose.yml:22`, `apps/api/CLAUDE.md:108-110`                      |
| É também o `NEXT_PUBLIC_API_URL` da Vercel **e** a redirect URI registrada no Google Console                            | idem                                                                             |
| Python 3.13.7 instalado; **`uv` NÃO está instalado**                                                                    | `python3 --version`, `which uv`                                                  |
| Modelos no Ollama: **só `qwen2.5:3b-instruct` e `qwen2.5:7b-instruct`**                                                 | `ollama list`                                                                    |
| `process-compose.yaml` manda puxar `qwen2.5:14b-instruct`, **que não está na máquina** (`make stack` baixaria ~9 GB)    | `process-compose.yaml:18` vs. `ollama list`                                      |
| O CLI do insight usa `/api/generate` do Ollama; a revisão de artigo (Go) usa `/api/chat` — **são duas APIs diferentes** | `apps/financas/scripts/insight.mjs:157` vs. `apps/api/internal/llm/client.go:76` |
| O que porta na revisão de artigo: **349 linhas de Go** (`client.go` 215 + `chunk.go` 108 + `prompts.go` 26)             | `wc -l apps/api/internal/llm/`                                                   |

### Decisões do dono (2026-07-28) — não reabrir

1. **O Python assume `promeia.piluvitu.com.br`.** A API Go vai ser reescrita em TS, virar o **ramielle** e ser deployada num Worker — não existe um estado final com a Go nesse hostname.
2. **Nada roteia através da Go** (a alternativa "a Go vira cliente do promeia" foi recusada). O caminho é o do spec: navegador → ramielle → promeia.

**Consequência direta na ordem, e o motivo de este plano existir separado:** como a Go não entra no caminho e o hostname só é liberado quando ela morrer, **o cutover de `promeia.piluvitu.com.br` fica amarrado ao ramielle** e está **fora deste plano**. O que salva a ordem é que **o insight é push-only**: o promeia faz `POST` para o Worker e nunca recebe requisição. Este plano inteiro roda sem túnel, sem hostname e sem uma linha de frontend.

### Onde este plano se encaixa no spec

`docs/superpowers/specs/2026-07-28-ramielle-promeia-design.md` §9 — este plano é o **passo 1** ("promeia mínimo … portar o insight"), com o esqueleto separado do fluxo (o spec junta os dois num passo só; separar dá dois portões de revisão distintos).

**Fora de escopo, cada um com seu plano depois:** o botão no app (§9.2 — precisa do promeia alcançável, logo do hostname), PDF e transcrição (§9.3), o ramielle (§9.4 — o subsistema grande: votação, auth, CORS, split de hostname), allowlist no admin (§9.5), aposentar o Go (§9.6). **A revisão de artigo (`/llm/proofread`, `/llm/refine`) migra depois do ramielle**, por decisão do dono — não tente antecipá-la aqui.

---

## Global Constraints

Requisitos do projeto inteiro. Valem implicitamente para **toda** task deste plano.

- **Python 3.13** (o instalado na máquina). Fixado em `.python-version`.
- **`uv` com lockfile commitado.** CI roda `uv sync --frozen` — nunca resolve versão em CI.
- **Colocation é lei do projeto** (`CLAUDE.md` da raiz): o teste fica **no mesmo diretório** do fonte. Em Python isso é `modulo.py` → `modulo_test.py` (por isso `python_files = ["*_test.py"]` no pytest, não o `test_*.py` default).
- **`PROMEIA_TOKEN` é exigido em TODA rota** (spec §3). Sem exceção — nem `/health`. O promeia é oportunista (o Mac fica desligado a maior parte do tempo), então não há monitor externo para justificar uma rota aberta.
- **Fail-closed, e mais: recusa a subir.** `PROMEIA_TOKEN` ausente/vazio derruba o boot. Precedente medido neste projeto: o Better Auth, sem `BETTER_AUTH_SECRET`, cai num segredo default publicado no próprio pacote e **não avisa** — o guard explícito é o que torna a falta real (`apps/financas/CLAUDE.md` § _Better Auth — factory_).
- **Dinheiro é `int` em centavos, sempre.** Nunca `float`. `0.1 + 0.2` acumula erro de centavo e o D1 guarda tudo como `INTEGER`.
- **Teresina é UTC−3 FIXO** (o Piauí não adota horário de verão desde 2019). Esta conta já produziu bug **três vezes** neste projeto (data de compra em UTC, competência de fatura, `v_cashflow.competence_month`).
- **Relógio e HTTP são injetados, nunca mockados globalmente.** `now: datetime | None = None`, cliente HTTP por parâmetro. Mesma disciplina de `todayInTeresina(now?)`/`nowIsoUtc(now?)` no Worker.
- **Temperatura zero** em toda chamada ao modelo. Isto é resumo de fatos já calculados, não criação — variação entre execuções é defeito.
- **A mensagem de erro é o produto.** Nunca vaze `ConnectError`/stack trace. "Não alcancei" e "alcancei e falhou" são frases **diferentes** (spec §5) — mandar subir algo que já está de pé faz perder tempo no lugar errado.
- **Verifique por mutação.** Antes de dar uma task por pronta: quebre o código de propósito e confirme que o teste falha. Teste que não pode falhar foi o defeito mais recorrente da sessão anterior.
- **`timeout` não existe no macOS.** Não use em nenhum script.
- **`rtk` mente** — `rtk prettier --check` imprime sucesso mesmo falhando, e o `git log` dele já mostrou a `main` sem merges que existiam. Em verificação que importa, use `git --no-pager` ou `rtk proxy`.
- **O modelo NUNCA vê lançamento cru.** `GET /api/insights/numbers` devolve só agregado; o prompt recebe só isso. Isso é o que mantém o escopo do `INGEST_TOKEN` honesto (lê totais, escreve prosa, nunca toca o livro-caixa).

---

## File Structure

Tudo novo mora em `apps/promeia/`. Um arquivo, uma responsabilidade.

| Arquivo                        | Responsabilidade                                                         |
| ------------------------------ | ------------------------------------------------------------------------ |
| `pyproject.toml`               | Projeto, dependências, config de ruff e pytest, console script           |
| `uv.lock`                      | Lockfile com hashes (commitado)                                          |
| `.python-version`              | `3.13`                                                                   |
| `.env.example`                 | Documenta as chaves sem valor real                                       |
| `CLAUDE.md`                    | Doc do workspace (regra global de manutenção)                            |
| `src/promeia/config.py`        | `Settings` — lê env, recusa boot sem `PROMEIA_TOKEN`                     |
| `src/promeia/auth.py`          | Middleware que exige o token em toda rota, comparação em tempo constante |
| `src/promeia/app.py`           | `create_app()` — monta middleware + routers; `GET /health`               |
| `src/promeia/ollama.py`        | Cliente do Ollama local (`/api/generate`) + taxonomia de erro            |
| `src/promeia/money.py`         | `format_brl` — porte de `@piluvitu/tools/money`, byte a byte igual       |
| `src/promeia/dates.py`         | `competencia_atual` — a regra de Teresina UTC−3                          |
| `src/promeia/ramielle.py`      | Cliente do ramielle (envelope + `INGEST_TOKEN`) e a distinção §5         |
| `src/promeia/insight.py`       | `build_prompt` + `run_insight` + o `APIRouter` de `POST /insight`        |
| `src/promeia/cli.py`           | Entrypoint `promeia-insight` (o que o dono roda no Mac)                  |
| `src/promeia/<modulo>_test.py` | Teste colocado ao lado de cada módulo acima                              |

**Apagados na Task 6:** `apps/financas/scripts/insight.mjs`, `apps/financas/scripts/insight.test.mjs`.

**Modificados:** `Makefile`, `.github/workflows/ci.yml`, `.gitignore`, `apps/financas/package.json`, `apps/financas/CLAUDE.md`, `CLAUDE.md` da raiz.

---

## Pré-requisito de máquina (ação do dono, uma vez)

`uv` não está instalado. Antes da Task 1:

```bash
brew install uv
# ou, sem Homebrew:  curl -LsSf https://astral.sh/uv/install.sh | sh
```

Confirmar com `uv --version`. Nada mais deste plano precisa de instalação global.

---

### Task 1: Esqueleto — pacote Python, guard do token, `/health`, CI

O portão desta task é o critério de aceitação §11 do spec: _"promeia recusa requisição sem `PROMEIA_TOKEN` — provado por teste"_.

**Files:**

- Create: `apps/promeia/pyproject.toml`
- Create: `apps/promeia/.python-version`
- Create: `apps/promeia/.env.example`
- Create: `apps/promeia/src/promeia/__init__.py`
- Create: `apps/promeia/src/promeia/config.py`
- Create: `apps/promeia/src/promeia/config_test.py`
- Create: `apps/promeia/src/promeia/auth.py`
- Create: `apps/promeia/src/promeia/app.py`
- Create: `apps/promeia/src/promeia/app_test.py`
- Modify: `Makefile` (alvos novos + agregados `test`/`lint`/`stop`)
- Modify: `.github/workflows/ci.yml` (job `promeia`)
- Modify: `.gitignore` (`.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`)

**Interfaces:**

- Consumes: nada (primeira task).
- Produces:
  - `promeia.config.Settings` — dataclass congelada com `promeia_token: str`, `ollama_url: str`, `ollama_model: str`, `ramielle_url: str`, `ingest_token: str`.
  - `promeia.config.load_settings(env: Mapping[str, str] | None = None) -> Settings` — lança `ConfigError` se `PROMEIA_TOKEN` faltar/for vazio.
  - `promeia.config.ConfigError(Exception)`.
  - `promeia.auth.token_valido(header: str | None, esperado: str) -> bool` — pura.
  - `promeia.auth.TokenMiddleware` — middleware ASGI (classe `BaseHTTPMiddleware`).
  - `promeia.app.create_app(settings: Settings) -> FastAPI`.

- [ ] **Step 1: Criar o pacote com `uv` e travar as dependências**

```bash
cd apps/promeia
uv init --package --name promeia --python 3.13 .
uv add fastapi uvicorn httpx
uv add --dev pytest ruff
```

`uv init --package` já cria o layout `src/`. Se ele gerar `src/promeia/__init__.py` com conteúdo de exemplo, esvazie o arquivo (deixe só uma docstring de uma linha).

⚠️ **Não invente número de versão em lugar nenhum.** Quem pina é o `uv.lock`, que o `uv add` escreve com hashes. `uv.lock` **vai commitado**.

- [ ] **Step 2: Escrever o `pyproject.toml` completo**

Substituir o gerado por este (mantendo o bloco `[project] dependencies` que o `uv add` escreveu — **não apague as deps**):

```toml
[project]
name = "promeia"
version = "0.1.0"
description = "Serviço local do MacBook: processamento que exige GPU, modelo local ou arquivo em disco"
requires-python = ">=3.13"
# dependencies: escritas pelo `uv add` no Step 1 — não editar à mão

[project.scripts]
promeia-insight = "promeia.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/promeia"]
exclude = ["*_test.py"]

# python_files: o default do pytest é `test_*.py`, que BRIGA com a lei de
# colocation deste projeto (teste no mesmo diretório do fonte, nomeado a
# partir dele — `cpf.go` → `cpf_test.go`). Aqui é `money.py` → `money_test.py`.
[tool.pytest.ini_options]
python_files = ["*_test.py"]
testpaths = ["src"]
addopts = "-q"

[tool.ruff]
line-length = 88
src = ["src"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
```

⚠️ `[project.scripts]` aponta para `promeia.cli:main`, que só existe na Task 6. Isso é de propósito: o entrypoint é contrato declarado desde já. Até lá o `uv sync` funciona normalmente (o script só quebra se **executado**), e a Task 6 fecha.

- [ ] **Step 3: Escrever o teste do `Settings` (falhando)**

`apps/promeia/src/promeia/config_test.py`:

```python
import pytest

from promeia.config import ConfigError, load_settings


def test_recusa_subir_sem_token():
    with pytest.raises(ConfigError, match="PROMEIA_TOKEN"):
        load_settings({})


def test_recusa_subir_com_token_vazio():
    # String vazia é o caso REAL: uma env exportada sem valor, ou um
    # `PROMEIA_TOKEN=` no .env. `if not token` cobre os dois; um
    # `if token is None` deixaria este passar.
    with pytest.raises(ConfigError, match="PROMEIA_TOKEN"):
        load_settings({"PROMEIA_TOKEN": ""})


def test_le_o_token_e_aplica_defaults():
    s = load_settings({"PROMEIA_TOKEN": "segredo"})
    assert s.promeia_token == "segredo"
    assert s.ollama_url == "http://localhost:11434"
    assert s.ollama_model == "qwen2.5:7b-instruct"
    assert s.ramielle_url == "https://financas.piluvitu.com.br"
    assert s.ingest_token == ""


def test_env_sobrescreve_os_defaults():
    s = load_settings(
        {
            "PROMEIA_TOKEN": "segredo",
            "OLLAMA_URL": "http://127.0.0.1:99999",
            "OLLAMA_MODEL": "qwen2.5:3b-instruct",
            "RAMIELLE_URL": "http://localhost:8787",
            "INGEST_TOKEN": "ingest",
        }
    )
    assert s.ollama_url == "http://127.0.0.1:99999"
    assert s.ollama_model == "qwen2.5:3b-instruct"
    assert s.ramielle_url == "http://localhost:8787"
    assert s.ingest_token == "ingest"


def test_barra_final_do_ramielle_url_e_removida():
    # Sem isso, `f"{url}/api/insights"` vira `...com.br//api/insights`.
    s = load_settings(
        {"PROMEIA_TOKEN": "x", "RAMIELLE_URL": "https://exemplo.com.br///"}
    )
    assert s.ramielle_url == "https://exemplo.com.br"
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/config_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.config'`

- [ ] **Step 5: Implementar o `config.py`**

`apps/promeia/src/promeia/config.py`:

```python
"""Configuração do promeia, lida do ambiente. Recusa subir sem o token."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass


class ConfigError(Exception):
    """Configuração inválida — o serviço não deve subir."""


@dataclass(frozen=True)
class Settings:
    promeia_token: str
    ollama_url: str
    ollama_model: str
    ramielle_url: str
    ingest_token: str


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
        ramielle_url=src.get(
            "RAMIELLE_URL", "https://financas.piluvitu.com.br"
        ).rstrip("/"),
        ingest_token=src.get("INGEST_TOKEN", ""),
    )
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `cd apps/promeia && uv run pytest src/promeia/config_test.py`
Expected: PASS (5 testes)

- [ ] **Step 7: Escrever o teste do guard de token (falhando)**

`apps/promeia/src/promeia/app_test.py`:

```python
import pytest
from fastapi.testclient import TestClient

from promeia.app import create_app
from promeia.auth import token_valido
from promeia.config import Settings

TOKEN = "token-de-teste"


def make_settings(**over) -> Settings:
    base = dict(
        promeia_token=TOKEN,
        ollama_url="http://localhost:11434",
        ollama_model="qwen2.5:7b-instruct",
        ramielle_url="https://exemplo.invalid",
        ingest_token="ingest",
    )
    base.update(over)
    return Settings(**base)


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(make_settings()))


def test_health_com_token_responde_200(client):
    r = client.get("/health", headers={"authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "service": "promeia"}


def test_health_sem_token_e_401(client):
    r = client.get("/health")
    assert r.status_code == 401
    assert r.json()["code"] == "invalid_promeia_token"


def test_token_errado_e_401(client):
    r = client.get("/health", headers={"authorization": "Bearer errado"})
    assert r.status_code == 401


def test_esquema_errado_e_401(client):
    # `Basic` em vez de `Bearer`, e o token cru sem esquema nenhum.
    assert client.get("/health", headers={"authorization": TOKEN}).status_code == 401
    assert (
        client.get("/health", headers={"authorization": f"Basic {TOKEN}"}).status_code
        == 401
    )


def test_token_valido_aceita_nao_ascii_sem_lancar():
    """hmac.compare_digest com dois `str` LANÇA TypeError quando algum tem
    caractere fora de ASCII — e um token vindo do ambiente é texto livre.
    Sem o .encode("utf-8") em auth.py, isso subiria como 500 na rota de
    autenticação, e um 500 ali manda depurar o serviço quando o problema é
    o token.

    ⚠️ Testado no nível de UNIDADE, nunca via TestClient. MEDIDO (httpx
    0.28.1): o httpx recusa header não-ASCII no CLIENTE, então a requisição
    nunca chega no app ASGI — um teste HTTP passaria por acidente, provando
    nada sobre a comparação. Um teste que não pode falhar por causa do que
    ele afirma é o defeito mais recorrente deste projeto.
    """
    esperado = "ção-com-acento"
    assert token_valido(f"Bearer {esperado}", esperado) is True
    assert token_valido("Bearer errado", esperado) is False
    assert token_valido(f"Bearer {esperado}", "ascii-puro") is False


def test_rota_inexistente_tambem_exige_token(client):
    # O 401 vem ANTES do 404: quem não tem token não descobre nem quais
    # rotas existem. Um guard montado por decorator, rota a rota, daria 404
    # aqui — e devolver o mapa de rotas pra quem não autenticou é justamente
    # o que este serviço, alcançável pela internet, não pode fazer.
    assert client.get("/rota-que-nao-existe").status_code == 401


def test_TODA_rota_registrada_recusa_sem_token(client):
    """A prova que não envelhece.

    Enumera as rotas que o app REALMENTE registrou e exige 401 em cada uma.
    Uma rota nova adicionada no futuro entra nesta asserção sozinha — é a
    diferença entre um middleware (protege por construção) e um decorator
    por rota (que se esquece). Critério de aceitação §11 do spec.
    """
    rotas = [
        (r.path, sorted(r.methods - {"HEAD", "OPTIONS"}))
        for r in client.app.routes
        if getattr(r, "methods", None) and not r.path.startswith("/openapi")
    ]
    assert rotas, "nenhuma rota registrada — o teste passaria vazio"

    for path, methods in rotas:
        for method in methods:
            r = client.request(method, path)
            assert r.status_code == 401, f"{method} {path} respondeu {r.status_code}"
```

- [ ] **Step 8: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/app_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.app'`

- [ ] **Step 9: Implementar o `auth.py`**

`apps/promeia/src/promeia/auth.py`:

```python
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
```

- [ ] **Step 10: Implementar o `app.py`**

`apps/promeia/src/promeia/app.py`:

```python
"""Factory do app FastAPI do promeia."""

from __future__ import annotations

from fastapi import FastAPI

from promeia.auth import TokenMiddleware
from promeia.config import Settings, load_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Monta o app. `settings` injetado nos testes, lido do ambiente em prod."""
    cfg = settings if settings is not None else load_settings()

    app = FastAPI(title="promeia", docs_url=None, redoc_url=None)
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
```

`apps/promeia/src/promeia/__init__.py`:

```python
"""promeia — o serviço local que carrega o processamento caro."""
```

- [ ] **Step 11: Rodar e confirmar que passa**

Run: `cd apps/promeia && uv run pytest`
Expected: PASS (12 testes: 5 de config + 7 de app)

- [ ] **Step 12: Verificar por mutação — o guard tem que ser capaz de falhar**

Troque, em `auth.py`, `return hmac.compare_digest(partes[1], esperado)` por `return True` e rode `uv run pytest`.
Expected: **FALHAM** os testes `test_health_sem_token_e_401`, `test_token_errado_e_401`, `test_esquema_errado_e_401`, `test_rota_inexistente_tambem_exige_token` e `test_TODA_rota_registrada_recusa_sem_token`.
Depois: **reverta** e confirme `git diff` limpo em `auth.py`. Registre no relatório da task que a mutação foi feita e revertida.

- [ ] **Step 13: Escrever o `.env.example`**

`apps/promeia/.env.example`:

```bash
# Token que protege TODA rota do promeia. Sem ele o serviço NÃO SOBE.
# O túnel torna este serviço alcançável pela internet inteira — sem token,
# é GPU grátis publicada. Gere com: openssl rand -base64 32
PROMEIA_TOKEN=

# Ollama local. O modelo é carregado sob demanda pelo próprio Ollama.
OLLAMA_URL=http://localhost:11434
# Instalados nesta máquina hoje: qwen2.5:3b-instruct e qwen2.5:7b-instruct
OLLAMA_MODEL=qwen2.5:7b-instruct

# ramielle — para onde o promeia EMPURRA o resultado. Hoje é o Worker de
# finanças; o INGEST_TOKEN é o mesmo do `wrangler secret put INGEST_TOKEN`
# (ou a chave INGEST_TOKEN de apps/financas/.dev.vars em dev).
RAMIELLE_URL=https://financas.piluvitu.com.br
INGEST_TOKEN=
```

- [ ] **Step 14: Alvos no `Makefile`**

Acrescentar ao `.PHONY` da primeira linha: `dev-promeia test-promeia lint-promeia`.

Acrescentar os alvos (depois de `test-web`, antes de `test-e2e`):

```makefile
# --- promeia (serviço Python local) ---
# Porta 8082: 8080 é a Go no docker, 8081 a Go em dev, 3333 o web,
# 6017 o Storybook, 5273 o Vite do financas, 8787 o wrangler, 11434 o Ollama.
dev-promeia:
	cd apps/promeia && uv run uvicorn promeia.app:create_app --factory --reload --port 8082

test-promeia:
	cd apps/promeia && uv run pytest

lint-promeia:
	cd apps/promeia && uv run ruff check . && uv run ruff format --check .
```

Alterar os agregados:

```makefile
test:
	pnpm -r test && cd apps/api && go test ./... && cd ../promeia && uv run pytest

lint:
	pnpm -r lint && cd apps/api && go vet ./... && cd ../promeia && uv run ruff check . && uv run ruff format --check .
```

E somar a `8082` à lista de portas do alvo `stop`: `for p in 8081 8082 3333 6017; do`.

- [ ] **Step 15: Job no CI**

Em `.github/workflows/ci.yml`, acrescentar um quarto job, irmão de `web`/`api`/`financas` (não altera nenhum deles):

```yaml
promeia:
  name: Promeia (lint + test)
  runs-on: ubuntu-latest
  timeout-minutes: 10
  defaults:
    run:
      working-directory: apps/promeia
  steps:
    - uses: actions/checkout@v4

    # v9 é a major mais recente (confirmada com `gh release list` durante a
    # execução — o rascunho deste plano dizia v6). `uv sync` baixa o Python
    # de .python-version sozinho, então não há setup-python aqui.
    - uses: astral-sh/setup-uv@v9
      with:
        enable-cache: true

    # --frozen: o CI NUNCA resolve versão. Quem pina é o uv.lock commitado.
    - name: Install dependencies
      run: uv sync --frozen

    - name: Lint
      run: uv run ruff check .

    - name: Format check
      run: uv run ruff format --check .

    - name: Test
      run: uv run pytest
```

- [ ] **Step 16: Ignorar os artefatos do Python**

Acrescentar ao fim do `.gitignore` da raiz:

```
# python (apps/promeia)
.venv/
**/__pycache__/
.pytest_cache/
.ruff_cache/
```

⚠️ **`uv.lock` NÃO entra no `.gitignore`** — ele é commitado de propósito (é o que o `--frozen` do CI verifica).

- [ ] **Step 17: Formatar, lintar e rodar tudo**

```bash
cd apps/promeia && uv run ruff format . && uv run ruff check . && uv run pytest
```

Expected: format sem alteração pendente, lint silencioso, 12 testes passando.

- [ ] **Step 18: Confirmar que o serviço sobe de verdade (não só em TestClient)**

```bash
cd apps/promeia && PROMEIA_TOKEN=teste uv run uvicorn promeia.app:create_app --factory --port 8082 &
# em outro terminal:
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8082/health
curl -s -o /dev/null -w '%{http_code}\n' -H 'authorization: Bearer teste' http://localhost:8082/health
```

Expected: `401` na primeira, `200` na segunda. Derrube o processo depois.

E o boot sem token:

```bash
cd apps/promeia && env -u PROMEIA_TOKEN uv run uvicorn promeia.app:create_app --factory --port 8082
```

Expected: falha no start com a mensagem do `ConfigError` citando `openssl rand -base64 32` — **não** um serviço de pé.

- [ ] **Step 19: Commit**

```bash
git add apps/promeia Makefile .github/workflows/ci.yml .gitignore
git commit -m "feat(promeia): esqueleto do serviço Python com guard do PROMEIA_TOKEN"
```

---

### Task 2: Cliente do Ollama, com a taxonomia de erro já medida

Porta o comportamento de erro que `scripts/insight.mjs` e `scripts/pdf-import.mjs` já mediram **contra o Ollama real** — não reinvente as mensagens, elas são o produto.

**Files:**

- Create: `apps/promeia/src/promeia/ollama.py`
- Create: `apps/promeia/src/promeia/ollama_test.py`

**Interfaces:**

- Consumes: nada da Task 1 (módulo independente).
- Produces:
  - `promeia.ollama.OllamaError(Exception)` — base.
  - `promeia.ollama.OllamaUnreachable(OllamaError)` — não alcancei o Ollama.
  - `promeia.ollama.OllamaModelMissing(OllamaError)` — alcancei, o modelo não existe.
  - `promeia.ollama.OllamaFailed(OllamaError)` — alcancei, respondeu erro / resposta malformada.
  - `promeia.ollama.generate(*, model: str, prompt: str, base_url: str, client: httpx.Client | None = None) -> str`

- [ ] **Step 1: Escrever os testes (falhando)**

`apps/promeia/src/promeia/ollama_test.py`:

```python
import httpx
import pytest

from promeia.ollama import (
    OllamaFailed,
    OllamaModelMissing,
    OllamaUnreachable,
    generate,
)

BASE = "http://localhost:11434"


def cliente(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_caminho_feliz_devolve_o_campo_response():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/generate"
        return httpx.Response(200, json={"response": "  texto do modelo  "})

    with cliente(handler) as c:
        assert generate(
            model="m", prompt="p", base_url=BASE, client=c
        ) == "  texto do modelo  "


def test_manda_temperatura_zero_e_stream_falso():
    # Isto é resumo de fatos já calculados, não criação: variação entre
    # execuções aqui é DEFEITO, não estilo.
    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        visto.update(json.loads(request.content))
        return httpx.Response(200, json={"response": "ok"})

    with cliente(handler) as c:
        generate(model="qwen2.5:7b-instruct", prompt="oi", base_url=BASE, client=c)

    assert visto["options"]["temperature"] == 0
    assert visto["stream"] is False
    assert visto["model"] == "qwen2.5:7b-instruct"
    assert visto["prompt"] == "oi"


def test_ollama_desligado_diz_como_ligar():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    with cliente(handler) as c, pytest.raises(OllamaUnreachable) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    msg = str(exc.value)
    assert "ollama serve" in msg
    assert BASE in msg
    # Nunca o erro cru da biblioteca.
    assert "ConnectError" not in msg


def test_modelo_ausente_cita_o_pull_exato():
    # Formato MEDIDO contra o Ollama real: 404 com corpo
    # {"error":"model '<nome>' not found"}
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "model 'fantasma' not found"})

    with cliente(handler) as c, pytest.raises(OllamaModelMissing) as exc:
        generate(model="fantasma", prompt="p", base_url=BASE, client=c)

    assert "ollama pull fantasma" in str(exc.value)


def test_404_que_nao_e_modelo_ausente_nao_vira_model_missing():
    # Um 404 de path errado não pode virar "instale o modelo" — mandaria o
    # dono baixar 5 GB para resolver um erro de URL.
    #
    # ⚠️ Este corpo é a ARMADILHA de propósito: "404 page not found" CONTÉM a
    # substring "not found". Uma checagem ingênua (`"not found" in corpo`)
    # passa nos outros testes e falha só aqui — que é exatamente o ponto.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="404 page not found")

    with cliente(handler) as c, pytest.raises(OllamaFailed) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    assert not isinstance(exc.value, OllamaModelMissing)


def test_erro_http_qualquer_reporta_status_e_corpo():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with cliente(handler) as c, pytest.raises(OllamaFailed) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    assert "500" in str(exc.value)
    assert "boom" in str(exc.value)


def test_resposta_sem_campo_response_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"outra_coisa": 1})

    with cliente(handler) as c, pytest.raises(OllamaFailed) as exc:
        generate(model="m", prompt="p", base_url=BASE, client=c)

    assert "response" in str(exc.value)


def test_resposta_que_nao_e_json_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>nope</html>")

    with cliente(handler) as c, pytest.raises(OllamaFailed):
        generate(model="m", prompt="p", base_url=BASE, client=c)


def test_timeout_e_inalcancavel_nao_falha():
    # Timeout é "não consegui falar com ele", não "ele me respondeu errado" —
    # a distinção da §5 do spec começa aqui, na classificação do erro.
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("too slow", request=request)

    with cliente(handler) as c, pytest.raises(OllamaUnreachable):
        generate(model="m", prompt="p", base_url=BASE, client=c)
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/ollama_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.ollama'`

- [ ] **Step 3: Implementar o `ollama.py`**

```python
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
                f"resposta do Ollama em {url} não é JSON válido: "
                f"{resposta.text[:500]}"
            ) from err

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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd apps/promeia && uv run pytest src/promeia/ollama_test.py`
Expected: PASS (9 testes)

- [ ] **Step 5: Verificar por mutação**

Troque, em `generate`, `_MODELO_AUSENTE_RE.search(corpo)` por `"not found" in corpo.lower()` (a versão ingênua) e rode.
Expected: **falha** `test_404_que_nao_e_modelo_ausente_nao_vira_model_missing`, e **só** ele — os outros 8 continuam verdes. É a prova de que a regex está fazendo trabalho real, e não é enfeite.
Reverta e confirme `git diff` limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/promeia/src/promeia/ollama.py apps/promeia/src/promeia/ollama_test.py
git commit -m "feat(promeia): cliente do Ollama com a taxonomia de erro medida"
```

---

### Task 3: `money.py` e `dates.py` — os dois pontos onde este projeto já mediu bug

Pequena de propósito, e com portão próprio: a conta de fuso de Teresina já produziu bug **três vezes** neste repositório, e a formatação de dinheiro é o que impede um centavo cru de vazar para o texto que o modelo lê.

**Files:**

- Create: `apps/promeia/src/promeia/money.py`
- Create: `apps/promeia/src/promeia/money_test.py`
- Create: `apps/promeia/src/promeia/dates.py`
- Create: `apps/promeia/src/promeia/dates_test.py`

**Interfaces:**

- Consumes: nada.
- Produces:
  - `promeia.money.format_brl(cents: int) -> str`
  - `promeia.dates.competencia_atual(now: datetime | None = None) -> str`
  - `promeia.dates.competencia_valida(valor: str) -> bool`

- [ ] **Step 1: Escrever os testes de `money` (falhando)**

`apps/promeia/src/promeia/money_test.py`:

```python
import pytest

from promeia.money import format_brl


@pytest.mark.parametrize(
    ("cents", "esperado"),
    [
        (0, "R$ 0,00"),
        (1, "R$ 0,01"),
        (99, "R$ 0,99"),
        (100, "R$ 1,00"),
        (1999, "R$ 19,99"),
        (18900, "R$ 189,00"),
        (100000, "R$ 1.000,00"),
        (136000, "R$ 1.360,00"),
        (100000000, "R$ 1.000.000,00"),
        (-3500, "-R$ 35,00"),
        (-1, "-R$ 0,01"),
    ],
)
def test_formata_igual_ao_formatBRL_do_tools(cents, esperado):
    # Porte byte a byte de packages/tools/src/money.ts#formatBRL. Formatação
    # manual, nunca locale: o Intl/locale usa U+00A0 entre 'R$' e o número e
    # o resultado varia com a versão do ICU do runtime — aqui a saída tem que
    # ser idêntica em qualquer lugar, incluindo dentro de um prompt.
    assert format_brl(cents) == esperado


def test_o_separador_de_milhar_e_ponto_e_o_decimal_e_virgula():
    # A inversão silenciosa (padrão en-US) é o erro que um `f"{x:,.2f}"`
    # desavisado produz: 'R$ 1,360.00' em vez de 'R$ 1.360,00'.
    saida = format_brl(136000)
    assert saida == "R$ 1.360,00"
    assert "1,360" not in saida


def test_recusa_float():
    # Dinheiro é INTEGER centavos ponta a ponta. Um float aqui é o começo do
    # erro de centavo que o schema do D1 existe pra impedir.
    with pytest.raises(TypeError):
        format_brl(19.99)


def test_recusa_bool():
    # isinstance(True, int) é True em Python — sem checagem explícita,
    # format_brl(True) devolveria 'R$ 0,01' em silêncio.
    with pytest.raises(TypeError):
        format_brl(True)


def test_recusa_string():
    with pytest.raises(TypeError):
        format_brl("1999")
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/money_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.money'`

- [ ] **Step 3: Implementar o `money.py`**

```python
"""Dinheiro em centavos inteiros. Porte de packages/tools/src/money.ts.

⚠️ Duplicação DELIBERADA, não descuido. `@piluvitu/tools` é TypeScript e este
é um quarto runtime (Python, no Mac) — não há fronteira de import entre eles,
mesma decisão já registrada para `todayInTeresina` existir no Worker E na SPA.
A saída tem que bater byte a byte com a do TS, porque os dois formatam o MESMO
número para o MESMO dono ler.
"""

from __future__ import annotations


def format_brl(cents: int) -> str:
    """1999 -> 'R$ 19,99'. -3500 -> '-R$ 35,00'.

    Formatação manual em vez de locale/Intl: o resultado de um formatador de
    locale varia com a versão do ICU do runtime (e insere U+00A0 entre 'R$' e
    o número). Aqui a saída é a mesma em qualquer lugar.
    """
    if isinstance(cents, bool) or not isinstance(cents, int):
        raise TypeError(
            f"centavos precisam ser int (nunca float/bool/str): {cents!r}"
        )

    abs_cents = abs(cents)
    inteiro = f"{abs_cents // 100:,}".replace(",", ".")
    decimal = f"{abs_cents % 100:02d}"
    sinal = "-" if cents < 0 else ""
    return f"{sinal}R$ {inteiro},{decimal}"
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd apps/promeia && uv run pytest src/promeia/money_test.py`
Expected: PASS (15 casos)

- [ ] **Step 5: Escrever os testes de `dates` (falhando)**

`apps/promeia/src/promeia/dates_test.py`:

```python
from datetime import datetime, timedelta, timezone

import pytest

from promeia.dates import competencia_atual, competencia_valida


def test_o_caso_que_ja_deu_bug_tres_vezes_neste_projeto():
    """22h do dia 31/01 em Teresina é 01h do dia 01/02 em UTC.

    Sem subtrair o offset, a competência sairia '2026-02' — o mês errado,
    justamente na virada, que é quando importa. Mesmo bug já corrigido em
    lib/dates.ts (Worker), web/src/lib/dates.ts (SPA) e cashflow.ts.
    """
    momento = datetime(2026, 2, 1, 1, 0, tzinfo=timezone.utc)
    assert competencia_atual(momento) == "2026-01"


def test_meio_do_mes_nao_muda():
    assert competencia_atual(datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc)) == (
        "2026-07"
    )


def test_a_borda_exata_do_offset():
    # 03:00Z do dia 1 é exatamente 00:00 em Teresina — já é o mês novo.
    assert competencia_atual(datetime(2026, 3, 1, 3, 0, tzinfo=timezone.utc)) == (
        "2026-03"
    )
    # 02:59Z ainda é 23:59 do último dia de fevereiro.
    assert competencia_atual(datetime(2026, 3, 1, 2, 59, tzinfo=timezone.utc)) == (
        "2026-02"
    )


def test_virada_de_ano():
    assert competencia_atual(datetime(2027, 1, 1, 2, 0, tzinfo=timezone.utc)) == (
        "2026-12"
    )


def test_aceita_datetime_de_outro_fuso_convertendo_para_utc_antes():
    # Um datetime em -03:00 já É o horário local; a função tem que normalizar
    # para UTC antes de subtrair, não subtrair duas vezes.
    local = datetime(2026, 1, 31, 22, 0, tzinfo=timezone(timedelta(hours=-3)))
    assert competencia_atual(local) == "2026-01"


def test_recusa_datetime_ingenuo():
    # Um datetime sem fuso é ambíguo — assumir UTC em silêncio é como o bug
    # de UTC nasce. Falhar alto é o comportamento certo.
    with pytest.raises(ValueError, match="fuso"):
        competencia_atual(datetime(2026, 2, 1, 1, 0))


def test_sem_argumento_usa_o_relogio_e_devolve_formato_valido():
    assert competencia_valida(competencia_atual())


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        ("2026-01", True),
        ("2026-12", True),
        ("2026-00", False),
        ("2026-13", False),
        ("2026-1", False),
        ("26-01", False),
        ("2026/01", False),
        ("", False),
        ("2026-01-15", False),
    ],
)
def test_competencia_valida(valor, esperado):
    assert competencia_valida(valor) is esperado
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/dates_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.dates'`

- [ ] **Step 7: Implementar o `dates.py`**

```python
"""Competência (YYYY-MM) no fuso de Teresina.

⚠️ Teresina é UTC−3 FIXO — o Piauí não adota horário de verão desde 2019.
Offset constante, não uma tabela de fuso: a conta é a MESMA de
apps/financas/src/lib/dates.ts (Worker), web/src/lib/dates.ts (SPA) e
scripts/insight.mjs (o CLI que este módulo substitui). Quatro runtimes, sem
fronteira de import entre eles.

Esta conta já produziu bug TRÊS vezes neste repositório: data de compra
gravada em UTC, competência de fatura caindo no mês seguinte, e a coluna
v_cashflow.competence_month (que por isso está documentada como "não usar").
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

TERESINA_OFFSET = timedelta(hours=3)
_COMPETENCE_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def competencia_atual(now: datetime | None = None) -> str:
    """Mês corrente em Teresina, como 'YYYY-MM'.

    `now` é injetado (nunca um relógio global mockado) — mesma disciplina de
    todayInTeresina(now?)/nowIsoUtc(now?) no Worker: mock de relógio global
    vaza entre testes do mesmo arquivo.
    """
    momento = datetime.now(timezone.utc) if now is None else now
    if momento.tzinfo is None:
        raise ValueError(
            "competencia_atual precisa de um datetime com fuso (tz-aware) — "
            "um datetime ingênuo é ambíguo, e assumir UTC em silêncio é "
            "exatamente como o bug de fuso nasce neste projeto"
        )
    return (momento.astimezone(timezone.utc) - TERESINA_OFFSET).strftime("%Y-%m")


def competencia_valida(valor: str) -> bool:
    """'2026-07' -> True. '2026-13', '2026-1', '2026-07-15' -> False."""
    return bool(_COMPETENCE_RE.match(valor or ""))
```

- [ ] **Step 8: Rodar e confirmar que passa**

Run: `cd apps/promeia && uv run pytest src/promeia/dates_test.py`
Expected: PASS (17 casos)

- [ ] **Step 9: Verificar por mutação — a subtração do offset precisa ser load-bearing**

Troque `- TERESINA_OFFSET` por `- timedelta(0)` e rode.
Expected: **falham** `test_o_caso_que_ja_deu_bug_tres_vezes_neste_projeto`, `test_a_borda_exata_do_offset`, `test_virada_de_ano` e `test_aceita_datetime_de_outro_fuso_convertendo_para_utc_antes`.
Reverta e confirme `git diff` limpo.

- [ ] **Step 10: Rodar a suíte inteira, formatar e commitar**

```bash
cd apps/promeia && uv run ruff format . && uv run ruff check . && uv run pytest
git add apps/promeia/src/promeia/money.py apps/promeia/src/promeia/money_test.py \
        apps/promeia/src/promeia/dates.py apps/promeia/src/promeia/dates_test.py
git commit -m "feat(promeia): format_brl e competencia_atual (Teresina UTC-3)"
```

---

### Task 4: Cliente do ramielle — envelope, e "não alcancei" ≠ "alcancei e falhou"

O primeiro lugar em Python onde a regra da §5 do spec vira código. As duas situações têm causas diferentes e **precisam** de mensagens diferentes: mandar subir algo que já está de pé faz perder tempo no lugar errado.

**Files:**

- Create: `apps/promeia/src/promeia/ramielle.py`
- Create: `apps/promeia/src/promeia/ramielle_test.py`

**Interfaces:**

- Consumes: nada dos módulos anteriores.
- Produces:
  - `promeia.ramielle.RamielleError(Exception)` — base.
  - `promeia.ramielle.RamielleUnreachable(RamielleError)` — não cheguei lá.
  - `promeia.ramielle.RamielleRefused(RamielleError)` — cheguei, ele recusou.
  - `promeia.ramielle.fetch_numbers(*, base_url, token, competence, client=None) -> dict`
  - `promeia.ramielle.post_insight(*, base_url, token, texto, modelo, periodo, client=None) -> dict`

- [ ] **Step 1: Escrever os testes (falhando)**

`apps/promeia/src/promeia/ramielle_test.py`:

```python
import json

import httpx
import pytest

from promeia.ramielle import (
    RamielleRefused,
    RamielleUnreachable,
    fetch_numbers,
    post_insight,
)

BASE = "https://exemplo.invalid"
TOKEN = "ingest-token"


def cliente(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def envelope(data) -> dict:
    return {"ok": True, "data": data, "notifications": []}


def test_fetch_numbers_monta_a_url_e_manda_o_bearer():
    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        visto["url"] = str(request.url)
        visto["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=envelope({"competence": "2026-07"}))

    with cliente(handler) as c:
        dados = fetch_numbers(
            base_url=BASE, token=TOKEN, competence="2026-07", client=c
        )

    assert visto["url"] == f"{BASE}/api/insights/numbers?competence=2026-07"
    assert visto["auth"] == f"Bearer {TOKEN}"
    assert dados == {"competence": "2026-07"}


def test_post_insight_manda_os_tres_campos_e_nada_mais():
    # generated_at é SEMPRE o relógio do servidor (⚠️ em domain/insights.ts) —
    # mandar um daqui seria ignorado, mas mandar é sinal de mau entendimento.
    visto = {}

    def handler(request: httpx.Request) -> httpx.Response:
        visto.update(json.loads(request.content))
        return httpx.Response(201, json=envelope({"id": "abc"}))

    with cliente(handler) as c:
        post_insight(
            base_url=BASE,
            token=TOKEN,
            texto="a leitura",
            modelo="qwen2.5:7b-instruct",
            periodo="2026-07",
            client=c,
        )

    assert visto == {
        "texto": "a leitura",
        "modelo": "qwen2.5:7b-instruct",
        "periodo": "2026-07",
    }


def test_nao_alcancei_e_diferente_de_recusou():
    """A distinção da §5 do spec, provada nas DUAS direções."""

    def cai(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("dns", request=request)

    with cliente(cai) as c, pytest.raises(RamielleUnreachable) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)
    assert "não consegui alcançar" in str(exc.value)

    def recusa(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    with cliente(recusa) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)
    assert "não consegui alcançar" not in str(exc.value)
    assert "500" in str(exc.value)


def test_401_cita_o_ingest_token_e_como_configurar():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"ok": False, "notifications": []})

    with cliente(handler) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)

    msg = str(exc.value)
    assert "INGEST_TOKEN" in msg
    assert "wrangler secret put" in msg


def test_envelope_ok_false_com_200_ainda_e_recusa():
    # O Worker responde com envelope; um `ok: false` é recusa mesmo com
    # status 2xx em algum caminho. Confiar só no status HTTP deixaria isso
    # passar como sucesso e publicar/ler dado que não existe.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "ok": False,
                "data": None,
                "notifications": [
                    {"type": "error", "code": "invalid_query", "message": "competência inválida"}
                ],
            },
        )

    with cliente(handler) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-13", client=c)

    assert "competência inválida" in str(exc.value)


def test_resposta_fora_do_envelope_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"qualquer": "coisa"})

    with cliente(handler) as c, pytest.raises(RamielleRefused) as exc:
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)

    assert "envelope" in str(exc.value)


def test_resposta_que_nao_e_json_falha_alto():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>Cloudflare</html>")

    with cliente(handler) as c, pytest.raises(RamielleRefused):
        fetch_numbers(base_url=BASE, token=TOKEN, competence="2026-07", client=c)


def test_timeout_e_inalcancavel():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with cliente(handler) as c, pytest.raises(RamielleUnreachable):
        post_insight(
            base_url=BASE,
            token=TOKEN,
            texto="t",
            modelo="m",
            periodo="2026-07",
            client=c,
        )
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/ramielle_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.ramielle'`

- [ ] **Step 3: Implementar o `ramielle.py`**

```python
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
                f"resposta da API em {url} não é JSON válido: "
                f"{resposta.text[:500]}"
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
            raise RamielleRefused(
                f"a API recusou a requisição em {url}: {mensagem}"
            )

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
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd apps/promeia && uv run pytest src/promeia/ramielle_test.py`
Expected: PASS (9 testes)

- [ ] **Step 5: Verificar por mutação — o `ok:false` precisa ser load-bearing**

Remova o bloco `if not corpo["ok"]: ...` e rode.
Expected: **falha** `test_envelope_ok_false_com_200_ainda_e_recusa`, e só ele.
Reverta e confirme `git diff` limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/promeia/src/promeia/ramielle.py apps/promeia/src/promeia/ramielle_test.py
git commit -m "feat(promeia): cliente do ramielle com a distincao inalcancavel/recusou"
```

---

### Task 5: O insight — prompt, orquestração e a rota `POST /insight`

Porte fiel de `apps/financas/scripts/insight.mjs`. O prompt é contrato: mudar uma frase muda o texto que o dono lê todo mês.

**Files:**

- Create: `apps/promeia/src/promeia/insight.py`
- Create: `apps/promeia/src/promeia/insight_test.py`
- Modify: `apps/promeia/src/promeia/app.py` (montar o router)
- Modify: `apps/promeia/src/promeia/app_test.py` (o teste de "toda rota" passa a cobrir `/insight` sozinho)

**Interfaces:**

- Consumes: `promeia.money.format_brl`, `promeia.dates.competencia_atual`/`competencia_valida`, `promeia.ollama.generate` + as três exceções, `promeia.ramielle.fetch_numbers`/`post_insight` + as duas exceções, `promeia.config.Settings`.
- Produces:
  - `promeia.insight.build_prompt(numbers: dict) -> str`
  - `promeia.insight.InsightVazio(Exception)`
  - `promeia.insight.PublicacaoFalhou(Exception)` — com `.texto` e `.causa`.
  - `promeia.insight.run_insight(*, settings, competence, gerar=..., ler=..., publicar=...) -> tuple[str, str]` — devolve `(competence, texto)`.
  - `promeia.insight.router` — `APIRouter` com `POST /insight`.

- [ ] **Step 1: Escrever os testes do prompt (falhando)**

`apps/promeia/src/promeia/insight_test.py`:

```python
import pytest
from fastapi.testclient import TestClient

from promeia.app import create_app
from promeia.config import Settings
from promeia.insight import (
    InsightVazio,
    PublicacaoFalhou,
    build_prompt,
    run_insight,
)
from promeia.ollama import OllamaUnreachable
from promeia.ramielle import RamielleRefused

TOKEN = "token-de-teste"


def numeros(**over) -> dict:
    base = {
        "competence": "2026-07",
        "previous_competence": "2026-06",
        "total_cents": -123000,
        "previous_total_cents": -87000,
        "variation_cents": 36000,
        "variation_pct": 41,
        "top_categories": [
            {"category_name": "INSS", "total_cents": -76000},
            {"category_name": "Contador", "total_cents": -30000},
        ],
        "biggest_increase": {
            "category_name": "INSS",
            "previous_cents": -40000,
            "current_cents": -76000,
            "delta_cents": 36000,
        },
    }
    base.update(over)
    return base


# --- build_prompt -------------------------------------------------------


def test_nenhum_centavo_cru_aparece_no_prompt():
    # O modelo lê o texto do prompt. Um '-123000' solto ali é um número que
    # ele pode copiar para a leitura final — e "R$ 123.000,00" seria mentira
    # de 100x sobre R$ 1.230,00.
    p = build_prompt(numeros())
    assert "R$ 1.230,00" in p
    assert "-123000" not in p
    assert "123000" not in p


def test_as_categorias_saem_na_ordem_recebida_e_numeradas():
    p = build_prompt(numeros())
    assert "1. INSS: R$ 760,00" in p
    assert "2. Contador: R$ 300,00" in p
    assert p.index("1. INSS") < p.index("2. Contador")


def test_as_regras_anti_invencao_estao_presentes():
    # São elas que impedem o modelo de calcular/estimar um número novo. O
    # spec é explícito: nenhum número exibido pode vir do modelo.
    p = build_prompt(numeros())
    assert "REGRAS OBRIGATÓRIAS" in p
    assert "SOMENTE" in p
    assert "NUNCA invente" in p


def test_sem_categoria_nenhuma_diz_isso_em_vez_de_ficar_vazio():
    p = build_prompt(numeros(top_categories=[]))
    assert "(nenhum gasto registrado nesta competência)" in p


def test_sem_base_de_comparacao_diz_isso_em_vez_de_uma_porcentagem():
    p = build_prompt(numeros(variation_pct=None))
    assert "Sem base de comparação" in p
    assert "None" not in p


def test_variacao_zero_nao_vira_aumento_de_zero():
    p = build_prompt(numeros(variation_cents=0, variation_pct=0))
    assert "Sem variação em relação a 2026-06." in p


def test_reducao_e_reducao_nao_aumento_negativo():
    p = build_prompt(numeros(variation_cents=-36000, variation_pct=-41))
    assert "Redução de R$ 360,00 (41%)" in p
    assert "Aumento" not in p


def test_sem_maior_crescimento_marca_explicitamente():
    p = build_prompt(numeros(biggest_increase=None))
    assert "(sem dado suficiente para apontar)" in p
    assert "None" not in p


def test_maior_crescimento_usa_magnitude_nos_tres_numeros():
    p = build_prompt(numeros())
    assert "INSS: foi de R$ 400,00 para R$ 760,00 (aumento de R$ 360,00)." in p


# --- run_insight --------------------------------------------------------


def settings(**over) -> Settings:
    base = dict(
        promeia_token=TOKEN,
        ollama_url="http://localhost:11434",
        ollama_model="qwen2.5:7b-instruct",
        ramielle_url="https://exemplo.invalid",
        ingest_token="ingest",
    )
    base.update(over)
    return Settings(**base)


def test_run_insight_le_gera_e_publica_nessa_ordem():
    chamadas = []

    def ler(competence):
        chamadas.append(("ler", competence))
        return numeros()

    def gerar(prompt):
        chamadas.append(("gerar", prompt[:20]))
        return "  A leitura do mês.  "

    def publicar(texto, modelo, periodo):
        chamadas.append(("publicar", texto, modelo, periodo))

    competence, texto = run_insight(
        settings=settings(),
        competence="2026-07",
        ler=ler,
        gerar=gerar,
        publicar=publicar,
    )

    assert competence == "2026-07"
    assert texto == "A leitura do mês."  # trimado
    assert [c[0] for c in chamadas] == ["ler", "gerar", "publicar"]
    assert chamadas[2][1:] == ("A leitura do mês.", "qwen2.5:7b-instruct", "2026-07")


def test_texto_vazio_nao_publica_nada():
    # "Insight vazio publicado" é o pior resultado possível: parece sucesso e
    # o dono lê um card em branco sem saber por quê. Mesma regra do CSV vazio
    # em pdf-import.mjs.
    publicou = []

    with pytest.raises(InsightVazio):
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: numeros(),
            gerar=lambda p: "   \n  ",
            publicar=lambda *a: publicou.append(a),
        )

    assert publicou == []


def test_competencia_invalida_falha_antes_de_qualquer_chamada():
    tocou = []

    with pytest.raises(ValueError, match="competência"):
        run_insight(
            settings=settings(),
            competence="2026-13",
            ler=lambda c: tocou.append(c) or numeros(),
            gerar=lambda p: tocou.append(p) or "x",
            publicar=lambda *a: tocou.append(a),
        )

    assert tocou == []


def test_falha_ao_publicar_carrega_o_texto_gerado_na_excecao():
    """O texto custou uma rodada de modelo — não pode evaporar.

    Cenário real: a API cai (ou a rede oscila) ENTRE o gerar e o publicar. O
    CLI Node que este módulo substitui imprimia o texto sob
    "--- texto gerado (NÃO publicado) ---" justamente por isso. Deixar a
    exceção de rede subir crua perderia o texto e obrigaria a rodar o modelo
    de novo — regressão silenciosa contra o comportamento que já existia.
    """
    with pytest.raises(PublicacaoFalhou) as exc:
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: numeros(),
            gerar=lambda p: "texto caro",
            publicar=lambda *a: (_ for _ in ()).throw(RamielleRefused("caiu")),
        )
    assert exc.value.texto == "texto caro"
    assert isinstance(exc.value.causa, RamielleRefused)
    assert "caiu" in str(exc.value)


def test_falha_ao_LER_nao_vira_PublicacaoFalhou():
    # A leitura acontece ANTES de qualquer texto existir — embrulhar o erro
    # dela em PublicacaoFalhou faria o CLI prometer imprimir um texto que
    # nunca foi gerado.
    with pytest.raises(RamielleRefused):
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: (_ for _ in ()).throw(RamielleRefused("recusou a leitura")),
            gerar=lambda p: "nunca chega aqui",
            publicar=lambda *a: None,
        )


# --- rota ---------------------------------------------------------------


def client() -> TestClient:
    return TestClient(create_app(settings()))


def auth() -> dict:
    return {"authorization": f"Bearer {TOKEN}"}


def test_rota_insight_exige_o_token_do_promeia():
    r = client().post("/insight", json={"competence": "2026-07"})
    assert r.status_code == 401
    assert r.json()["code"] == "invalid_promeia_token"


def test_rota_insight_com_competencia_invalida_e_422():
    r = client().post("/insight", json={"competence": "2026-13"}, headers=auth())
    assert r.status_code == 422


def test_rota_insight_traduz_ollama_desligado_em_503():
    # 503 é a resposta que deixa o chamador (ramielle, depois) distinguir
    # "o promeia está de pé mas o Ollama não" de "não alcancei o promeia".
    app = create_app(settings())
    from promeia import insight as mod

    original = mod.run_insight
    mod.run_insight = lambda **kw: (_ for _ in ()).throw(
        OllamaUnreachable("suba o ollama")
    )
    try:
        r = TestClient(app).post(
            "/insight", json={"competence": "2026-07"}, headers=auth()
        )
    finally:
        mod.run_insight = original

    assert r.status_code == 503
    assert r.json()["code"] == "ollama_unreachable"
    assert "suba o ollama" in r.json()["message"]
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/insight_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.insight'`

- [ ] **Step 3: Implementar o `insight.py`**

```python
"""Insight financeiro — porte de apps/financas/scripts/insight.mjs.

⚠️ O MODELO NUNCA VÊ LANÇAMENTO CRU. `GET /api/insights/numbers` devolve só
agregado (totais por categoria/período, já calculados no Worker) — build_prompt
só recebe isso. É o que mantém o escopo do INGEST_TOKEN honesto: lê totais,
escreve prosa, nunca toca o livro-caixa.

⚠️ A ARITMÉTICA NÃO É IA. "Onde gastei mais", "quanto subiu" e "o que mais
cresceu" são consultas exatas, feitas no Worker, e a tela renderiza esses
números direto do dado. O texto gerado aqui é a leitura AO REDOR deles —
nenhum número exibido vem do modelo.
"""

from __future__ import annotations

from typing import Any, Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from promeia import ollama, ramielle
from promeia.config import Settings
from promeia.dates import competencia_atual, competencia_valida
from promeia.money import format_brl


class InsightVazio(Exception):
    """O modelo devolveu texto vazio — nada foi publicado."""


class PublicacaoFalhou(Exception):
    """Falhou ao publicar DEPOIS de o texto já estar gerado.

    ⚠️ Carrega o texto de propósito. Ele custou uma rodada de modelo, e a
    janela entre gerar e publicar é onde a rede realmente cai. Deixar a
    exceção de transporte subir crua perderia o texto e obrigaria a rodar
    tudo de novo — o CLI Node que este módulo substitui já imprimia o texto
    sob "--- texto gerado (NÃO publicado) ---" por esse motivo.

    NÃO herda de RamielleError: é um conceito do promeia (houve trabalho
    salvável), não uma categoria de falha de transporte. Quem trata precisa
    poder distinguir as duas.
    """

    def __init__(self, texto: str, causa: Exception) -> None:
        super().__init__(str(causa))
        self.texto = texto
        self.causa = causa


# --- prompt -------------------------------------------------------------


def _linha_categoria(row: dict, index: int) -> str:
    return f"{index + 1}. {row['category_name']}: {format_brl(abs(row['total_cents']))}"


def _linha_variacao(numbers: dict) -> str:
    pct = numbers["variation_pct"]
    cents = numbers["variation_cents"]
    anterior = numbers["previous_competence"]
    if pct is None:
        return f"Sem base de comparação: não houve gasto registrado em {anterior}."
    if cents == 0:
        return f"Sem variação em relação a {anterior}."
    direcao = "Aumento" if cents > 0 else "Redução"
    return (
        f"{direcao} de {format_brl(abs(cents))} ({abs(pct)}%) "
        f"em relação a {anterior}."
    )


def _linha_maior_crescimento(numbers: dict) -> str:
    b = numbers["biggest_increase"]
    if b is None:
        return "(sem dado suficiente para apontar)"
    direcao = "aumento" if b["delta_cents"] >= 0 else "redução"
    return (
        f"{b['category_name']}: foi de {format_brl(abs(b['previous_cents']))} "
        f"para {format_brl(abs(b['current_cents']))} ({direcao} de "
        f"{format_brl(abs(b['delta_cents']))})."
    )


def build_prompt(numbers: dict) -> str:
    """Monta o prompt a partir do payload de GET /api/insights/numbers.

    As "REGRAS OBRIGATÓRIAS" no fim são o que impede o modelo de inventar um
    número. Não as enfraqueça: o prompt é contrato, e o dono lê este texto
    todo mês achando que os números vieram do banco.
    """
    competence = numbers["competence"]
    anterior = numbers["previous_competence"]
    top = numbers["top_categories"]

    linhas_categorias = (
        "\n".join(_linha_categoria(row, i) for i, row in enumerate(top))
        if top
        else "(nenhum gasto registrado nesta competência)"
    )

    return f"""Você escreve um resumo financeiro curto, em português do Brasil, para o dono de um controle financeiro pessoal/PJ.

Abaixo estão os ÚNICOS fatos que você pode usar. Eles já foram calculados por consulta exata ao banco de dados — você NÃO tem acesso a nenhum lançamento individual, só a estes totais já agregados.

Competência: {competence} (mês anterior de comparação: {anterior})
Total gasto em {competence}: {format_brl(abs(numbers["total_cents"]))}
Total gasto em {anterior}: {format_brl(abs(numbers["previous_total_cents"]))}
Variação: {_linha_variacao(numbers)}

Maiores categorias de gasto em {competence} (da maior para a menor):
{linhas_categorias}

Categoria com a maior variação de gasto em relação a {anterior}:
{_linha_maior_crescimento(numbers)}

Escreva um parágrafo de 3 a 5 frases resumindo esses fatos para o dono, em tom direto, sem saudação, sem "espero que ajude", sem markdown, sem lista — só o parágrafo corrido.

REGRAS OBRIGATÓRIAS, sem exceção:
- Use SOMENTE os números e nomes de categoria que aparecem acima. Não calcule nada novo, não arredonde diferente do que já está escrito, não converta nem estime.
- NUNCA invente um valor, uma categoria ou uma porcentagem que não esteja listada acima.
- Se um fato não tem dado suficiente (ex.: "sem base de comparação" ou "nenhum gasto registrado"), diga isso em vez de inventar um número.
- Não é preciso citar todos os números — escolha o que mais importa para contar a história do mês, mas nunca cite um número que não veio da lista acima."""


# --- orquestração -------------------------------------------------------


def run_insight(
    *,
    settings: Settings,
    competence: str | None = None,
    ler: Callable[[str], dict] | None = None,
    gerar: Callable[[str], str] | None = None,
    publicar: Callable[[str, str, str], Any] | None = None,
) -> tuple[str, str]:
    """Lê os números, gera a leitura, publica. Devolve (competência, texto).

    Os três passos são injetáveis: é o que permite testar a ORDEM e os casos
    degenerados sem tocar Ollama nem rede.
    """
    comp = competence or competencia_atual()
    if not competencia_valida(comp):
        raise ValueError(f"competência inválida (esperado YYYY-MM): {comp}")

    _ler = ler or (
        lambda c: ramielle.fetch_numbers(
            base_url=settings.ramielle_url,
            token=settings.ingest_token,
            competence=c,
        )
    )
    _gerar = gerar or (
        lambda p: ollama.generate(
            model=settings.ollama_model, prompt=p, base_url=settings.ollama_url
        )
    )
    _publicar = publicar or (
        lambda texto, modelo, periodo: ramielle.post_insight(
            base_url=settings.ramielle_url,
            token=settings.ingest_token,
            texto=texto,
            modelo=modelo,
            periodo=periodo,
        )
    )

    numbers = _ler(comp)
    texto = _gerar(build_prompt(numbers)).strip()

    if texto == "":
        raise InsightVazio(
            "o modelo devolveu texto vazio — nada foi publicado. "
            "Publicar um insight em branco pareceria sucesso e deixaria o card "
            "vazio na tela sem explicação"
        )

    try:
        _publicar(texto, settings.ollama_model, comp)
    except ramielle.RamielleError as err:
        raise PublicacaoFalhou(texto, err) from err

    return comp, texto


# --- rota ---------------------------------------------------------------

router = APIRouter()


class InsightBody(BaseModel):
    competence: str | None = None


def _erro(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"ok": False, "code": code, "message": message}
    )


@router.post("/insight")
def gerar_insight(body: InsightBody, request: Request):
    settings: Settings = request.app.state.settings
    try:
        competence, texto = run_insight(
            settings=settings, competence=body.competence
        )
    except ValueError as err:
        return _erro(422, "invalid_competence", str(err))
    except InsightVazio as err:
        return _erro(502, "empty_insight", str(err))
    except PublicacaoFalhou as err:
        # Devolve o texto no corpo do erro: quem chamou pode republicar sem
        # gastar outra rodada de modelo. Precisa vir ANTES dos ramos de
        # RamielleError — PublicacaoFalhou não herda deles de propósito, mas
        # a ordem deixa a intenção explícita pra quem lê.
        return JSONResponse(
            status_code=502,
            content={
                "ok": False,
                "code": "publish_failed",
                "message": str(err),
                "data": {"texto": err.texto},
            },
        )
    except ollama.OllamaModelMissing as err:
        return _erro(503, "ollama_model_missing", str(err))
    except ollama.OllamaUnreachable as err:
        # 503, não 502: o promeia está de pé, o Ollama não. Quem chama precisa
        # dessa distinção pra dizer "abra o Ollama" em vez de "suba o promeia".
        return _erro(503, "ollama_unreachable", str(err))
    except ollama.OllamaFailed as err:
        return _erro(502, "ollama_failed", str(err))
    except ramielle.RamielleUnreachable as err:
        return _erro(502, "ramielle_unreachable", str(err))
    except ramielle.RamielleRefused as err:
        return _erro(502, "ramielle_refused", str(err))

    return {
        "ok": True,
        "data": {"competence": competence, "texto": texto,
                 "modelo": settings.ollama_model},
    }
```

- [ ] **Step 4: Montar o router no `app.py`**

Em `apps/promeia/src/promeia/app.py`, acrescentar o import e a linha de montagem:

```python
from promeia.insight import router as insight_router
```

e, dentro de `create_app`, depois de `app.state.settings = cfg`:

```python
    app.include_router(insight_router)
```

- [ ] **Step 5: Rodar a suíte inteira e confirmar que passa**

Run: `cd apps/promeia && uv run pytest`
Expected: PASS. O `test_TODA_rota_registrada_recusa_sem_token` (Task 1) agora enumera **duas** rotas (`/health` e `/insight`) e exige 401 nas duas — sem nenhuma edição naquele teste. Se ele continuar vendo só uma rota, o router não foi montado.

- [ ] **Step 6: Verificar por mutação — o prompt precisa estar preso ao formatador**

Troque, em `_linha_categoria`, `format_brl(abs(row['total_cents']))` por `row['total_cents']` e rode.
Expected: **falham** `test_nenhum_centavo_cru_aparece_no_prompt` e `test_as_categorias_saem_na_ordem_recebida_e_numeradas`.
Reverta e confirme `git diff` limpo.

- [ ] **Step 7: Formatar, lintar e commitar**

```bash
cd apps/promeia && uv run ruff format . && uv run ruff check . && uv run pytest
git add apps/promeia/src/promeia/insight.py apps/promeia/src/promeia/insight_test.py \
        apps/promeia/src/promeia/app.py
git commit -m "feat(promeia): insight portado do CLI Node (prompt, orquestracao e rota)"
```

---

### Task 6: CLI `promeia-insight`, rodada real, apagar o CLI Node e documentar

Fecha a fatia. **Não apague o `insight.mjs` antes do Step 6** — a prova contra o Ollama e a API reais é o que autoriza a remoção.

**Files:**

- Create: `apps/promeia/src/promeia/cli.py`
- Create: `apps/promeia/src/promeia/cli_test.py`
- Create: `apps/promeia/CLAUDE.md`
- Delete: `apps/financas/scripts/insight.mjs`
- Delete: `apps/financas/scripts/insight.test.mjs`
- Modify: `apps/financas/package.json` (remover o script `insight`)
- Modify: `apps/financas/CLAUDE.md` (a seção do comando do Mac aponta pro promeia)
- Modify: `CLAUDE.md` (raiz — tabela de workspaces, tech stack, comandos)
- Modify: `Makefile` (alvo `insight`)

**Interfaces:**

- Consumes: `promeia.config.load_settings`/`ConfigError`, `promeia.insight.run_insight`/`InsightVazio`, `promeia.ollama.OllamaError`, `promeia.ramielle.RamielleError`.
- Produces: `promeia.cli.main(argv: list[str] | None = None) -> int` — o console script declarado em `[project.scripts]` na Task 1.

- [ ] **Step 1: Escrever os testes do CLI (falhando)**

`apps/promeia/src/promeia/cli_test.py`:

```python
import pytest

from promeia.cli import main
from promeia.insight import InsightVazio, PublicacaoFalhou
from promeia.ollama import OllamaUnreachable
from promeia.ramielle import RamielleRefused

ENV = {"PROMEIA_TOKEN": "x", "INGEST_TOKEN": "ingest"}


def capture():
    saida, erros = [], []
    return saida, erros, saida.append, erros.append


def test_help_sai_zero_e_nao_roda_nada():
    saida, erros, log, log_erro = capture()
    tocou = []
    codigo = main(
        ["--help"], env=ENV, log=log, log_erro=log_erro,
        executar=lambda **kw: tocou.append(kw),
    )
    assert codigo == 0
    assert tocou == []
    assert any("Uso:" in linha for linha in saida)


def test_opcao_desconhecida_sai_dois():
    saida, erros, log, log_erro = capture()
    codigo = main(
        ["--inventada"], env=ENV, log=log, log_erro=log_erro,
        executar=lambda **kw: None,
    )
    assert codigo == 2


def test_sem_ingest_token_falha_antes_de_qualquer_rede():
    saida, erros, log, log_erro = capture()
    tocou = []
    codigo = main(
        [], env={"PROMEIA_TOKEN": "x"}, log=log, log_erro=log_erro,
        executar=lambda **kw: tocou.append(kw),
    )
    assert codigo == 1
    assert tocou == []
    assert any("INGEST_TOKEN" in linha for linha in erros)
    assert any("wrangler secret put" in linha for linha in erros)


def test_sem_promeia_token_explica_e_nao_estoura_stack():
    saida, erros, log, log_erro = capture()
    codigo = main([], env={}, log=log, log_erro=log_erro, executar=lambda **kw: None)
    assert codigo == 1
    assert any("PROMEIA_TOKEN" in linha for linha in erros)


def test_caminho_feliz_imprime_o_texto_e_sai_zero():
    saida, erros, log, log_erro = capture()
    codigo = main(
        ["--competencia", "2026-07"], env=ENV, log=log, log_erro=log_erro,
        executar=lambda **kw: ("2026-07", "A leitura do mês."),
    )
    assert codigo == 0
    assert any("A leitura do mês." in linha for linha in saida)
    assert any("publicado com sucesso" in linha for linha in saida)


def test_a_competencia_da_flag_chega_no_executar():
    visto = {}

    def executar(**kw):
        visto.update(kw)
        return ("2026-05", "t")

    main(["--competencia", "2026-05"], env=ENV, log=lambda _: None,
         log_erro=lambda _: None, executar=executar)
    assert visto["competence"] == "2026-05"


def test_ollama_desligado_sai_um_com_a_mensagem_util():
    saida, erros, log, log_erro = capture()
    codigo = main(
        [], env=ENV, log=log, log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(
            OllamaUnreachable('inicie com "ollama serve"')
        ),
    )
    assert codigo == 1
    assert any("ollama serve" in linha for linha in erros)


def test_texto_vazio_sai_um_e_nao_finge_sucesso():
    saida, erros, log, log_erro = capture()
    codigo = main(
        [], env=ENV, log=log, log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(InsightVazio("vazio")),
    )
    assert codigo == 1
    assert not any("sucesso" in linha for linha in saida)


def test_falha_de_rede_na_leitura_sai_um():
    saida, erros, log, log_erro = capture()
    codigo = main(
        [], env=ENV, log=log, log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(RamielleRefused("recusou")),
    )
    assert codigo == 1
    assert any("recusou" in linha for linha in erros)


def test_falha_ao_publicar_imprime_o_texto_gerado():
    # Sem isto, o texto que custou uma rodada de modelo some porque a rede
    # oscilou — e o dono não tem nem como republicar à mão.
    saida, erros, log, log_erro = capture()
    codigo = main(
        [], env=ENV, log=log, log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(
            PublicacaoFalhou("o texto caro", RamielleRefused("caiu"))
        ),
    )
    assert codigo == 1
    assert any("NÃO publicado" in linha for linha in erros)
    assert any("o texto caro" in linha for linha in erros)
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd apps/promeia && uv run pytest src/promeia/cli_test.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'promeia.cli'`

- [ ] **Step 3: Implementar o `cli.py`**

```python
"""Entrypoint `promeia-insight` — o que o dono roda no Mac.

⚠️ Nada precisa continuar rodando depois. O Ollama só precisa estar de pé
DURANTE a execução; quando o comando termina, pode fechar o terminal e a
tampa. A tela lê o que já foi publicado no D1 e continua funcionando igual.

Enquanto o ramielle não tiver como chamar a rota POST /insight (o que depende
do hostname do promeia, e portanto de a API Go sair do ar), este comando é o
gatilho — exatamente como o CLI Node que ele substitui.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Mapping

from promeia.config import ConfigError, load_settings
from promeia.insight import InsightVazio, PublicacaoFalhou, run_insight
from promeia.ollama import OllamaError
from promeia.ramielle import RamielleError

USO = """Uso: promeia-insight [opções]

Lê os números já calculados de uma competência, manda pro Ollama local
escrever uma leitura em texto por cima deles, e publica o resultado no
ramielle. NÃO envia nenhum lançamento cru pro modelo — só os totais
agregados que a API já calculou.

Opções:
  --competencia <YYYY-MM>  Competência a resumir (default: mês corrente, fuso de Teresina)
  --help, -h               Mostra esta ajuda

Requisitos:
  - Ollama rodando localmente (ollama serve) com o modelo instalado
  - PROMEIA_TOKEN e INGEST_TOKEN no ambiente (ver apps/promeia/.env.example)
"""


def main(
    argv: list[str] | None = None,
    *,
    env: Mapping[str, str] | None = None,
    log: Callable[[str], None] = print,
    log_erro: Callable[[str], None] = lambda m: print(m, file=sys.stderr),
    executar: Callable[..., tuple[str, str]] | None = None,
) -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--competencia", "--competence", dest="competencia")
    parser.add_argument("--help", "-h", dest="ajuda", action="store_true")

    try:
        args, sobra = parser.parse_known_args(argv if argv is not None else sys.argv[1:])
    except SystemExit:
        log_erro("erro: argumentos inválidos")
        log(USO)
        return 2

    if args.ajuda:
        log(USO)
        return 0
    if sobra:
        log_erro(f"erro: opção desconhecida: {sobra[0]}")
        log(USO)
        return 2

    try:
        settings = load_settings(env)
    except ConfigError as err:
        log_erro(f"erro: {err}")
        return 1

    if not settings.ingest_token:
        log_erro(
            "erro: a variável de ambiente INGEST_TOKEN não está definida — este "
            "comando não tem como se autenticar no ramielle.\n"
            "      Defina antes de rodar, com o MESMO valor configurado no "
            'servidor via "wrangler secret put INGEST_TOKEN"\n'
            "      (ou a chave INGEST_TOKEN de apps/financas/.dev.vars em "
            "desenvolvimento). Ex.: export INGEST_TOKEN=..."
        )
        return 1

    rodar = executar or run_insight

    log(f"==> buscando os números em {settings.ramielle_url}")
    log(
        f"==> consultando o Ollama (modelo {settings.ollama_model}, "
        f"{settings.ollama_url}) — pode levar alguns segundos"
    )
    try:
        competence, texto = rodar(
            settings=settings, competence=args.competencia
        )
    except ValueError as err:
        log_erro(f"erro: {err}")
        log(USO)
        return 2
    except PublicacaoFalhou as err:
        # O texto existe e não foi publicado. Imprimi-lo é o que separa
        # "perdi o trabalho" de "posso republicar isto à mão" — o CLI Node
        # que este substitui fazia exatamente isso.
        log_erro(f"erro: {err}")
        log_erro("--- texto gerado (NÃO publicado) ---")
        log_erro(err.texto)
        return 1
    except (InsightVazio, OllamaError, RamielleError) as err:
        log_erro(f"erro: {err}")
        return 1

    log("")
    log(f"==> insight de {competence} publicado com sucesso")
    log("")
    log(texto)
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd apps/promeia && uv run pytest src/promeia/cli_test.py`
Expected: PASS (10 testes)

- [ ] **Step 5: Rodar a suíte inteira e o lint**

```bash
cd apps/promeia && uv run ruff format . && uv run ruff check . && uv run pytest
```

Expected: tudo verde. Anote o total no relatório da task — ele vira a linha de base do `CLAUDE.md` do promeia, como as contagens de suíte que os outros workspaces já registram.

- [ ] **Step 6: A rodada real — contra o Ollama e o Worker de verdade (não stubs)**

⚠️ **Este é o passo que autoriza apagar o CLI Node.** Sem ele, a remoção é um salto no escuro.

```bash
# 1. Ollama de pé
ollama serve &

# 2. Worker de finanças local, com a migration 0007 aplicada
pnpm --filter @piluvitu/financas db:migrate:local
pnpm --filter @piluvitu/financas dev &

# 3. O comando, contra o Worker local
cd apps/promeia
PROMEIA_TOKEN=local \
INGEST_TOKEN=<o mesmo de apps/financas/.dev.vars> \
RAMIELLE_URL=http://localhost:8787 \
OLLAMA_MODEL=qwen2.5:7b-instruct \
uv run promeia-insight --competencia 2026-07
```

Confirmar, e **registrar a saída no relatório da task**:

1. O texto sai e cita **só** números que existem no banco local (conferir com `wrangler d1 execute piluvitu-financas --local --command "SELECT * FROM insights ORDER BY generated_at DESC LIMIT 1;"`).
2. A linha foi de fato gravada em `insights`.

E os quatro caminhos de erro, **contra os serviços reais**:

```bash
# Ollama desligado (porta fechada de propósito)
OLLAMA_URL=http://127.0.0.1:59999 ... uv run promeia-insight
# → "não consegui conectar ao Ollama ... ollama serve"

# Modelo inexistente
OLLAMA_MODEL=fantasma-que-nao-existe ... uv run promeia-insight
# → "ollama pull fantasma-que-nao-existe"

# Token errado
INGEST_TOKEN=errado ... uv run promeia-insight
# → 401 citando INGEST_TOKEN e "wrangler secret put"

# API inalcançável
RAMIELLE_URL=http://127.0.0.1:59998 ... uv run promeia-insight
# → "não consegui alcançar a API"
```

⚠️ Se qualquer uma das quatro mensagens sair como stack trace ou erro cru da biblioteca, **pare e corrija antes de seguir** — a mensagem é o produto.

- [ ] **Step 7: Apagar o CLI Node e seus vestígios**

```bash
git rm apps/financas/scripts/insight.mjs apps/financas/scripts/insight.test.mjs
```

Em `apps/financas/package.json`, remover a linha do script `insight`:

```diff
-    "insight": "node scripts/insight.mjs",
```

⚠️ **Não toque em `test:pdf-import` nem em `vitest.scripts.config.ts`** — o mesmo config cobre `scripts/**/*.test.mjs`, e `pdf-import.test.mjs` (77 testes) continua lá. Confirmar depois da remoção:

```bash
pnpm --filter @piluvitu/financas run test:pdf-import
```

Expected: **77 testes**, não 117 (os 40 do insight saíram junto com o arquivo). Um número diferente de 77 significa que algo mais foi removido por engano.

- [ ] **Step 8: Alvo `insight` no `Makefile`**

Acrescentar ao `.PHONY` da primeira linha: `insight`.

```makefile
# Gera e publica o insight financeiro. Exige Ollama de pé e PROMEIA_TOKEN +
# INGEST_TOKEN no ambiente. Nada precisa continuar rodando depois.
insight:
	cd apps/promeia && uv run promeia-insight
```

- [ ] **Step 9: Escrever o `apps/promeia/CLAUDE.md`**

Deve cobrir, cada fato uma vez só (regra da raiz — não duplicar o que já mora em outro `CLAUDE.md`):

- **O que o promeia é e a regra de corte:** _este trabalho precisa de GPU, modelo local ou acesso a arquivo em disco?_ Sim ⇒ promeia. Não ⇒ ramielle. ⚠️ "tem a ver com AI" **não** é o critério — publicar no dev.to é HTTP para API externa, e é ramielle.
- **O Mac empurra, o app lê.** Por que o promeia não é onde a verdade mora.
- **`PROMEIA_TOKEN` em toda rota, por middleware, e o serviço recusa subir sem ele** — com o motivo (o túnel torna isto alcançável pela internet; sem token é GPU grátis publicada) e o teste que prova (`test_TODA_rota_registrada_recusa_sem_token`, que cobre rota nova sozinho).
- **Toolchain:** uv, `uv.lock` commitado, `--frozen` no CI, pytest com `python_files = ["*_test.py"]` **por causa da lei de colocation** (o default `test_*.py` briga com ela).
- **Comandos:** `make dev-promeia` (uvicorn na 8082), `make test-promeia`, `make lint-promeia`, `make insight`.
- **⚠️ Pendências do dono**, sem rodeio:
  - `PROMEIA_TOKEN` gerado (`openssl rand -base64 32`) e no ambiente.
  - **O hostname `promeia.piluvitu.com.br` ainda é da API Go** (`NEXT_PUBLIC_API_URL` na Vercel + redirect URI no Google Console). O promeia só o assume quando a Go sair do ar, o que depende do ramielle. Até lá o promeia **não recebe requisição** — só empurra.
  - `process-compose.yaml` puxa `qwen2.5:14b-instruct`, que **não está instalado**; `make stack` baixaria ~9 GB.
- **Erros são o produto:** as quatro mensagens medidas (Ollama desligado, modelo ausente, API inalcançável, API recusou), e a distinção §5 entre "não alcancei" e "alcancei e falhou".

- [ ] **Step 10: Atualizar o `CLAUDE.md` da raiz**

Três lugares, mínimo necessário (o detalhe mora no `CLAUDE.md` do workspace):

1. **Tabela de workspaces** no topo — linha nova:

   | `apps/promeia` | `apps/promeia/CLAUDE.md` | Serviço Python local (FastAPI): o que exige GPU, modelo local ou arquivo em disco. Insight financeiro; PDF/transcrição depois |

2. **Tech Stack** — bullet novo dizendo que existe uma **segunda linguagem** no monorepo (Python 3.13 + uv), com o custo aceito (segundo toolchain, segundo runner, segundo job de CI, segunda política de dependência) e o motivo (Whisper/pdfplumber/OCR são Python de referência; Go foi descartado por ser a linguagem que está saindo).

3. **Tabela de comandos** — `make dev-promeia`, `make test-promeia`, `make lint-promeia`, `make insight`. E anotar que `make test`/`make lint` agora incluem o promeia.

⚠️ **Acrescentar à seção _Dependency security policy_** que ela é sobre **pnpm** e que o lado Python tem regras próprias: `uv.lock` commitado, `uv sync --frozen` no CI, e **não existe equivalente ao `minimumReleaseAge`** — dependência nova em Python precisa de conferência manual da idade da versão antes de entrar.

- [ ] **Step 11: Atualizar o `apps/financas/CLAUDE.md`**

Na seção _O comando do Mac (Task 4 — `scripts/insight.mjs`)_: o CLI Node **não existe mais**. Substituir o corpo por um ponteiro curto ("o comando virou `make insight` / `promeia-insight`, e mora em `apps/promeia` — ver `apps/promeia/CLAUDE.md`"), **preservando** os fatos que continuam sendo do finanças e não do promeia:

- a fronteira do `INGEST_TOKEN` (o que ele abre e o que ele não abre) e os testes de `src/index.test.ts` que a provam;
- as quatro exceções ao middleware global de sessão em `src/index.ts`;
- `requireIngestTokenOrSession` e por que um header presente decide sozinho.

⚠️ **Não apague esses três** — são do Worker, e o Worker não mudou nesta fatia.

- [ ] **Step 12: Verificação final, tudo junto**

```bash
cd apps/promeia && uv run ruff format --check . && uv run ruff check . && uv run pytest
cd ../.. && pnpm --filter @piluvitu/financas run test:pdf-import
pnpm prettier:fix && pnpm lint
make test
git --no-pager status
```

Expected: promeia verde; **77** testes no `test:pdf-import`; `make test` inclui o promeia; nenhum arquivo inesperado modificado.

⚠️ Use `git --no-pager`, **não** o `git` do `rtk` — ele já mostrou a `main` sem merges que existiam.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(promeia): CLI promeia-insight e remocao do CLI Node do insight"
```

---

## Estado ao fim deste plano

**Funciona:** o promeia sobe, recusa toda requisição sem token, e gera+publica o insight contra o Ollama e o Worker reais. O dono roda `make insight` em vez de `pnpm run insight` — mesmo resultado, mesmo fluxo, uma linguagem a menos de CLI Node.

**Não muda:** nenhuma tela, nenhum endpoint do Worker, nenhuma linha da API Go. O `/admin` e a `/votacao` continuam exatamente como estão.

**Fica pendente do dono:** gerar o `PROMEIA_TOKEN`; instalar o `uv`; decidir se corrige o `process-compose.yaml` (que puxa um modelo de 9 GB não instalado).

**Fica pendente de outro plano, nesta ordem:**

1. **ramielle** (§9.4) — o subsistema grande: a API Go reescrita em TS num Worker (auth Google + sessão, votação, admin), CORS e o split de hostname, apagando as 13 rotas mortas de ferramentas. **É ele que libera `promeia.piluvitu.com.br`.**
2. **Cutover do hostname** — o promeia assume `promeia.piluvitu.com.br`; `NEXT_PUBLIC_API_URL` (Vercel) e a redirect URI (Google Console) passam a apontar pro ramielle.
3. **Revisão de artigo em promeia** (§7.2) — `/llm/proofread` e `/llm/refine`, com o porte do `splitBlocks`/`restoreEdges` (o chunking byte-a-byte) e do `/api/chat` do Ollama. Chamado por ramielle, nunca pelo navegador.
4. **Botão do insight no app** (§9.2), com a degradação da §5.
5. **PDF e transcrição** (§9.3).
6. **Allowlist no admin** (§9.5) e, por último e condicional, **aposentar o Go** (§9.6).
