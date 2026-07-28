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
    autenticação, e um 500 ali manda depurar o serviço quando o problema é o
    token.

    Testado no nível de unidade, NÃO via TestClient: o httpx recusa header
    não-ASCII no cliente (nunca chega no app ASGI), então um teste HTTP não
    consegue exercitar este caminho — passaria por acidente, provando nada.
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
