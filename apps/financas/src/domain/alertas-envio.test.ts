/**
 * Configuração e estado do envio dos alertas por e-mail. A tela de
 * Configurações mostra o estado REAL do envio a partir daqui: nunca "Ligado"
 * sem e-mail saindo. Endereços fictícios; o binding é um objeto qualquer
 * (aqui só a presença dele importa).
 */
import { env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  ALERTAS_EMAIL_ENVIO_KEY,
  CODIGOS_DE_CONFIGURACAO,
  configuracaoDoEnvio,
  type ConfigDeEnvio,
  destinoNaoVerificado,
  estadoDoEnvio,
  faltaNaConfiguracao,
  impressaoDoEnvio,
  registrarEnvio,
} from './alertas-envio'
import { setSetting } from './settings'

const db = env.DB
const PARA = 'dono@exemplo.test'
const REMETENTE = 'alertas@exemplo.test'
const BINDING = {} as SendEmail
const EM = '2026-08-10T09:00:00Z'
const ENVIO = { modo: 'email_routing', de: REMETENTE, para: PARA } as const

function config(parcial: Partial<ConfigDeEnvio> = {}): ConfigDeEnvio {
  return {
    EMAIL: BINDING,
    ALLOWED_EMAIL: PARA,
    ALERTAS_REMETENTE: REMETENTE,
    ALERTAS_ENVIO: 'email_routing',
    ...parcial,
  }
}

async function gravarCru(valor: string) {
  await setSetting(db, ALERTAS_EMAIL_ENVIO_KEY, valor)
}

describe('faltaNaConfiguracao', () => {
  it('tudo presente, nos dois modos: nada falta', () => {
    expect(faltaNaConfiguracao(config())).toBeNull()
    expect(
      faltaNaConfiguracao(config({ ALERTAS_ENVIO: 'email_sending' })),
    ).toBeNull()
  })

  it('decide na ordem: binding, destinatário, remetente, modo', () => {
    expect(faltaNaConfiguracao({})).toBe('alertas_sem_binding')
    expect(faltaNaConfiguracao({ EMAIL: BINDING })).toBe(
      'alertas_sem_destinatario',
    )
    expect(faltaNaConfiguracao({ EMAIL: BINDING, ALLOWED_EMAIL: PARA })).toBe(
      'alertas_sem_remetente',
    )
    expect(
      faltaNaConfiguracao({
        EMAIL: BINDING,
        ALLOWED_EMAIL: PARA,
        ALERTAS_REMETENTE: REMETENTE,
      }),
    ).toBe('alertas_sem_modo')
  })

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['outro valor', 'smtp'],
    ['caixa diferente', 'EMAIL_ROUTING'],
  ])('ALERTAS_ENVIO %s: alertas_sem_modo', (_rotulo, valor) => {
    expect(faltaNaConfiguracao(config({ ALERTAS_ENVIO: valor }))).toBe(
      'alertas_sem_modo',
    )
  })

  it('string vazia conta como ausente', () => {
    expect(faltaNaConfiguracao(config({ ALLOWED_EMAIL: '' }))).toBe(
      'alertas_sem_destinatario',
    )
    expect(faltaNaConfiguracao(config({ ALERTAS_REMETENTE: '' }))).toBe(
      'alertas_sem_remetente',
    )
  })

  it('configuracaoDoEnvio devolve o que o Cron usa quando nada falta, e só o código quando falta', () => {
    expect(configuracaoDoEnvio(config())).toEqual({
      falta: null,
      email: BINDING,
      para: PARA,
      de: REMETENTE,
      modo: 'email_routing',
    })
    expect(configuracaoDoEnvio(config({ EMAIL: undefined }))).toEqual({
      falta: 'alertas_sem_binding',
    })
  })
})

describe('estadoDoEnvio', () => {
  it('configuração faltando: nao_configurado com o código e o modo, se o modo for válido', async () => {
    expect(await estadoDoEnvio(db, config({ EMAIL: undefined }))).toEqual({
      estado: 'nao_configurado',
      modo: 'email_routing',
      codigo: 'alertas_sem_binding',
    })
  })

  it('ALERTAS_ENVIO inválido: nao_configurado com modo null', async () => {
    expect(await estadoDoEnvio(db, config({ ALERTAS_ENVIO: 'smtp' }))).toEqual({
      estado: 'nao_configurado',
      modo: null,
      codigo: 'alertas_sem_modo',
    })
  })

  // Configuração faltando vence o registro: o envio de ontem não prova que
  // o de amanhã sai sem o binding.
  it('configuração faltando vence um registro de envio que deu certo', async () => {
    await registrarEnvio(db, ENVIO, { resultado: 'enviado', em: EM })
    expect(
      (await estadoDoEnvio(db, config({ ALERTAS_REMETENTE: undefined })))
        .estado,
    ).toBe('nao_configurado')
  })

  it('sem registro: aguardando o primeiro envio', async () => {
    expect(await estadoDoEnvio(db, config())).toEqual({
      estado: 'aguardando',
      modo: 'email_routing',
    })
  })

  it('registro enviado no modo atual: pronto, com a data', async () => {
    await registrarEnvio(db, ENVIO, { resultado: 'enviado', em: EM })
    expect(await estadoDoEnvio(db, config())).toEqual({
      estado: 'pronto',
      modo: 'email_routing',
      em: EM,
    })
  })

  // Trocar o caminho (ALERTAS_ENVIO) zera a confirmação: o envio que deu
  // certo pelo outro caminho não diz nada sobre este.
  it('registro de OUTRO modo: aguardando', async () => {
    await registrarEnvio(
      db,
      { ...ENVIO, modo: 'email_sending' },
      { resultado: 'enviado', em: EM },
    )
    expect(await estadoDoEnvio(db, config())).toEqual({
      estado: 'aguardando',
      modo: 'email_routing',
    })
  })

  // O mesmo vale para o destinatário e o remetente: um endereço novo pode
  // ainda não estar verificado no Email Routing, e o próximo alerta pode
  // levar semanas. Sem isto, o selo seguiria "Ligado" até lá.
  it.each([
    ['destinatário', { ALLOWED_EMAIL: 'outro@exemplo.test' }],
    ['remetente', { ALERTAS_REMETENTE: 'avisos@exemplo.test' }],
  ])('registro enviado com OUTRO %s: aguardando', async (_rotulo, parcial) => {
    await registrarEnvio(db, ENVIO, { resultado: 'enviado', em: EM })
    expect(await estadoDoEnvio(db, config(parcial))).toEqual({
      estado: 'aguardando',
      modo: 'email_routing',
    })
  })

  it('registro de falha por configuração com OUTRO destinatário: aguardando, não o código antigo', async () => {
    await registrarEnvio(db, ENVIO, {
      resultado: 'falhou',
      codigo: 'destino_nao_verificado',
      em: EM,
    })
    expect(
      await estadoDoEnvio(db, config({ ALLOWED_EMAIL: 'outro@exemplo.test' })),
    ).toEqual({ estado: 'aguardando', modo: 'email_routing' })
  })

  it.each([...CODIGOS_DE_CONFIGURACAO])(
    'falhou com %s (configuração): nao_configurado com o código e a data',
    async (codigo) => {
      await registrarEnvio(db, ENVIO, { resultado: 'falhou', codigo, em: EM })
      expect(await estadoDoEnvio(db, config())).toEqual({
        estado: 'nao_configurado',
        modo: 'email_routing',
        codigo,
        em: EM,
      })
    },
  )

  it('os códigos de configuração são exatamente os combinados', () => {
    expect([...CODIGOS_DE_CONFIGURACAO].sort()).toEqual(
      [
        'E_ACCOUNT_SUSPENDED',
        'E_RECIPIENT_NOT_ALLOWED',
        'E_RECIPIENT_SUPPRESSED',
        'E_SENDER_DOMAIN_NOT_AVAILABLE',
        'E_SENDER_NOT_VERIFIED',
        'alertas_endereco_invalido',
        'destino_nao_verificado',
      ].sort(),
    )
  })

  it.each(['E_RATE_LIMIT_EXCEEDED', 'E_INTERNAL_SERVER_ERROR', 'TypeError'])(
    'falhou com %s (passageiro): falhou com o código e a data',
    async (codigo) => {
      await registrarEnvio(db, ENVIO, { resultado: 'falhou', codigo, em: EM })
      expect(await estadoDoEnvio(db, config())).toEqual({
        estado: 'falhou',
        modo: 'email_routing',
        codigo,
        em: EM,
      })
    },
  )

  // Cada registro ilegível abaixo é o registro válido com UM defeito; o
  // controle prova que a base, sem defeito, dá 'pronto'. Sem ele, um caso
  // poderia dar 'aguardando' por outro motivo (ex.: a impressão faltando).
  describe('registro gravado por fora', () => {
    let base: Record<string, unknown>
    beforeAll(async () => {
      base = {
        resultado: 'enviado',
        modo: 'email_routing',
        impressao: await impressaoDoEnvio(ENVIO),
        em: EM,
      }
    })

    function sem(chave: string): Record<string, unknown> {
      const copia = { ...base }
      delete copia[chave]
      return copia
    }

    it('controle: o registro válido escrito cru dá pronto', async () => {
      await gravarCru(JSON.stringify(base))
      expect(await estadoDoEnvio(db, config())).toEqual({
        estado: 'pronto',
        modo: 'email_routing',
        em: EM,
      })
    })

    it.each<[string, () => string]>([
      ['JSON quebrado', () => '{resultado:'],
      ['lista', () => '[]'],
      ['null', () => 'null'],
      [
        'resultado desconhecido',
        () => JSON.stringify({ ...base, resultado: 'talvez' }),
      ],
      ['modo desconhecido', () => JSON.stringify({ ...base, modo: 'smtp' })],
      ['sem data', () => JSON.stringify(sem('em'))],
      [
        'data fora do ISO UTC',
        () => JSON.stringify({ ...base, em: '10/08/2026' }),
      ],
      [
        'código com texto livre',
        () =>
          JSON.stringify({
            ...base,
            resultado: 'falhou',
            codigo: 'email to dono@exemplo.test not allowed',
          }),
      ],
      [
        'código não string',
        () => JSON.stringify({ ...base, resultado: 'falhou', codigo: 42 }),
      ],
      ['sem impressão da configuração', () => JSON.stringify(sem('impressao'))],
      [
        'impressão fora do formato',
        () => JSON.stringify({ ...base, impressao: 'abc' }),
      ],
    ])(
      'registro ilegível (%s): aguardando, sem lançar',
      async (_rotulo, valor) => {
        await gravarCru(valor())
        expect(await estadoDoEnvio(db, config())).toEqual({
          estado: 'aguardando',
          modo: 'email_routing',
        })
      },
    )
  })

  // A falha do D1 chega como rejeição do first(), como em produção.
  it('leitura do registro falhando no D1: propaga', async () => {
    const dbQueFalha = {
      prepare: () => ({
        bind: () => ({
          first: async () => {
            throw new Error('D1_ERROR: no such table: settings: SQLITE_ERROR')
          },
        }),
      }),
    } as unknown as D1Database
    await expect(estadoDoEnvio(dbQueFalha, config())).rejects.toThrow(
      /SQLITE_ERROR/,
    )
  })
})

describe('registrarEnvio', () => {
  async function valorSalvo(): Promise<string> {
    const linha = await db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .bind('alertas_email_envio')
      .first<{ value: string }>()
    return linha?.value ?? ''
  }

  it('grava o JSON na chave alertas_email_envio, com a impressão da configuração e sem código quando não há', async () => {
    const envio = { ...ENVIO, modo: 'email_sending' } as const
    await registrarEnvio(db, envio, { resultado: 'enviado', em: EM })
    expect(JSON.parse(await valorSalvo())).toEqual({
      resultado: 'enviado',
      modo: 'email_sending',
      impressao: await impressaoDoEnvio(envio),
      em: EM,
    })
  })

  // O registro fica no D1 e não pode guardar os endereços: só o hash.
  it('o registro não guarda os endereços, só uma impressão SHA-256 em hex', async () => {
    await registrarEnvio(db, ENVIO, {
      resultado: 'falhou',
      codigo: 'destino_nao_verificado',
      em: EM,
    })
    const valor = await valorSalvo()
    expect(valor).not.toContain('@')
    expect(valor).not.toContain('exemplo')
    expect(JSON.parse(valor).impressao).toMatch(/^[0-9a-f]{64}$/)
  })

  it('impressaoDoEnvio muda com o modo, o remetente e o destinatário, sem ambiguidade na junção dos três', async () => {
    const a = await impressaoDoEnvio(ENVIO)
    expect(await impressaoDoEnvio({ ...ENVIO })).toBe(a)
    const outras = await Promise.all([
      impressaoDoEnvio({ ...ENVIO, modo: 'email_sending' }),
      impressaoDoEnvio({ ...ENVIO, de: 'avisos@exemplo.test' }),
      impressaoDoEnvio({ ...ENVIO, para: 'outro@exemplo.test' }),
    ])
    for (const outra of outras) expect(outra).not.toBe(a)
    expect(
      await impressaoDoEnvio({ modo: 'email_routing', de: 'a|b@x', para: 'c' }),
    ).not.toBe(
      await impressaoDoEnvio({ modo: 'email_routing', de: 'a', para: 'b@x|c' }),
    )
  })

  it('a tentativa seguinte sobrescreve a anterior', async () => {
    await registrarEnvio(db, ENVIO, {
      resultado: 'falhou',
      codigo: 'E_SENDER_NOT_VERIFIED',
      em: EM,
    })
    await registrarEnvio(db, ENVIO, {
      resultado: 'enviado',
      em: '2026-08-11T09:00:00Z',
    })
    expect(await estadoDoEnvio(db, config())).toEqual({
      estado: 'pronto',
      modo: 'email_routing',
      em: '2026-08-11T09:00:00Z',
    })
  })
})

// Medido no miniflare 4.20260722.0 (src/workers/email/send_email.worker.ts):
// destino fora de allowed_destination_addresses lança Error SEM `code`, com
// a mensagem "email to <endereço> not allowed". A frase de produção para
// destino não verificado não está na doc nem no workerd aberto. A única
// publicada é a de um texto de terceiro sobre um Worker mandando e-mail
// ("destination address is not a verified address", no debug_reason); a
// outra forma é suposição. As duas ficam cobertas para o primeiro envio,
// antes da verificação, não cair em 'falhou' por engano.
describe('destinoNaoVerificado', () => {
  it.each([
    ['medida no miniflare', `email to ${PARA} not allowed`],
    ['publicada por terceiro', 'destination address is not a verified address'],
    ['suposta em produção', `destination address ${PARA} is not verified`],
  ])('mensagem %s sem code: é destino não verificado', (_rotulo, mensagem) => {
    expect(destinoNaoVerificado(new Error(mensagem))).toBe(true)
  })

  it('erro vindo por RPC (objeto com message, sem ser instância local de Error) também conta', () => {
    expect(
      destinoNaoVerificado({
        name: 'Error',
        message: `email to ${PARA} not allowed`,
      }),
    ).toBe(true)
  })

  it.each([
    [
      'remetente fora da lista (miniflare)',
      `email from ${REMETENTE} not allowed`,
    ],
    ['From diferente (miniflare)', 'From: header does not match mail from'],
    ['sem Message-ID (miniflare)', 'invalid message-id'],
    ['erro de rede', 'Network connection lost.'],
  ])('%s: não é destino não verificado', (_rotulo, mensagem) => {
    expect(destinoNaoVerificado(new Error(mensagem))).toBe(false)
  })

  it('com code E_* o code manda, mesmo com a mensagem parecida', () => {
    const erro = Object.assign(new Error(`email to ${PARA} not allowed`), {
      code: 'E_RECIPIENT_NOT_ALLOWED',
    })
    expect(destinoNaoVerificado(erro)).toBe(false)
  })

  it('não erro: falso', () => {
    expect(destinoNaoVerificado(undefined)).toBe(false)
    expect(destinoNaoVerificado('email to x@y not allowed')).toBe(false)
  })
})
