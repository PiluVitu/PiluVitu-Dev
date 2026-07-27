import type { MapaColunas } from '@piluvitu/tools/import/csv'
import { api } from '../api'

/**
 * Mapa de colunas do CSV, salvo por conta (spec §6 — "o dono mapeia as
 * colunas uma vez por banco, e o mapa fica salvo"). Cada conta representa,
 * na prática, um banco/cartão específico neste app — chavear por
 * `account_id` evita pedir ao dono um identificador de banco à parte.
 *
 * Persistido em `GET|PUT /api/settings/:key` (tabela `settings`, chave
 * `import_map:<account_id>`) — NÃO em `localStorage`. `settings` já é
 * chave-valor genérico desde a migration 0005 (comentário do próprio
 * schema: "uma configuração futura reusa esta MESMA tabela sem migration
 * nova"); a versão anterior desta task tinha ficado em `localStorage`
 * alegando que generalizar o backend estava fora de escopo — errado, a
 * tabela já era genérica, só faltava o endpoint (`routes/settings.ts`,
 * `GET|PUT /settings/:key`, adicionado nesta mesma fatia). `localStorage`
 * quebrava o caso real de dois dispositivos (o dono lança do Android,
 * revisa no MacBook): o mapa mapeado no laptop nunca aparecia no celular.
 */
function chaveImportMap(accountId: string): string {
  return `import_map:${accountId}`
}

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

export async function mapaSalvo(
  accountId: string,
): Promise<MapaColunas | null> {
  try {
    const { value } = await api<{ key: string; value: string | null }>(
      `/api/settings/${encodeURIComponent(chaveImportMap(accountId))}`,
    )
    if (value === null) return null
    const parsed: unknown = JSON.parse(value)
    return isMapaColunas(parsed) ? parsed : null
  } catch {
    // JSON corrompido ou rede fora (`ApiError`) — degrada pra "sem mapa
    // salvo", que reabre a etapa de mapeamento em vez de travar a
    // importação atual. Todo caso aqui degrada da mesma forma, não
    // precisa distinguir a causa.
    return null
  }
}

export async function salvarMapa(
  accountId: string,
  mapa: MapaColunas,
): Promise<void> {
  try {
    await api(
      `/api/settings/${encodeURIComponent(chaveImportMap(accountId))}`,
      {
        method: 'PUT',
        body: JSON.stringify({ value: JSON.stringify(mapa) }),
      },
    )
  } catch {
    // Falha ao salvar (rede fora, 5xx) não pode impedir a importação ATUAL
    // de terminar — só a PRÓXIMA importação daquela conta reabre a etapa
    // de mapeamento, em vez de travar a que está em andamento.
  }
}
