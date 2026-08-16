import pytest
from fastapi.testclient import TestClient

from promeia.app import create_app
from promeia.config import ConfigError, Settings
from promeia.insight import (
    InsightVazio,
    PublicacaoFalhou,
    build_prompt,
    run_insight,
)
from promeia.ollama import (
    OllamaError,
    OllamaFailed,
    OllamaModelMissing,
    OllamaUnreachable,
)
from promeia.ramielle import RamielleError, RamielleRefused, RamielleUnreachable

TOKEN = "token-de-teste"


def numeros(**over) -> dict:
    base = {
        "competence": "2026-07",
        "previous_competence": "2026-06",
        "total_cents": -123000,
        "previous_total_cents": -87000,
        "variation_cents": 36000,
        "variation_pct": 41,
        "top_categories": [
            {"category_name": "INSS", "total_cents": -76000},
            {"category_name": "Contador", "total_cents": -30000},
        ],
        "biggest_increase": {
            "category_name": "INSS",
            "previous_cents": -40000,
            "current_cents": -76000,
            "delta_cents": 36000,
        },
    }
    base.update(over)
    return base


# --- build_prompt -------------------------------------------------------


def test_nenhum_centavo_cru_aparece_no_prompt():
    # O modelo lê o texto do prompt. Um '-123000' solto ali é um número que
    # ele pode copiar para a leitura final — e "R$ 123.000,00" seria mentira
    # de 100x sobre R$ 1.230,00.
    p = build_prompt(numeros())
    assert "R$ 1.230,00" in p
    assert "-123000" not in p
    assert "123000" not in p


def test_as_categorias_saem_na_ordem_recebida_e_numeradas():
    p = build_prompt(numeros())
    assert "1. INSS: R$ 760,00" in p
    assert "2. Contador: R$ 300,00" in p
    assert p.index("1. INSS") < p.index("2. Contador")


def test_as_regras_anti_invencao_estao_presentes():
    # São elas que impedem o modelo de calcular/estimar um número novo. O
    # spec é explícito: nenhum número exibido pode vir do modelo.
    p = build_prompt(numeros())
    assert "REGRAS OBRIGATÓRIAS" in p
    assert "SOMENTE" in p
    assert "NUNCA invente" in p


def test_sem_categoria_nenhuma_diz_isso_em_vez_de_ficar_vazio():
    p = build_prompt(numeros(top_categories=[]))
    assert "(nenhum gasto registrado nesta competência)" in p


def test_sem_base_de_comparacao_diz_isso_em_vez_de_uma_porcentagem():
    p = build_prompt(numeros(variation_pct=None))
    assert "Sem base de comparação" in p
    assert "None" not in p


def test_variacao_zero_nao_vira_aumento_de_zero():
    p = build_prompt(numeros(variation_cents=0, variation_pct=0))
    assert "Sem variação em relação a 2026-06." in p


def test_reducao_e_reducao_nao_aumento_negativo():
    p = build_prompt(numeros(variation_cents=-36000, variation_pct=-41))
    assert "Redução de R$ 360,00 (41%)" in p
    assert "Aumento" not in p


def test_sem_maior_crescimento_marca_explicitamente():
    p = build_prompt(numeros(biggest_increase=None))
    assert "(sem dado suficiente para apontar)" in p
    assert "None" not in p


def test_maior_crescimento_usa_magnitude_nos_tres_numeros():
    p = build_prompt(numeros())
    assert "INSS: foi de R$ 400,00 para R$ 760,00 (aumento de R$ 360,00)." in p


# --- run_insight --------------------------------------------------------


def settings(**over) -> Settings:
    base = dict(
        promeia_token=TOKEN,
        ollama_url="http://localhost:11434",
        ollama_model="qwen2.5:7b-instruct",
        ramielle_url="https://exemplo.invalid",
        ingest_token="ingest",
    )
    base.update(over)
    return Settings(**base)


def test_run_insight_le_gera_e_publica_nessa_ordem():
    chamadas = []

    def ler(competence):
        chamadas.append(("ler", competence))
        return numeros()

    def gerar(prompt):
        chamadas.append(("gerar", prompt[:20]))
        return "  A leitura do mês.  "

    def publicar(texto, modelo, periodo):
        chamadas.append(("publicar", texto, modelo, periodo))

    competence, texto = run_insight(
        settings=settings(),
        competence="2026-07",
        ler=ler,
        gerar=gerar,
        publicar=publicar,
    )

    assert competence == "2026-07"
    assert texto == "A leitura do mês."  # trimado
    assert [c[0] for c in chamadas] == ["ler", "gerar", "publicar"]
    assert chamadas[2][1:] == ("A leitura do mês.", "qwen2.5:7b-instruct", "2026-07")


def test_texto_vazio_nao_publica_nada():
    # "Insight vazio publicado" é o pior resultado possível: parece sucesso e
    # o dono lê um card em branco sem saber por quê. Mesma regra do CSV vazio
    # em pdf-import.mjs.
    publicou = []

    with pytest.raises(InsightVazio):
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: numeros(),
            gerar=lambda p: "   \n  ",
            publicar=lambda *a: publicou.append(a),
        )

    assert publicou == []


def test_competencia_invalida_falha_antes_de_qualquer_chamada():
    tocou = []

    with pytest.raises(ValueError, match="competência"):
        run_insight(
            settings=settings(),
            competence="2026-13",
            ler=lambda c: tocou.append(c) or numeros(),
            gerar=lambda p: tocou.append(p) or "x",
            publicar=lambda *a: tocou.append(a),
        )

    assert tocou == []


def test_falha_ao_publicar_carrega_o_texto_gerado_na_excecao():
    """O texto custou uma rodada de modelo — não pode evaporar.

    Cenário real: a API cai (ou a rede oscila) ENTRE o gerar e o publicar. O
    CLI Node que este módulo substitui imprimia o texto sob
    "--- texto gerado (NÃO publicado) ---" justamente por isso. Deixar a
    exceção de rede subir crua perderia o texto e obrigaria a rodar o modelo
    de novo — regressão silenciosa contra o comportamento que já existia.
    """
    with pytest.raises(PublicacaoFalhou) as exc:
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: numeros(),
            gerar=lambda p: "texto caro",
            publicar=lambda *a: (_ for _ in ()).throw(RamielleRefused("caiu")),
        )
    assert exc.value.texto == "texto caro"
    assert isinstance(exc.value.causa, RamielleRefused)
    assert "caiu" in str(exc.value)


def test_envelope_sem_data_vira_ramielle_refused_nao_typeerror_cru():
    """Envelope `ok:true` sem "data" faz `ramielle.fetch_numbers` devolver
    None (é `corpo.get("data")`, e a chave pode faltar). Sem a guarda em
    run_insight, build_prompt(None) levanta `TypeError: 'NoneType' object is
    not subscriptable` cru — MEDIDO executando de verdade antes da correção.
    """
    with pytest.raises(RamielleRefused, match="formato esperado"):
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: None,
            gerar=lambda p: "nunca chega aqui",
            publicar=lambda *a: None,
        )


def test_numeros_sem_chave_esperada_vira_ramielle_refused_nao_keyerror_cru():
    """`data` sem uma chave que build_prompt espera (ex.: API mudou o
    formato, ou um bug no Worker) levanta `KeyError: 'previous_competence'`
    cru sem a guarda — MEDIDO. Precisa virar recusa de formato, não crash.
    """
    incompleto = numeros()
    del incompleto["previous_competence"]

    with pytest.raises(RamielleRefused, match="formato esperado"):
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: incompleto,
            gerar=lambda p: "nunca chega aqui",
            publicar=lambda *a: None,
        )


def test_falha_ao_LER_nao_vira_PublicacaoFalhou():
    # A leitura acontece ANTES de qualquer texto existir — embrulhar o erro
    # dela em PublicacaoFalhou faria o CLI prometer imprimir um texto que
    # nunca foi gerado.
    with pytest.raises(RamielleRefused):
        run_insight(
            settings=settings(),
            competence="2026-07",
            ler=lambda c: (_ for _ in ()).throw(RamielleRefused("recusou a leitura")),
            gerar=lambda p: "nunca chega aqui",
            publicar=lambda *a: None,
        )


def test_ingest_token_vazio_falha_ANTES_de_ler_gerar_ou_publicar():
    # O caso real medido: `make dev-promeia` sem source do .env sobe o serviço
    # com INGEST_TOKEN="". Sem esta guarda, `fetch_numbers` montava o header
    # "Bearer " e o httpx o recusava — erro de CONFIGURAÇÃO saindo como
    # "confira a conexão". Falhar antes de qualquer I/O também protege a GPU:
    # nada de rodar 20-33 s de modelo pra descobrir no fim que não dá pra
    # publicar.
    tocou = []

    with pytest.raises(ConfigError, match="INGEST_TOKEN"):
        run_insight(
            settings=settings(ingest_token=""),
            competence="2026-07",
            ler=lambda c: tocou.append(("ler", c)) or numeros(),
            gerar=lambda p: tocou.append(("gerar", p)) or "x",
            publicar=lambda *a: tocou.append(("publicar", a)),
        )

    assert tocou == []


# --- rota ---------------------------------------------------------------


def client() -> TestClient:
    return TestClient(create_app(settings()))


def auth() -> dict:
    return {"authorization": f"Bearer {TOKEN}"}


def test_rota_insight_exige_o_token_do_promeia():
    r = client().post("/insight", json={"competence": "2026-07"})
    assert r.status_code == 401
    assert r.json()["code"] == "invalid_promeia_token"


def test_rota_insight_com_competencia_invalida_e_422():
    r = client().post("/insight", json={"competence": "2026-13"}, headers=auth())
    assert r.status_code == 422


def test_rota_insight_traduz_ollama_desligado_em_503():
    # 503 é a resposta que deixa o chamador (ramielle, depois) distinguir
    # "o promeia está de pé mas o Ollama não" de "não alcancei o promeia".
    app = create_app(settings())
    from promeia import insight as mod

    original = mod.run_insight
    mod.run_insight = lambda **kw: (_ for _ in ()).throw(
        OllamaUnreachable("suba o ollama")
    )
    try:
        r = TestClient(app).post(
            "/insight", json={"competence": "2026-07"}, headers=auth()
        )
    finally:
        mod.run_insight = original

    assert r.status_code == 503
    assert r.json()["code"] == "ollama_unreachable"
    assert "suba o ollama" in r.json()["message"]


def _resposta_para(excecao: Exception, cfg: Settings | None = None):
    """Faz a rota falhar com `excecao` sem tocar Ollama, rede ou o ramielle."""
    app = create_app(cfg or settings())
    from promeia import insight as mod

    original = mod.run_insight
    mod.run_insight = lambda **kw: (_ for _ in ()).throw(excecao)
    try:
        return TestClient(app).post(
            "/insight", json={"competence": "2026-07"}, headers=auth()
        )
    finally:
        mod.run_insight = original


@pytest.mark.parametrize(
    ("excecao", "code"),
    [
        (ConfigError("INGEST_TOKEN não está definido"), "ingest_token_missing"),
        (InsightVazio("texto vazio"), "empty_insight"),
        (OllamaModelMissing("ollama pull x"), "ollama_model_missing"),
        (OllamaUnreachable("suba o ollama"), "ollama_unreachable"),
        (OllamaFailed("o ollama respondeu e falhou"), "ollama_failed"),
        (RamielleUnreachable("não alcancei a API"), "ramielle_unreachable"),
        (RamielleRefused("a API recusou"), "ramielle_refused"),
        # As duas redes de segurança: subclasses novas que ninguém listou.
        (type("OllamaNova", (OllamaError,), {})("nova"), "ollama_error"),
        (type("RamielleNova", (RamielleError,), {})("nova"), "ramielle_error"),
    ],
)
def test_NENHUM_erro_da_rota_sai_como_502(excecao, code):
    """O 502 é o único status cujo corpo o túnel Cloudflare COME — medido.

    Local (:8082) contra o túnel (promeia.piluvitu.com.br), 3/3 de cada lado e
    depois isolado por status com uma origem descartável: 400, 422, 500 e 503
    chegam com o JSON intacto; **502 chega como `text/plain`, 16 bytes,
    `error code: 502`** — corpo da origem substituído pelo error page da
    Cloudflare.

    Isso não perde só a frase: `apps/ramielle/src/lib/promeia.ts#chamarPromeia`
    trata "erro HTTP sem code/message no corpo" como NÃO ALCANCEI O MAC, então
    todo 502 daqui chegaria ao dono como "Suba o promeia no Mac" — com o
    promeia de pé. A distinção que importa mora no `code`, dentro do corpo, e
    só sobrevive se o corpo sobreviver.

    Este teste falha se alguém devolver um 502 novo aqui — inclusive por
    copiar/colar um ramo existente, que é exatamente como os cinco anteriores
    nasceram.
    """
    r = _resposta_para(excecao)

    assert r.status_code != 502
    assert r.status_code == 503
    corpo = r.json()
    assert corpo["ok"] is False
    assert corpo["code"] == code
    assert corpo["message"] != ""


def test_ingest_token_vazio_pela_rota_NAO_se_disfarca_de_falha_de_rede():
    # O defeito medido por HTTP antes desta correção: 502
    # `ramielle_unreachable`, mensagem "confira a conexão e a URL
    # (RAMIELLE_URL). Detalhe: Illegal header value b'Bearer '". Rede nenhuma
    # tinha problema.
    app = create_app(settings(ingest_token=""))
    r = TestClient(app).post("/insight", json={"competence": "2026-07"}, headers=auth())

    assert r.status_code == 503
    corpo = r.json()
    assert corpo["code"] == "ingest_token_missing"
    assert corpo["code"] != "ramielle_unreachable"
    assert "INGEST_TOKEN" in corpo["message"]
    assert "confira a conexão" not in corpo["message"]
    assert "Illegal header value" not in corpo["message"]


def test_publicacao_falhou_devolve_o_texto_caro_num_status_que_atravessa_o_tunel():
    # `data.texto` é o único lugar onde o texto sobrevive quando a publicação
    # falha depois da rodada de modelo. Num 502 o túnel apagaria o corpo
    # inteiro — o texto sumiria sem ninguém saber que existiu.
    r = _resposta_para(PublicacaoFalhou("a leitura do mês", RamielleRefused("caiu")))

    assert r.status_code == 503
    corpo = r.json()
    assert corpo["code"] == "publish_failed"
    assert corpo["data"]["texto"] == "a leitura do mês"


def test_a_rota_insight_aparece_na_prova_de_toda_rota():
    """Controle positivo do achatamento de rotas.

    O teste genérico (app_test.py) só prova o que consegue ENUMERAR. Esta
    asserção é o que garante que /insight — montado por include_router, o
    caminho que o FastAPI 0.140.7 esconde atrás de um _IncludedRouter opaco —
    está de fato dentro da lista que aquele teste percorre, e não fora dela.
    """
    from promeia.app_test import _rotas_registradas

    caminhos = [p for p, _ in _rotas_registradas(create_app(settings()))]
    assert "/insight" in caminhos, caminhos
