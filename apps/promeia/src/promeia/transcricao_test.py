from pathlib import Path

import pytest

from promeia.transcricao import (
    PALAVRAS_DE_CONTEXTO,
    TranscricaoVazia,
    cauda,
    montar_prompt,
    transcrever,
)

# ⚠️ Textos DISTINGUÍVEIS entre si: um valor esperado igual ao default não
# distingue "leu o parâmetro" de "devolveu a constante" (lição da fatia ④).
A1 = Path("/tmp/a1.ogg")
A2 = Path("/tmp/a2.ogg")
A3 = Path("/tmp/a3.ogg")


def executor_espiao(respostas):
    """Devolve (fn, chamadas). Cada chamada guarda (caminho, modelo, idioma, prompt)."""
    chamadas = []

    def executar(caminho, modelo, idioma, prompt):
        chamadas.append(
            {
                "caminho": caminho,
                "modelo": modelo,
                "idioma": idioma,
                "prompt": prompt,
            }
        )
        return respostas[len(chamadas) - 1]

    return executar, chamadas


class TestCauda:
    def test_texto_curto_volta_inteiro(self):
        assert cauda("uma duas tres") == "uma duas tres"

    def test_corta_nas_ultimas_palavras(self):
        texto = " ".join(str(i) for i in range(300))
        resultado = cauda(texto, palavras=5)
        assert resultado == "295 296 297 298 299"

    def test_achata_quebra_de_linha(self):
        assert cauda("uma\nduas\n\ntres") == "uma duas tres"


class TestMontarPrompt:
    def test_sem_termos_e_sem_contexto_so_a_base(self):
        p = montar_prompt(termos="", contexto="")
        assert "português do Brasil" in p
        assert "Termos" not in p
        assert "Continuação" not in p

    def test_termos_entram_declarados(self):
        p = montar_prompt(termos="PiluVitu, ramielle", contexto="")
        assert "PiluVitu, ramielle" in p

    def test_contexto_entra_como_continuacao(self):
        p = montar_prompt(termos="", contexto="fim do audio anterior")
        assert "fim do audio anterior" in p
        assert "Continuação" in p


class TestTranscrever:
    def test_devolve_um_texto_por_audio_na_ordem(self):
        executar, _ = executor_espiao(["texto UM", "texto DOIS", "texto TRES"])
        assert transcrever([A1, A2, A3], executar=executar) == [
            "texto UM",
            "texto DOIS",
            "texto TRES",
        ]

    def test_repassa_modelo_e_idioma_escolhidos(self):
        executar, chamadas = executor_espiao(["x"])
        transcrever([A1], executar=executar, modelo="MODELO-X", idioma="en")
        assert chamadas[0]["modelo"] == "MODELO-X"
        assert chamadas[0]["idioma"] == "en"

    # O QUE ESTE MÓDULO EXISTE PRA FAZER: três áudios que se complementam
    # precisam grafar o mesmo nome do mesmo jeito. O fim de um vira prompt
    # do seguinte.
    def test_encadeia_o_fim_de_um_audio_no_prompt_do_seguinte(self):
        executar, chamadas = executor_espiao(["falei de RAMIELLE aqui", "segundo"])
        transcrever([A1, A2], executar=executar)

        assert "Continuação" not in chamadas[0]["prompt"]
        assert "falei de RAMIELLE aqui" in chamadas[1]["prompt"]

    def test_contexto_do_segundo_nao_vaza_o_do_primeiro_alem_do_limite(self):
        longo = " ".join(f"p{i}" for i in range(PALAVRAS_DE_CONTEXTO + 50))
        executar, chamadas = executor_espiao([longo, "segundo"])
        transcrever([A1, A2], executar=executar)

        assert "p0 " not in chamadas[1]["prompt"]
        assert f"p{PALAVRAS_DE_CONTEXTO + 49}" in chamadas[1]["prompt"]

    def test_termos_valem_para_todos_os_audios(self):
        executar, chamadas = executor_espiao(["um", "dois"])
        transcrever([A1, A2], executar=executar, termos="CPF, company")
        assert "CPF, company" in chamadas[0]["prompt"]
        assert "CPF, company" in chamadas[1]["prompt"]

    # Espelha OllamaVazio: resposta vazia é FALHA, nunca sucesso silencioso.
    def test_saida_vazia_e_falha(self):
        executar, _ = executor_espiao(["   "])
        with pytest.raises(TranscricaoVazia):
            transcrever([A1], executar=executar)

    def test_sem_audio_nenhum_e_erro_de_entrada(self):
        executar, _ = executor_espiao([])
        with pytest.raises(ValueError):
            transcrever([], executar=executar)
