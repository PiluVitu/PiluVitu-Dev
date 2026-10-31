import io
import threading
import time

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
def pasta(tmp_path):
    return tmp_path / "transcricoes"


@pytest.fixture
def cliente(pasta):
    with TestClient(create_app(settings_de_teste(), transcricoes_dir=pasta)) as c:
        yield c


def falso_executor(monkeypatch, respostas=None, erro=None):
    """Substitui o executor REAL que a fila usa. Nunca chama o binário."""
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


def esperar(cliente, job_id, status=("pronto", "falhou"), limite=5.0):
    fim = time.monotonic() + limite
    while time.monotonic() < fim:
        r = cliente.get(f"/transcrever/{job_id}", headers=AUTH)
        assert r.status_code == 200, r.text
        job = r.json()["data"]
        if job["status"] in status:
            return job
        time.sleep(0.01)
    raise AssertionError(f"o job {job_id} não chegou em {status}: {job}")


def transcrever_e_esperar(cliente, files, data=None):
    r = cliente.post("/transcrever", headers=AUTH, files=files, data=data or {})
    assert r.status_code == 202, r.text
    return esperar(cliente, r.json()["data"]["id"])


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

    def test_audio_grande_demais_e_413(self, cliente, monkeypatch, pasta):
        falso_executor(monkeypatch)
        gordo = audio("g.ogg", b"x" * (transcricao.MAX_BYTES_TOTAL + 1))
        r = cliente.post("/transcrever", headers=AUTH, files=[gordo])
        assert r.status_code == 413
        assert r.json()["code"] == "audio_too_large"
        assert list(pasta.glob("*.json")) == [], "recusado não pode virar job"

    def test_post_devolve_o_job_na_forma_do_contrato(self, cliente, monkeypatch):
        falso_executor(monkeypatch)
        r = cliente.post("/transcrever", headers=AUTH, files=[audio(), audio("b.ogg")])
        assert r.status_code == 202
        job = r.json()["data"]
        assert set(job) == {
            "id",
            "status",
            "posicao",
            "parte_atual",
            "total_partes",
            "nome_atual",
            "modelo",
            "criado_em",
            "atualizado_em",
            "resultado",
            "erro",
        }
        assert job["total_partes"] == 2
        assert job["modelo"] == transcricao.MODELO_PADRAO

    def test_nome_com_caminho_nao_escapa_do_diretorio(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch)
        job = transcrever_e_esperar(cliente, [audio("../../etc/x.ogg")])
        assert job["status"] == "pronto"
        assert vistos[0]["nome"] == "x.ogg"


class TestStatus:
    def test_id_inexistente_e_404_job_not_found(self, cliente):
        r = cliente.get("/transcrever/" + "a" * 32, headers=AUTH)
        assert r.status_code == 404
        assert r.json() == {
            "ok": False,
            "code": "job_not_found",
            "message": "Transcrição não encontrada — ela pode ter expirado.",
        }

    @pytest.mark.parametrize(
        "malformado",
        ["a.b", "abc", "A" * 32, "a" * 31 + "g", "a" * 33, "%2e%2e", "a" * 32 + "%0A"],
    )
    def test_id_malformado_e_404_sem_tocar_no_disco(self, cliente, malformado):
        r = cliente.get(f"/transcrever/{malformado}", headers=AUTH)
        assert r.status_code == 404
        assert r.json()["code"] == "job_not_found"

    def test_get_sem_token_e_401(self, cliente):
        r = cliente.get("/transcrever/" + "a" * 32)
        assert r.status_code == 401


class TestSucesso:
    def test_devolve_texto_por_audio_e_o_costurado(self, cliente, monkeypatch):
        falso_executor(monkeypatch, respostas=["PRIMEIRO", "SEGUNDO"])
        job = transcrever_e_esperar(cliente, [audio("a1.ogg"), audio("a2.ogg")])
        assert job["status"] == "pronto"
        assert job["parte_atual"] == 2
        assert job["erro"] is None
        data = job["resultado"]
        assert [p["texto"] for p in data["partes"]] == ["PRIMEIRO", "SEGUNDO"]
        assert [p["nome"] for p in data["partes"]] == ["a1.ogg", "a2.ogg"]
        assert "PRIMEIRO" in data["texto"] and "SEGUNDO" in data["texto"]
        assert data["modelo"] == transcricao.MODELO_PADRAO

    def test_dois_audios_com_o_mesmo_nome_nao_se_sobrescrevem(
        self, cliente, monkeypatch
    ):
        lidos: list[bytes] = []

        def fn(caminho, modelo, idioma, prompt):
            lidos.append(caminho.read_bytes())
            return "ok"

        monkeypatch.setattr(transcricao, "executar_mlx_whisper", fn)
        transcrever_e_esperar(cliente, [audio("a.ogg", b"UM"), audio("a.ogg", b"DOIS")])
        assert lidos == [b"UM", b"DOIS"]

    def test_encadeia_contexto_entre_os_audios(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch, respostas=["falei de RAMIELLE", "dois"])
        transcrever_e_esperar(cliente, [audio("a1.ogg"), audio("a2.ogg")])
        assert "Continuação" not in vistos[0]["prompt"]
        assert "falei de RAMIELLE" in vistos[1]["prompt"]

    def test_termos_e_idioma_chegam_no_whisper(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch)
        transcrever_e_esperar(
            cliente, [audio()], data={"termos": "CPF, company", "idioma": "en"}
        )
        assert "CPF, company" in vistos[0]["prompt"]
        assert vistos[0]["idioma"] == "en"

    def test_modo_rapido_troca_o_modelo(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch)
        job = transcrever_e_esperar(cliente, [audio()], data={"modo": "rapido"})
        assert vistos[0]["modelo"] == transcricao.MODELO_RAPIDO
        assert job["modelo"] == transcricao.MODELO_RAPIDO

    def test_modo_padrao_e_o_preciso(self, cliente, monkeypatch):
        vistos = falso_executor(monkeypatch)
        transcrever_e_esperar(cliente, [audio()])
        assert vistos[0]["modelo"] == transcricao.MODELO_PADRAO

    def test_audios_somem_do_disco_quando_o_job_termina(
        self, cliente, monkeypatch, pasta
    ):
        falso_executor(monkeypatch)
        job = transcrever_e_esperar(cliente, [audio()])
        assert not (pasta / job["id"]).exists()
        assert (pasta / f"{job['id']}.json").exists()


class TestFalhas:
    # Falha do Whisper agora é ESTADO do job (status "falhou"), não status HTTP:
    # o GET responde 200 e o `code` de antes vem em `erro`. Mesmos códigos e
    # mensagens que a rota síncrona devolvia.
    def test_binario_ausente_vira_whisper_indisponivel(self, cliente, monkeypatch):
        falso_executor(
            monkeypatch, erro=transcricao.WhisperIndisponivel("instale o mlx-whisper")
        )
        job = transcrever_e_esperar(cliente, [audio()])
        assert job["status"] == "falhou"
        assert job["erro"] == {
            "code": "whisper_indisponivel",
            "message": "instale o mlx-whisper",
        }
        assert job["resultado"] is None

    def test_whisper_falhou_vira_transcricao_falhou(self, cliente, monkeypatch):
        falso_executor(monkeypatch, erro=transcricao.TranscricaoFalhou("deu ruim"))
        job = transcrever_e_esperar(cliente, [audio()])
        assert job["erro"] == {"code": "transcricao_falhou", "message": "deu ruim"}

    def test_saida_vazia_vira_transcricao_vazia(self, cliente, monkeypatch):
        falso_executor(monkeypatch, respostas=["   "])
        job = transcrever_e_esperar(cliente, [audio("mudo.ogg")])
        assert job["erro"]["code"] == "transcricao_vazia"
        assert "mudo.ogg" in job["erro"]["message"]

    def test_falha_tambem_apaga_os_audios(self, cliente, monkeypatch, pasta):
        falso_executor(monkeypatch, erro=transcricao.TranscricaoFalhou("x"))
        job = transcrever_e_esperar(cliente, [audio()])
        assert not (pasta / job["id"]).exists()

    def test_erro_inesperado_nao_derruba_a_fila(self, cliente, monkeypatch):
        falso_executor(monkeypatch, erro=RuntimeError("bug"))
        primeiro = transcrever_e_esperar(cliente, [audio()])
        assert primeiro["erro"]["code"] == "transcricao_falhou"

        falso_executor(monkeypatch, respostas=["voltou"])
        segundo = transcrever_e_esperar(cliente, [audio()])
        assert segundo["status"] == "pronto"


class TestProgresso:
    def test_um_por_vez_com_posicao_e_parte_atual(self, cliente, monkeypatch):
        liberar = [threading.Event() for _ in range(3)]
        chamadas: list[str] = []

        def fn(caminho, modelo, idioma, prompt):
            chamadas.append(caminho.name)
            liberar[len(chamadas) - 1].wait(5)
            return f"texto de {caminho.name}"

        monkeypatch.setattr(transcricao, "executar_mlx_whisper", fn)
        try:
            a = cliente.post(
                "/transcrever", headers=AUTH, files=[audio("a1.ogg"), audio("a2.ogg")]
            ).json()["data"]
            b = cliente.post(
                "/transcrever", headers=AUTH, files=[audio("b1.ogg")]
            ).json()["data"]

            ja = esperar(cliente, a["id"], status=("transcrevendo",))
            assert ja["parte_atual"] == 0
            assert ja["total_partes"] == 2
            assert ja["nome_atual"] == "a1.ogg"
            assert ja["posicao"] is None

            jb = esperar(cliente, b["id"], status=("na_fila",))
            assert jb["posicao"] == 1

            liberar[0].set()
            fim = time.monotonic() + 5
            while time.monotonic() < fim:
                ja = cliente.get(f"/transcrever/{a['id']}", headers=AUTH).json()["data"]
                if ja["parte_atual"] == 1:
                    break
                time.sleep(0.01)
            assert ja["parte_atual"] == 1
            assert ja["nome_atual"] == "a2.ogg"
            assert ja["status"] == "transcrevendo"
            assert chamadas == ["a1.ogg", "a2.ogg"], "B não pode furar a fila"
        finally:
            for e in liberar:
                e.set()

        assert esperar(cliente, a["id"])["status"] == "pronto"
        assert esperar(cliente, b["id"])["status"] == "pronto"


class TestNaoBloqueia:
    # O bug de produção (2026-10-31): 9 min de áudio no modo Preciso levam mais
    # que os ~100 s que a Cloudflare deixa um request aberto. O túnel cortava,
    # o ramielle via "inalcançável" e mandava subir o promeia que estava de pé.
    # O POST tem que voltar na hora, com o Whisper ainda rodando.
    def test_post_volta_202_com_id_enquanto_o_whisper_roda(self, cliente, monkeypatch):
        import threading

        liberar = threading.Event()

        def preso(caminho, modelo, idioma, prompt):
            liberar.wait(10)
            return "TEXTO"

        monkeypatch.setattr(transcricao, "executar_mlx_whisper", preso)
        resposta: dict = {}

        def postar():
            resposta["r"] = cliente.post("/transcrever", headers=AUTH, files=[audio()])

        t = threading.Thread(target=postar)
        t.start()
        t.join(timeout=3)
        try:
            assert not t.is_alive(), "o POST ficou preso esperando o Whisper"
            assert resposta["r"].status_code == 202
            assert len(resposta["r"].json()["data"]["id"]) == 32
        finally:
            liberar.set()
            t.join(timeout=10)
