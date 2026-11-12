import { describe, expect, it } from 'vitest'
import {
  FREQUENCIAS,
  custoDoMes,
  diaDaSemanaCurto,
  nomeDoMes,
  ocorrenciasNoMes,
  proximoVencimento,
  quandoVence,
  type RecorrenciaDatas,
} from './recorrencia'

// Espelho, na SPA, das regras D2 do Worker (frequências) — só para os KPIs
// e o texto da linha da tela de recorrentes. A projeção que vale para o
// Comprometido continua sendo a do Worker (`projectRecurring`).
const mensal = (patch: Partial<RecorrenciaDatas> = {}): RecorrenciaDatas => ({
  frequency: 'monthly',
  day_of_month: 10,
  starts_on: '2026-01-01',
  ends_on: null,
  amount_min_cents: 9990,
  amount_max_cents: 9990,
  ...patch,
})

describe('FREQUENCIAS', () => {
  it('Mensal é a primeira (o padrão do formulário) e quinzenal diz que é a cada 14 dias', () => {
    expect(FREQUENCIAS.map((f) => f.valor)).toEqual([
      'monthly',
      'weekly',
      'biweekly',
      'annual',
    ])
    expect(FREQUENCIAS[0].rotulo).toBe('Mensal')
    expect(FREQUENCIAS.find((f) => f.valor === 'biweekly')?.rotulo).toBe(
      'Quinzenal — a cada 14 dias',
    )
  })
})

describe('ocorrenciasNoMes', () => {
  it('mensal: uma data por mês, no dia escolhido', () => {
    expect(ocorrenciasNoMes(mensal(), '2026-11')).toEqual(['2026-11-10'])
  })

  it('mensal: dia 31 é aparado no último dia de um mês curto', () => {
    expect(ocorrenciasNoMes(mensal({ day_of_month: 31 }), '2026-02')).toEqual([
      '2026-02-28',
    ])
    expect(ocorrenciasNoMes(mensal({ day_of_month: 31 }), '2026-04')).toEqual([
      '2026-04-30',
    ])
  })

  it('mensal: starts_on e ends_on cortam no nível do dia', () => {
    // Começa no dia 15: o vencimento do dia 10 daquele mês ainda não vale.
    expect(
      ocorrenciasNoMes(mensal({ starts_on: '2026-11-15' }), '2026-11'),
    ).toEqual([])
    expect(
      ocorrenciasNoMes(mensal({ starts_on: '2026-11-15' }), '2026-12'),
    ).toEqual(['2026-12-10'])
    // Termina no dia 9: o do dia 10 já não acontece.
    expect(
      ocorrenciasNoMes(mensal({ ends_on: '2026-11-09' }), '2026-11'),
    ).toEqual([])
    expect(
      ocorrenciasNoMes(mensal({ ends_on: '2026-11-10' }), '2026-11'),
    ).toEqual(['2026-11-10'])
  })

  it('anual: só no mês do início, com o dia aparado (29/02 vira 28 fora do bissexto)', () => {
    const anual = mensal({
      frequency: 'annual',
      day_of_month: 29,
      starts_on: '2028-02-01',
    })
    expect(ocorrenciasNoMes(anual, '2028-02')).toEqual(['2028-02-29'])
    expect(ocorrenciasNoMes(anual, '2029-02')).toEqual(['2029-02-28'])
    expect(ocorrenciasNoMes(anual, '2029-03')).toEqual([])
  })

  it('semanal: a cada 7 dias a partir do início — 4 ou 5 no mês', () => {
    // 2026-11-02 é uma segunda.
    const semanal = mensal({ frequency: 'weekly', starts_on: '2026-11-02' })
    expect(ocorrenciasNoMes(semanal, '2026-11')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ])
    expect(ocorrenciasNoMes(semanal, '2026-12')).toEqual([
      '2026-12-07',
      '2026-12-14',
      '2026-12-21',
      '2026-12-28',
    ])
    // Antes do início, nada.
    expect(ocorrenciasNoMes(semanal, '2026-10')).toEqual([])
  })

  it('quinzenal: a cada 14 dias, não "dia 1 e dia 15"', () => {
    const quinzenal = mensal({
      frequency: 'biweekly',
      starts_on: '2026-11-02',
    })
    expect(ocorrenciasNoMes(quinzenal, '2026-11')).toEqual([
      '2026-11-02',
      '2026-11-16',
      '2026-11-30',
    ])
    expect(ocorrenciasNoMes(quinzenal, '2026-12')).toEqual([
      '2026-12-14',
      '2026-12-28',
    ])
  })

  it('semanal com fim no meio do mês para na última data <= ends_on', () => {
    const semanal = mensal({
      frequency: 'weekly',
      starts_on: '2026-11-02',
      ends_on: '2026-11-20',
    })
    expect(ocorrenciasNoMes(semanal, '2026-11')).toEqual([
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ])
  })
})

describe('custoDoMes', () => {
  it('soma piso e teto por ocorrência — a semanal pesa 5 vezes num mês de 5 segundas', () => {
    const custo = custoDoMes(
      [
        mensal({ amount_min_cents: 9990, amount_max_cents: 9990 }),
        mensal({
          frequency: 'weekly',
          starts_on: '2026-11-02',
          amount_min_cents: 4000,
          amount_max_cents: 6000,
        }),
        // Anual de março: não pesa em novembro.
        mensal({ frequency: 'annual', starts_on: '2026-03-05' }),
      ],
      '2026-11',
    )
    expect(custo).toEqual({
      min: 9990 + 5 * 4000,
      max: 9990 + 5 * 6000,
    })
  })

  it('lista vazia é zero, nunca NaN', () => {
    expect(custoDoMes([], '2026-11')).toEqual({ min: 0, max: 0 })
  })
})

describe('proximoVencimento', () => {
  it('a menor data a partir de hoje, incluindo hoje', () => {
    const academia = {
      ...mensal({ frequency: 'weekly', starts_on: '2026-11-02' }),
      description: 'Academia',
    }
    const internet = {
      ...mensal({ day_of_month: 11 }),
      description: 'Internet fibra',
    }
    expect(proximoVencimento([academia, internet], '2026-11-11')).toEqual({
      data: '2026-11-11',
      descricoes: ['Internet fibra'],
    })
    expect(proximoVencimento([academia, internet], '2026-11-12')).toEqual({
      data: '2026-11-16',
      descricoes: ['Academia'],
    })
  })

  it('anual de outro mês ainda aparece: procura até 12 meses à frente', () => {
    const anual = {
      ...mensal({
        frequency: 'annual',
        day_of_month: 5,
        starts_on: '2026-03-05',
      }),
      description: 'Anuidade',
    }
    expect(proximoVencimento([anual], '2026-11-11')).toEqual({
      data: '2027-03-05',
      descricoes: ['Anuidade'],
    })
  })

  it('várias no mesmo dia: todas as descrições', () => {
    const a = { ...mensal({ day_of_month: 20 }), description: 'Internet fibra' }
    const b = { ...mensal({ day_of_month: 20 }), description: 'Academia' }
    expect(proximoVencimento([a, b], '2026-11-11')?.descricoes).toEqual([
      'Internet fibra',
      'Academia',
    ])
  })

  it('encerradas ou nenhuma: null', () => {
    const encerrada = {
      ...mensal({ ends_on: '2026-10-31' }),
      description: 'Internet fibra',
    }
    expect(proximoVencimento([encerrada], '2026-11-11')).toBeNull()
    expect(proximoVencimento([], '2026-11-11')).toBeNull()
  })
})

describe('quandoVence e diaDaSemanaCurto', () => {
  it('mensal diz o dia; anual diz dia e mês do início', () => {
    expect(quandoVence(mensal())).toBe('mensal, dia 10')
    expect(
      quandoVence(
        mensal({
          frequency: 'annual',
          day_of_month: 5,
          starts_on: '2026-03-01',
        }),
      ),
    ).toBe('anual, 5 de março')
  })

  it('anual com dia que o mês do início não tem diz "último dia", nunca "31 de fevereiro"', () => {
    // O aparo do D2 (29/02 vira 28 fora do bissexto) acontece na data; o
    // texto da linha não pode prometer um dia que não existe.
    const anual = (day_of_month: number, starts_on: string) =>
      quandoVence(mensal({ frequency: 'annual', day_of_month, starts_on }))

    expect(anual(31, '2026-02-01')).toBe('anual, último dia de fevereiro')
    expect(anual(29, '2026-02-01')).toBe('anual, último dia de fevereiro')
    expect(anual(28, '2026-02-01')).toBe('anual, 28 de fevereiro')
    expect(anual(31, '2026-04-01')).toBe('anual, último dia de abril')
    expect(anual(30, '2026-04-01')).toBe('anual, 30 de abril')
    expect(anual(31, '2026-01-01')).toBe('anual, 31 de janeiro')
  })

  it('semanal e quinzenal dizem o dia da semana do início (com "aos" no sábado e no domingo)', () => {
    // 2026-11-02 segunda; 2026-11-07 sábado; 2026-11-08 domingo.
    expect(
      quandoVence(mensal({ frequency: 'weekly', starts_on: '2026-11-02' })),
    ).toBe('semanal, às segundas')
    expect(
      quandoVence(mensal({ frequency: 'biweekly', starts_on: '2026-11-07' })),
    ).toBe('quinzenal, a cada 14 dias, aos sábados')
    expect(
      quandoVence(mensal({ frequency: 'weekly', starts_on: '2026-11-08' })),
    ).toBe('semanal, aos domingos')
    expect(diaDaSemanaCurto('2026-11-02')).toBe('seg')
    expect(diaDaSemanaCurto('2026-11-07')).toBe('sáb')
  })
})

describe('nomeDoMes', () => {
  it('nome do mês da competência, em minúsculas', () => {
    expect(nomeDoMes('2026-11')).toBe('novembro')
    expect(nomeDoMes('2027-03')).toBe('março')
  })
})
