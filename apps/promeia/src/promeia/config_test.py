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


def test_defaults_de_modelo_da_revisao_sao_os_MEDIDOS_de_2026():
    # ⚠️ Estes três valores são ESCOLHA PRÓPRIA, medida BLOCO A BLOCO (o
    # caminho real do `proofread`) — não mais "igual ao que o Go usava" (a Go
    # foi aposentada, ver ROADMAP §2). Rápido: qwen2.5:7b-instruct (9/9 em
    # preservação de nível de título, 8/9 no corpus de erros) contra o
    # qwen2.5:3b-instruct antigo (6/9 e 5/9). Careful e hooks: gemma4:12b
    # (9/9 nos dois), pagando 11,8 s/bloco — que é o preço que o slot
    # "careful" existe pra pagar. Comentário completo em `config.py#Settings`.
    s = load_settings({"PROMEIA_TOKEN": "x"})
    assert s.model_proofread == "qwen2.5:7b-instruct"
    assert s.model_proofread_careful == "gemma4:12b"
    assert s.model_hooks == "gemma4:12b"


def test_nenhum_slot_da_revisao_usa_a_familia_qwen3_5():
    # ⚠️ Este é o teste que teria impedido o 6808f60, e o de cima NÃO seria.
    # Fixar a string do default não protege nada: quem troca o default troca a
    # string do teste junto, no mesmo commit, sem nunca encarar o motivo. O que
    # protege é uma trava sobre a FAMÍLIA medida como ruim, com a evidência na
    # mensagem de falha: pra reintroduzir um qwen3.5 é preciso APAGAR uma
    # asserção que diz, em português, que ela destrói o nível do título — vira
    # ato consciente, não troca mecânica de valor. E ela pega o caso que uma
    # igualdade não pega: uma tag qwen3.5 QUALQUER (4b, 9b, ou a próxima que
    # sair), inclusive num slot que hoje está certo.
    #
    # MEDIDO, 9 repetições, blocos `## Subtitulo`/`### Secao`/`#### Detalhe`
    # mandados sozinhos (é assim que o `proofread` manda): qwen3.5:4b preservou
    # o nível 1/9 vez, qwen3.5:9b 4/9 — devolvendo `'# Subtítulo'` no lugar de
    # `'## Subtitulo'` — e o 9b ainda vazou espanhol (`'#### Detalle'`).
    s = load_settings({"PROMEIA_TOKEN": "x"})
    for slot, modelo in (
        ("MODEL_PROOFREAD", s.model_proofread),
        ("MODEL_PROOFREAD_CAREFUL", s.model_proofread_careful),
        ("MODEL_HOOKS", s.model_hooks),
    ):
        assert not modelo.startswith("qwen3.5"), (
            f"{slot}={modelo}: a família qwen3.5 REBAIXA o nível dos títulos "
            f"quando o bloco chega sozinho (4b: 1/9; 9b: 4/9), que é como o "
            f"proofread manda. Ela já foi escolhida uma vez (6808f60) com base "
            f"num corpus de texto INTEIRO, que não mede esse caso. Se for medir "
            f"de novo, meça bloco a bloco."
        )


def test_o_modelo_do_insight_NAO_acompanha_os_da_revisao():
    # ⚠️ Decisão deliberada, não esquecimento: a tarefa do insight é redigir um
    # parágrafo sobre números JÁ calculados pelo Worker, e o gargalo medido
    # dele é o PROMPT, não o modelo — o insight de 2026-08 saiu afirmando
    # "mantendo-se igual ao mesmo período do ano anterior" sobre um banco sem
    # ano anterior, coisa que modelo maior nenhum conserta. Este teste é o que
    # impede alguém de "uniformizar" os quatro slots numa próxima passada.
    #
    # ⚠️ `ollama_model` e `model_proofread` calharem de ser o MESMO modelo hoje
    # é coincidência de valor, não decisão compartilhada: um venceu no corpus
    # de revisão bloco a bloco, o outro nunca foi medido porque não é o gargalo
    # dele. Por isso a asserção de independência é contra o `careful`.
    s = load_settings({"PROMEIA_TOKEN": "x"})
    assert s.ollama_model == "qwen2.5:7b-instruct"
    assert s.ollama_model != s.model_proofread_careful


def test_env_sobrescreve_os_tres_modelos_da_revisao():
    # Cada slot lê a SUA env: um `src.get` copiado e colado (os três lendo
    # MODEL_PROOFREAD, por exemplo) passa despercebido se o teste usar o mesmo
    # valor nos três.
    s = load_settings(
        {
            "PROMEIA_TOKEN": "x",
            "MODEL_PROOFREAD": "rapido-X",
            "MODEL_PROOFREAD_CAREFUL": "cuidadoso-Y",
            "MODEL_HOOKS": "hooks-Z",
        }
    )
    assert s.model_proofread == "rapido-X"
    assert s.model_proofread_careful == "cuidadoso-Y"
    assert s.model_hooks == "hooks-Z"


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
