"""Transcrição de áudio com Whisper local (MLX/Metal).

⚠️ **Por que subprocess e não `import mlx_whisper`.** O `mlx-whisper` depende
do `mlx`, que só existe em macOS/arm64. Declará-lo em `pyproject.toml`
quebraria o `uv sync --locked` do CI, que roda em Ubuntu — e o serviço inteiro
deixaria de instalar num runner Linux por causa de UMA rota. Chamando o
binário, a dependência vira requisito de AMBIENTE (a máquina do dono, que é a
única onde esta rota faz sentido rodar), não de pacote. O executor é injetado
(`executar=`), então o teste nunca toca no binário.

⚠️ **O encadeamento de contexto é o produto deste módulo, não um detalhe.**
Áudios que se complementam precisam grafar o mesmo nome próprio do mesmo jeito
nos três. O `initial_prompt` do Whisper cabe em 224 tokens, então só a cauda
do áudio anterior entra — ver `PALAVRAS_DE_CONTEXTO`.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from collections.abc import Callable, Sequence
from pathlib import Path

MODELO_PADRAO = "mlx-community/whisper-large-v3-mlx"
# Destilado: ~13x tempo real contra ~4,4x do large-v3 (MEDIDO num M4), ao
# custo de precisão. Existe pro áudio que não cabe no teto de tempo abaixo.
MODELO_RAPIDO = "mlx-community/whisper-large-v3-turbo"
IDIOMA_PADRAO = "pt"

# ⚠️ O teto real NÃO é tamanho de arquivo, é TEMPO. A Cloudflare corta a
# requisição do navegador em ~100 s (524), e o ramielle desiste em 120 s
# (`TIMEOUT_MS`). A 4,4x tempo real, `MODELO_PADRAO` dá conta de ~7 min de
# áudio dentro desse orçamento; `MODELO_RAPIDO`, de ~20 min. Os limites de
# bytes abaixo são um PROXY grosseiro disso — medir duração exigiria ffprobe,
# uma segunda dependência de ambiente, e o proxy já barra o caso absurdo.
MAX_AUDIOS = 10
MAX_BYTES_TOTAL = 40 * 1024 * 1024

# O initial_prompt do Whisper cabe em 224 tokens; passar mais faz a janela
# cortar em silêncio. 120 palavras deixa folga para a base e os termos.
PALAVRAS_DE_CONTEXTO = 120

NOME_SAIDA = "transcricao"

BASE_PROMPT = (
    "Transcrição em português do Brasil, com pontuação correta, "
    "acentuação completa e uso normal de maiúsculas."
)


class TranscricaoError(Exception):
    """Base — todo erro desta camada desce daqui."""


class WhisperIndisponivel(TranscricaoError):
    """Não achei o binário. Instale com `uv tool install mlx-whisper`."""


class TranscricaoFalhou(TranscricaoError):
    """O Whisper rodou e falhou. O gargalo é o áudio ou o modelo."""


class TranscricaoVazia(TranscricaoFalhou):
    """Rodou, saiu vazio. Espelha `OllamaVazio`: vazio é falha, nunca sucesso."""


def cauda(texto: str, palavras: int = PALAVRAS_DE_CONTEXTO) -> str:
    """As últimas `palavras` de `texto`, numa linha só."""
    pedacos = texto.split()
    return " ".join(pedacos[-palavras:])


def montar_prompt(*, termos: str = "", contexto: str = "") -> str:
    partes = [BASE_PROMPT]
    if termos.strip():
        partes.append(f"Termos que aparecem: {termos.strip()}.")
    if contexto.strip():
        partes.append(f"Continuação de: {contexto.strip()}")
    return " ".join(partes)


def transcrever(
    caminhos: Sequence[Path],
    *,
    executar: Callable[[Path, str, str, str], str],
    modelo: str = MODELO_PADRAO,
    idioma: str = IDIOMA_PADRAO,
    termos: str = "",
) -> list[str]:
    """Transcreve na ORDEM dada, encadeando o contexto de um no seguinte."""
    if not caminhos:
        raise ValueError("nenhum áudio informado")

    textos: list[str] = []
    contexto = ""
    for caminho in caminhos:
        prompt = montar_prompt(termos=termos, contexto=contexto)
        texto = executar(caminho, modelo, idioma, prompt).strip()
        if not texto:
            raise TranscricaoVazia(
                f"O Whisper devolveu texto vazio para '{caminho.name}'. "
                "O áudio pode estar mudo ou corrompido."
            )
        textos.append(texto)
        contexto = cauda(texto)
    return textos


def _linha_de_erro(saida: str) -> str:
    """A última linha com "Error" — o resto é o banner de versão do ffmpeg."""
    linhas = [linha.strip() for linha in saida.splitlines() if linha.strip()]
    erros = [linha for linha in linhas if "Error" in linha]
    escolhida = erros[-1] if erros else (linhas[-1] if linhas else "")
    return escolhida[-300:]


def executar_mlx_whisper(
    caminho: Path,
    modelo: str,
    idioma: str,
    prompt: str,
    *,
    binario: str | None = None,
    rodar: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> str:
    """Executor real. `WHISPER_BIN` sobrescreve o binário (útil fora do PATH)."""
    exe = binario or os.environ.get("WHISPER_BIN", "mlx_whisper")

    with tempfile.TemporaryDirectory() as tmp:
        args = [
            exe,
            str(caminho),
            "--model",
            modelo,
            "--language",
            idioma,
            # Determinístico: sem amostragem, a mesma entrada dá a mesma saída.
            "--temperature",
            "0",
            "--condition-on-previous-text",
            "True",
            # O modo clássico do Whisper inventar frase repetida em trecho mudo.
            "--hallucination-silence-threshold",
            "2",
            "--initial-prompt",
            prompt,
            "--output-dir",
            tmp,
            "--output-format",
            "txt",
            # Nome fixo: o mlx_whisper usa `with_suffix`, que corta o último
            # trecho de um nome com pontos (áudio do WhatsApp: `..._22.15.03`).
            "--output-name",
            NOME_SAIDA,
            "--verbose",
            "False",
        ]
        try:
            proc = rodar(args, capture_output=True, text=True)
        except FileNotFoundError as err:
            raise WhisperIndisponivel(
                f"Não encontrei o '{exe}'. Instale com "
                "`uv tool install mlx-whisper` na máquina que roda o promeia."
            ) from err

        if proc.returncode != 0:
            cauda_erro = (proc.stderr or "").strip()[-300:]
            raise TranscricaoFalhou(
                f"O Whisper falhou em '{caminho.name}': {cauda_erro or 'sem detalhe'}"
            )

        saida = Path(tmp) / f"{NOME_SAIDA}.txt"
        if not saida.exists():
            # O mlx_whisper sai 0 quando pula um áudio por erro; a causa só
            # aparece no que ele imprimiu.
            detalhe = _linha_de_erro((proc.stderr or "") + (proc.stdout or ""))
            raise TranscricaoFalhou(
                f"O Whisper terminou sem gerar texto para '{caminho.name}': "
                f"{detalhe or 'sem detalhe'}"
            )
        return saida.read_text(encoding="utf-8")
