import { describe, expect, it, vi } from 'vitest'
import { friendlyConstraintMessage, logConstraintError } from './errors'

describe('friendlyConstraintMessage', () => {
  it('traduz gatilho de teto de alocacao (I1/I2)', () => {
    const raw =
      'D1_ERROR: alocacao excede o valor do item: SQLITE_CONSTRAINT_TRIGGER'
    expect(friendlyConstraintMessage(raw)).toBe(
      'A alocação passa do valor disponível no item ou no pagamento.',
    )
  })

  it('traduz FOREIGN KEY sem vazar nome de coluna/tabela', () => {
    const raw =
      'D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY'
    const msg = friendlyConstraintMessage(raw)
    expect(msg).toBe(
      'Referência inválida: a conta, dívida ou item informado não existe (ou foi removido).',
    )
    expect(msg).not.toMatch(/D1_ERROR|SQLITE_CONSTRAINT|FOREIGN KEY/i)
  })

  it('traduz CHECK de cartao de credito (closing_day/due_day)', () => {
    const raw =
      'D1_ERROR: CHECK constraint failed: closing_day BETWEEN 1 AND 31: SQLITE_CONSTRAINT_CHECK'
    expect(friendlyConstraintMessage(raw)).toBe(
      'Conta de cartão de crédito exige dia de fechamento e de vencimento válidos (entre 1 e 31).',
    )
  })

  it('cai num generico legivel para CHECK nao mapeado, sem vazar o texto cru', () => {
    const raw = 'D1_ERROR: CHECK constraint failed: amount_cents <> 0'
    const msg = friendlyConstraintMessage(raw)
    expect(msg).toBe('Os dados enviados não passam nas regras de validação.')
    expect(msg).not.toContain('amount_cents')
  })

  it('cai num generico legivel quando nada casa', () => {
    expect(friendlyConstraintMessage('algo totalmente inesperado')).toBe(
      'Não foi possível concluir a operação: restrição do banco de dados.',
    )
  })
})

describe('logConstraintError', () => {
  it('loga a mensagem crua (nunca some, so nao vai pro usuario)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logConstraintError('POST /accounts', 'D1_ERROR: algo cru')
    expect(spy).toHaveBeenCalledWith(
      '[financas] POST /accounts: D1_ERROR: algo cru',
    )
    spy.mockRestore()
  })
})
