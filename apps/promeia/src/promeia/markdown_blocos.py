"""Divide markdown em blocos: prosa (vai pro LLM) × passthrough (não vai).

Porte de `apps/api/internal/llm/chunk.go`.

⚠️ **A invariante é o contrato deste módulo:** a concatenação dos `.texto` de
todos os blocos reproduz a entrada **byte a byte**. Ela é o que permite ao
`proofread` remontar o artigo sem perder nada — quebrá-la corrompe o texto do
dono em silêncio, porque a saída continua "parecendo" markdown.

⚠️ É por isso que este módulo usa um split que **preserva o `\\n`** em vez de
`str.splitlines()`: o `splitlines()` DESCARTA os separadores, e a invariante
morre sem nenhum erro aparecer. O Go faz o mesmo com `strings.SplitAfter`.

Motivo de existir: o Go não manda o artigo inteiro pro modelo. Manda só a
prosa, pulando código, tabela, HTML/JSX, citação e imagem. Dois ganhos —
velocidade em artigo longo, e o LLM não estraga o que não é texto.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Tipo(Enum):
    """Prosa vai pro LLM; passthrough é mantido verbatim."""

    PROSA = "prosa"
    PASSTHROUGH = "passthrough"


@dataclass(frozen=True)
class Bloco:
    tipo: Tipo
    texto: str


def _linhas_com_quebra(texto: str) -> list[str]:
    """Divide mantendo o `\\n` no fim de cada linha (equivale a SplitAfter do Go).

    ⚠️ NÃO trocar por `splitlines()`: ele descarta os separadores e a
    invariante de reconstrução byte-a-byte morre em silêncio.
    """
    if texto == "":
        return []
    partes = texto.split("\n")
    linhas = [p + "\n" for p in partes[:-1]]
    # A última parte só é uma linha se o texto não terminar em \n.
    if partes[-1] != "":
        linhas.append(partes[-1])
    return linhas


def _e_passthrough(linhas: list[str]) -> bool:
    """Decide pela primeira linha não-vazia se o bloco é não-prosa."""
    primeira = ""
    for linha in linhas:
        despida = linha.strip()
        if despida != "":
            primeira = despida
            break
    if primeira == "":  # só espaço em branco
        return True
    return primeira.startswith(("|", "<", ">", "!["))


def dividir_blocos(entrada: str) -> list[Bloco]:
    """Divide o markdown em blocos ordenados, separando prosa do resto.

    Bloco de código cercado (```) é ATÔMICO: linha em branco dentro dele não
    o quebra, senão o LLM receberia metade de um trecho de código como se
    fosse prosa.
    """
    linhas = _linhas_com_quebra(entrada)
    blocos: list[Bloco] = []
    atual: list[str] = []
    atual_vazio = False

    def descarregar() -> None:
        nonlocal atual, atual_vazio
        if not atual:
            return
        tipo = (
            Tipo.PASSTHROUGH if (atual_vazio or _e_passthrough(atual)) else Tipo.PROSA
        )
        blocos.append(Bloco(tipo=tipo, texto="".join(atual)))
        atual = []
        atual_vazio = False

    i = 0
    while i < len(linhas):
        linha = linhas[i]
        despida = linha.strip()

        if despida.startswith("```"):
            descarregar()
            cerca = [linha]
            i += 1
            while i < len(linhas):
                cerca.append(linhas[i])
                fechou = linhas[i].strip().startswith("```")
                i += 1
                if fechou:
                    break
            # Cerca não fechada até o fim do arquivo continua passthrough:
            # mandar código truncado pro LLM é pior que não corrigi-lo.
            blocos.append(Bloco(tipo=Tipo.PASSTHROUGH, texto="".join(cerca)))
            continue

        vazia = despida == ""
        if atual and vazia != atual_vazio:
            descarregar()
        atual_vazio = vazia
        atual.append(linha)
        i += 1

    descarregar()
    return blocos


def restaurar_bordas(original: str, corrigido: str) -> str:
    """Reanexa o espaço em branco de borda do bloco original ao texto corrigido.

    O chat devolve o texto já trimado; sem isto, a remontagem cola os blocos
    e o espaçamento do artigo colapsa.
    """
    inicio = original[: len(original) - len(original.lstrip(" \t\r\n"))]
    fim = original[len(original.rstrip(" \t\r\n")) :]
    return inicio + corrigido + fim
