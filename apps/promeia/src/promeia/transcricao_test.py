import subprocess
from pathlib import Path

import pytest

from promeia.transcricao import (
    PALAVRAS_DE_CONTEXTO,
    TranscricaoFalhou,
    TranscricaoVazia,
    cauda,
    executar_mlx_whisper,
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


def rodar_como_mlx_whisper(texto="transcrito", *, stderr=""):
    """Imita o `mlx_whisper` de verdade: grava `(dir / nome).with_suffix(".txt")`,
    com `nome` = `--output-name` ou o stem do áudio. É o `with_suffix` que
    come o último trecho de um nome com pontos (`..._22.15.03` → `..._22.15.txt`).
    """

    def rodar(args, **_):
        audio = Path(args[1])
        nome = (
            args[args.index("--output-name") + 1]
            if "--output-name" in args
            else audio.stem
        )
        saida_dir = Path(args[args.index("--output-dir") + 1])
        if texto is not None:
            (saida_dir / nome).with_suffix(".txt").write_text(texto, encoding="utf-8")
        # O mlx_whisper sai 0 mesmo quando pula o áudio por erro.
        return subprocess.CompletedProcess(args, 0, stdout="", stderr=stderr)

    return rodar


class TestExecutarMlxWhisper:
    def test_le_a_saida_de_audio_com_nome_simples(self, tmp_path):
        audio = tmp_path / "nota.ogg"
        audio.write_bytes(b"x")
        texto = executar_mlx_whisper(
            audio, "m", "pt", "p", binario="mlx", rodar=rodar_como_mlx_whisper("oi")
        )
        assert texto == "oi"

    # Nome padrão do WhatsApp: a hora vem com pontos. Era o defeito em produção
    # — todo áudio do WhatsApp voltava "terminou sem gerar texto".
    def test_le_a_saida_de_audio_com_pontos_no_nome(self, tmp_path):
        audio = tmp_path / "WhatsApp_Ptt_2026-09-30_at_22.15.03.ogg"
        audio.write_bytes(b"x")
        texto = executar_mlx_whisper(
            audio, "m", "pt", "p", binario="mlx", rodar=rodar_como_mlx_whisper("oi")
        )
        assert texto == "oi"

    def test_saida_ausente_traz_o_erro_que_o_whisper_imprimiu(self, tmp_path):
        audio = tmp_path / "quebrado.ogg"
        audio.write_bytes(b"x")
        rodar = rodar_como_mlx_whisper(
            None,
            stderr="Skipping quebrado.ogg due to RuntimeError: Failed to load audio",
        )
        with pytest.raises(TranscricaoFalhou, match="Failed to load audio"):
            executar_mlx_whisper(audio, "m", "pt", "p", binario="mlx", rodar=rodar)

    # O que vira toast no admin: a linha de erro do ffmpeg, não o banner dele.
    def test_mensagem_de_falha_e_a_ultima_linha_de_erro_sem_o_banner(self, tmp_path):
        audio = tmp_path / "quebrado.ogg"
        audio.write_bytes(b"x")
        stderr = (
            "Skipping quebrado.ogg due to RuntimeError: Failed to load audio: "
            "ffmpeg version 8.1.1\n"
            "  libavutil      60. 26.101 / 60. 26.101\n"
            "[in#0 @ 0x80301c000] Error opening input: Invalid data found\n"
            "Error opening input files: Invalid data found when processing input\n"
        )
        rodar = rodar_como_mlx_whisper(None, stderr=stderr)
        with pytest.raises(TranscricaoFalhou) as erro:
            executar_mlx_whisper(audio, "m", "pt", "p", binario="mlx", rodar=rodar)
        mensagem = str(erro.value)
        assert mensagem.endswith(
            "Error opening input files: Invalid data found when processing input"
        )
        assert "libavutil" not in mensagem
