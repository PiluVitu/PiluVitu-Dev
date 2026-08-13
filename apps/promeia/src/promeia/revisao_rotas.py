"""Rotas HTTP da revisão de artigo: `POST /llm/proofread` e `POST /llm/refine`.

⚠️ **De quem é este contrato.** Estas rotas são chamadas pelo **ramielle**, não
pelo navegador (§3 e §7.2 do spec: o botão no admin chama ramielle, que chama
promeia — o navegador nunca fala com o Mac direto). Então a forma de erro aqui
é a do promeia (`{ok, code, message}`, a mesma de `/insight`), **não** o
envelope `{ok, data, notifications}` que o `apps/web` consome.

Traduzir para o envelope — e para as mensagens genéricas que o Go emitia
(`"LLM local indisponível (Ollama offline)."`) — é trabalho do **ramielle**, na
fatia seguinte. Fazer aqui inverteria a camada e obrigaria o promeia a
conhecer o formato do frontend.

⚠️ **E as mensagens daqui são melhores que as do Go, de propósito.** O Go
dizia `"Falha ao corrigir o texto."` para qualquer falha. Este serviço já tem
a distinção que o `CLAUDE.md` dele chama de estrutural: `OllamaUnreachable`
("abra o Ollama") nunca se confunde com `OllamaModelMissing` ("ollama pull
X") nem com `OllamaFailed`. Quem traduzir no ramielle deve **preservar** essa
distinção, não achatá-la de volta.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from promeia import ollama, revisao
from promeia.config import Settings

router = APIRouter()


class ProofreadBody(BaseModel):
    text: str = ""
    # Mesmo nome do corpo que o Go já expunha (`{"text":..., "careful":bool}`)
    # — o admin não muda.
    careful: bool = False


class ArtigoBody(BaseModel):
    title: str = ""
    excerpt: str = ""
    url: str = ""
    tags: list[str] = []
    voice_sample: str = ""


class HooksBody(BaseModel):
    article: ArtigoBody = ArtigoBody()
    platforms: list[str] = []


class RefineBody(BaseModel):
    platform: str = ""
    text: str = ""
    instruction: str = ""


def _erro(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"ok": False, "code": code, "message": message}
    )


def _traduzir_falha_do_ollama(err: Exception) -> JSONResponse:
    """As três falhas do Ollama, cada uma com seu status e sua ação.

    ⚠️ 503 vs. 502 não é estilo: 503 = o promeia está de pé e o Ollama não
    (suba o Ollama); 502 = o Ollama respondeu e falhou (o gargalo é outro).
    Colapsar os dois manda o dono conferir a coisa errada.
    """
    if isinstance(err, ollama.OllamaModelMissing):
        return _erro(503, "ollama_model_missing", str(err))
    if isinstance(err, ollama.OllamaUnreachable):
        return _erro(503, "ollama_unreachable", str(err))
    return _erro(502, "ollama_failed", str(err))


@router.post("/llm/proofread")
def rota_proofread(body: ProofreadBody, request: Request):
    if not body.text:
        return _erro(400, "invalid_json", "Corpo inválido: 'text' é obrigatório.")

    settings: Settings = request.app.state.settings
    try:
        corrigido = revisao.proofread(
            body.text,
            careful=body.careful,
            chat=ollama.chat,
            model_proofread=settings.model_proofread,
            model_proofread_careful=settings.model_proofread_careful,
            base_url=settings.ollama_url,
        )
    except ollama.OllamaError as err:
        return _traduzir_falha_do_ollama(err)

    return JSONResponse(
        status_code=200, content={"ok": True, "data": {"corrected": corrigido}}
    )


@router.post("/llm/refine")
def rota_refine(body: RefineBody, request: Request):
    if not body.text:
        return _erro(400, "invalid_json", "Corpo inválido: 'text' é obrigatório.")

    settings: Settings = request.app.state.settings
    try:
        refinado = revisao.refine(
            body.platform,
            body.text,
            body.instruction,
            chat=ollama.chat,
            model_hooks=settings.model_hooks,
            base_url=settings.ollama_url,
        )
    except ollama.OllamaError as err:
        return _traduzir_falha_do_ollama(err)

    return JSONResponse(
        status_code=200, content={"ok": True, "data": {"refined": refinado}}
    )


@router.post("/llm/hooks")
def rota_hooks(body: HooksBody, request: Request):
    """Gera uma chamada social por plataforma (porte de `GenerateHooks`).

    ⚠️ Só a GERAÇÃO mora aqui. PUBLICAR em dev.to/Hashnode/Bluesky/Mastodon é
    HTTP pra API de terceiro — não precisa de GPU nem de disco local, então é
    ramielle pela regra de corte deste serviço, mesmo o texto tendo saído de
    um LLM em outra etapa do fluxo.
    """
    if not body.platforms:
        return _erro(400, "invalid_json", "Corpo inválido: 'platforms' é obrigatório.")

    settings: Settings = request.app.state.settings
    artigo = revisao.Artigo(
        title=body.article.title,
        excerpt=body.article.excerpt,
        url=body.article.url,
        tags=body.article.tags,
        voice_sample=body.article.voice_sample,
    )
    try:
        chamadas = revisao.gerar_hooks(
            artigo,
            body.platforms,
            chat=ollama.chat,
            model_hooks=settings.model_hooks,
            base_url=settings.ollama_url,
        )
    except ollama.OllamaError as err:
        return _traduzir_falha_do_ollama(err)

    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "data": {
                "hooks": [{"platform": c.platform, "text": c.text} for c in chamadas]
            },
        },
    )
