import pytest

from promeia.config import ConfigError, Settings, load_settings


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


def test_repr_de_settings_nao_expoe_os_segredos():
    # Ninguém loga `settings` hoje, mas o dataclass gera __repr__ com todos
    # os campos por padrão — os dois únicos segredos do serviço (o token que
    # protege toda rota e o token que autentica no ramielle) não podem
    # aparecer se alguém logar o objeto inteiro por engano no futuro.
    s = Settings(
        promeia_token="segredo-promeia",
        ollama_url="http://localhost:11434",
        ollama_model="qwen2.5:7b-instruct",
        ramielle_url="https://exemplo.invalid",
        ingest_token="segredo-ingest",
    )
    texto = repr(s)
    assert "segredo-promeia" not in texto
    assert "segredo-ingest" not in texto


def test_barra_final_do_ramielle_url_e_removida():
    # Sem isso, `f"{url}/api/insights"` vira `...com.br//api/insights`.
    s = load_settings(
        {"PROMEIA_TOKEN": "x", "RAMIELLE_URL": "https://exemplo.com.br///"}
    )
    assert s.ramielle_url == "https://exemplo.com.br"
