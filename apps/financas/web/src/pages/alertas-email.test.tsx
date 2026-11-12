import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

// api.ts importa o authClient só para o 401; o cliente real do Better Auth
// não interessa aqui. O resto é de verdade: o teste troca o `fetch`, então o
// caminho, o método, o corpo e o envelope passam pelo `api` real.
vi.mock('../auth-client', () => ({
  authClient: { $store: { notify: vi.fn() } },
}))

import { AlertasEmailCard, CartaoAlertasEmail } from './alertas-email'
import metaHistorias, * as todasAsHistorias from './alertas-email.stories'

const ROTA = '/api/settings/alertas'
const NOME = 'Receber alertas por e-mail'

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

    leitura.responder(ok({ ligado: true }))
    expect(await screen.findByRole('switch', { name: NOME })).toBeChecked()
  })

  it('carrega ligado: interruptor marcado e o estado escrito, não só na cor', async () => {
    const chamadas = servidor([ok({ ligado: true })])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    expect(interruptor).toBeChecked()
    expect(interruptor).toBeEnabled()
    expect(interruptor).toHaveAccessibleDescription('Ligado')
    expect(chamadas).toEqual([{ path: ROTA, method: 'GET', body: undefined }])
  })

  it('carrega desligado', async () => {
    servidor([ok({ ligado: false })])
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
    const chamadas = servidor([ok({ ligado: true }), gravacao.promessa])
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

    gravacao.responder(ok({ ligado: false }))
    await waitFor(() => expect(interruptor).toBeEnabled())
    expect(interruptor).not.toBeChecked()
    expect(interruptor).toHaveAccessibleDescription('Desligado')
  })

  it('ligar manda PUT com ligado true', async () => {
    const usuario = userEvent.setup()
    const chamadas = servidor([ok({ ligado: false }), ok({ ligado: true })])
    render(<AlertasEmailCard />)

    const interruptor = await screen.findByRole('switch', { name: NOME })
    await usuario.click(interruptor)

    await waitFor(() => expect(interruptor).toBeChecked())
    expect(chamadas[1]).toEqual({
      path: ROTA,
      method: 'PUT',
      body: { ligado: true },
    })
    expect(interruptor).toHaveAccessibleDescription('Ligado')
  })

  it('a recusa do servidor aparece e o interruptor fica no valor salvo', async () => {
    const usuario = userEvent.setup()
    servidor([
      ok({ ligado: true }),
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
  })

  it('uma tentativa nova apaga a recusa anterior', async () => {
    const usuario = userEvent.setup()
    servidor([
      ok({ ligado: true }),
      recusa(429, 'rate_limited', 'Muitas gravações em pouco tempo.'),
      ok({ ligado: false }),
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
    servidor([ok({ ligado: true }), new TypeError('Failed to fetch')])
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
      ok({ ligado: false }),
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
    erroCarga: null,
    salvando: false,
    recusa: null,
    onAlternar: () => {},
    onTentarDeNovo: () => {},
  }

  it('explica o que dispara, o limite de um e-mail por alerta e o destino, sem mostrar o endereço', () => {
    render(<CartaoAlertasEmail {...base} />)

    expect(
      screen.getByRole('heading', { name: 'Alertas por e-mail' }),
    ).toBeInTheDocument()
    const cartao = screen.getByTestId('cartao-alertas-email')
    expect(cartao).toHaveTextContent(/80% do orçamento do mês/)
    expect(cartao).toHaveTextContent(/quando estoura/)
    expect(cartao).toHaveTextContent(/3 dias antes do vencimento/)
    expect(cartao).toHaveTextContent(/fatura de cartão em aberto/)
    expect(cartao).toHaveTextContent(/no máximo um e-mail por alerta/i)
    expect(cartao).toHaveTextContent(/conta Google/)
    // O endereço mora só na config do Worker; a tela não o conhece nem o
    // mostra.
    expect(cartao).not.toHaveTextContent('@')
  })

  it('o rótulo inteiro é o alvo de 44 px, não só o quadradinho', () => {
    render(<CartaoAlertasEmail {...base} />)
    const rotulo = screen.getByRole('switch', { name: NOME }).closest('label')
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
    await usuario.click(screen.getByRole('switch', { name: NOME }))
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
        expect(s).toHaveAccessibleDescription('Ligado')
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
