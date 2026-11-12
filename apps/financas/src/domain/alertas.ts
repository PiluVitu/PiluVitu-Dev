import { formatBRL } from '@piluvitu/tools/money'
import {
  addDays,
  billDueDate,
  daysBetween,
  isRealCalendarDate,
  nowIsoUtc,
} from '../lib/dates'
import { errorCode } from '../lib/errors'
import { CODIGOS_PROPRIOS_DO_ENVIO } from './alertas-envio'
import { budgetReport } from './budgets'
import { listOpenBills } from './transactions'

/**
 * Alertas por e-mail do Cron diário: orçamento do mês em 80% e no limite, e
 * fatura de cartão em aberto vencendo em até 3 dias. Regras, idempotência e o
 * que fica fora do e-mail: "Alertas por e-mail" no CLAUDE.md.
 */

export const DIAS_ANTES_DO_VENCIMENTO = 3
export const LIMIAR_PERTO_PCT = 80
export const NOME_DO_REMETENTE = 'Finanças'

export type AlertaDeOrcamento = {
  alert_key: string
  kind: 'orcamento_perto' | 'orcamento_estourado'
  categoria: string
  mes: string
  gasto_cents: number
  orcamento_cents: number
  percentual: number
}

export type AlertaDeFatura = {
  alert_key: string
  kind: 'fatura_vencendo'
  cartao: string
  competencia: string
  vencimento: string
  dias: number
  valor_cents: number
}

export type Alerta = AlertaDeOrcamento | AlertaDeFatura

export type MensagemDeAlerta = {
  to: string
  from: { name: string; email: string }
  subject: string
  text: string
  html: string
}

export type EnviarEmail = {
  send(msg: MensagemDeAlerta): Promise<{ messageId: string }>
}

export type ResultadoDosAlertas = {
  status: 'desligado' | 'sem_alerta' | 'enviado' | 'falhou'
  /** Quantos alertas foram no e-mail (um e-mail por rodada). */
  enviados: number
  codigo?: string
}

/** floor(gasto * 100 / orçamento) sem passar por fração. */
function percentualInteiro(gasto: number, orcamento: number): number {
  const base = gasto * 100
  return (base - (base % orcamento)) / orcamento
}

async function alertasDeOrcamento(
  db: D1Database,
  mes: string,
): Promise<AlertaDeOrcamento[]> {
  const { rows } = await budgetReport(db, mes)
  const alertas: AlertaDeOrcamento[] = []
  for (const r of rows) {
    if (r.budget_cents === null) continue
    const estourado = r.spent_cents >= r.budget_cents
    if (!estourado && r.spent_cents * 100 < LIMIAR_PERTO_PCT * r.budget_cents) {
      continue
    }
    alertas.push({
      alert_key: `orcamento:${r.category_id}:${mes}:${estourado ? 100 : LIMIAR_PERTO_PCT}`,
      kind: estourado ? 'orcamento_estourado' : 'orcamento_perto',
      categoria:
        r.parent_name === null
          ? r.category_name
          : `${r.parent_name} › ${r.category_name}`,
      mes,
      gasto_cents: r.spent_cents,
      orcamento_cents: r.budget_cents,
      percentual: percentualInteiro(r.spent_cents, r.budget_cents),
    })
  }
  return alertas
}

async function alertasDeFatura(
  db: D1Database,
  today: string,
): Promise<AlertaDeFatura[]> {
  const { results: cartoes } = await db
    .prepare(
      `SELECT id, name, closing_day, due_day FROM accounts
        WHERE kind = 'credit_card' AND archived_at IS NULL
          AND closing_day IS NOT NULL AND due_day IS NOT NULL
        ORDER BY name, id`,
    )
    .all<{ id: string; name: string; closing_day: number; due_day: number }>()
  const abertas = await Promise.all(cartoes.map((c) => listOpenBills(db, c.id)))

  const limite = addDays(today, DIAS_ANTES_DO_VENCIMENTO)
  const alertas: AlertaDeFatura[] = []
  cartoes.forEach((c, i) => {
    for (const fatura of abertas[i]) {
      const vencimento = billDueDate(
        fatura.competence,
        c.closing_day,
        c.due_day,
      )
      if (vencimento < today || vencimento > limite) continue
      alertas.push({
        alert_key: `fatura:${c.id}:${fatura.competence}`,
        kind: 'fatura_vencendo',
        cartao: c.name,
        competencia: fatura.competence,
        vencimento,
        dias: daysBetween(today, vencimento),
        valor_cents: fatura.amount_cents,
      })
    }
  })
  return alertas
}

export async function alertasDoDia(
  db: D1Database,
  { today }: { today: string },
): Promise<Alerta[]> {
  if (!isRealCalendarDate(today)) {
    throw new RangeError(`today inválido (esperado YYYY-MM-DD): ${today}`)
  }
  const [orcamento, faturas] = await Promise.all([
    alertasDeOrcamento(db, today.slice(0, 7)),
    alertasDeFatura(db, today),
  ])
  return [...orcamento, ...faturas]
}

export async function enviarAlertas(
  db: D1Database,
  opts: {
    today: string
    enviar: EnviarEmail
    para: string
    de: string
    appUrl: string
    ligado: boolean
  },
): Promise<ResultadoDosAlertas> {
  if (!opts.ligado) return { status: 'desligado', enviados: 0 }

  const candidatos = await alertasDoDia(db, { today: opts.today })
  if (candidatos.length === 0) return { status: 'sem_alerta', enviados: 0 }

  const agora = nowIsoUtc()
  const reivindicacoes = await db.batch(
    candidatos.map((a) =>
      a.kind === 'orcamento_perto'
        ? db
            .prepare(
              `INSERT OR IGNORE INTO alert_log (alert_key, kind, claimed_at)
               SELECT ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM alert_log WHERE alert_key = ?)`,
            )
            .bind(a.alert_key, a.kind, agora, chaveDoEstouroNoMes(a))
        : db
            .prepare(
              'INSERT OR IGNORE INTO alert_log (alert_key, kind, claimed_at) VALUES (?, ?, ?)',
            )
            .bind(a.alert_key, a.kind, agora),
    ),
  )
  const nossos = candidatos.filter(
    (_, i) => reivindicacoes[i].meta.changes === 1,
  )
  if (nossos.length === 0) return { status: 'sem_alerta', enviados: 0 }

  const porChave = (sql: string, ...antes: string[]) =>
    db.batch(nossos.map((a) => db.prepare(sql).bind(...antes, a.alert_key)))

  try {
    await opts.enviar.send(montarEmail(nossos, opts))
  } catch (err) {
    const codigo = codigoDoEnvio(err)
    try {
      await porChave(
        'DELETE FROM alert_log WHERE alert_key = ? AND sent_at IS NULL',
      )
    } catch (errDelete) {
      console.error(
        'alertas: chaves ficaram reivindicadas',
        errorCode(errDelete),
      )
    }
    return { status: 'falhou', enviados: 0, codigo }
  }

  try {
    await porChave(
      'UPDATE alert_log SET sent_at = ? WHERE alert_key = ?',
      nowIsoUtc(),
    )
  } catch (err) {
    console.error('alertas: sent_at não gravado', errorCode(err))
  }
  return { status: 'enviado', enviados: nossos.length }
}

function chaveDoEstouroNoMes(a: AlertaDeOrcamento): string {
  return `${a.alert_key.slice(0, a.alert_key.lastIndexOf(':'))}:100`
}

function codigoDoEnvio(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? err.code
      : undefined
  if (
    typeof code === 'string' &&
    (/^E_[A-Z0-9_]{1,60}$/.test(code) || CODIGOS_PROPRIOS_DO_ENVIO.has(code))
  ) {
    return code
  }
  return errorCode(err)
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

const MAX_NOME_NO_ASSUNTO = 60

function porExtenso(competencia: string): string {
  return `${MESES[Number(competencia.slice(5, 7)) - 1]} de ${competencia.slice(0, 4)}`
}

function dataBr(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`
}

/** Nome vindo do usuário: sem caractere de controle (nada de \r\n no cabeçalho). */
function limpar(nome: string): string {
  return nome.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim()
}

function encurtar(nome: string): string {
  return nome.length > MAX_NOME_NO_ASSUNTO
    ? `${nome.slice(0, MAX_NOME_NO_ASSUNTO - 1)}…`
    : nome
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function estadoDoOrcamento(a: AlertaDeOrcamento): string {
  if (a.kind === 'orcamento_perto') return 'Perto do limite.'
  return a.gasto_cents > a.orcamento_cents
    ? 'Passou do limite.'
    : 'Chegou ao limite.'
}

function quando(dias: number): string {
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  return `em ${dias} dias`
}

function assunto(alertas: Alerta[]): string {
  if (alertas.length > 1) return `Finanças: ${alertas.length} alertas de hoje`
  const [a] = alertas
  if (a.kind === 'fatura_vencendo') {
    return `Fatura do ${encurtar(limpar(a.cartao))} vence ${quando(a.dias)}`
  }
  const nome = encurtar(limpar(a.categoria))
  if (a.kind === 'orcamento_perto') {
    return `Orçamento: ${nome} chegou a ${a.percentual}% do limite`
  }
  return a.gasto_cents > a.orcamento_cents
    ? `Orçamento: ${nome} passou do limite (${a.percentual}%)`
    : `Orçamento: ${nome} chegou ao limite`
}

function linhaDeOrcamento(a: AlertaDeOrcamento, nome: string): string {
  return `${nome}: ${formatBRL(a.gasto_cents)} de ${formatBRL(a.orcamento_cents)} (${a.percentual}%). ${estadoDoOrcamento(a)}`
}

function linhaDeFatura(a: AlertaDeFatura, nome: string): string {
  return `${nome}, fatura de ${porExtenso(a.competencia)}: ${formatBRL(a.valor_cents)}, vence em ${dataBr(a.vencimento)} (${quando(a.dias)}).`
}

function montarEmail(
  alertas: Alerta[],
  opts: { today: string; para: string; de: string; appUrl: string },
): MensagemDeAlerta {
  const base = opts.appUrl.replace(/\/+$/, '')
  const orcamento = alertas.filter(
    (a): a is AlertaDeOrcamento => a.kind !== 'fatura_vencendo',
  )
  const faturas = alertas.filter(
    (a): a is AlertaDeFatura => a.kind === 'fatura_vencendo',
  )
  const titulo = `Alertas do Finanças em ${dataBr(opts.today)}`
  const rodape = 'Cada alerta é enviado uma vez só.'
  const parar = 'Para parar de receber, desligue em Configurações.'
  const linkConfig = `${base}/#/configuracoes`

  const secoes: Array<{
    titulo: string
    linhas: Array<{ texto: string; html: string }>
    link: { rotulo: string; url: string }
  }> = []
  if (orcamento.length > 0) {
    secoes.push({
      titulo: `Orçamento de ${porExtenso(orcamento[0].mes)}`,
      linhas: orcamento.map((a) => ({
        texto: linhaDeOrcamento(a, limpar(a.categoria)),
        html: linhaDeOrcamento(a, escapeHtml(limpar(a.categoria))),
      })),
      link: { rotulo: 'Abrir o orçamento', url: `${base}/#/orcamento` },
    })
  }
  if (faturas.length > 0) {
    secoes.push({
      titulo: 'Faturas de cartão',
      linhas: faturas.map((a) => ({
        texto: linhaDeFatura(a, limpar(a.cartao)),
        html: linhaDeFatura(a, escapeHtml(limpar(a.cartao))),
      })),
      link: { rotulo: 'Abrir as contas', url: `${base}/#/contas` },
    })
  }

  const text = [
    titulo,
    '',
    ...secoes.flatMap((s) => [
      s.titulo,
      ...s.linhas.map((l) => `- ${l.texto}`),
      `${s.link.rotulo}: ${s.link.url}`,
      '',
    ]),
    rodape,
    parar,
    linkConfig,
    '',
  ].join('\n')

  const html = [
    '<!doctype html>',
    '<html lang="pt-BR"><body style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111827">',
    `<p style="font-size:16px;font-weight:bold">${escapeHtml(titulo)}</p>`,
    ...secoes.map(
      (s) =>
        `<h2 style="font-size:15px;margin:20px 0 4px">${escapeHtml(s.titulo)}</h2>` +
        `<ul style="padding-left:20px;margin:0">${s.linhas
          .map((l) => `<li>${l.html}</li>`)
          .join('')}</ul>` +
        `<p style="margin:6px 0 0"><a href="${escapeHtml(s.link.url)}">${escapeHtml(s.link.rotulo)}</a></p>`,
    ),
    `<p style="margin-top:24px;font-size:13px;color:#4b5563">${escapeHtml(rodape)}<br>${escapeHtml(parar)} <a href="${escapeHtml(linkConfig)}">Abrir as Configurações</a></p>`,
    '</body></html>',
  ].join('\n')

  return {
    to: opts.para,
    from: { name: NOME_DO_REMETENTE, email: opts.de },
    subject: assunto(alertas),
    text,
    html,
  }
}
