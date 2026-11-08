import { describe, expect, it } from 'vitest'
import {
  faltaDaMeta,
  formatPrazo,
  larguraDaBarra,
  plural,
  previaDoRitmo,
  ritmoDaMeta,
  rotuloDoStatus,
  resumoDasMetas,
  type MetaView,
} from './metas'

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

describe('metas — formatação', () => {
  it('limita a barra entre 0 e 100', () => {
    expect(larguraDaBarra(40)).toBe(40)
    expect(larguraDaBarra(180)).toBe(100)
    expect(larguraDaBarra(-3)).toBe(0)
  })
  it('formata o prazo em dia/mês/ano', () => {
    expect(formatPrazo('2027-06-30')).toBe('30/06/2027')
  })
  it('pluraliza', () => {
    expect(plural(1, 'mês', 'meses')).toBe('1 mês')
    expect(plural(3, 'mês', 'meses')).toBe('3 meses')
  })
})

describe('rotuloDoStatus', () => {
  it('No ritmo, Atrasada e Concluída', () => {
    expect(rotuloDoStatus(meta())).toBe('No ritmo')
    expect(rotuloDoStatus(meta({ status: 'atrasada' }))).toBe('Atrasada')
    expect(rotuloDoStatus(meta({ status: 'concluida' }))).toBe('Concluída')
  })
  it('sem prazo não há ritmo para estar em dia: Em andamento', () => {
    expect(rotuloDoStatus(meta({ target_date: null }))).toBe('Em andamento')
  })
})

describe('ritmoDaMeta e faltaDaMeta', () => {
  it('em andamento com prazo mostra o aporte mensal e os meses', () => {
    expect(ritmoDaMeta(meta())).toBe('R$ 418,75 por mês · 8 meses')
    expect(
      ritmoDaMeta(meta({ months_left: 1, monthly_needed_cents: 335000 })),
    ).toBe('R$ 3.350,00 por mês · 1 mês')
  })
  it('sem prazo, atrasada e concluída têm texto próprio', () => {
    expect(
      ritmoDaMeta(
        meta({
          target_date: null,
          months_left: null,
          monthly_needed_cents: null,
        }),
      ),
    ).toBe('sem prazo')
    expect(
      ritmoDaMeta(
        meta({
          status: 'atrasada',
          months_left: null,
          monthly_needed_cents: null,
        }),
      ),
    ).toBe('prazo passou · R$ 3.350,00 em aberto')
    expect(ritmoDaMeta(meta({ status: 'concluida', missing_cents: 0 }))).toBe(
      'concluída',
    )
  })
  it('falta: o valor, ou nada quando a meta foi batida', () => {
    expect(faltaDaMeta(meta())).toBe('R$ 3.350,00')
    expect(faltaDaMeta(meta({ status: 'concluida', missing_cents: 0 }))).toBe(
      'nada, meta batida',
    )
  })
})

describe('resumoDasMetas', () => {
  it('soma o guardado, o que falta e o ritmo só das metas que pedem', () => {
    const r = resumoDasMetas([
      meta({
        balance_cents: 465000,
        missing_cents: 335000,
        monthly_needed_cents: 41875,
      }),
      meta({
        id: 'g2',
        balance_cents: 212000,
        missing_cents: 438000,
        monthly_needed_cents: 87600,
      }),
      meta({
        id: 'g3',
        status: 'concluida',
        balance_cents: 240000,
        missing_cents: 0,
        monthly_needed_cents: null,
        months_left: null,
      }),
      meta({
        id: 'g4',
        status: 'atrasada',
        balance_cents: 220000,
        missing_cents: 980000,
        monthly_needed_cents: null,
        months_left: null,
      }),
    ])
    expect(r).toEqual({
      total: 4,
      concluidas: 1,
      abertas: 3,
      guardado_cents: 1137000,
      falta_cents: 1753000,
      ritmo_cents: 129475,
      com_prazo_count: 2,
    })
  })
  it('saldo negativo não diminui o guardado', () => {
    expect(
      resumoDasMetas([meta({ balance_cents: -5000 })]).guardado_cents,
    ).toBe(0)
  })
  it('lista vazia zera tudo', () => {
    expect(resumoDasMetas([])).toEqual({
      total: 0,
      concluidas: 0,
      abertas: 0,
      guardado_cents: 0,
      falta_cents: 0,
      ritmo_cents: 0,
      com_prazo_count: 0,
    })
  })
})

describe('previaDoRitmo', () => {
  const hoje = '2026-11-07'
  const base = {
    saldo_cents: 465000,
    alvo_cents: 800000,
    prazo: '2027-06-30',
    hoje,
  }

  it('com prazo diz quanto guardar por mês e por quantos meses', () => {
    expect(previaDoRitmo(base)).toBe(
      'Já tem R$ 4.650,00 (58%). Para chegar em 30/06/2027, guarde R$ 418,75 por mês durante 8 meses.',
    )
  })
  it('um mês só fica no singular', () => {
    expect(previaDoRitmo({ ...base, prazo: '2026-11-30' })).toBe(
      'Já tem R$ 4.650,00 (58%). Para chegar em 30/11/2026, guarde R$ 3.350,00 por mês durante 1 mês.',
    )
  })
  it('sem prazo convida a definir um', () => {
    expect(previaDoRitmo({ ...base, prazo: null })).toBe(
      'Já tem R$ 4.650,00 (58%). Defina um prazo para ver quanto guardar por mês.',
    )
  })
  it('meta que já nasce batida', () => {
    expect(previaDoRitmo({ ...base, saldo_cents: 800000 })).toBe(
      'Já tem R$ 8.000,00 (100%): a meta já nasce concluída.',
    )
  })
  it('prazo que já passou', () => {
    expect(previaDoRitmo({ ...base, prazo: '2026-10-31' })).toBe(
      'Já tem R$ 4.650,00 (58%). O prazo já passou: a meta nasce atrasada, faltam R$ 3.350,00.',
    )
  })
  it('perto do alvo não mostra 100% enquanto falta dinheiro', () => {
    expect(
      previaDoRitmo({ ...base, saldo_cents: 796000, prazo: null }),
    ).toContain('(99%)')
  })
  it('saldo negativo conta como zero', () => {
    expect(previaDoRitmo({ ...base, saldo_cents: -5000, prazo: null })).toBe(
      'Já tem R$ 0,00 (0%). Defina um prazo para ver quanto guardar por mês.',
    )
  })
  it('sem valor ou sem conta não inventa número', () => {
    expect(previaDoRitmo({ ...base, alvo_cents: null })).toBeNull()
    expect(previaDoRitmo({ ...base, saldo_cents: null })).toBeNull()
  })
})
