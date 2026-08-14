from dataclasses import FrozenInstanceError

import pytest

from promeia.markdown_blocos import Bloco, Tipo, dividir_blocos, restaurar_bordas

# ⚠️ A INVARIANTE é o teste mais importante deste módulo: a concatenação dos
# blocos reproduz a entrada BYTE A BYTE. Sem ela, o proofread remonta o artigo
# perdendo/inventando espaço em branco — e o resultado continua "parecendo"
# markdown, então a corrupção passa despercebida.

ENTRADAS_HOSTIS = [
    pytest.param("", id="vazio"),
    pytest.param("   ", id="so-espacos-sem-quebra"),
    pytest.param("\n\n\n", id="so-quebras"),
    pytest.param("uma linha sem quebra no fim", id="sem-quebra-final"),
    pytest.param("com quebra no fim\n", id="com-quebra-final"),
    pytest.param("\n\ncomeca com linhas em branco", id="comeca-em-branco"),
    pytest.param("termina com linhas em branco\n\n\n", id="termina-em-branco"),
    pytest.param("a\r\nb\r\n", id="crlf"),
    pytest.param(
        "prosa\n\n```py\ncodigo\n\ncom linha em branco\n```\n\nmais prosa\n",
        id="codigo-com-linha-em-branco",
    ),
    pytest.param("prosa\n\n```py\nnunca fecha\n", id="cerca-nao-fechada"),
    pytest.param("| a | b |\n| - | - |\n\ntexto\n", id="tabela"),
    pytest.param("<div>\n  <p>oi</p>\n</div>\n\ntexto\n", id="html"),
    pytest.param("> citação\n> segunda linha\n\ntexto\n", id="citacao"),
    pytest.param("![alt](/img.png)\n\ntexto\n", id="imagem"),
    pytest.param(
        "# Título\n\nParágrafo com *ênfase* e `código inline`.\n", id="prosa-rica"
    ),
    pytest.param("```\n```\n", id="cerca-vazia"),
    pytest.param("texto\n```\nfecha sem abrir label\n```\ndepois\n", id="cerca-colada"),
]


@pytest.mark.parametrize("entrada", ENTRADAS_HOSTIS)
def test_INVARIANTE_concatenar_os_blocos_reproduz_a_entrada_byte_a_byte(entrada):
    blocos = dividir_blocos(entrada)
    assert "".join(b.texto for b in blocos) == entrada


def test_prosa_e_separada_do_codigo():
    entrada = "Olá mundo.\n\n```py\nprint(1)\n```\n\nTchau.\n"
    blocos = dividir_blocos(entrada)
    prosa = [b.texto for b in blocos if b.tipo is Tipo.PROSA]
    assert prosa == ["Olá mundo.\n", "Tchau.\n"]
    # O código NUNCA pode ser classificado como prosa — é o que impede o LLM
    # de "corrigir" um trecho de código.
    assert "print(1)" not in "".join(prosa)


def test_bloco_de_codigo_e_ATOMICO_mesmo_com_linha_em_branco_dentro():
    # Sem atomicidade, a linha em branco quebraria a cerca em dois blocos e o
    # segundo pedaço iria pro LLM como se fosse prosa.
    entrada = "```py\na = 1\n\nb = 2\n```\n"
    blocos = dividir_blocos(entrada)
    assert len(blocos) == 1
    assert blocos[0].tipo is Tipo.PASSTHROUGH
    assert blocos[0].texto == entrada


def test_cerca_nao_fechada_ate_o_fim_continua_passthrough():
    entrada = "```py\nnunca fecha\n"
    blocos = dividir_blocos(entrada)
    assert all(b.tipo is Tipo.PASSTHROUGH for b in blocos)


@pytest.mark.parametrize(
    "primeiro_caractere,rotulo",
    [("|", "tabela"), ("<", "html/jsx"), (">", "citação"), ("![", "imagem")],
)
def test_nao_prosa_por_primeira_linha(primeiro_caractere, rotulo):
    entrada = f"{primeiro_caractere} conteudo\n"
    blocos = dividir_blocos(entrada)
    assert [b.tipo for b in blocos] == [Tipo.PASSTHROUGH], rotulo


def test_bloco_so_de_espaco_em_branco_e_passthrough():
    blocos = dividir_blocos("texto\n\n   \n\noutro\n")
    assert [b.tipo for b in blocos if b.texto.strip() == ""] != []
    assert all(b.tipo is Tipo.PASSTHROUGH for b in blocos if b.texto.strip() == "")


def test_restaurar_bordas_devolve_o_espacamento_do_original():
    # O chat devolve trimado; sem isto a remontagem cola os blocos.
    #
    # ⚠️ A borda inclui ESPAÇOS e TABS, não só quebras de linha — o Go trima
    # " \t\r\n" nos dois lados (`restoreEdges`, chunk.go). A indentação de um
    # item de lista mora nessa borda: descartá-la reindentaria a lista inteira
    # na remontagem. Escrevi este teste esperando "\n\nTEXTO\n\n" e ele pegou
    # a diferença — a implementação estava certa, a expectativa é que estava.
    assert restaurar_bordas("\n\n  texto  \n\n", "TEXTO") == "\n\n  TEXTO  \n\n"


def test_restaurar_bordas_preserva_indentacao_de_lista():
    # Caso concreto do porquê acima: sem preservar o espaço à esquerda, um
    # sub-item de lista perde o nível na remontagem.
    assert restaurar_bordas("  - item\n", "- item corrigido") == "  - item corrigido\n"


def test_restaurar_bordas_sem_bordas_e_identidade():
    assert restaurar_bordas("texto", "TEXTO") == "TEXTO"


def test_bloco_e_imutavel():
    # frozen=True: um bloco alterado depois da divisão quebraria a invariante
    # silenciosamente, já que a checagem é feita na saída de dividir_blocos.
    bloco = Bloco(tipo=Tipo.PROSA, texto="x")
    # Exceção ESPECÍFICA, não `Exception` cru: um `pytest.raises(Exception)`
    # passaria por qualquer motivo — inclusive um `AttributeError` de campo
    # com nome errado, que provaria o contrário do que o teste alega.
    with pytest.raises(FrozenInstanceError):
        bloco.texto = "outro"  # type: ignore[misc]
