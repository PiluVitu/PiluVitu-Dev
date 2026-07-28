"""Dinheiro em centavos inteiros. Porte de packages/tools/src/money.ts.

⚠️ Duplicação DELIBERADA, não descuido. `@piluvitu/tools` é TypeScript e este
é um quarto runtime (Python, no Mac) — não há fronteira de import entre eles,
mesma decisão já registrada para `todayInTeresina` existir no Worker E na SPA.
A saída tem que bater byte a byte com a do TS, porque os dois formatam o MESMO
número para o MESMO dono ler.
"""

from __future__ import annotations


def format_brl(cents: int) -> str:
    """1999 -> 'R$ 19,99'. -3500 -> '-R$ 35,00'.

    Formatação manual em vez de locale/Intl: o resultado de um formatador de
    locale varia com a versão do ICU do runtime (e insere U+00A0 entre 'R$' e
    o número). Aqui a saída é a mesma em qualquer lugar.
    """
    if isinstance(cents, bool) or not isinstance(cents, int):
        raise TypeError(
            f"centavos precisam ser int (nunca float/bool/str): {cents!r}"
        )

    abs_cents = abs(cents)
    inteiro = f"{abs_cents // 100:,}".replace(",", ".")
    decimal = f"{abs_cents % 100:02d}"
    sinal = "-" if cents < 0 else ""
    return f"{sinal}R$ {inteiro},{decimal}"
