/**
 * Traduz mensagens cruas do D1 (SQLITE_CONSTRAINT*, incl. o gatilho de teto
 * de alocação) para frases legíveis em pt-BR. O texto cru do D1 — que vem
 * com prefixo tipo "D1_ERROR:" e o nome de tabela/coluna embutido na
 * expressão do CHECK/FK, ex. "D1_ERROR: FOREIGN KEY constraint failed:
 * SQLITE_CONSTRAINT_FOREIGNKEY" — nunca deve chegar ao usuário final: expõe
 * detalhe de schema e não diz o que fazer.
 *
 * Cobre os casos hoje ALCANÇÁVEIS por uma requisição real (auditado lendo
 * cada call site que usa isto — ver routes/accounts.ts, routes/
 * transactions.ts, routes/installments.ts, routes/debts.ts e domain/
 * debts.ts#translateD1Error): FK apontando pra um registro que não existe
 * (conta, dívida), o CHECK de cartão de crédito (closing_day/due_day fora
 * de 1..31, ou ausentes) e o gatilho de teto de alocação (I1/I2 da
 * migration 0001). O catch-all final é deliberadamente genérico — não
 * inventa uma frase específica pra um caso que não foi confirmado como
 * alcançável.
 *
 * A mensagem crua NUNCA é descartada — cada call site loga com
 * `logConstraintError` antes de traduzir, pra debug via `wrangler tail`
 * sem vazar pro cliente.
 */
export function friendlyConstraintMessage(raw: string): string {
  if (/SQLITE_CONSTRAINT_TRIGGER/i.test(raw)) {
    return 'A alocação passa do valor disponível no item ou no pagamento.'
  }
  if (/FOREIGN KEY/i.test(raw)) {
    return 'Referência inválida: a conta, dívida ou item informado não existe (ou foi removido).'
  }
  if (/closing_day|due_day|credit_card/i.test(raw)) {
    return 'Conta de cartão de crédito exige dia de fechamento e de vencimento válidos (entre 1 e 31).'
  }
  if (/CHECK constraint failed/i.test(raw)) {
    return 'Os dados enviados não passam nas regras de validação.'
  }
  return 'Não foi possível concluir a operação: restrição do banco de dados.'
}

/** Loga a mensagem crua do D1 pro server (wrangler tail) sem expor ao usuário. */
export function logConstraintError(context: string, raw: string): void {
  console.error(`[financas] ${context}: ${raw}`)
}
