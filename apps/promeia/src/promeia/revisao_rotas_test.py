import pytest
from fastapi.testclient import TestClient

from promeia import ollama
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
        model_proofread="modelo-RAPIDO",
        model_proofread_careful="modelo-CUIDADOSO",
        model_hooks="modelo-HOOKS",
    )


@pytest.fixture
def cliente():
    with TestClient(create_app(settings_de_teste())) as c:
        yield c


def falso_chat(monkeypatch, resposta="TEXTO DO MODELO", erro=None):
    """Substitui o `ollama.chat` que as ROTAS usam. Nunca toca rede."""
    visto: list[dict] = []

    def fn(**kwargs):
        visto.append(kwargs)
        if erro is not None:
            raise erro
        return resposta

    monkeypatch.setattr(ollama, "chat", fn)
    return visto


# --- caminho feliz -------------------------------------------------------


def test_proofread_devolve_corrected(cliente, monkeypatch):
    falso_chat(monkeypatch, resposta="Olá mundo corrigido.")
    r = cliente.post("/llm/proofread", json={"text": "Ola mundo."}, headers=AUTH)
    assert r.status_code == 200
    assert r.json() == {"ok": True, "data": {"corrected": "Olá mundo corrigido."}}


def test_refine_devolve_refined(cliente, monkeypatch):
    falso_chat(monkeypatch, resposta="chamada refinada")
    r = cliente.post(
        "/llm/refine",
        json={"platform": "bluesky", "text": "chamada", "instruction": "encurta"},
        headers=AUTH,
    )
    assert r.status_code == 200
    assert r.json() == {"ok": True, "data": {"refined": "chamada refinada"}}


def test_proofread_repassa_o_careful_ate_a_escolha_do_modelo(cliente, monkeypatch):
    # A ponta a ponta que importa: o campo do CORPO chega na escolha do modelo.
    visto = falso_chat(monkeypatch)
    cliente.post(
        "/llm/proofread", json={"text": "texto", "careful": True}, headers=AUTH
    )
    assert visto[0]["model"] == "modelo-CUIDADOSO"

    visto.clear()
    cliente.post(
        "/llm/proofread", json={"text": "texto", "careful": False}, headers=AUTH
    )
    assert visto[0]["model"] == "modelo-RAPIDO"


def test_careful_ausente_no_corpo_e_falso_como_no_Go(cliente, monkeypatch):
    visto = falso_chat(monkeypatch)
    cliente.post("/llm/proofread", json={"text": "texto"}, headers=AUTH)
    assert visto[0]["model"] == "modelo-RAPIDO"


# --- erros ---------------------------------------------------------------


@pytest.mark.parametrize("rota", ["/llm/proofread", "/llm/refine"])
def test_text_vazio_da_400_com_a_mensagem_do_Go(cliente, rota):
    r = cliente.post(rota, json={"text": ""}, headers=AUTH)
    assert r.status_code == 400
    corpo = r.json()
    assert corpo["code"] == "invalid_json"
    # ⚠️ Mensagem LITERAL: o ramielle a repassa pro `toast.error` do admin.
    assert corpo["message"] == "Corpo inválido: 'text' é obrigatório."


@pytest.mark.parametrize("rota", ["/llm/proofread", "/llm/refine"])
def test_text_ausente_tambem_da_400(cliente, rota):
    assert cliente.post(rota, json={}, headers=AUTH).status_code == 400


@pytest.mark.parametrize("rota", ["/llm/proofread", "/llm/refine"])
def test_ollama_desligado_da_503_unreachable(cliente, monkeypatch, rota):
    # ⚠️ 503, não 502: o promeia está de pé, o Ollama não. Quem chama precisa
    # da distinção pra dizer "abra o Ollama" em vez de "suba o promeia".
    falso_chat(monkeypatch, erro=ollama.OllamaUnreachable("suba o Ollama"))
    r = cliente.post(rota, json={"text": "t", "platform": "bluesky"}, headers=AUTH)
    assert r.status_code == 503
    assert r.json()["code"] == "ollama_unreachable"


@pytest.mark.parametrize("rota", ["/llm/proofread", "/llm/refine"])
def test_modelo_ausente_da_503_model_missing_com_o_comando(cliente, monkeypatch, rota):
    falso_chat(
        monkeypatch,
        erro=ollama.OllamaModelMissing("modelo 'x' não está instalado. ollama pull x"),
    )
    r = cliente.post(rota, json={"text": "t", "platform": "bluesky"}, headers=AUTH)
    assert r.status_code == 503
    assert r.json()["code"] == "ollama_model_missing"
    # A mensagem acionável do promeia sobrevive até a resposta — é ela que
    # torna o erro útil, e não pode ser achatada num "falhou".
    assert "ollama pull x" in r.json()["message"]


@pytest.mark.parametrize("rota", ["/llm/proofread", "/llm/refine"])
def test_ollama_respondeu_e_falhou_da_502(cliente, monkeypatch, rota):
    falso_chat(monkeypatch, erro=ollama.OllamaFailed("resposta malformada"))
    r = cliente.post(rota, json={"text": "t", "platform": "bluesky"}, headers=AUTH)
    assert r.status_code == 502
    assert r.json()["code"] == "ollama_failed"


# --- token ---------------------------------------------------------------


@pytest.mark.parametrize("rota", ["/llm/proofread", "/llm/refine"])
def test_sem_token_da_401_antes_de_qualquer_coisa(cliente, monkeypatch, rota):
    # Redundante com test_TODA_rota_registrada_recusa_sem_token (app_test.py),
    # que cobre rota nova sozinha — mas aqui prova algo a mais: que o 401 vem
    # ANTES da validação de corpo (um 400 aqui significaria que o corpo foi
    # lido sem credencial).
    visto = falso_chat(monkeypatch)
    r = cliente.post(rota, json={"text": ""})
    assert r.status_code == 401
    assert visto == []


# --- /llm/hooks ----------------------------------------------------------


def test_hooks_devolve_uma_chamada_por_plataforma(cliente, monkeypatch):
    falso_chat(monkeypatch, resposta="chamada gerada")
    r = cliente.post(
        "/llm/hooks",
        json={
            "article": {"title": "T", "excerpt": "E", "tags": ["go"]},
            "platforms": ["bluesky", "mastodon"],
        },
        headers=AUTH,
    )
    assert r.status_code == 200
    assert r.json() == {
        "ok": True,
        "data": {
            "hooks": [
                {"platform": "bluesky", "text": "chamada gerada"},
                {"platform": "mastodon", "text": "chamada gerada"},
            ]
        },
    }


def test_hooks_sem_platforms_da_400(cliente, monkeypatch):
    visto = falso_chat(monkeypatch)
    r = cliente.post("/llm/hooks", json={"article": {}}, headers=AUTH)
    assert r.status_code == 400
    assert r.json()["code"] == "invalid_json"
    assert visto == []  # nem chegou a chamar o modelo


def test_hooks_traduz_falha_do_ollama_igual_as_outras(cliente, monkeypatch):
    falso_chat(monkeypatch, erro=ollama.OllamaUnreachable("suba o Ollama"))
    r = cliente.post("/llm/hooks", json={"platforms": ["bluesky"]}, headers=AUTH)
    assert r.status_code == 503
    assert r.json()["code"] == "ollama_unreachable"


def test_hooks_sem_token_da_401(cliente):
    assert cliente.post("/llm/hooks", json={"platforms": ["x"]}).status_code == 401
