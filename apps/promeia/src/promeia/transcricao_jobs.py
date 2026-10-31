"""Fila de transcrições: um job por vez, numa thread, com o estado em disco.

O request HTTP só grava os áudios e devolve o id; o Whisper roda aqui. Assim
nenhum request passa do corte de ~100 s da Cloudflare, por maior que seja o
áudio (ver "Transcrição de áudio" no CLAUDE.md).

Layout no disco: `<base>/<id>.json` (o job) e `<base>/<id>/<n>/<nome>` (os
áudios, um subdiretório por posição para dois `a.ogg` não se sobrescreverem).
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import tempfile
import threading
import uuid
from collections import deque
from collections.abc import Callable, Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path

from promeia import transcricao

logger = logging.getLogger(__name__)

ID_VALIDO = re.compile(r"[0-9a-f]{32}")
EXPIRA_EM = timedelta(hours=24)

NA_FILA = "na_fila"
TRANSCREVENDO = "transcrevendo"
PRONTO = "pronto"
FALHOU = "falhou"
TERMINADOS = (PRONTO, FALHOU)

ERRO_REINICIADO = {
    "code": "promeia_reiniciado",
    "message": ("O promeia reiniciou no meio da transcrição. Envie os áudios de novo."),
}


def diretorio_padrao() -> Path:
    bruto = os.environ.get("TRANSCRICAO_DIR", "").strip()
    if bruto:
        return Path(bruto).expanduser()
    return Path.home() / "Library" / "Application Support" / "promeia" / "transcricoes"


def costurar(partes: Sequence[dict]) -> str:
    total = len(partes)
    return "\n\n".join(
        f"===== ÁUDIO {i + 1} de {total} — {p['nome']} =====\n\n{p['texto']}"
        for i, p in enumerate(partes)
    )


def _erro_do_whisper(err: Exception) -> dict:
    if isinstance(err, transcricao.WhisperIndisponivel):
        code = "whisper_indisponivel"
    elif isinstance(err, transcricao.TranscricaoVazia):
        code = "transcricao_vazia"
    else:
        code = "transcricao_falhou"
    return {"code": code, "message": str(err) or "A transcrição falhou."}


class FilaDeTranscricao:
    def __init__(
        self,
        base: Path,
        *,
        agora: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._base = base
        self._agora = agora
        self._jobs: dict[str, dict] = {}
        self._fila: deque[str] = deque()
        self._cond = threading.Condition()
        self._parar = False
        self._thread: threading.Thread | None = None

    # ---- ciclo de vida -------------------------------------------------

    def iniciar(self) -> None:
        """Idempotente: recupera o disco e sobe o worker na primeira chamada."""
        with self._cond:
            if self._thread is not None:
                return
            self._base.mkdir(parents=True, exist_ok=True)
            self._recuperar()
            self._expirar()
            self._parar = False
            self._thread = threading.Thread(
                target=self._trabalhar, name="promeia-transcricao", daemon=True
            )
            self._thread.start()

    def parar(self, espera: float = 1.0) -> None:
        with self._cond:
            self._parar = True
            self._cond.notify_all()
            thread, self._thread = self._thread, None
        if thread is not None:
            thread.join(timeout=espera)

    # ---- API usada pela rota -------------------------------------------

    def criar(
        self,
        audios: Sequence[tuple[str, bytes]],
        *,
        modelo: str,
        idioma: str,
        termos: str,
    ) -> dict:
        self.iniciar()
        job_id = uuid.uuid4().hex
        pasta = self._base / job_id
        nomes: list[str] = []
        try:
            for i, (nome, conteudo) in enumerate(audios):
                destino = pasta / str(i)
                destino.mkdir(parents=True)
                (destino / nome).write_bytes(conteudo)
                nomes.append(nome)
        except BaseException:
            self._apagar_audios(job_id)
            raise

        momento = self._iso()
        job = {
            "id": job_id,
            "status": NA_FILA,
            "posicao": None,
            "parte_atual": 0,
            "total_partes": len(nomes),
            "nome_atual": None,
            "modelo": modelo,
            "criado_em": momento,
            "atualizado_em": momento,
            "resultado": None,
            "erro": None,
            "_entrada": {"nomes": nomes, "idioma": idioma, "termos": termos},
        }
        with self._cond:
            self._expirar()
            self._jobs[job_id] = job
            self._salvar(job)
            self._fila.append(job_id)
            self._cond.notify_all()
            return self._publico(job)

    def obter(self, job_id: str) -> dict | None:
        if not ID_VALIDO.fullmatch(job_id):
            return None
        with self._cond:
            job = self._jobs.get(job_id)
            return None if job is None else self._publico(job)

    # ---- worker --------------------------------------------------------

    def _trabalhar(self) -> None:
        while True:
            with self._cond:
                while not self._fila and not self._parar:
                    self._cond.wait()
                if self._parar:
                    return
                job = self._jobs.get(self._fila.popleft())
            if job is None:
                continue
            try:
                self._processar(job)
            except Exception:
                logger.exception("transcrição %s quebrou o worker", job["id"])
                self._apagar_audios(job["id"])
                self._marcar_quebrado(job)
            finally:
                self._apagar_audios(job["id"])

    def _marcar_quebrado(self, job: dict) -> None:
        erro = {"code": "transcricao_falhou", "message": "A transcrição falhou."}
        with self._cond:
            job.update(status=FALHOU, nome_atual=None, erro=erro)
            try:
                self._atualizar(job)
            except OSError:
                logger.exception("não gravei a falha da transcrição %s", job["id"])

    def _processar(self, job: dict) -> None:
        entrada = job["_entrada"]
        caminhos = [
            self._base / job["id"] / str(i) / nome
            for i, nome in enumerate(entrada["nomes"])
        ]
        with self._cond:
            self._atualizar(job, status=TRANSCREVENDO, nome_atual=caminhos[0].name)

        def ao_concluir(feitos: int) -> None:
            proximo = caminhos[feitos].name if feitos < len(caminhos) else None
            with self._cond:
                self._atualizar(job, parte_atual=feitos, nome_atual=proximo)

        try:
            textos = transcricao.transcrever(
                caminhos,
                # Buscado no MÓDULO a cada job para o teste trocar o executor.
                executar=transcricao.executar_mlx_whisper,
                modelo=job["modelo"],
                idioma=entrada["idioma"],
                termos=entrada["termos"],
                ao_concluir=ao_concluir,
            )
        except Exception as err:
            self._apagar_audios(job["id"])
            with self._cond:
                self._atualizar(
                    job, status=FALHOU, nome_atual=None, erro=_erro_do_whisper(err)
                )
            return

        partes = [
            {"nome": c.name, "texto": t} for c, t in zip(caminhos, textos, strict=True)
        ]
        resultado = {
            "partes": partes,
            "texto": costurar(partes),
            "modelo": job["modelo"],
        }
        self._apagar_audios(job["id"])
        with self._cond:
            self._atualizar(job, status=PRONTO, nome_atual=None, resultado=resultado)

    # ---- disco ---------------------------------------------------------

    def _recuperar(self) -> None:
        for sobra in self._base.glob(".job-*.tmp"):
            sobra.unlink(missing_ok=True)
        for arquivo in self._base.glob("*.json"):
            job_id = arquivo.stem
            if not ID_VALIDO.fullmatch(job_id):
                continue
            try:
                job = json.loads(arquivo.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                arquivo.unlink(missing_ok=True)
                self._apagar_audios(job_id)
                continue
            self._jobs[job_id] = job
            if job.get("status") not in TERMINADOS:
                self._atualizar(
                    job, status=FALHOU, nome_atual=None, erro=dict(ERRO_REINICIADO)
                )
        for pasta in self._base.iterdir():
            if pasta.is_dir():
                self._apagar_audios(pasta.name)

    def _expirar(self) -> None:
        limite = self._agora() - EXPIRA_EM
        for job_id, job in list(self._jobs.items()):
            if job["status"] not in TERMINADOS:
                continue
            if datetime.fromisoformat(job["atualizado_em"]) < limite:
                del self._jobs[job_id]
                (self._base / f"{job_id}.json").unlink(missing_ok=True)
                self._apagar_audios(job_id)

    def _atualizar(self, job: dict, **campos) -> None:
        job.update(campos)
        job["atualizado_em"] = self._iso()
        self._salvar(job)

    def _salvar(self, job: dict) -> None:
        fd, tmp = tempfile.mkstemp(dir=self._base, prefix=".job-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(job, f, ensure_ascii=False)
            os.replace(tmp, self._base / f"{job['id']}.json")
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def _apagar_audios(self, job_id: str) -> None:
        shutil.rmtree(self._base / job_id, ignore_errors=True)

    def _publico(self, job: dict) -> dict:
        visivel = {k: v for k, v in job.items() if not k.startswith("_")}
        if job["status"] == NA_FILA and job["id"] in self._fila:
            visivel["posicao"] = list(self._fila).index(job["id"]) + 1
        else:
            visivel["posicao"] = None
        return visivel

    def _iso(self) -> str:
        return self._agora().isoformat()
