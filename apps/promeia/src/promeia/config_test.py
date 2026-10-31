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


def test_o_insight_saiu_settings_nao_tem_mais_os_campos_dele():
    # O insight foi para a Claude no Worker de finanças (PR2 da IA fase 1):
    # o promeia não lê números nem publica nada, então não guarda mais a
    # credencial de ingestão, a URL do Worker nem o modelo do insight.
    s = load_settings(
        {
            "PROMEIA_TOKEN": "x",
            "INGEST_TOKEN": "sobra-de-um-env-antigo",
            "RAMIELLE_URL": "https://exemplo.invalid",
            "OLLAMA_MODEL": "qwen2.5:7b-instruct",
        }
    )
    for campo in ("ingest_token", "ramielle_url", "ollama_model"):
        assert not hasattr(s, campo), campo
    assert not hasattr(s, "exigir_ingest_token")
    assert "sobra-de-um-env-antigo" not in repr(s)


def test_as_settings_do_ollama_sairam_com_a_revisao_e_o_insight():
    # O insight foi para o financas e a revisão para o ramielle, os dois pela
    # Claude: nenhuma env de modelo configura mais nada aqui.
    s = load_settings({"PROMEIA_TOKEN": "x", "MODEL_PROOFREAD": "qualquer"})
    for campo in (
        "model_proofread",
        "model_proofread_careful",
        "model_hooks",
        "ollama_model",
        "ollama_url",
    ):
        assert not hasattr(s, campo)


def test_repr_de_settings_nao_expoe_os_segredos():
    # Ninguém loga `settings` hoje, mas o dataclass gera __repr__ com todos
    # os campos por padrão — o token que protege toda rota não pode aparecer
    # se alguém logar o objeto inteiro por engano no futuro.
    s = Settings(
        promeia_token="segredo-promeia",
    )
    assert "segredo-promeia" not in repr(s)
