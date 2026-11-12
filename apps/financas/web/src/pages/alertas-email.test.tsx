import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// api.ts importa o authClient só para o 401; o cliente real do Better Auth
// não interessa aqui. O resto é de verdade: o teste troca o `fetch`, então o
// caminho, o método, o corpo e o envelope passam pelo `api` real.
vi.mock('../auth-client', () => ({
  authClient: { $store: { notify: vi.fn() } },
}))

import {
  AlertasEmailCard,
  CartaoAlertasEmail,
  type EnvioView,
} from './alertas-email'
import metaHistorias, * as todasAsHistorias from './alertas-email.stories'

const ROTA = '/api/settings/alertas'
const NOME = 'Receber alertas por e-mail'

const SELO_PRONTO = 'Ligado'
const SELO_AGUARDANDO = 'Aguardando o primeiro envio'
const SELO_NAO_CONFIGURADO = 'Envio de e-mail não configurado'
const SELO_FALHOU = 'A última tentativa falhou'

const FRASE_AGUARDANDO =
  'Nenhum e-mail saiu ainda. O estado se confirma no primeiro alerta.'
const FRASE_NAO_CONFIGURADO =
  'O Finanças ainda não consegue mandar e-mail: falta configurar o envio na Cloudflare.'
const FRASE_FALHOU = 'Tenta de novo no próximo dia com alerta.'

const PRONTO: EnvioView = {
  estado: 'pronto',
  modo: 'email_routing',
  em: '2026-11-10T09:00:12.000Z',
}
const AGUARDANDO: EnvioView = { estado: 'aguardando', modo: 'email_routing' }
const SEM_BINDING: EnvioView = {
  estado: 'nao_configurado',
  modo: 'email_routing',
  codigo: 'alertas_sem_binding',
}
const REMETENTE_NAO_VERIFICADO: EnvioView = {
  estado: 'nao_configurado',
  modo: 'email_routing',
  codigo: 'E_SENDER_NOT_VERIFIED',
  em: '2026-11-10T09:00:03.000Z',
}
const FALHOU: EnvioView = {
  estado: 'falhou',
  modo: 'email_routing',
  codigo: 'E_DELIVERY_FAILED',
  em: '2026-11-10T09:00:05.000Z',
}

type Resposta = { status: number; body: unknown }
type Passo = Resposta | Promise<Resposta> | Error

const ok = (data: unknown): Resposta => ({
  status: 200,
  body: { ok: true, data, notifications: [] },
})

const recusa = (status: number, code: string, message: string): Resposta => ({
  status,
  body: {
    ok: false,
    data: null,
    notifications: [{ type: 'error', code, message }],
  },
})

function adiada() {
  let responder!: (r: Resposta) => void
  const promessa = new Promise<Resposta>((r) => {
    responder = r
  })
  return { promessa, responder }
}

type Chamada = { path: string; method: string; body: unknown }

/** Responde as chamadas na ordem; uma chamada a mais falha o teste. */
function servidor(passos: Passo[]): Chamada[] {
  const fila = [...passos]
  const chamadas: Chamada[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      chamadas.push({
        path,
        method,
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      })
      const passo = fila.shift()
      if (passo === undefined)
        throw new Error(`chamada inesperada: ${method} ${path}`)
      if (passo instanceof Error) throw passo
      const r = await passo
      return { status: r.status, json: async () => r.body }
    }),
  )
  return chamadas
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AlertasEmailCard', () => {
  it('enquanto a leitura não volta, avisa que está carregando e não mostra o interruptor', async () => {
    const leitura = adiada()
    servidor([leitura.promessa])
    render(<AlertasEmailCard />)

    expect(screen.getByText(/Carregando/)).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('switch')).toBeNull()

    leitura.responder(ok({ ligado: true, envio: PRONTO }))
    expect(await screen.findByRole('switch', { name: NOME })).toBeChecked()
  })

  it('carrega ligado com o envio pronto: interruptor marcado e o estado escrito, não só na cor', async () => {
    const chamadas = servidor([ok({ ligado: true, envio: PRONTO })])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    expect(interruptor).toBeChecked()
    expect(interruptor).toBeEnabled()
    expect(interruptor).toHaveAccessibleDescription(SELO_PRONTO)
    expect(screen.getByText('Último e-mail em 10/11/2026')).toBeInTheDocument()
    expect(chamadas).toEqual([{ path: ROTA, method: 'GET', body: undefined }])
  })

  it('carrega ligado sem o envio configurado: o selo diz isso, nunca "Ligado"', async () => {
    // A preferência está ligada, mas nenhum e-mail sai: um "Ligado" aqui
    // diria ao dono que ele vai ser avisado quando não vai.
    servidor([ok({ ligado: true, envio: REMETENTE_NAO_VERIFICADO })])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    expect(interruptor).toBeChecked()
    expect(interruptor).toHaveAccessibleDescription(SELO_NAO_CONFIGURADO)
    const cartao = screen.getByTestId('cartao-alertas-email')
    expect(cartao).toHaveTextContent(FRASE_NAO_CONFIGURADO)
    expect(cartao).toHaveTextContent('código: E_SENDER_NOT_VERIFIED')
    expect(cartao).not.toHaveTextContent(/Ligado/)
  })

  it('carrega desligado', async () => {
    servidor([ok({ ligado: false, envio: PRONTO })])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    expect(interruptor).not.toBeChecked()
    expect(interruptor).toHaveAccessibleDescription('Desligado')
  })

  it('desligar manda PUT com ligado false e só muda quando o servidor confirma', async () => {
    // Nada de otimismo: nenhuma tela do app muda antes da resposta, e um
    // interruptor que mostra "Desligado" enquanto o servidor ainda pode
    // recusar diria ao dono que os e-mails pararam sem ter parado.
    const usuario = userEvent.setup()
    const gravacao = adiada()
    const chamadas = servidor([
      ok({ ligado: true, envio: PRONTO }),
      gravacao.promessa,
    ])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    await usuario.click(interruptor)

    expect(chamadas[1]).toEqual({
      path: ROTA,
      method: 'PUT',
      body: { ligado: false },
    })
    expect(interruptor).toBeDisabled()
    expect(interruptor).toBeChecked()
    expect(interruptor).toHaveAccessibleDescription('Salvando…')

    gravacao.responder(ok({ ligado: false, envio: PRONTO }))
    await waitFor(() => expect(interruptor).toBeEnabled())
    expect(interruptor).not.toBeChecked()
    expect(interruptor).toHaveAccessibleDescription('Desligado')
  })

  it('ligar manda PUT com ligado true e o selo segue o envio que a resposta trouxe', async () => {
    // A leitura disse "aguardando"; a resposta do PUT diz "não configurado".
    // O selo tem que seguir a resposta, não o estado lido antes.
    const usuario = userEvent.setup()
    const chamadas = servidor([
      ok({ ligado: false, envio: AGUARDANDO }),
      ok({ ligado: true, envio: SEM_BINDING }),
    ])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    await usuario.click(interruptor)

    await waitFor(() => expect(interruptor).toBeChecked())
    expect(chamadas[1]).toEqual({
      path: ROTA,
      method: 'PUT',
      body: { ligado: true },
    })
    expect(interruptor).toHaveAccessibleDescription(SELO_NAO_CONFIGURADO)
    expect(screen.getByTestId('cartao-alertas-email')).toHaveTextContent(
      'código: alertas_sem_binding',
    )
  })

  it('ligar com o envio pronto mostra "Ligado" e a data do último e-mail', async () => {
    const usuario = userEvent.setup()
    servidor([
      ok({ ligado: false, envio: PRONTO }),
      ok({ ligado: true, envio: PRONTO }),
    ])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    expect(screen.queryByText(/Último e-mail/)).toBeNull()
    await usuario.click(interruptor)

    await waitFor(() =>
      expect(interruptor).toHaveAccessibleDescription(SELO_PRONTO),
    )
    expect(screen.getByText('Último e-mail em 10/11/2026')).toBeInTheDocument()
  })

  it('a recusa do servidor aparece e o interruptor fica no valor salvo', async () => {
    const usuario = userEvent.setup()
    servidor([
      ok({ ligado: true, envio: PRONTO }),
      recusa(422, 'invalid_body', 'Envie ligado como verdadeiro ou falso.'),
    ])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    await usuario.click(interruptor)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Envie ligado como verdadeiro ou falso.',
    )
    expect(interruptor).toBeChecked()
    expect(interruptor).toBeEnabled()
    expect(interruptor).toHaveAccessibleDescription(SELO_PRONTO)
  })

  it('uma tentativa nova apaga a recusa anterior', async () => {
    const usuario = userEvent.setup()
    servidor([
      ok({ ligado: true, envio: PRONTO }),
      recusa(429, 'rate_limited', 'Muitas gravações em pouco tempo.'),
      ok({ ligado: false, envio: PRONTO }),
    ])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    await usuario.click(interruptor)
    await screen.findByRole('alert')

    await usuario.click(interruptor)
    await waitFor(() => expect(interruptor).not.toBeChecked())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('falha de rede ao salvar vira frase em português, não o erro cru do navegador', async () => {
    const usuario = userEvent.setup()
    servidor([
      ok({ ligado: true, envio: PRONTO }),
      new TypeError('Failed to fetch'),
    ])
    render(<AlertasEmailCard />)

    await usuario.click(await screen.findByRole('switch', { name: NOME }))

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Não foi possível falar com o servidor. Tente de novo.',
    )
    expect(alerta).not.toHaveTextContent(/TypeError|fetch/)
  })

  it('erro de leitura mostra o motivo, sem interruptor, e "Tentar de novo" busca de novo', async () => {
    const usuario = userEvent.setup()
    const chamadas = servidor([
      recusa(503, 'db_unavailable', 'O banco não respondeu.'),
      ok({ ligado: false, envio: AGUARDANDO }),
    ])
    render(<AlertasEmailCard />)

    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent(
      'Não foi possível carregar a preferência de alertas.',
    )
    expect(alerta).toHaveTextContent('O banco não respondeu.')
    expect(screen.queryByRole('switch')).toBeNull()

    await usuario.click(
      within(alerta).getByRole('button', { name: 'Tentar de novo' }),
    )

    expect(await screen.findByRole('switch', { name: NOME })).not.toBeChecked()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(chamadas.map((c) => c.method)).toEqual(['GET', 'GET'])
  })
})

describe('CartaoAlertasEmail', () => {
  const base = {
    ligado: true,
    envio: PRONTO,
    erroCarga: null,
    salvando: false,
    recusa: null,
    onAlternar: () => {},
    onTentarDeNovo: () => {},
  }

  const interruptor = () => screen.getByRole('switch', { name: NOME })
  const cartao = () => screen.getByTestId('cartao-alertas-email')

  it('explica o que dispara, o limite de um e-mail por alerta e o destino, sem mostrar o endereço', () => {
    render(<CartaoAlertasEmail {...base} />)

    expect(
      screen.getByRole('heading', { name: 'Alertas por e-mail' }),
    ).toBeInTheDocument()
    expect(cartao()).toHaveTextContent(/80% do orçamento do mês/)
    expect(cartao()).toHaveTextContent(/quando estoura/)
    expect(cartao()).toHaveTextContent(/3 dias antes do vencimento/)
    expect(cartao()).toHaveTextContent(/fatura de cartão em aberto/)
    expect(cartao()).toHaveTextContent(/no máximo um e-mail por alerta/i)
    expect(cartao()).toHaveTextContent(/conta Google/)
    // O endereço mora só na config do Worker; a tela não o conhece nem o
    // mostra.
    expect(cartao()).not.toHaveTextContent('@')
  })

  it('pronto: "Ligado" e o dia do último e-mail em Teresina, não em UTC', () => {
    // 01:30 UTC de 11/11 ainda é 22:30 de 10/11 em Teresina (UTC−3). Cortar
    // a string ISO daria 11/11, o dia errado.
    render(
      <CartaoAlertasEmail
        {...base}
        envio={{ ...PRONTO, em: '2026-11-11T01:30:00.000Z' }}
      />,
    )
    expect(interruptor()).toHaveAccessibleDescription(SELO_PRONTO)
    expect(cartao()).toHaveTextContent('Último e-mail em 10/11/2026')
    expect(cartao()).not.toHaveTextContent('11/11/2026')
  })

  it('pronto com a data ausente ou ilegível não quebra o cartão nem inventa um dia', () => {
    for (const em of [undefined, 'ontem']) {
      const { unmount } = render(
        <CartaoAlertasEmail {...base} envio={{ ...PRONTO, em }} />,
      )
      expect(interruptor()).toHaveAccessibleDescription(SELO_PRONTO)
      expect(cartao()).not.toHaveTextContent(/Último e-mail/)
      unmount()
    }
  })

  it('aguardando: diz que nenhum e-mail saiu ainda', () => {
    render(<CartaoAlertasEmail {...base} envio={AGUARDANDO} />)
    expect(interruptor()).toHaveAccessibleDescription(SELO_AGUARDANDO)
    expect(cartao()).toHaveTextContent(FRASE_AGUARDANDO)
    expect(cartao()).not.toHaveTextContent(/código/)
  })

  it('não configurado: frase, código em texto pequeno e o dia da tentativa, sem endereço', () => {
    render(<CartaoAlertasEmail {...base} envio={REMETENTE_NAO_VERIFICADO} />)
    expect(interruptor()).toHaveAccessibleDescription(SELO_NAO_CONFIGURADO)
    expect(cartao()).toHaveTextContent(FRASE_NAO_CONFIGURADO)
    const codigo = screen.getByText(/código: E_SENDER_NOT_VERIFIED/)
    expect(codigo.className).toContain('text-xs')
    expect(codigo).toHaveTextContent('tentativa em 10/11/2026')
    expect(cartao()).not.toHaveTextContent('@')
  })

  it('não configurado pela config do Worker (sem tentativa): código sem data', () => {
    render(<CartaoAlertasEmail {...base} envio={SEM_BINDING} />)
    expect(interruptor()).toHaveAccessibleDescription(SELO_NAO_CONFIGURADO)
    expect(cartao()).toHaveTextContent(FRASE_NAO_CONFIGURADO)
    expect(
      screen.getByText(/código: alertas_sem_binding/),
    ).not.toHaveTextContent(/tentativa/)
  })

  it('não configurado sem código: só a frase, sem uma linha de código vazia', () => {
    render(
      <CartaoAlertasEmail
        {...base}
        envio={{ estado: 'nao_configurado', modo: null }}
      />,
    )
    expect(interruptor()).toHaveAccessibleDescription(SELO_NAO_CONFIGURADO)
    expect(cartao()).toHaveTextContent(FRASE_NAO_CONFIGURADO)
    expect(cartao()).not.toHaveTextContent(/código/)
  })

  it('falhou: diz quando tenta de novo, o código e o dia da tentativa', () => {
    render(<CartaoAlertasEmail {...base} envio={FALHOU} />)
    expect(interruptor()).toHaveAccessibleDescription(SELO_FALHOU)
    expect(cartao()).toHaveTextContent(FRASE_FALHOU)
    expect(cartao()).toHaveTextContent('código: E_DELIVERY_FAILED')
    expect(cartao()).toHaveTextContent('tentativa em 10/11/2026')
  })

  it('em todo estado que não é "pronto", o selo NÃO diz "Ligado"', () => {
    // A regra do pedido: nunca "Ligado" sem e-mail saindo. Inclui o envio
    // ausente e um estado que esta versão da tela não conhece.
    const naoProntos: Array<EnvioView | null> = [
      AGUARDANDO,
      SEM_BINDING,
      REMETENTE_NAO_VERIFICADO,
      { estado: 'nao_configurado', modo: null },
      FALHOU,
      { estado: 'desconhecido', modo: 'email_routing' } as unknown as EnvioView,
      null,
    ]
    for (const envio of naoProntos) {
      const { unmount } = render(<CartaoAlertasEmail {...base} envio={envio} />)
      const selo = document.getElementById(
        interruptor().getAttribute('aria-describedby')!,
      )
      expect(selo).not.toBeNull()
      expect(selo).not.toHaveTextContent(/Ligado/)
      expect(interruptor()).not.toHaveAccessibleDescription(SELO_PRONTO)
      expect(cartao()).not.toHaveTextContent(/Ligado/)
      expect(cartao()).not.toHaveTextContent(/Último e-mail/)
      unmount()
    }
  })

  it('desligado diz só "Desligado", sem o estado do envio', () => {
    for (const envio of [PRONTO, AGUARDANDO, SEM_BINDING, FALHOU]) {
      const { unmount } = render(
        <CartaoAlertasEmail {...base} ligado={false} envio={envio} />,
      )
      expect(interruptor()).toHaveAccessibleDescription('Desligado')
      expect(cartao()).not.toHaveTextContent(/Último e-mail/)
      expect(cartao()).not.toHaveTextContent(FRASE_AGUARDANDO)
      expect(cartao()).not.toHaveTextContent(FRASE_NAO_CONFIGURADO)
      expect(cartao()).not.toHaveTextContent(FRASE_FALHOU)
      expect(cartao()).not.toHaveTextContent(/código/)
      unmount()
    }
  })

  it('salvando, o selo diz "Salvando…" em qualquer estado do envio', () => {
    render(<CartaoAlertasEmail {...base} salvando envio={FALHOU} />)
    expect(interruptor()).toHaveAccessibleDescription('Salvando…')
  })

  it('o rótulo inteiro é o alvo de 44 px, não só o quadradinho', () => {
    render(<CartaoAlertasEmail {...base} />)
    const rotulo = interruptor().closest('label')
    expect(rotulo).not.toBeNull()
    expect(rotulo!.className).toContain('min-h-11')
  })

  it('"Tentar de novo" tem 44 px e chama onTentarDeNovo', async () => {
    const usuario = userEvent.setup()
    const onTentarDeNovo = vi.fn()
    render(
      <CartaoAlertasEmail
        {...base}
        ligado={null}
        envio={null}
        erroCarga="O servidor não respondeu."
        onTentarDeNovo={onTentarDeNovo}
      />,
    )
    const botao = screen.getByRole('button', { name: 'Tentar de novo' })
    expect(botao.className).toContain('min-h-11')
    await usuario.click(botao)
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1)
  })

  it('o toque entrega o valor novo, sem chamar a rede sozinho', async () => {
    const usuario = userEvent.setup()
    const onAlternar = vi.fn()
    render(<CartaoAlertasEmail {...base} onAlternar={onAlternar} />)
    await usuario.click(interruptor())
    expect(onAlternar).toHaveBeenCalledWith(false)
  })
})

describe('alertas-email.stories — os estados do cartão', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const { default: _meta, ...historias } = todasAsHistorias
    const esperado: Record<string, (c: HTMLElement) => void> = {
      Carregando: (c) => {
        expect(within(c).getByText(/Carregando/)).toHaveAttribute(
          'aria-busy',
          'true',
        )
        expect(within(c).queryByRole('switch')).toBeNull()
      },
      Ligado: (c) => {
        const s = within(c).getByRole('switch', { name: NOME })
        expect(s).toBeChecked()
        expect(s).toBeEnabled()
        expect(s).toHaveAccessibleDescription(SELO_PRONTO)
      },
      Desligado: (c) => {
        const s = within(c).getByRole('switch', { name: NOME })
        expect(s).not.toBeChecked()
        expect(s).toHaveAccessibleDescription('Desligado')
      },
      Salvando: (c) => {
        const s = within(c).getByRole('switch', { name: NOME })
        expect(s).toBeDisabled()
        expect(s).toHaveAccessibleDescription('Salvando…')
      },
      Recusado: (c) => {
        expect(within(c).getByRole('alert')).toHaveTextContent(
          'Muitas gravações em pouco tempo.',
        )
        expect(within(c).getByRole('switch', { name: NOME })).toBeEnabled()
      },
      ErroAoCarregar: (c) => {
        const alerta = within(c).getByRole('alert')
        expect(alerta).toHaveTextContent('O servidor não respondeu.')
        expect(
          within(alerta).getByRole('button', { name: 'Tentar de novo' }),
        ).toBeInTheDocument()
        expect(within(c).queryByRole('switch')).toBeNull()
      },
      Pronto: (c) => {
        const s = within(c).getByRole('switch', { name: NOME })
        expect(s).toBeChecked()
        expect(s).toHaveAccessibleDescription(SELO_PRONTO)
        expect(c).toHaveTextContent(/Último e-mail em \d{2}\/\d{2}\/\d{4}/)
      },
      Aguardando: (c) => {
        const s = within(c).getByRole('switch', { name: NOME })
        expect(s).toBeChecked()
        expect(s).toHaveAccessibleDescription(SELO_AGUARDANDO)
        expect(c).toHaveTextContent(FRASE_AGUARDANDO)
      },
      NaoConfigurado: (c) => {
        const s = within(c).getByRole('switch', { name: NOME })
        expect(s).toBeChecked()
        expect(s).toHaveAccessibleDescription(SELO_NAO_CONFIGURADO)
        expect(c).toHaveTextContent(FRASE_NAO_CONFIGURADO)
        expect(c).toHaveTextContent(/código: E_/)
      },
      Falhou: (c) => {
        const s = within(c).getByRole('switch', { name: NOME })
        expect(s).toBeChecked()
        expect(s).toHaveAccessibleDescription(SELO_FALHOU)
        expect(c).toHaveTextContent(FRASE_FALHOU)
        expect(c).toHaveTextContent(/código: E_/)
      },
    }
    expect(Object.keys(historias).sort()).toEqual(Object.keys(esperado).sort())
    for (const [nome, h] of Object.entries(historias)) {
      const { container, unmount } = render(
        <CartaoAlertasEmail {...metaHistorias.args} {...h.args} />,
      )
      esperado[nome](container)
      unmount()
    }
  })
})
