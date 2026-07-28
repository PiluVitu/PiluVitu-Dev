import pytest

from promeia.money import format_brl


@pytest.mark.parametrize(
    ("cents", "esperado"),
    [
        (0, "R$ 0,00"),
        (1, "R$ 0,01"),
        (99, "R$ 0,99"),
        (100, "R$ 1,00"),
        (1999, "R$ 19,99"),
        (18900, "R$ 189,00"),
        (100000, "R$ 1.000,00"),
        (136000, "R$ 1.360,00"),
        (100000000, "R$ 1.000.000,00"),
        (-3500, "-R$ 35,00"),
        (-1, "-R$ 0,01"),
    ],
)
def test_formata_igual_ao_formatBRL_do_tools(cents, esperado):
    # Porte byte a byte de packages/tools/src/money.ts#formatBRL. Formatação
    # manual, nunca locale: o Intl/locale usa U+00A0 entre 'R$' e o número e
    # o resultado varia com a versão do ICU do runtime — aqui a saída tem que
    # ser idêntica em qualquer lugar, incluindo dentro de um prompt.
    assert format_brl(cents) == esperado


def test_o_separador_de_milhar_e_ponto_e_o_decimal_e_virgula():
    # A inversão silenciosa (padrão en-US) é o erro que um `f"{x:,.2f}"`
    # desavisado produz: 'R$ 1,360.00' em vez de 'R$ 1.360,00'.
    saida = format_brl(136000)
    assert saida == "R$ 1.360,00"
    assert "1,360" not in saida


def test_recusa_float():
    # Dinheiro é INTEGER centavos ponta a ponta. Um float aqui é o começo do
    # erro de centavo que o schema do D1 existe pra impedir.
    with pytest.raises(TypeError):
        format_brl(19.99)


def test_recusa_bool():
    # isinstance(True, int) é True em Python — sem checagem explícita,
    # format_brl(True) devolveria 'R$ 0,01' em silêncio.
    with pytest.raises(TypeError):
        format_brl(True)


def test_recusa_string():
    with pytest.raises(TypeError):
        format_brl("1999")
