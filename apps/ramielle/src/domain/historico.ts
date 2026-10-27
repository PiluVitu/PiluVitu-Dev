// Histórico público do Votaí: `votes.user_id` só entra em COUNT DISTINCT e
// nenhuma coluna de `users` nem `created_by` é lida. Ver "Histórico público
// do Votaí" no CLAUDE.md.
import { toIsoUtc } from '../lib/dates'

export const HISTORICO_PAGE_SIZE = 10

export type HistoricoFilme = {
  id: number
  title: string
  type: 'filme' | 'serie'
  category: string
  poster_url: string
  votes: number
}

export type HistoricoSessao = {
  id: number
  title: string
  created_at: string
  closed_at: string | null
  theme: 'halloween' | null
  mode: 'votacao' | 'roleta'
  winner_movie_id: number | null
  winner_method: 'votes' | 'roulette' | null
  total_voters: number
  total_votes: number
  movies: HistoricoFilme[]
}

export type HistoricoPagina = {
  sessions: HistoricoSessao[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}

type SessaoRow = {
  id: number
  title: string
  created_at: string
  closed_at: string | null
  winner_movie_id: number | null
  winner_method: 'votes' | 'roulette' | null
  sort_options_json: string
}

type FilmeRow = {
  session_id: number
  id: number
  title: string
  type: 'filme' | 'serie'
  category: string
  poster_url: string | null
  votes: number
}

type TotaisRow = {
  session_id: number
  total_voters: number
  total_votes: number
}

const SESSAO_COLUMNS = `
  id, title, created_at, closed_at, winner_movie_id, winner_method, sort_options_json
`

// `datetime()` porque o histórico mistura `2026-05-19 12:00:00` (importado da
// Go, CURRENT_TIMESTAMP) e `2026-05-19T12:00:00Z` (gravado aqui): comparadas
// como texto, o espaço ordena antes do `T` no mesmo dia.
const ORDEM_ENCERRADAS = `datetime(closed_at) DESC, id DESC`

function temaEModo(sortOptionsJson: string): {
  theme: HistoricoSessao['theme']
  mode: HistoricoSessao['mode']
} {
  let opts: { theme?: unknown; mode?: unknown } | null
  try {
    opts = JSON.parse(sortOptionsJson) as typeof opts
  } catch {
    opts = null
  }
  return {
    theme: opts?.theme === 'halloween' ? 'halloween' : null,
    mode: opts?.mode === 'roleta' ? 'roleta' : 'votacao',
  }
}

async function montar(
  db: D1Database,
  sessoes: SessaoRow[],
): Promise<HistoricoSessao[]> {
  if (sessoes.length === 0) return []
  const ids = sessoes.map((s) => s.id)
  const marcadores = ids.map(() => '?').join(', ')

  const [filmes, totais] = await db.batch([
    db
      .prepare(
        `SELECT m.session_id, m.id, m.title, m.type, m.category, m.poster_url,
                COUNT(v.id) AS votes
           FROM session_movies m
           LEFT JOIN votes v ON v.movie_id = m.id AND v.session_id = m.session_id
          WHERE m.session_id IN (${marcadores})
          GROUP BY m.id
          ORDER BY m.session_id, votes DESC, m.id ASC`,
      )
      .bind(...ids),
    db
      .prepare(
        `SELECT session_id,
                COUNT(DISTINCT user_id) AS total_voters,
                COUNT(*) AS total_votes
           FROM votes
          WHERE session_id IN (${marcadores})
          GROUP BY session_id`,
      )
      .bind(...ids),
  ])

  const filmesPorSessao = new Map<number, HistoricoFilme[]>()
  for (const f of (filmes?.results ?? []) as FilmeRow[]) {
    const lista = filmesPorSessao.get(f.session_id) ?? []
    lista.push({
      id: f.id,
      title: f.title,
      type: f.type,
      category: f.category,
      poster_url: f.poster_url ?? '',
      votes: f.votes,
    })
    filmesPorSessao.set(f.session_id, lista)
  }
  const totaisPorSessao = new Map<number, TotaisRow>()
  for (const t of (totais?.results ?? []) as TotaisRow[]) {
    totaisPorSessao.set(t.session_id, t)
  }

  return sessoes.map((s) => {
    const t = totaisPorSessao.get(s.id)
    return {
      id: s.id,
      title: s.title,
      created_at: toIsoUtc(s.created_at),
      closed_at: s.closed_at ? toIsoUtc(s.closed_at) : null,
      ...temaEModo(s.sort_options_json),
      winner_movie_id: s.winner_movie_id,
      winner_method: s.winner_method,
      total_voters: t?.total_voters ?? 0,
      total_votes: t?.total_votes ?? 0,
      movies: filmesPorSessao.get(s.id) ?? [],
    }
  })
}

/** `page` já validada pela rota (inteiro >= 1). */
export async function listarHistorico(
  db: D1Database,
  page: number,
): Promise<HistoricoPagina> {
  const offset = (page - 1) * HISTORICO_PAGE_SIZE
  const contagem = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM voting_sessions WHERE status = 'closed'`,
    )
    .first<{ total: number }>()
  const total = contagem?.total ?? 0
  if (offset >= total) {
    return {
      sessions: [],
      page,
      page_size: HISTORICO_PAGE_SIZE,
      total,
      has_more: false,
    }
  }
  const pagina = await db
    .prepare(
      `SELECT ${SESSAO_COLUMNS}
         FROM voting_sessions
        WHERE status = 'closed'
        ORDER BY ${ORDEM_ENCERRADAS}
        LIMIT ? OFFSET ?`,
    )
    .bind(HISTORICO_PAGE_SIZE, offset)
    .all<SessaoRow>()
  const sessions = await montar(db, pagina.results)
  return {
    sessions,
    page,
    page_size: HISTORICO_PAGE_SIZE,
    total,
    has_more: offset + sessions.length < total,
  }
}

/** `null` para sessão inexistente ou ainda aberta. */
export async function buscarSessaoDoHistorico(
  db: D1Database,
  id: number,
): Promise<HistoricoSessao | null> {
  const row = await db
    .prepare(
      `SELECT ${SESSAO_COLUMNS}
         FROM voting_sessions
        WHERE id = ? AND status = 'closed'`,
    )
    .bind(id)
    .first<SessaoRow>()
  if (!row) return null
  const [sessao] = await montar(db, [row])
  return sessao ?? null
}
