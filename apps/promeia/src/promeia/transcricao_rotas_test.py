import io

import pytest
from fastapi.testclient import TestClient

from promeia import transcricao
from promeia.app import create_app
from promeia.config import Settings

TOKEN = "token-de-teste"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def settings_de_teste() -> Settings:
    return Settings(
        promeia_token=TOKEN,
        ollama_url="http://localhost:11434",
        ollama_model="modelo-do-insight",
        ramielle_url="http://localhost:8787",
        ingest_token="ingest",
    )


@pytest.fixture
def cliente():
    with TestClient(create_app(settings_de_teste())) as c:
        yield c


def falso_executor(monkeypatch, respostas=None, erro=None):
    """Substitui o executor REAL que a rota usa. Nunca chama o binário."""
    vistos: list[dict] = []
    respostas = respostas or ["TEXTO TRANSCRITO"]

    def fn(caminho, modelo, idioma, prompt):
        vistos.append(
            {"nome": caminho.name, "modelo": modelo, "idioma": idioma, "prompt": prompt}
        )
        if erro is not None:
            raise erro
        return respostas[min(len(vistos) - 1, len(respostas) - 1)]

    monkeypatch.setattr(transcricao, "executar_mlx_whisper", fn)
    return vistos


def audio(nome="a.ogg", conteudo=b"fake-audio-bytes"):
    return ("audios", (nome, io.BytesIO(conteudo), "audio/ogg"))


class TestContrato:
    def test_sem_audio_nenhum_e_400(self, cliente, monkeypatch):
        falso_executor(monkeypatch)
        r = cliente.post("/transcrever", headers=AUTH, files=[])
        assert r.status_code == 400
        assert r.json()["code"] == "invalid_body"

    def test_audio_demais_e_400(self, cliente, monkeypatch):
        falso_executor(monkeypatch)
        muitos = [audio(f"a{i}.ogg") for i in range(transcricao.MAX_AUDIOS + 1)]
        r = cliente.post("/transcrever", headers=AUTH, files=muitos)
        assert r.status_code == 400
        assert r.json()["code"] == "too_many_files"

    def test_audio_grande_demais_e_413(self, cliente, monkeypatch):
        falso_executor(monkeypatch)
        gordo = audio("g.ogg", b"x" * (transcricao.MAX_BYTES_TOTAL + 1))
        r = cliente.post("/transcrever", headers=AUTH, files=[gordo])
        assert r.status_code == 413
        assert r.json()["code"] == "audio_too_large"


class TestSucesso:
    def test_devolve_texto_por_audio_e_o_costurado(self, cliente, monkeypatch):
        falso_executor(monkeypatch, respostas=["PRIMEIRO", "SEGUNDO"])
        r = cliente.post(
            "/transcrever", headers=AUTH, files=[audio("a1.ogg"), audio("a2.ogg")]
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert [p["texto"] for p in data["partes"]] == ["PRIMEIRO", "SEGUNDO"]
        assert [p["nome"] for p in data["partes"]] == ["a1.ogg", "a2.ogg"]
        assert "PRIMEIRO" in data["texto"] and "SEGUNDO" in data["texto"]

    def test_encadeia_contexto_entre_os_audios(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch, respostas=["falei de RAMIELLE", "dois"])
        cliente.post(
            "/transcrever", headers=AUTH, files=[audio("a1.ogg"), audio("a2.ogg")]
        )
        assert "Continuação" not in vistos[0]["prompt"]
        assert "falei de RAMIELLE" in vistos[1]["prompt"]

    def test_termos_chegam_no_prompt(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch)
        cliente.post(
            "/transcrever",
            headers=AUTH,
            files=[audio()],
            data={"termos": "CPF, company"},
        )
        assert "CPF, company" in vistos[0]["prompt"]

    def test_modo_rapido_troca_o_modelo(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch)
        cliente.post(
            "/transcrever", headers=AUTH, files=[audio()], data={"modo": "rapido"}
        )
        assert vistos[0]["modelo"] == transcricao.MODELO_RAPIDO

    def test_modo_padrao_e_o_preciso(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch)
        cliente.post("/transcrever", headers=AUTH, files=[audio()])
        assert vistos[0]["modelo"] == transcricao.MODELO_PADRAO


class TestFalhas:
    # 503 vs 502 é a mesma distinção do Ollama: 503 = falta instalar/subir
    # algo no Mac; 502 = rodou e falhou.
    def test_binario_ausente_e_503(self, cliente, monkeypatch):
        falso_executor(
            monkeypatch, erro=transcricao.WhisperIndisponivel("instale o mlx-whisper")
        )
        r = cliente.post("/transcrever", headers=AUTH, files=[audio()])
        assert r.status_code == 503
        assert r.json()["code"] == "whisper_indisponivel"
        assert "mlx-whisper" in r.json()["message"]

    def test_whisper_falhou_e_502(self, cliente, monkeypatch):
        falso_executor(monkeypatch, erro=transcricao.TranscricaoFalhou("deu ruim"))
        r = cliente.post("/transcrever", headers=AUTH, files=[audio()])
        assert r.status_code == 502
        assert r.json()["code"] == "transcricao_falhou"

    def test_saida_vazia_e_502(self, cliente, monkeypatch):
        falso_executor(monkeypatch, respostas=["   "])
        r = cliente.post("/transcrever", headers=AUTH, files=[audio()])
        assert r.status_code == 502
        assert r.json()["code"] == "transcricao_vazia"
