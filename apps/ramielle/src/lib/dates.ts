/**
 * Datas de fio, no formato que a API Go emite.
 *
 * ⚠️ MEDIDO: no Go, `CreatedAt` é `time.Time` e o `encoding/json` serializa em
 * RFC3339 (`2026-05-19T12:00:00Z`). No D1 a coluna é TEXT com
 * `DEFAULT CURRENT_TIMESTAMP`, e o CURRENT_TIMESTAMP do SQLite grava
 * `2026-05-19 12:00:00` — separador ESPAÇO, sem T e sem Z. Devolver o valor
 * cru quebra o cliente: `new Date('2026-05-19 12:00:00')` é aceito pelo V8 e
 * REJEITADO pelo Safari (Invalid Date), e o apps/web renderiza essa data.
 * Mesma classe de armadilha do fuso que este projeto já mediu três vezes:
 * só aparece em um dos ambientes.
 */

/** Instante atual (ou o injetado) em `YYYY-MM-DDTHH:MM:SSZ`. */
export function nowIsoUtc(now: Date = new Date()): string {
  return `${now.toISOString().slice(0, 19)}Z`
}

/** Normaliza o que veio do SQLite para o formato de fio. */
export function toIsoUtc(valor: string): string {
  const bruto = (valor ?? '').trim()
  if (bruto === '') {
    throw new RangeError(
      'data vazia — o D1 devolveu uma coluna de data em branco',
    )
  }
  // O `T` fecha a lacuna do CURRENT_TIMESTAMP; o `Z` fecha a de fuso ausente
  // (o SQLite grava UTC, mas sem dizer).
  const comT = bruto.includes('T') ? bruto : bruto.replace(' ', 'T')
  const comZone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(comT) ? comT : `${comT}Z`
  const d = new Date(comZone)
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(
      `data inválida vinda do banco: ${JSON.stringify(valor)}`,
    )
  }
  return nowIsoUtc(d)
}
