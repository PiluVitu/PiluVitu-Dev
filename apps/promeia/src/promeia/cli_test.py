from promeia.cli import main
from promeia.config import Settings
from promeia.insight import InsightVazio, PublicacaoFalhou, run_insight
from promeia.ollama import OllamaUnreachable
from promeia.ramielle import RamielleRefused

ENV = {"PROMEIA_TOKEN": "x", "INGEST_TOKEN": "ingest"}


def capture():
    saida, erros = [], []
    return saida, erros, saida.append, erros.append


def test_help_sai_zero_e_nao_roda_nada():
    saida, erros, log, log_erro = capture()
    tocou = []
    codigo = main(
        ["--help"],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: tocou.append(kw),
    )
    assert codigo == 0
    assert tocou == []
    assert any("Uso:" in linha for linha in saida)


def test_opcao_desconhecida_sai_dois():
    saida, erros, log, log_erro = capture()
    codigo = main(
        ["--inventada"],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: None,
    )
    assert codigo == 2


def test_sem_ingest_token_falha_antes_de_qualquer_rede():
    saida, erros, log, log_erro = capture()
    tocou = []
    codigo = main(
        [],
        env={"PROMEIA_TOKEN": "x"},
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: tocou.append(kw),
    )
    assert codigo == 1
    assert tocou == []
    assert any("INGEST_TOKEN" in linha for linha in erros)
    assert any("wrangler secret put" in linha for linha in erros)


def test_sem_promeia_token_explica_e_nao_estoura_stack():
    saida, erros, log, log_erro = capture()
    codigo = main([], env={}, log=log, log_erro=log_erro, executar=lambda **kw: None)
    assert codigo == 1
    assert any("PROMEIA_TOKEN" in linha for linha in erros)


def test_caminho_feliz_imprime_o_texto_e_sai_zero():
    saida, erros, log, log_erro = capture()
    codigo = main(
        ["--competencia", "2026-07"],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: ("2026-07", "A leitura do mês."),
    )
    assert codigo == 0
    assert any("A leitura do mês." in linha for linha in saida)
    assert any("publicado com sucesso" in linha for linha in saida)


def test_a_competencia_da_flag_chega_no_executar():
    visto = {}

    def executar(**kw):
        visto.update(kw)
        return ("2026-05", "t")

    main(
        ["--competencia", "2026-05"],
        env=ENV,
        log=lambda _: None,
        log_erro=lambda _: None,
        executar=executar,
    )
    assert visto["competence"] == "2026-05"


def test_competencia_invalida_sai_dois_e_mostra_o_uso():
    # Finding 4 (fix round 1): `except ValueError` em cli.py (competência
    # malformada -> código de uso 2) não tinha teste dedicado — todo outro
    # branch (InsightVazio/OllamaError/RamielleError/PublicacaoFalhou) já
    # tinha. Sem isto, remover o `except` hoje não derrubaria nada.
    saida, erros, log, log_erro = capture()
    codigo = main(
        [],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(
            ValueError("competência inválida (esperado YYYY-MM): lixo")
        ),
    )
    assert codigo == 2
    assert any("competência inválida" in linha for linha in erros)
    assert any("Uso:" in linha for linha in saida)


def test_ollama_desligado_sai_um_com_a_mensagem_util():
    saida, erros, log, log_erro = capture()
    codigo = main(
        [],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(
            OllamaUnreachable('inicie com "ollama serve"')
        ),
    )
    assert codigo == 1
    assert any("ollama serve" in linha for linha in erros)


def test_texto_vazio_sai_um_e_nao_finge_sucesso():
    saida, erros, log, log_erro = capture()
    codigo = main(
        [],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(InsightVazio("vazio")),
    )
    assert codigo == 1
    assert not any("sucesso" in linha for linha in saida)


def test_falha_de_rede_na_leitura_sai_um():
    saida, erros, log, log_erro = capture()
    codigo = main(
        [],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(RamielleRefused("recusou")),
    )
    assert codigo == 1
    assert any("recusou" in linha for linha in erros)


def test_payload_malformado_da_api_nao_vaza_traceback_ate_o_cli():
    """Antes da correção em insight.py, um envelope `ok:true` sem "data"
    fazia build_prompt levantar TypeError — nenhuma das exceções que cli.py
    sabe tratar (InsightVazio/OllamaError/RamielleError/PublicacaoFalhou/
    ValueError), então subia cru: traceback no terminal do dono. Usa o
    run_insight DE VERDADE (só ler/gerar/publicar são stubados) para provar
    a correção ponta a ponta, não só que RamielleError já era tratado.
    """
    saida, erros, log, log_erro = capture()
    fake_settings = Settings(
        promeia_token="x",
        ollama_url="http://localhost:11434",
        ollama_model="m",
        ramielle_url="https://exemplo.invalid",
        ingest_token="ingest",
    )

    def executar(**kw):
        return run_insight(
            settings=fake_settings,
            competence=kw.get("competence"),
            ler=lambda c: None,  # envelope ok:true sem "data"
            gerar=lambda p: "nunca chega aqui",
            publicar=lambda *a: None,
        )

    codigo = main([], env=ENV, log=log, log_erro=log_erro, executar=executar)

    assert codigo == 1
    assert any("formato esperado" in linha for linha in erros)


def test_falha_ao_publicar_imprime_o_texto_gerado():
    # Sem isto, o texto que custou uma rodada de modelo some porque a rede
    # oscilou — e o dono não tem nem como republicar à mão.
    saida, erros, log, log_erro = capture()
    codigo = main(
        [],
        env=ENV,
        log=log,
        log_erro=log_erro,
        executar=lambda **kw: (_ for _ in ()).throw(
            PublicacaoFalhou("o texto caro", RamielleRefused("caiu"))
        ),
    )
    assert codigo == 1
    assert any("NÃO publicado" in linha for linha in erros)
    assert any("o texto caro" in linha for linha in erros)
