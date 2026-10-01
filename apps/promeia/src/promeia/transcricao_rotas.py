"""Rota HTTP da transcrição: `POST /transcrever`.

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
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from promeia import transcricao

router = APIRouter()

# Nome de arquivo vem do cliente: só o basename, e só caracteres inertes.
# Sem isso, um `../../etc/x.ogg` escaparia do diretório temporário.
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

    with tempfile.TemporaryDirectory() as tmp:
        destino = Path(tmp)
        caminhos: list[Path] = []
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
            caminho = destino / _nome_seguro(upload.filename, i)
            caminho.write_bytes(conteudo)
            caminhos.append(caminho)

        try:
            textos = transcricao.transcrever(
                caminhos,
                # Buscado no MÓDULO (não importado direto) para o teste poder
                # trocar o executor sem tocar no binário.
                executar=transcricao.executar_mlx_whisper,
                modelo=modelo,
                idioma=idioma,
                termos=termos,
            )
        except transcricao.WhisperIndisponivel as err:
            return _erro(503, "whisper_indisponivel", str(err))
        # 503, nunca 502: o túnel troca o corpo de um 502 e a mensagem some
        # (ver "O túnel COME o corpo do 502" no CLAUDE.md).
        except transcricao.TranscricaoVazia as err:
            return _erro(503, "transcricao_vazia", str(err))
        except transcricao.TranscricaoFalhou as err:
            return _erro(503, "transcricao_falhou", str(err))

    partes = [
        {"nome": c.name, "texto": t} for c, t in zip(caminhos, textos, strict=True)
    ]
    total_partes = len(partes)
    costurado = "\n\n".join(
        f"===== ÁUDIO {i + 1} de {total_partes} — {p['nome']} =====\n\n{p['texto']}"
        for i, p in enumerate(partes)
    )

    return JSONResponse(
        status_code=200,
        content={
            "ok": True,
            "data": {"partes": partes, "texto": costurado, "modelo": modelo},
        },
    )
