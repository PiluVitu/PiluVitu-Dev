import type { MapaColunas } from '@piluvitu/tools/import/csv'

/**
 * Mapa de colunas do CSV, salvo por conta (spec §6 — "o dono mapeia as
 * colunas uma vez por banco, e o mapa fica salvo"). Cada conta representa,
 * na prática, um banco/cartão específico neste app — chavear por
 * `account_id` evita pedir ao dono um identificador de banco à parte.
 *
 * `localStorage`, não a tabela `settings` do Worker (que hoje só conhece a
 * chave `fixed_net_cents` — ver `domain/settings.ts`/`routes/settings.ts`):
 * estender o backend para chave-valor genérica está fora do escopo dos
 * arquivos desta task (só `web/src/pages/importar.tsx` + `App.tsx`).
 * `localStorage` já é o precedente estabelecido para "configuração salva no
 * navegador" neste app (`lib/theme.ts`), e mantém a garantia de que o
 * arquivo/mapeamento nunca precisa trafegar para ser lembrado.
 */
const PREFIXO_CHAVE = 'financas-import-mapa:'

function isMapaColunas(value: unknown): value is MapaColunas {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.data === 'number' &&
    typeof v.valor === 'number' &&
    typeof v.descricao === 'number' &&
    typeof v.temCabecalho === 'boolean'
  )
}

export function mapaSalvo(accountId: string): MapaColunas | null {
  try {
    const bruto = localStorage.getItem(PREFIXO_CHAVE + accountId)
    if (bruto === null) return null
    const parsed: unknown = JSON.parse(bruto)
    return isMapaColunas(parsed) ? parsed : null
  } catch {
    // JSON corrompido ou localStorage indisponível (modo privado/cota) —
    // degrada para "sem mapa salvo", que reabre a etapa de mapeamento em
    // vez de quebrar a importação.
    return null
  }
}

export function salvarMapa(accountId: string, mapa: MapaColunas): void {
  try {
    localStorage.setItem(PREFIXO_CHAVE + accountId, JSON.stringify(mapa))
  } catch {
    // localStorage pode LANÇAR (não só faltar) em storage particionado/modo
    // privado (mesmo achado M5 do fix final, lib/theme.ts) — perder a
    // persistência do mapa não pode impedir a importação atual de terminar.
  }
}
