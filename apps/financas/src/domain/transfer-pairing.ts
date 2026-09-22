import { newId } from '../lib/ids'
import { getSetting, setSetting } from './settings'

/**
 * Pareamento de transferencia entre contas proprias que chegou pelo IMPORT.
 *
 * O anti-dupla-contagem do modulo inteiro (`cashflow`, `commitments`,
 * `byCategory`) e o filtro `transfer_id IS NULL` — e `transfer_id` so era
 * preenchido por `createTransfer()`, a tela "Transferir". Extrato importado
 * nao tem esse conceito: o Pluggy entrega as duas pernas como linhas
 * independentes, em requisicoes DIFERENTES (`importTransactions` recebe UMA
 * `account_id` por chamada), entao a saida virava despesa comum e inflava o
 * "Gasto em <mes>". Ver "Transferencia vinda do import" no CLAUDE.md pela
 * medicao que originou este modulo.
 *
 * ⚠️ **A contraparte faz parte do criterio, e nao e cosmetica.** Parear so
 * por valor+data casaria, nos dados reais do dono, uma saida de R$ 50 do
 * Nubank com um "Pix recebido - Livia R P Oliveira" no Inter — duas
 * movimentacoes distintas que coincidiram. Esconder esse par apagaria uma
 * despesa de verdade do relatorio, em silencio, que e exatamente o modo de
 * falha que este arquivo existe pra impedir.
 */

export const CHAVE_NOMES_PROPRIOS = 'transfer:self_names'

export type ParPareado = {
  transfer_id: string
  saida_id: string
  entrada_id: string
  purchase_date: string
  /** Magnitude, sempre positiva. */
  amount_cents: number
}

type LinhaCandidata = {
  id: string
  account_id: string
  purchase_date: string
  amount_cents: number
  description: string
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A descricao cita uma contraparte que e o proprio dono (pessoa fisica ou a
 * razao social da PJ)? Lista vazia responde `false` pra tudo — fail closed.
 */
export function contraparteEhPropria(
  descricao: string,
  nomes: readonly string[],
): boolean {
  const alvo = normalizar(descricao)
  return nomes.some((nome) => {
    const n = normalizar(nome)
    return n.length > 0 && alvo.includes(n)
  })
}

export async function getNomesProprios(db: D1Database): Promise<string[]> {
  const bruto = await getSetting(db, CHAVE_NOMES_PROPRIOS)
  if (bruto === null) return []
  try {
    const lista: unknown = JSON.parse(bruto)
    if (!Array.isArray(lista)) return []
    return lista
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
  } catch {
    return []
  }
}

export async function setNomesProprios(
  db: D1Database,
  nomes: readonly string[],
): Promise<void> {
  const limpos = nomes.map((n) => n.trim()).filter((n) => n.length > 0)
  await setSetting(db, CHAVE_NOMES_PROPRIOS, JSON.stringify(limpos))
}

function chaveDoGrupo(linha: LinhaCandidata): string {
  return `${linha.purchase_date}|${Math.abs(linha.amount_cents)}`
}

export async function parearTransferencias(
  db: D1Database,
  opts: { from?: string; to?: string; dry_run?: boolean } = {},
): Promise<{ pares: ParPareado[] }> {
  const nomes = await getNomesProprios(db)
  if (nomes.length === 0) return { pares: [] }

  const where: string[] = ['transfer_id IS NULL', 'parent_id IS NULL']
  const binds: string[] = []
  if (opts.from !== undefined) {
    where.push('purchase_date >= ?')
    binds.push(opts.from)
  }
  if (opts.to !== undefined) {
    where.push('purchase_date < ?')
    binds.push(opts.to)
  }

  const res = await db
    .prepare(
      `SELECT id, account_id, purchase_date, amount_cents, description
         FROM transactions
        WHERE ${where.join(' AND ')}
        ORDER BY purchase_date, id`,
    )
    .bind(...binds)
    .all<LinhaCandidata>()

  const grupos = new Map<
    string,
    { saidas: LinhaCandidata[]; entradas: LinhaCandidata[] }
  >()
  for (const linha of res.results) {
    if (!contraparteEhPropria(linha.description, nomes)) continue
    const chave = chaveDoGrupo(linha)
    let grupo = grupos.get(chave)
    if (grupo === undefined) {
      grupo = { saidas: [], entradas: [] }
      grupos.set(chave, grupo)
    }
    if (linha.amount_cents < 0) grupo.saidas.push(linha)
    else grupo.entradas.push(linha)
  }

  const pares: ParPareado[] = []
  for (const { saidas, entradas } of grupos.values()) {
    const disponiveis = [...entradas]
    for (const saida of saidas) {
      const i = disponiveis.findIndex((e) => e.account_id !== saida.account_id)
      if (i === -1) continue
      const [entrada] = disponiveis.splice(i, 1)
      pares.push({
        transfer_id: newId(),
        saida_id: saida.id,
        entrada_id: entrada.id,
        purchase_date: saida.purchase_date,
        amount_cents: Math.abs(saida.amount_cents),
      })
    }
  }

  if (opts.dry_run !== true && pares.length > 0) {
    const stmt = db.prepare(
      'UPDATE transactions SET transfer_id = ? WHERE id IN (?, ?)',
    )
    await db.batch(
      pares.map((p) => stmt.bind(p.transfer_id, p.saida_id, p.entrada_id)),
    )
  }

  return { pares }
}
