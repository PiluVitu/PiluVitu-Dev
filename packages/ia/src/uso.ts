import { chamarClaude, type PedidoClaude, type RespostaClaude } from './claude'
import { estimativaMicroUsd, type Modelo } from './custo'
import { ClaudeDesligado, ClaudeRecusou, TetoAtingido } from './erros'

export type ComandoD1 = {
  bind(...valores: unknown[]): ComandoD1
  run(): Promise<{ meta: { changes: number } }>
  first<T = Record<string, unknown>>(): Promise<T | null>
}

export type BancoD1 = { prepare(sql: string): ComandoD1 }

export type Reserva = {
  feature: string
  mes: string
  modelo: Modelo
  estimativaMicro: number
  tetoMicro: number
}

const TRES_HORAS_MS = 3 * 60 * 60 * 1000

// America/Fortaleza é UTC-3 fixo, sem horário de verão desde 2001.
export function mesFortaleza(agora: Date = new Date()): string {
  return new Date(agora.getTime() - TRES_HORAS_MS).toISOString().slice(0, 7)
}

function gastoDoMes(feature: string, mes: string): string {
  return `SELECT COALESCE(SUM(CASE estado
    WHEN 'concluido' THEN COALESCE(custo_micro, 0)
    WHEN 'reservado' THEN reservado_micro
    ELSE 0 END), 0)
  FROM uso_ia WHERE feature = ${feature} AND mes = ${mes}`
}

export async function reservar(db: BancoD1, r: Reserva): Promise<string> {
  const id = crypto.randomUUID()
  const resultado = await db
    .prepare(
      `INSERT INTO uso_ia (id, feature, mes, modelo, estado, reservado_micro, criado_em)
       SELECT ?1, ?2, ?3, ?4, 'reservado', ?5, ?6
       WHERE (${gastoDoMes('?2', '?3')}) + ?5 <= ?7`,
    )
    .bind(
      id,
      r.feature,
      r.mes,
      r.modelo,
      r.estimativaMicro,
      new Date().toISOString(),
      r.tetoMicro,
    )
    .run()

  if (resultado.meta.changes === 0) {
    const gasto = await db
      .prepare(`SELECT (${gastoDoMes('?1', '?2')}) AS gasto`)
      .bind(r.feature, r.mes)
      .first<{ gasto: number }>()
    throw new TetoAtingido(r.feature, r.mes, r.tetoMicro, gasto?.gasto ?? 0)
  }
  return id
}

export async function concluir(
  db: BancoD1,
  id: string,
  resposta: RespostaClaude,
): Promise<void> {
  const { uso } = resposta
  const entrada =
    uso.input_tokens +
    (uso.cache_read_input_tokens ?? 0) +
    (uso.cache_creation_input_tokens ?? 0)
  await db
    .prepare(
      `UPDATE uso_ia
       SET estado = 'concluido', custo_micro = ?, tokens_entrada = ?, tokens_saida = ?, concluido_em = ?
       WHERE id = ? AND estado = 'reservado'`,
    )
    .bind(
      resposta.custoMicro,
      entrada,
      uso.output_tokens,
      new Date().toISOString(),
      id,
    )
    .run()
}

export async function liberar(db: BancoD1, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE uso_ia SET estado = 'falhou', concluido_em = ?
       WHERE id = ? AND estado = 'reservado'`,
    )
    .bind(new Date().toISOString(), id)
    .run()
}

async function cobrarEstimativa(db: BancoD1, id: string): Promise<void> {
  await db
    .prepare(
      `UPDATE uso_ia SET estado = 'concluido', custo_micro = reservado_micro, concluido_em = ?
       WHERE id = ? AND estado = 'reservado'`,
    )
    .bind(new Date().toISOString(), id)
    .run()
}

// 'recusa' e 'formato' vêm de uma resposta que a API já cobrou, mas cujo uso
// não chega até aqui; contar a estimativa inteira erra para o lado barato.
function foiCobrada(err: unknown): boolean {
  return (
    err instanceof ClaudeRecusou &&
    (err.motivo === 'recusa' || err.motivo === 'formato')
  )
}

export type ConfigOrcamento = {
  feature: string
  tetoMicro: number
  apiKey?: string
  fetch?: typeof fetch
}

export async function comOrcamento(
  db: BancoD1,
  cfg: ConfigOrcamento,
  pedido: PedidoClaude,
): Promise<RespostaClaude> {
  if (!cfg.apiKey) throw new ClaudeDesligado()

  const id = await reservar(db, {
    feature: cfg.feature,
    mes: mesFortaleza(),
    modelo: pedido.modelo,
    estimativaMicro: estimativaMicroUsd(
      pedido.modelo,
      pedido.system.length + pedido.user.length,
      pedido.maxTokens,
    ),
    tetoMicro: cfg.tetoMicro,
  })

  let resposta: RespostaClaude
  try {
    resposta = await chamarClaude(cfg.apiKey, pedido, { fetch: cfg.fetch })
  } catch (err) {
    await (foiCobrada(err) ? cobrarEstimativa(db, id) : liberar(db, id))
    throw err
  }
  await concluir(db, id, resposta)
  return resposta
}
