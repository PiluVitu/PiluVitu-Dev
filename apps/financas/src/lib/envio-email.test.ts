/**
 * Adaptador do envio: o domínio (enviarAlertas) entrega uma MensagemDeAlerta e
 * o adaptador manda pelo caminho configurado. Email Routing: EmailMessage com
 * o MIME montado à mão, para o destino verificado. Email Sending: o objeto
 * estruturado, como no #102.
 *
 * Ler o raw de uma EmailMessage: no pool de testes ela é a do miniflare
 * (src/workers/email/email.worker.ts, 4.20260722.0), um objeto simples com
 * as chaves from, to e "EmailMessage::raw". Medido; em produção o raw não é
 * legível pelo Worker.
 */
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import type { MensagemDeAlerta } from '../domain/alertas'
import { enviadorDeAlertas } from './envio-email'
import { montarMime } from './mime'

const PARA = 'dono@exemplo.test'
const REMETENTE = 'alertas@exemplo.test'
const AGORA = new Date('2026-08-10T09:00:00Z')
const ID = '11111111-2222-4333-8444-555555555555'

function mensagem(parcial: Partial<MensagemDeAlerta> = {}): MensagemDeAlerta {
  return {
    to: PARA,
    from: { name: 'Finanças', email: REMETENTE },
    subject: 'Orçamento: Mercado chegou a 81% do limite',
    text: 'Mercado: R$ 81,00 de R$ 100,00 (81%).\n',
    html: '<p>Mercado: R$ 81,00 de R$ 100,00 (81%).</p>',
    ...parcial,
  }
}

type Recebido = { from?: string; to?: string; raw?: unknown; tudo: unknown }

function bindingFalso(falha?: unknown) {
  const recebidos: Recebido[] = []
  const binding = {
    async send(msg: unknown) {
      if (falha !== undefined) throw falha
      const m = msg as Record<string, unknown>
      recebidos.push({
        from: m.from as string,
        to: m.to as string,
        raw: m['EmailMessage::raw'],
        tudo: msg,
      })
      return { messageId: '<do-binding@exemplo.test>' }
    },
  }
  return { binding: binding as unknown as SendEmail, recebidos }
}

function routing(email: SendEmail, novoId: () => string = () => ID) {
  return enviadorDeAlertas(
    { email, modo: 'email_routing' },
    { agora: () => AGORA, novoId },
  )
}

async function capturar(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('era para ter lançado')
}

describe('enviadorDeAlertas — email_routing', () => {
  it('manda uma EmailMessage: from = remetente, to = destino, raw = o MIME montado', async () => {
    const { binding, recebidos } = bindingFalso()
    const msg = mensagem()

    const r = await routing(binding).send(msg)

    expect(recebidos).toHaveLength(1)
    expect(recebidos[0].from).toBe(REMETENTE)
    expect(recebidos[0].to).toBe(PARA)
    expect(recebidos[0].raw).toBe(
      montarMime(msg, { data: AGORA, messageId: `${ID}@exemplo.test` }),
    )
    expect(r).toEqual({ messageId: `<${ID}@exemplo.test>` })
  })

  it('não manda o objeto estruturado: nada de subject/text/html soltos', async () => {
    const { binding, recebidos } = bindingFalso()
    await routing(binding).send(mensagem())
    expect(recebidos[0].tudo).not.toHaveProperty('subject')
    expect(recebidos[0].tudo).not.toHaveProperty('html')
  })

  it('Message-ID padrão: um UUID no domínio do remetente', async () => {
    const { binding, recebidos } = bindingFalso()
    const r = await enviadorDeAlertas({
      email: binding,
      modo: 'email_routing',
    }).send(mensagem())
    expect(r.messageId).toMatch(
      /^<[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@exemplo\.test>$/,
    )
    expect(String(recebidos[0].raw)).toContain(
      `\r\nMessage-ID: ${r.messageId}\r\n`,
    )
  })

  it('endereço inválido: rejeita com alertas_endereco_invalido e não chama o binding', async () => {
    const { binding, recebidos } = bindingFalso()
    const erro = await capturar(
      routing(binding).send(mensagem({ to: `${PARA}\r\nBcc: x@y.test` })),
    )
    expect(erro).toMatchObject({ code: 'alertas_endereco_invalido' })
    expect(recebidos).toHaveLength(0)
  })

  // Os dois lados da classificação: o erro sem code E_* cuja mensagem diz
  // destino recusado vira destino_nao_verificado (sem a mensagem, que traz o
  // endereço); qualquer outro erro sai do jeito que veio.
  it('destino recusado sem code (mensagem medida no miniflare): rejeita com destino_nao_verificado, sem o endereço', async () => {
    const { binding } = bindingFalso(new Error(`email to ${PARA} not allowed`))
    const erro = await capturar(routing(binding).send(mensagem()))
    expect(erro).toBeInstanceOf(Error)
    expect(erro).toMatchObject({ code: 'destino_nao_verificado' })
    expect(String((erro as Error).message)).not.toContain(PARA)
    expect(String((erro as Error).stack)).not.toContain(PARA)
  })

  it('destino recusado sem code (frase publicada por terceiro): rejeita com destino_nao_verificado', async () => {
    const { binding } = bindingFalso(
      new Error('destination address is not a verified address'),
    )
    const erro = await capturar(routing(binding).send(mensagem()))
    expect(erro).toMatchObject({ code: 'destino_nao_verificado' })
  })

  it('erro com code E_* sai do jeito que veio', async () => {
    const original = Object.assign(new Error(`email to ${PARA} not allowed`), {
      code: 'E_RECIPIENT_NOT_ALLOWED',
    })
    const { binding } = bindingFalso(original)
    expect(await capturar(routing(binding).send(mensagem()))).toBe(original)
  })

  it('outro erro sem code sai do jeito que veio', async () => {
    const original = new Error('Network connection lost.')
    const { binding } = bindingFalso(original)
    expect(await capturar(routing(binding).send(mensagem()))).toBe(original)
  })
})

describe('enviadorDeAlertas — email_sending', () => {
  it('manda o objeto estruturado do jeito que veio e devolve o messageId do binding', async () => {
    const { binding, recebidos } = bindingFalso()
    const msg = mensagem()

    const r = await enviadorDeAlertas({
      email: binding,
      modo: 'email_sending',
    }).send(msg)

    expect(recebidos.map((x) => x.tudo)).toEqual([msg])
    expect(r).toEqual({ messageId: '<do-binding@exemplo.test>' })
  })

  it('não reclassifica a mensagem: o caminho estruturado tem os códigos E_*', async () => {
    const original = new Error(`email to ${PARA} not allowed`)
    const { binding } = bindingFalso(original)
    const erro = await capturar(
      enviadorDeAlertas({ email: binding, modo: 'email_sending' }).send(
        mensagem(),
      ),
    )
    expect(erro).toBe(original)
  })
})

// O binding REAL do pool: o send_email EMAIL do wrangler.jsonc, simulado pelo
// miniflare. Sem "remote": true o miniflare não liga o proxy remoto e só grava
// a mensagem num arquivo temporário (plugins/email do miniflare); nada sai da
// máquina. Ele confere de verdade: remetente na allowed_sender_addresses,
// MIME que o PostalMime lê, Message-ID presente e From do cabeçalho igual ao
// remetente do envelope.
describe('enviadorDeAlertas — contra o binding send_email do miniflare', () => {
  const real = env as unknown as {
    EMAIL: SendEmail
    ALERTAS_REMETENTE: string
  }

  it('aceita a EmailMessage montada, do remetente do wrangler.jsonc', async () => {
    expect(real.EMAIL).toBeDefined()
    const r = await routing(real.EMAIL).send(
      mensagem({
        from: { name: 'Finanças', email: real.ALERTAS_REMETENTE },
        subject: 'Fatura do Cartão › Ação vence amanhã',
      }),
    )
    expect(r.messageId).toMatch(/^<.+@piluvitu\.com\.br>$/)
  })

  it('recusa um remetente fora da allowed_sender_addresses', async () => {
    const erro = await capturar(
      routing(real.EMAIL).send(
        mensagem({
          from: { name: 'Finanças', email: 'outro@piluvitu.com.br' },
        }),
      ),
    )
    expect(String((erro as Error).message)).toMatch(/not allowed/)
  })
})
