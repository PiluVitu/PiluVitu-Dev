import { describe, expect, it } from 'vitest'
import { guardadoEmMetas, notaNoInicio, prazoCurto } from './inicio-metas'
import type { MetaView } from './metas'

const meta = (patch: Partial<MetaView> = {}): MetaView => ({
  id: 'g1',
  name: 'Viagem',
  target_cents: 800000,
  target_date: '2027-06-30',
  account_id: 'a1',
  account_name: 'Poupança',
  balance_cents: 465000,
  pct: 58,
  status: 'em_andamento',
  missing_cents: 335000,
  months_left: 8,
  monthly_needed_cents: 41875,
  editable: true,
  reserve_overlap: false,
  ...patch,
})

describe('inicio-metas', () => {
  it('prazo curto é mês abreviado e ano de dois dígitos', () => {
    expect(prazoCurto('2027-06-30')).toBe('jun/27')
    expect(prazoCurto('2026-10-31')).toBe('out/26')
  })

  it('a nota depende do estado da meta', () => {
    expect(notaNoInicio(meta())).toBe('R$ 418,75 por mês até jun/27')
    expect(
      notaNoInicio(
        meta({
          status: 'atrasada',
          target_date: '2026-10-31',
          monthly_needed_cents: null,
          months_left: null,
        }),
      ),
    ).toBe('Atrasada · prazo era out/26')
    expect(
      notaNoInicio(
        meta({
          target_date: null,
          monthly_needed_cents: null,
          months_left: null,
        }),
      ),
    ).toBe('sem prazo')
  })

  it('soma o guardado e ignora saldo negativo', () => {
    expect(
      guardadoEmMetas([meta(), meta({ id: 'g2', balance_cents: 100000 })]),
    ).toBe(565000)
    expect(guardadoEmMetas([meta({ balance_cents: -5000 })])).toBe(0)
    expect(guardadoEmMetas([])).toBe(0)
  })
})
