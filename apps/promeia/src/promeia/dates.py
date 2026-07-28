"""Competência (YYYY-MM) no fuso de Teresina.

⚠️ Teresina é UTC−3 FIXO — o Piauí não adota horário de verão desde 2019.
Offset constante, não uma tabela de fuso: a conta é a MESMA de
apps/financas/src/lib/dates.ts (Worker), web/src/lib/dates.ts (SPA) e
scripts/insight.mjs (o CLI que este módulo substitui). Quatro runtimes, sem
fronteira de import entre eles.

Esta conta já produziu bug TRÊS vezes neste repositório: data de compra
gravada em UTC, competência de fatura caindo no mês seguinte, e a coluna
v_cashflow.competence_month (que por isso está documentada como "não usar").
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta

TERESINA_OFFSET = timedelta(hours=3)
_COMPETENCE_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def competencia_atual(now: datetime | None = None) -> str:
    """Mês corrente em Teresina, como 'YYYY-MM'.

    `now` é injetado (nunca um relógio global mockado) — mesma disciplina de
    todayInTeresina(now?)/nowIsoUtc(now?) no Worker: mock de relógio global
    vaza entre testes do mesmo arquivo.
    """
    momento = datetime.now(UTC) if now is None else now
    if momento.tzinfo is None:
        raise ValueError(
            "competencia_atual precisa de um datetime com fuso (tz-aware) — "
            "um datetime ingênuo é ambíguo, e assumir UTC em silêncio é "
            "exatamente como o bug de fuso nasce neste projeto"
        )
    return (momento.astimezone(UTC) - TERESINA_OFFSET).strftime("%Y-%m")


def competencia_valida(valor: str) -> bool:
    """'2026-07' -> True. '2026-13', '2026-1', '2026-07-15' -> False."""
    return bool(_COMPETENCE_RE.match(valor or ""))
