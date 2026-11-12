/**
 * Alertas por e-mail (migration 0021): orçamento do mês em 80% e no limite, e
 * fatura de cartão em aberto vencendo em até 3 dias. `today` e o envio são
 * injetados; o D1 é o real do teste. Valores e nomes fictícios.
 */
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { archiveAccount, createAccount } from './accounts'
import {
  alertasDoDia,
  DIAS_ANTES_DO_VENCIMENTO,
  enviarAlertas,
  type EnviarEmail,
  type MensagemDeAlerta,
} from './alertas'
import { setBudget } from './budgets'
import { createCategory } from './categories'
import { createTransaction, deleteTransaction, payBill } from './transactions'

const db = env.DB
const PARA = 'dono@exemplo.test'
const DE = 'alertas@exemplo.test'
const APP = 'https://financas.exemplo.test'

type Falso = EnviarEmail & { mensagens: MensagemDeAlerta[] }

function enviarFalso(falha?: unknown): Falso {
  const mensagens: MensagemDeAlerta[] = []
  return {
    mensagens,
    async send(msg) {
      if (falha !== undefined) throw falha
      mensagens.push(msg)
      return { messageId: `msg-${mensagens.length}` }
    },
  }
}

function rodada(today: string, enviar: EnviarEmail, ligado = true) {
  return enviarAlertas(db, {
    today,
    enviar,
    para: PARA,
    de: DE,
    appUrl: APP,
    ligado,
  })
}

async function conta(name = 'Conta Teste', opening_balance_cents = 0) {
  return createAccount(db, {
    name,
    scope: 'PF',
    kind: 'checking',
    opening_balance_cents,
  })
}

async function cartao(name: string, closing_day: number, due_day: number) {
  return createAccount(db, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day,
    due_day,
  })
}

async function despesa(name: string, parent_id: string | null = null) {
  return createCategory(db, { name, kind: 'expense', parent_id })
}

async function gastar(
  account_id: string,
  category_id: string | null,
  cents: number,
  purchase_date: string,
) {
  return createTransaction(db, {
    account_id,
    category_id,
    amount_cents: -cents,
    purchase_date,
    description: 'Compra de teste',
  })
}

async function orcamentoCom(
  nome: string,
  orcamento: number,
  gasto: number,
  mes = '2026-11',
) {
  const c = await conta()
  const cat = await despesa(nome)
  await setBudget(db, mes, cat.id, orcamento)
  if (gasto > 0) await gastar(c.id, cat.id, gasto, `${mes}-02`)
  return cat
}

async function chavesNoLog() {
  const { results } = await db
    .prepare(
      'SELECT alert_key, kind, sent_at FROM alert_log ORDER BY alert_key',
    )
    .all<{ alert_key: string; kind: string; sent_at: string | null }>()
  return results
}

describe('alertasDoDia — orçamento do mês', () => {
  // Aritmética inteira: spent*100 >= 80*budget. 79,99% não alerta, 80% sim,
  // e 100% exato já é "estourado" (chave :100), não "perto".
  it.each([
    ['79,99%', 799_900, null, null],
    ['80% exato', 800_000, 'orcamento_perto', 80],
    ['99,99%', 999_900, 'orcamento_perto', 99],
    ['100% exato', 1_000_000, 'orcamento_estourado', 100],
    ['130%', 1_300_000, 'orcamento_estourado', 130],
  ] as const)(
    'gasto em %s do limite',
    async (_borda, gasto, kind, percentual) => {
      const cat = await orcamentoCom('Mercado', 1_000_000, gasto)

      const alertas = await alertasDoDia(db, { today: '2026-11-20' })

      if (kind === null) {
        expect(alertas).toEqual([])
        return
      }
      const sufixo = kind === 'orcamento_perto' ? '80' : '100'
      expect(alertas).toEqual([
        {
          alert_key: `orcamento:${cat.id}:2026-11:${sufixo}`,
          kind,
          categoria: 'Mercado',
          mes: '2026-11',
          gasto_cents: gasto,
          orcamento_cents: 1_000_000,
          percentual,
        },
      ])
    },
  )

  it('categoria sem orçamento não alerta, por maior que seja o gasto', async () => {
    const c = await conta()
    const cat = await despesa('Lazer')
    await gastar(c.id, cat.id, 900_000, '2026-11-03')

    expect(await alertasDoDia(db, { today: '2026-11-20' })).toEqual([])
  })

  it('orçamento do mês anterior não alerta, e gasto do mês anterior não conta', async () => {
    const c = await conta()
    const cat = await despesa('Mercado')
    await setBudget(db, '2026-10', cat.id, 10_000)
    await gastar(c.id, cat.id, 50_000, '2026-10-15')
    await setBudget(db, '2026-11', cat.id, 10_000)

    expect(await alertasDoDia(db, { today: '2026-11-01' })).toEqual([])
  })

  it('filha aparece com o nome da mãe, como na tela', async () => {
    const c = await conta()
    const casa = await despesa('Casa')
    const luz = await despesa('Luz', casa.id)
    await setBudget(db, '2026-11', luz.id, 10_000)
    await gastar(c.id, luz.id, 9_000, '2026-11-02')

    const [alerta] = await alertasDoDia(db, { today: '2026-11-20' })
    expect(alerta).toMatchObject({
      kind: 'orcamento_perto',
      categoria: 'Casa › Luz',
    })
  })

  it('today inválido é RangeError', async () => {
    await expect(alertasDoDia(db, { today: '2026-02-30' })).rejects.toThrow(
      RangeError,
    )
  })
})

describe('alertasDoDia — fatura vencendo', () => {
  // Fecha dia 1 e vence dia 10: vence no MESMO mês do fechamento. A compra de
  // 20/10 cai na fatura de novembro, que vence em 10/11.
  async function faturaQueVenceDia10DeNovembro() {
    const card = await cartao('Cartão Teste', 1, 10)
    await gastar(card.id, null, 50_000, '2026-10-20')
    return card
  }

  it(`janela de ${DIAS_ANTES_DO_VENCIMENTO} dias: vence hoje e em 3 dias alerta, em 4 não`, async () => {
    expect(DIAS_ANTES_DO_VENCIMENTO).toBe(3)
    const card = await faturaQueVenceDia10DeNovembro()

    expect(await alertasDoDia(db, { today: '2026-11-10' })).toEqual([
      {
        alert_key: `fatura:${card.id}:2026-11`,
        kind: 'fatura_vencendo',
        cartao: 'Cartão Teste',
        competencia: '2026-11',
        vencimento: '2026-11-10',
        dias: 0,
        valor_cents: 50_000,
      },
    ])
    const [em3] = await alertasDoDia(db, { today: '2026-11-07' })
    expect(em3).toMatchObject({ dias: 3, vencimento: '2026-11-10' })
    expect(await alertasDoDia(db, { today: '2026-11-06' })).toEqual([])
  })

  it('fatura já vencida não alerta (fora de escopo)', async () => {
    await faturaQueVenceDia10DeNovembro()
    expect(await alertasDoDia(db, { today: '2026-11-11' })).toEqual([])
  })

  it('cartão que vence no mês seguinte ao fechamento (fecha 28, vence 5) usa o vencimento real', async () => {
    const card = await cartao('Cartão Teste', 28, 5)
    // 10/10 cai na fatura que fecha em 28/10 e vence em 05/11. O
    // competenceDueDate cru daria 05/10, já passado, e não alertaria.
    await gastar(card.id, null, 30_000, '2026-10-10')

    expect(await alertasDoDia(db, { today: '2026-11-03' })).toEqual([
      expect.objectContaining({
        alert_key: `fatura:${card.id}:2026-10`,
        competencia: '2026-10',
        vencimento: '2026-11-05',
        dias: 2,
      }),
    ])
  })

  it('fatura já paga não alerta', async () => {
    const card = await faturaQueVenceDia10DeNovembro()
    const corrente = await conta('Conta Teste', 100_000)
    await payBill(db, {
      card_account_id: card.id,
      competence: '2026-11',
      paid_on: '2026-11-05',
      from_account_id: corrente.id,
    })

    expect(await alertasDoDia(db, { today: '2026-11-08' })).toEqual([])
  })

  it('cartão arquivado não alerta', async () => {
    const card = await faturaQueVenceDia10DeNovembro()
    await archiveAccount(db, card.id)

    expect(await alertasDoDia(db, { today: '2026-11-08' })).toEqual([])
  })
})

describe('enviarAlertas — idempotência e liga/desliga', () => {
  it('desligado: não envia e não grava nada', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const enviar = enviarFalso()

    expect(await rodada('2026-11-20', enviar, false)).toEqual({
      status: 'desligado',
      enviados: 0,
    })
    expect(enviar.mensagens).toEqual([])
    expect(await chavesNoLog()).toEqual([])
  })

  it('sem alerta: não envia', async () => {
    await orcamentoCom('Mercado', 10_000, 1_000)
    const enviar = enviarFalso()

    expect(await rodada('2026-11-20', enviar)).toEqual({
      status: 'sem_alerta',
      enviados: 0,
    })
    expect(enviar.mensagens).toEqual([])
  })

  it('envia um e-mail só para o destinatário, do remetente, e marca sent_at', async () => {
    const cat = await orcamentoCom('Mercado', 10_000, 9_000)
    const enviar = enviarFalso()

    expect(await rodada('2026-11-20', enviar)).toEqual({
      status: 'enviado',
      enviados: 1,
    })
    expect(enviar.mensagens).toHaveLength(1)
    expect(enviar.mensagens[0].to).toBe(PARA)
    expect(enviar.mensagens[0].from).toEqual({ name: 'Finanças', email: DE })
    const log = await chavesNoLog()
    expect(log).toEqual([
      {
        alert_key: `orcamento:${cat.id}:2026-11:80`,
        kind: 'orcamento_perto',
        sent_at: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
        ),
      },
    ])
  })

  it('duas rodadas no mesmo dia: um e-mail só', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const enviar = enviarFalso()

    await rodada('2026-11-20', enviar)
    expect(await rodada('2026-11-20', enviar)).toEqual({
      status: 'sem_alerta',
      enviados: 0,
    })
    expect(enviar.mensagens).toHaveLength(1)
  })

  it('dia seguinte sem nada novo: nenhum e-mail', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const enviar = enviarFalso()

    await rodada('2026-11-20', enviar)
    await rodada('2026-11-21', enviar)
    expect(enviar.mensagens).toHaveLength(1)
  })

  it('de perto para estourado no mesmo mês: um e-mail novo só com o estourado', async () => {
    const c = await conta()
    const cat = await despesa('Mercado')
    await setBudget(db, '2026-11', cat.id, 10_000)
    await gastar(c.id, cat.id, 8_500, '2026-11-02')
    const enviar = enviarFalso()

    await rodada('2026-11-10', enviar)
    await gastar(c.id, cat.id, 2_000, '2026-11-11')
    await rodada('2026-11-11', enviar)

    expect(enviar.mensagens).toHaveLength(2)
    expect(enviar.mensagens[0].text).toContain('Perto do limite')
    expect(enviar.mensagens[1].text).toContain('Passou do limite')
    expect(enviar.mensagens[1].text).not.toContain('Perto do limite')
    expect((await chavesNoLog()).map((l) => l.alert_key)).toEqual([
      `orcamento:${cat.id}:2026-11:100`,
      `orcamento:${cat.id}:2026-11:80`,
    ])
  })

  // A categoria pulou direto para 100% (a chave :80 nunca foi usada) e depois
  // voltou à faixa de 80% a 99%. Avisar "perto" depois de "estourado" no
  // mesmo mês seria notícia velha, e um segundo e-mail do mesmo assunto.
  it.each([
    ['orçamento aumentado', 'orcamento'],
    ['lançamento apagado', 'lancamento'],
  ] as const)(
    'estourado e depois perto no mesmo mês (%s): nenhum e-mail novo',
    async (_como, mudanca) => {
      const c = await conta()
      const cat = await despesa('Mercado')
      await setBudget(db, '2026-11', cat.id, 10_000)
      await gastar(c.id, cat.id, 9_000, '2026-11-02')
      const extra = await gastar(c.id, cat.id, 1_000, '2026-11-03')
      const enviar = enviarFalso()

      await rodada('2026-11-10', enviar)
      if (mudanca === 'orcamento') {
        await setBudget(db, '2026-11', cat.id, 12_000)
      } else {
        await deleteTransaction(db, extra.id)
      }
      expect(await alertasDoDia(db, { today: '2026-11-11' })).toEqual([
        expect.objectContaining({ kind: 'orcamento_perto' }),
      ])

      expect(await rodada('2026-11-11', enviar)).toEqual({
        status: 'sem_alerta',
        enviados: 0,
      })
      expect(enviar.mensagens).toHaveLength(1)
      expect(enviar.mensagens[0].text).toContain('Chegou ao limite')
      expect((await chavesNoLog()).map((l) => l.alert_key)).toEqual([
        `orcamento:${cat.id}:2026-11:100`,
      ])
    },
  )

  it('várias pendências do dia vão num e-mail só (resumo do dia)', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const card = await cartao('Cartão Teste', 1, 10)
    await gastar(card.id, null, 50_000, '2026-10-20')
    const enviar = enviarFalso()

    expect(await rodada('2026-11-08', enviar)).toEqual({
      status: 'enviado',
      enviados: 2,
    })
    expect(enviar.mensagens).toHaveLength(1)
    expect(enviar.mensagens[0].subject).toBe('Finanças: 2 alertas de hoje')
    expect(enviar.mensagens[0].text).toContain('Mercado')
    expect(enviar.mensagens[0].text).toContain('Cartão Teste')
  })

  it('duas rodadas ao mesmo tempo: cada alerta sai em um e-mail só', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    await orcamentoCom('Farmácia', 10_000, 12_000)
    const enviar = enviarFalso()

    const [a, b] = await Promise.all([
      rodada('2026-11-20', enviar),
      rodada('2026-11-20', enviar),
    ])

    expect(a.enviados + b.enviados).toBe(2)
    const todos = enviar.mensagens.map((m) => m.text).join('\n')
    expect(todos.match(/Mercado/g)).toHaveLength(1)
    expect(todos.match(/Farmácia/g)).toHaveLength(1)
  })
})

describe('enviarAlertas — falha no envio', () => {
  it('envio lançou: solta as chaves, devolve só o code, e a rodada seguinte envia', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const erro = Object.assign(
      new Error('detalhe interno com dono@exemplo.test'),
      { code: 'E_RATE_LIMIT_EXCEEDED' },
    )

    const falhou = await rodada('2026-11-20', enviarFalso(erro))
    expect(falhou).toEqual({
      status: 'falhou',
      enviados: 0,
      codigo: 'E_RATE_LIMIT_EXCEEDED',
    })
    expect(await chavesNoLog()).toEqual([])

    const enviar = enviarFalso()
    expect(await rodada('2026-11-21', enviar)).toEqual({
      status: 'enviado',
      enviados: 1,
    })
    expect(enviar.mensagens).toHaveLength(1)
  })

  // A falha solta só as chaves reivindicadas NESTA rodada e ainda sem
  // sent_at. Soltar todos os candidatos apagaria a chave do alerta enviado
  // ontem, e ele sairia de novo: o e-mail repetido que a chave impede.
  it('falha numa rodada não reabre alerta já enviado antes', async () => {
    const mercado = await orcamentoCom('Mercado', 10_000, 9_000)
    await rodada('2026-11-10', enviarFalso())
    const farmacia = await orcamentoCom('Farmácia', 10_000, 9_500)
    const erro = Object.assign(new Error('x'), {
      code: 'E_INTERNAL_SERVER_ERROR',
    })

    expect(await rodada('2026-11-11', enviarFalso(erro))).toEqual({
      status: 'falhou',
      enviados: 0,
      codigo: 'E_INTERNAL_SERVER_ERROR',
    })

    const enviar = enviarFalso()
    expect(await rodada('2026-11-12', enviar)).toEqual({
      status: 'enviado',
      enviados: 1,
    })
    expect(enviar.mensagens).toHaveLength(1)
    expect(enviar.mensagens[0].text).toContain('Farmácia')
    expect(enviar.mensagens[0].text).not.toContain('Mercado')
    const enviadoEm = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    expect(await chavesNoLog()).toEqual(
      expect.arrayContaining([
        {
          alert_key: `orcamento:${mercado.id}:2026-11:80`,
          kind: 'orcamento_perto',
          sent_at: enviadoEm,
        },
        {
          alert_key: `orcamento:${farmacia.id}:2026-11:80`,
          kind: 'orcamento_perto',
          sent_at: enviadoEm,
        },
      ]),
    )
    expect(await chavesNoLog()).toHaveLength(2)
  })

  it('erro sem code: o código é o nome do erro, nunca a mensagem', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)

    const r = await rodada('2026-11-20', enviarFalso(new TypeError('cru')))
    expect(r).toEqual({ status: 'falhou', enviados: 0, codigo: 'TypeError' })
  })

  // Códigos do adaptador do Email Routing (lib/envio-email.ts e lib/mime.ts):
  // passam como código para a tela dizer "não configurado", como os E_*.
  it.each(['destino_nao_verificado', 'alertas_endereco_invalido'])(
    'code próprio do envio (%s) passa como código, e as chaves são soltas',
    async (code) => {
      await orcamentoCom('Mercado', 10_000, 9_000)
      const erro = Object.assign(new Error(`detalhe com ${PARA}`), { code })

      const r = await rodada('2026-11-20', enviarFalso(erro))
      expect(r).toEqual({ status: 'falhou', enviados: 0, codigo: code })
      expect(await chavesNoLog()).toEqual([])
    },
  )

  it('code minúsculo desconhecido não passa: cai no nome do erro', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const erro = Object.assign(new Error('x'), { code: 'outro_codigo' })

    const r = await rodada('2026-11-20', enviarFalso(erro))
    expect(r.codigo).toBe('Error')
  })

  it('code com formato estranho não vaza: cai no nome do erro', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const erro = Object.assign(new Error('x'), {
      code: 'texto livre\ncom dado',
    })

    const r = await rodada('2026-11-20', enviarFalso(erro))
    expect(r.codigo).toBe('Error')
  })
})

describe('enviarAlertas — o conteúdo do e-mail', () => {
  async function emailDe(today: string) {
    const enviar = enviarFalso()
    await rodada(today, enviar)
    expect(enviar.mensagens).toHaveLength(1)
    return enviar.mensagens[0]
  }

  it('orçamento perto: assunto, valores em R$ pt-BR, percentual e links', async () => {
    await orcamentoCom('Mercado', 1_000_000, 812_345)

    const msg = await emailDe('2026-11-20')

    expect(msg.subject).toBe('Orçamento: Mercado chegou a 81% do limite')
    expect(msg.text).toContain('Orçamento de novembro de 2026')
    expect(msg.text).toContain(
      '- Mercado: R$ 8.123,45 de R$ 10.000,00 (81%). Perto do limite.',
    )
    expect(msg.text).toContain(`${APP}/#/orcamento`)
    expect(msg.text).not.toContain(`${APP}/#/contas`)
    expect(msg.text).toContain(
      'Para parar de receber, desligue em Configurações.',
    )
    expect(msg.text).toContain(`${APP}/#/configuracoes`)
    expect(msg.html).toContain('R$ 8.123,45')
    expect(msg.html).toContain(`href="${APP}/#/orcamento"`)
    expect(msg.html).toContain(`href="${APP}/#/configuracoes"`)
    expect(msg.html).toContain(
      'Para parar de receber, desligue em Configurações.',
    )
  })

  it('no limite exato e acima dele: textos diferentes', async () => {
    await orcamentoCom('Mercado', 10_000, 10_000)
    const noLimite = await emailDe('2026-11-20')
    expect(noLimite.subject).toBe('Orçamento: Mercado chegou ao limite')
    expect(noLimite.text).toContain('(100%). Chegou ao limite.')

    await orcamentoCom('Farmácia', 10_000, 13_050)
    const acima = await emailDe('2026-11-20')
    expect(acima.subject).toBe('Orçamento: Farmácia passou do limite (130%)')
    expect(acima.text).toContain(
      '- Farmácia: R$ 130,50 de R$ 100,00 (130%). Passou do limite.',
    )
  })

  it('fatura: cartão, competência por extenso, vencimento, valor e link de contas', async () => {
    const card = await cartao('Cartão Teste', 1, 10)
    await gastar(card.id, null, 123_456, '2026-10-20')

    const msg = await emailDe('2026-11-07')

    expect(msg.subject).toBe('Fatura do Cartão Teste vence em 3 dias')
    expect(msg.text).toContain('Faturas de cartão')
    expect(msg.text).toContain(
      '- Cartão Teste, fatura de novembro de 2026: R$ 1.234,56, vence em 10/11/2026 (em 3 dias).',
    )
    expect(msg.text).toContain(`${APP}/#/contas`)
    expect(msg.text).not.toContain(`${APP}/#/orcamento`)
  })

  it.each([
    ['2026-11-10', 'vence hoje'],
    ['2026-11-09', 'vence amanhã'],
  ])('fatura em %s: assunto "%s"', async (today, fim) => {
    const card = await cartao('Cartão Teste', 1, 10)
    await gastar(card.id, null, 5_000, '2026-10-20')

    const msg = await emailDe(today)
    expect(msg.subject).toBe(`Fatura do Cartão Teste ${fim}`)
  })

  it('não traz nome nem valor de conta ou categoria que não está em alerta', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    // Categoria com orçamento, mas longe do limite.
    await orcamentoCom('Lazer Discreto', 77_700, 1_100)
    // Saldo de conta corrente: nunca entra.
    await conta('Conta Sigilosa', 4_242_424)
    // Outro cartão, com fatura que só vence depois da janela.
    const longe = await cartao('Cartão Distante', 1, 25)
    await gastar(longe.id, null, 31_337, '2026-10-20')

    const msg = await emailDe('2026-11-20')

    const tudo = `${msg.subject}\n${msg.text}\n${msg.html}`
    for (const proibido of [
      'Lazer Discreto',
      '777,00',
      '11,00',
      'Conta Sigilosa',
      '42.424,24',
      'Cartão Distante',
      '313,37',
    ]) {
      expect(tudo).not.toContain(proibido)
    }
  })

  it('html escapa o nome da categoria; o texto puro mantém', async () => {
    await orcamentoCom(`<script>alert("x")</script> & 'Cia'`, 10_000, 9_000)

    const msg = await emailDe('2026-11-20')

    expect(msg.html).not.toContain('<script>')
    expect(msg.html).toContain(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;Cia&#39;',
    )
    expect(msg.text).toContain(`<script>alert("x")</script> & 'Cia'`)
  })

  it('assunto sem quebra de linha, mesmo com \\r\\n no nome', async () => {
    const c = await conta()
    const cat = await despesa('Mercado')
    await db
      .prepare('UPDATE categories SET name = ? WHERE id = ?')
      .bind('Mercado\r\nBcc: outro@exemplo.test', cat.id)
      .run()
    await setBudget(db, '2026-11', cat.id, 10_000)
    await gastar(c.id, cat.id, 9_000, '2026-11-02')

    const msg = await emailDe('2026-11-20')

    expect(msg.subject).not.toMatch(/[\r\n]/)
    expect(msg.subject).toBe(
      'Orçamento: Mercado Bcc: outro@exemplo.test chegou a 90% do limite',
    )
    expect(msg.text).not.toContain('Mercado\r\nBcc')
  })

  it('nome muito longo é encurtado no assunto', async () => {
    const nome = 'Categoria '.repeat(10).trim()
    await orcamentoCom(nome, 10_000, 9_000)

    const msg = await emailDe('2026-11-20')

    expect(msg.subject.length).toBeLessThanOrEqual(100)
    expect(msg.subject).toContain('…')
    expect(msg.text).toContain(nome)
  })

  it('appUrl com barra no fim não duplica a barra', async () => {
    await orcamentoCom('Mercado', 10_000, 9_000)
    const enviar = enviarFalso()
    await enviarAlertas(db, {
      today: '2026-11-20',
      enviar,
      para: PARA,
      de: DE,
      appUrl: `${APP}/`,
      ligado: true,
    })

    expect(enviar.mensagens[0].text).toContain(`${APP}/#/orcamento`)
    expect(enviar.mensagens[0].text).not.toContain(`${APP}//#`)
  })
})
