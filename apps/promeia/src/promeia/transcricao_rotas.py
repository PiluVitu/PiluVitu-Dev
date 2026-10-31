"""Rotas HTTP da transcrição: `POST /transcrever` e `GET /transcrever/{id}`.

O POST só grava os áudios e enfileira (202 + job); o GET devolve o estado.
Nenhum dos dois espera o Whisper (ver `transcricao_jobs.py`).

⚠️ **De quem é este contrato.** Chamada pelo **ramielle**, nunca pelo
navegador — mesma regra de `revisao_rotas.py`. A forma de erro é a do promeia
(`{ok, code, message}`); traduzir pro envelope do frontend é trabalho do
Worker.

⚠️ **Multipart, não JSON com base64.** Áudio em base64 infla 33% e passa duas
vezes pela memória do Worker (que tem 128 MB). `UploadFile` transmite o
arquivo como veio.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from promeia import transcricao, transcricao_jobs

router = APIRouter()

# Nome de arquivo vem do cliente: só o basename, e só caracteres inertes.
# Sem isso, um `../../etc/x.ogg` escaparia do diretório do job.
_SEGURO = re.compile(r"[^A-Za-z0-9._-]+")


def _erro(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"ok": False, "code": code, "message": message}
    )


def _nome_seguro(bruto: str | None, indice: int) -> str:
    base = Path(bruto or "").name
    limpo = _SEGURO.sub("_", base).strip("._-")
    return limpo or f"audio-{indice + 1}.bin"


@router.post("/transcrever")
async def rota_transcrever(
    request: Request,
    # `Annotated` em vez de `= File(...)`: chamada em default de argumento é
    # B008 no ruff, e `= []` seria B006. `None` cobre os dois e deixa o 400
    # de corpo vazio ser NOSSO, não o 422 automático do FastAPI.
    audios: Annotated[list[UploadFile] | None, File()] = None,
    termos: Annotated[str, Form()] = "",
    idioma: Annotated[str, Form()] = transcricao.IDIOMA_PADRAO,
    modo: Annotated[str, Form()] = "preciso",
):
    if not audios:
        return _erro(400, "invalid_body", "Envie ao menos um áudio em 'audios'.")
    if len(audios) > transcricao.MAX_AUDIOS:
        return _erro(
            400,
            "too_many_files",
            f"No máximo {transcricao.MAX_AUDIOS} áudios por vez — "
            f"vieram {len(audios)}.",
        )

    modelo = (
        transcricao.MODELO_RAPIDO if modo == "rapido" else transcricao.MODELO_PADRAO
    )

    recebidos: list[tuple[str, bytes]] = []
    total = 0
    for i, upload in enumerate(audios):
        conteudo = await upload.read()
        total += len(conteudo)
        if total > transcricao.MAX_BYTES_TOTAL:
            limite_mb = transcricao.MAX_BYTES_TOTAL // (1024 * 1024)
            return _erro(
                413,
                "audio_too_large",
                f"Os áudios somam mais que o limite de {limite_mb} MB.",
            )
        recebidos.append((_nome_seguro(upload.filename, i), conteudo))

    fila: transcricao_jobs.FilaDeTranscricao = request.app.state.transcricoes
    job = await run_in_threadpool(
        fila.criar, recebidos, modelo=modelo, idioma=idioma, termos=termos
    )
    return JSONResponse(status_code=202, content={"ok": True, "data": job})


@router.get("/transcrever/{job_id}")
def rota_status(request: Request, job_id: str):
    fila: transcricao_jobs.FilaDeTranscricao = request.app.state.transcricoes
    fila.iniciar()
    job = fila.obter(job_id)
    if job is None:
        return _erro(
            404,
            "job_not_found",
            "Transcrição não encontrada — ela pode ter expirado.",
        )
    return JSONResponse(status_code=200, content={"ok": True, "data": job})
