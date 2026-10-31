import json
import time
from datetime import UTC, datetime, timedelta

import pytest

from promeia import transcricao
from promeia.transcricao_jobs import (
    ERRO_REINICIADO,
    FilaDeTranscricao,
    diretorio_padrao,
)

ID_A = "a" * 32
ID_B = "b" * 32


class Relogio:
    def __init__(self):
        self.agora = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)

    def __call__(self):
        return self.agora


def job_no_disco(base, job_id, status, atualizado_em, *, com_audio=True):
    base.mkdir(parents=True, exist_ok=True)
    job = {
        "id": job_id,
        "status": status,
        "posicao": None,
        "parte_atual": 0,
        "total_partes": 1,
        "nome_atual": "a.ogg" if status == "transcrevendo" else None,
        "modelo": transcricao.MODELO_PADRAO,
        "criado_em": atualizado_em.isoformat(),
        "atualizado_em": atualizado_em.isoformat(),
        "resultado": None,
        "erro": None,
        "_entrada": {"nomes": ["a.ogg"], "idioma": "pt", "termos": ""},
    }
    (base / f"{job_id}.json").write_text(json.dumps(job), encoding="utf-8")
    if com_audio:
        (base / job_id / "0").mkdir(parents=True)
        (base / job_id / "0" / "a.ogg").write_bytes(b"x")
    return job


@pytest.fixture
def fila_viva():
    criadas: list[FilaDeTranscricao] = []

    def criar(base, **kw):
        f = FilaDeTranscricao(base, **kw)
        criadas.append(f)
        return f

    yield criar
    for f in criadas:
        f.parar()


def esperar(fila, job_id, limite=5.0):
    fim = time.monotonic() + limite
    while time.monotonic() < fim:
        job = fila.obter(job_id)
        if job and job["status"] in ("pronto", "falhou"):
            return job
        time.sleep(0.01)
    raise AssertionError(fila.obter(job_id))


class TestPromeiaReiniciado:
    @pytest.mark.parametrize("status", ["na_fila", "transcrevendo"])
    def test_job_interrompido_vira_falha_com_mensagem_clara(
        self, tmp_path, fila_viva, status
    ):
        relogio = Relogio()
        job_no_disco(tmp_path, ID_A, status, relogio.agora - timedelta(minutes=3))

        fila = fila_viva(tmp_path, agora=relogio)
        fila.iniciar()

        job = fila.obter(ID_A)
        assert job["status"] == "falhou"
        assert job["erro"] == {
            "code": "promeia_reiniciado",
            "message": (
                "O promeia reiniciou no meio da transcrição. Envie os áudios de novo."
            ),
        }
        assert job["erro"] == ERRO_REINICIADO
        assert job["nome_atual"] is None
        assert not (tmp_path / ID_A).exists(), "os áudios do job perdido ficaram"
        no_disco = json.loads((tmp_path / f"{ID_A}.json").read_text())
        assert no_disco["status"] == "falhou"

    def test_job_terminado_sobrevive_ao_reinicio(self, tmp_path, fila_viva):
        relogio = Relogio()
        job = job_no_disco(tmp_path, ID_A, "pronto", relogio.agora, com_audio=False)
        job["resultado"] = {"partes": [], "texto": "OI", "modelo": "m"}
        (tmp_path / f"{ID_A}.json").write_text(json.dumps(job))

        fila = fila_viva(tmp_path, agora=relogio)
        fila.iniciar()

        assert fila.obter(ID_A)["resultado"]["texto"] == "OI"

    def test_json_corrompido_e_descartado_sem_derrubar_a_subida(
        self, tmp_path, fila_viva
    ):
        tmp_path.mkdir(exist_ok=True)
        (tmp_path / f"{ID_A}.json").write_text("{meio json")
        (tmp_path / ".job-x.tmp").write_text("sobra de escrita interrompida")

        fila = fila_viva(tmp_path)
        fila.iniciar()

        assert fila.obter(ID_A) is None
        assert not (tmp_path / f"{ID_A}.json").exists()
        assert list(tmp_path.glob(".job-*.tmp")) == []

    def test_pasta_de_audio_orfa_e_apagada(self, tmp_path, fila_viva):
        (tmp_path / ID_B / "0").mkdir(parents=True)
        (tmp_path / ID_B / "0" / "a.ogg").write_bytes(b"x")

        fila_viva(tmp_path).iniciar()

        assert not (tmp_path / ID_B).exists()


class TestExpiracao:
    def test_terminado_ha_mais_de_24h_some_na_subida(self, tmp_path, fila_viva):
        relogio = Relogio()
        velho = relogio.agora - timedelta(hours=24, minutes=1)
        recente = relogio.agora - timedelta(hours=23)
        job_no_disco(tmp_path, ID_A, "pronto", velho, com_audio=False)
        job_no_disco(tmp_path, ID_B, "falhou", recente, com_audio=False)

        fila_viva(tmp_path, agora=relogio).iniciar()

        assert not (tmp_path / f"{ID_A}.json").exists()
        assert (tmp_path / f"{ID_B}.json").exists()

    def test_expira_ao_criar_job_novo(self, tmp_path, fila_viva, monkeypatch):
        monkeypatch.setattr(transcricao, "executar_mlx_whisper", lambda *a: "ok")
        relogio = Relogio()
        fila = fila_viva(tmp_path, agora=relogio)
        antigo = fila.criar([("a.ogg", b"x")], modelo="m", idioma="pt", termos="")
        assert esperar(fila, antigo["id"])["status"] == "pronto"

        relogio.agora += timedelta(hours=25)
        fila.criar([("b.ogg", b"x")], modelo="m", idioma="pt", termos="")

        assert fila.obter(antigo["id"]) is None
        assert not (tmp_path / f"{antigo['id']}.json").exists()


class TestObter:
    def test_id_malformado_nao_toca_no_disco(self, tmp_path, fila_viva):
        fila = fila_viva(tmp_path)
        fila.iniciar()
        assert fila.obter("../../etc/passwd") is None
        assert fila.obter("A" * 32) is None
        assert fila.obter("a" * 32 + "\n") is None

    def test_estado_interno_nao_vaza(self, tmp_path, fila_viva, monkeypatch):
        monkeypatch.setattr(transcricao, "executar_mlx_whisper", lambda *a: "ok")
        fila = fila_viva(tmp_path)
        job = fila.criar([("a.ogg", b"x")], modelo="m", idioma="pt", termos="seg")
        assert "_entrada" not in job
        assert "_entrada" not in esperar(fila, job["id"])


class TestDiretorioPadrao:
    def test_env_sobrescreve(self, monkeypatch, tmp_path):
        monkeypatch.setenv("TRANSCRICAO_DIR", str(tmp_path / "x"))
        assert diretorio_padrao() == tmp_path / "x"

    def test_sem_env_fica_no_application_support(self, monkeypatch):
        monkeypatch.delenv("TRANSCRICAO_DIR", raising=False)
        assert diretorio_padrao().parts[-3:] == (
            "Application Support",
            "promeia",
            "transcricoes",
        )


class TestAudiosSomemAntesDoFim:
    # Um GET que chega logo depois do status virar terminal não pode achar a
    # pasta de áudio ainda no disco: era essa janela que deixava instáveis os
    # testes de rota que conferem a limpeza.
    @pytest.mark.parametrize("falha", [False, True])
    def test_status_terminal_so_e_gravado_com_os_audios_ja_apagados(
        self, tmp_path, fila_viva, monkeypatch, falha
    ):
        def executar(*_a):
            if falha:
                raise RuntimeError("whisper quebrou")
            return "ok"

        monkeypatch.setattr(transcricao, "executar_mlx_whisper", executar)
        fila = fila_viva(tmp_path)
        gravacoes: list[tuple[str, bool]] = []
        salvar_original = fila._salvar

        def salvar_espiando(job):
            gravacoes.append((job["status"], (tmp_path / job["id"]).exists()))
            salvar_original(job)

        monkeypatch.setattr(fila, "_salvar", salvar_espiando)

        job = fila.criar([("a.ogg", b"x")], modelo="m", idioma="pt", termos="")
        final = esperar(fila, job["id"])

        assert final["status"] == ("falhou" if falha else "pronto")
        terminais = [
            existe for status, existe in gravacoes if status in ("pronto", "falhou")
        ]
        assert terminais == [False]


class TestErroDepoisDoWhisper:
    # Uma exceção depois de o Whisper terminar (ao costurar, ao gravar) escapava
    # de _processar e deixava o job em "transcrevendo" até o próximo reinício —
    # e a tela fazendo polling para sempre num áudio longo.
    def test_job_vira_falhou_em_vez_de_ficar_preso(
        self, tmp_path, fila_viva, monkeypatch
    ):
        monkeypatch.setattr(transcricao, "executar_mlx_whisper", lambda *_a: "ok")

        def quebra(_partes):
            raise RuntimeError("costura quebrou")

        monkeypatch.setattr("promeia.transcricao_jobs.costurar", quebra)
        fila = fila_viva(tmp_path)

        job = fila.criar([("a.ogg", b"x")], modelo="m", idioma="pt", termos="")
        final = esperar(fila, job["id"])

        assert final["status"] == "falhou"
        assert final["erro"]["code"] == "transcricao_falhou"
        assert not (tmp_path / job["id"]).exists()
