from datetime import UTC, datetime, timedelta, timezone

import pytest

from promeia.dates import competencia_atual, competencia_valida


def test_o_caso_que_ja_deu_bug_tres_vezes_neste_projeto():
    """22h do dia 31/01 em Teresina é 01h do dia 01/02 em UTC.

    Sem subtrair o offset, a competência sairia '2026-02' — o mês errado,
    justamente na virada, que é quando importa. Mesmo bug já corrigido em
    lib/dates.ts (Worker), web/src/lib/dates.ts (SPA) e cashflow.ts.
    """
    momento = datetime(2026, 2, 1, 1, 0, tzinfo=UTC)
    assert competencia_atual(momento) == "2026-01"


def test_meio_do_mes_nao_muda():
    assert competencia_atual(datetime(2026, 7, 15, 12, 0, tzinfo=UTC)) == ("2026-07")


def test_a_borda_exata_do_offset():
    # 03:00Z do dia 1 é exatamente 00:00 em Teresina — já é o mês novo.
    assert competencia_atual(datetime(2026, 3, 1, 3, 0, tzinfo=UTC)) == ("2026-03")
    # 02:59Z ainda é 23:59 do último dia de fevereiro.
    assert competencia_atual(datetime(2026, 3, 1, 2, 59, tzinfo=UTC)) == ("2026-02")


def test_virada_de_ano():
    assert competencia_atual(datetime(2027, 1, 1, 2, 0, tzinfo=UTC)) == ("2026-12")


def test_aceita_datetime_de_outro_fuso_convertendo_para_utc_antes():
    # Um datetime em -03:00 já É o horário local; a função tem que normalizar
    # para UTC antes de subtrair, não subtrair duas vezes.
    local = datetime(2026, 1, 31, 22, 0, tzinfo=timezone(timedelta(hours=-3)))
    assert competencia_atual(local) == "2026-01"


def test_recusa_datetime_ingenuo():
    # Um datetime sem fuso é ambíguo — assumir UTC em silêncio é como o bug
    # de UTC nasce. Falhar alto é o comportamento certo.
    with pytest.raises(ValueError, match="fuso"):
        competencia_atual(datetime(2026, 2, 1, 1, 0))


def test_sem_argumento_usa_o_relogio_e_devolve_formato_valido():
    assert competencia_valida(competencia_atual())


@pytest.mark.parametrize(
    ("valor", "esperado"),
    [
        ("2026-01", True),
        ("2026-12", True),
        ("2026-00", False),
        ("2026-13", False),
        ("2026-1", False),
        ("26-01", False),
        ("2026/01", False),
        ("", False),
        ("2026-01-15", False),
    ],
)
def test_competencia_valida(valor, esperado):
    assert competencia_valida(valor) is esperado
