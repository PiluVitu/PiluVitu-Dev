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


def test_o_modelo_do_insight_e_o_medido():
    # O gargalo medido do insight é o PROMPT, não o modelo: o insight de
    # 2026-08 afirmou "igual ao mesmo período do ano anterior" sobre um banco
    # sem ano anterior, coisa que modelo maior nenhum conserta.
    s = load_settings({"PROMEIA_TOKEN": "x"})
    assert s.ollama_model == "qwen2.5:7b-instruct"


def test_as_settings_da_revisao_sairam_com_ela():
    # A revisão de artigo foi para a Claude no ramielle: MODEL_PROOFREAD,
    # MODEL_PROOFREAD_CAREFUL e MODEL_HOOKS não configuram mais nada.
    s = load_settings({"PROMEIA_TOKEN": "x", "MODEL_PROOFREAD": "qualquer"})
    for campo in ("model_proofread", "model_proofread_careful", "model_hooks"):
        assert not hasattr(s, campo)


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


def test_load_settings_NAO_derruba_o_servico_por_INGEST_TOKEN_ausente():
    # ⚠️ Este teste fixa uma DECISÃO, não um descuido. A simetria óbvia com o
    # PROMEIA_TOKEN (que levanta ConfigError logo acima) é ERRADA aqui: das
    # rotas POST do serviço, só `/insight` usa o INGEST_TOKEN; `/transcrever`
    # recebe áudio e devolve texto, sem tocar o ramielle. Exigir o token no
    # boot derrubaria o serviço inteiro, transcrição inclusa, por uma
    # credencial que ela não usa.
    #
    # Quem for "consertar a assimetria" trocando isto por um pytest.raises tem
    # que apagar esta explicação antes — que é o ponto de ela estar aqui.
    s = load_settings({"PROMEIA_TOKEN": "so-o-do-middleware"})
    assert s.ingest_token == ""
    assert s.promeia_token == "so-o-do-middleware"


def test_exigir_ingest_token_levanta_quando_vazio():
    # String vazia é o caso REAL: `make dev-promeia` sem source do .env, ou um
    # `INGEST_TOKEN=` solto. Sem esta guarda o valor vazio virava o header
    # "Bearer " e o httpx o recusava com `Illegal header value b'Bearer '` —
    # que `ramielle.py` classificava como falha de TRANSPORTE.
    s = load_settings({"PROMEIA_TOKEN": "x"})
    with pytest.raises(ConfigError, match="INGEST_TOKEN"):
        s.exigir_ingest_token()


def test_exigir_ingest_token_devolve_o_token_quando_configurado():
    s = load_settings({"PROMEIA_TOKEN": "x", "INGEST_TOKEN": "ingest-de-verdade"})
    assert s.exigir_ingest_token() == "ingest-de-verdade"


def test_a_mensagem_do_ingest_token_diz_que_NAO_e_rede_e_o_que_fazer():
    # A classificação errada não era só um `code` trocado: a mensagem mandava
    # "confira a conexão e a URL". Quem lê a nova precisa sair dela sabendo
    # (a) que o serviço está de pé e (b) qual comando resolve.
    s = load_settings({"PROMEIA_TOKEN": "x"})
    with pytest.raises(ConfigError) as exc:
        s.exigir_ingest_token()
    msg = str(exc.value)
    assert "NÃO é problema de rede" in msg
    assert "wrangler secret put INGEST_TOKEN" in msg
    assert ".dev.vars" in msg
    assert "confira a conexão" not in msg


def test_barra_final_do_ramielle_url_e_removida():
    # Sem isso, `f"{url}/api/insights"` vira `...com.br//api/insights`.
    s = load_settings(
        {"PROMEIA_TOKEN": "x", "RAMIELLE_URL": "https://exemplo.com.br///"}
    )
    assert s.ramielle_url == "https://exemplo.com.br"
