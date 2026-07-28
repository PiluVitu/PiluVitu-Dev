import pytest
from fastapi.testclient import TestClient

from promeia.app import create_app
from promeia.config import Settings
from promeia.insight import (
    InsightVazio,
    PublicacaoFalhou,
    build_prompt,
    run_insight,
)
from promeia.ollama import OllamaUnreachable
from promeia.ramielle import RamielleRefused

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
