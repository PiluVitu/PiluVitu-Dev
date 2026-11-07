import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import type { MetaView } from '../lib/metas'
import { CartaoDaMeta, MetasPage } from './metas'
import metaHistorias, * as todasAsHistorias from './metas.stories'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

afterEach(() => {
  vi.clearAllMocks()
})

const meta = (patch: Partial<MetaView> = {}): MetaView => ({
  id: 'g-viagem',
  name: 'Viagem',
  target_cents: 500000,
  target_date: '2027-06-30',
  account_id: 'a-poupanca',
  account_name: 'Poupança teste',
  balance_cents: 125000,
  pct: 25,
  status: 'em_andamento',
  missing_cents: 375000,
  months_left: 10,
  monthly_needed_cents: 37500,
  editable: true,
  reserve_overlap: false,
  ...patch,
})

const contas = [
  {
    id: 'a-poupanca',
    name: 'Poupança teste',
    scope: 'PF',
    kind: 'savings',
    closing_day: null,
    due_day: null,
    balance_cents: 0,
  },
  {
    id: 'a-caixa',
    name: 'Caixa teste',
    scope: 'PF',
    kind: 'cash',
    closing_day: null,
    due_day: null,
    balance_cents: 0,
  },
  {
    id: 'a-cartao',
    name: 'Cartão teste',
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 10,
    due_day: 20,
    balance_cents: 0,
  },
]

const duas = [
  meta(),
  meta({
    id: 'g-carro',
    name: 'Carro',
    account_id: 'a-caixa',
    account_name: 'Caixa teste',
    target_cents: 900000,
    balance_cents: 900000,
    pct: 100,
    status: 'concluida',
    missing_cents: 0,
    months_left: null,
    monthly_needed_cents: null,
  }),
]

function mockApi(
  opts: {
    metas?: () => unknown
    other?: (path: string, init: RequestInit) => unknown
  } = {},
) {
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && path === '/api/accounts') return contas
      if (method === 'GET' && path === '/api/goals')
        return opts.metas ? opts.metas() : duas
      return opts.other ? opts.other(path, init ?? {}) : { ok: true }
    },
  )
}

const cartao = (nome: string) => screen.getByRole('listitem', { name: nome })

describe('MetasPage', () => {
  it('lista as metas com progresso, o que falta, o prazo e o aporte mensal', async () => {
    mockApi()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    expect(within(viagem).getByText('25%')).toBeInTheDocument()
    expect(within(viagem).getByText(/R\$ 1\.250,00/)).toBeInTheDocument()
    expect(within(viagem).getByText(/Faltam R\$ 3\.750,00/)).toBeInTheDocument()
    expect(within(viagem).getByText(/30\/06\/2027/)).toBeInTheDocument()
    expect(within(viagem).getByText(/R\$ 375,00 por mês/)).toBeInTheDocument()
    expect(within(viagem).getByText(/Poupança teste/)).toBeInTheDocument()
    const carro = cartao('Carro')
    expect(within(carro).getByText('Concluída')).toBeInTheDocument()
  })

  it('estado vazio explica como começar', async () => {
    mockApi({ metas: () => [] })
    render(<MetasPage />)
    expect(await screen.findByText(/Nenhuma meta ainda/)).toBeInTheDocument()
  })

  it('erro de carregamento aparece como alerta', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(500, 'internal', 'falhou'))
    render(<MetasPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('falhou')
  })

  it('cria uma meta enviando centavos e a conta escolhida', async () => {
    mockApi({ metas: () => [meta()] })
    const user = userEvent.setup()
    render(<MetasPage />)
    await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const form = screen.getByRole('form', { name: 'Nova meta' })
    await user.type(within(form).getByLabelText('Nome'), 'Reforma')
    await user.type(within(form).getByLabelText('Valor da meta'), '3.000,00')
    await user.type(
      within(form).getByLabelText('Prazo (opcional)'),
      '2027-12-31',
    )
    await user.selectOptions(within(form).getByLabelText('Conta'), 'a-caixa')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/goals', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Reforma',
          target_cents: 300000,
          account_id: 'a-caixa',
          target_date: '2027-12-31',
        }),
      }),
    )
  })

  it('a lista de contas não oferece cartão nem conta que já tem meta', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<MetasPage />)
    await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const opcoes = within(screen.getByLabelText('Conta'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toEqual(['Escolha uma conta'])
  })

  it.each([
    ['sem nome', { nome: '', valor: '100', conta: true }, /nome/i],
    ['valor inválido', { nome: 'X', valor: 'abc', conta: true }, /valor/i],
    ['valor zero', { nome: 'X', valor: '0', conta: true }, /valor/i],
  ])('%s mostra o erro e não chama a API', async (_titulo, entrada, texto) => {
    mockApi({ metas: () => [] })
    const user = userEvent.setup()
    render(<MetasPage />)
    await screen.findByText(/Nenhuma meta ainda/)
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const form = screen.getByRole('form', { name: 'Nova meta' })
    if (entrada.nome)
      await user.type(within(form).getByLabelText('Nome'), entrada.nome)
    await user.type(within(form).getByLabelText('Valor da meta'), entrada.valor)
    if (entrada.conta)
      await user.selectOptions(
        within(form).getByLabelText('Conta'),
        'a-poupanca',
      )
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(within(form).getByRole('alert')).toHaveTextContent(texto)
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0)
  })

  it('sem conta escolhida mostra o erro', async () => {
    mockApi({ metas: () => [] })
    const user = userEvent.setup()
    render(<MetasPage />)
    await screen.findByText(/Nenhuma meta ainda/)
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const form = screen.getByRole('form', { name: 'Nova meta' })
    await user.type(within(form).getByLabelText('Nome'), 'X')
    await user.type(within(form).getByLabelText('Valor da meta'), '100')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(within(form).getByRole('alert')).toHaveTextContent(/conta/i)
  })

  it('edita uma meta com os valores atuais já preenchidos', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(within(viagem).getByRole('button', { name: 'Editar' }))
    const form = screen.getByRole('form', { name: 'Editar Viagem' })
    expect(within(form).getByLabelText('Nome')).toHaveValue('Viagem')
    expect(within(form).getByLabelText('Valor da meta')).toHaveValue(
      'R$ 5.000,00',
    )
    expect(within(form).getByLabelText('Prazo (opcional)')).toHaveValue(
      '2027-06-30',
    )
    await user.clear(within(form).getByLabelText('Nome'))
    await user.type(within(form).getByLabelText('Nome'), 'Viagem longa')
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/goals/g-viagem', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Viagem longa',
          target_cents: 500000,
          account_id: 'a-poupanca',
          target_date: '2027-06-30',
        }),
      }),
    )
  })

  it('mostra o erro do servidor ao salvar', async () => {
    mockApi({
      other: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'essa conta já tem uma meta',
        )
      },
    })
    const user = userEvent.setup()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(within(viagem).getByRole('button', { name: 'Editar' }))
    const form = screen.getByRole('form', { name: 'Editar Viagem' })
    await user.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      /já tem uma meta/,
    )
  })

  it('exclui em dois passos', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(within(viagem).getByRole('button', { name: 'Excluir' }))
    expect(api).not.toHaveBeenCalledWith('/api/goals/g-viagem', {
      method: 'DELETE',
    })
    await user.click(
      within(viagem).getByRole('button', { name: 'Confirmar exclusão' }),
    )
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/goals/g-viagem', {
        method: 'DELETE',
      }),
    )
  })

  it('cancelar a exclusão não chama a API', async () => {
    mockApi()
    const user = userEvent.setup()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(within(viagem).getByRole('button', { name: 'Excluir' }))
    await user.click(within(viagem).getByRole('button', { name: 'Cancelar' }))
    expect(
      within(viagem).getByRole('button', { name: 'Excluir' }),
    ).toBeInTheDocument()
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'DELETE'),
    ).toHaveLength(0)
  })

  it('meta de conta arquivada não tem Editar, só Excluir', async () => {
    mockApi({ metas: () => [meta({ editable: false })] })
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    expect(
      within(viagem).queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument()
    expect(within(viagem).getByText(/conta arquivada/i)).toBeInTheDocument()
    expect(
      within(viagem).getByRole('button', { name: 'Excluir' }),
    ).toBeInTheDocument()
  })

  it('avisa quando a conta também está na reserva de emergência', async () => {
    mockApi({ metas: () => [meta({ reserve_overlap: true })] })
    render(<MetasPage />)
    expect(
      await screen.findByText(/também conta na reserva de emergência/),
    ).toBeInTheDocument()
  })
})

function suspensa<T>() {
  let resolver!: (v: T) => void
  const promessa = new Promise<T>((r) => {
    resolver = r
  })
  return { promessa, resolver }
}

const liberar = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })

describe('mutação lenta com outra seleção', () => {
  it('salvar a meta A em voo não fecha nem apaga o editor da meta B', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    vi.mocked(api).mockImplementation(
      async (path: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (method === 'GET' && path === '/api/accounts') return contas
        if (method === 'GET') return duas
        return promessa
      },
    )
    const user = userEvent.setup()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(within(viagem).getByRole('button', { name: 'Editar' }))
    await user.click(
      within(screen.getByRole('form', { name: 'Editar Viagem' })).getByRole(
        'button',
        { name: 'Salvar' },
      ),
    )

    await user.click(
      within(cartao('Carro')).getByRole('button', { name: 'Editar' }),
    )
    const formB = screen.getByRole('form', { name: 'Editar Carro' })
    await user.clear(within(formB).getByLabelText('Nome'))
    await user.type(within(formB).getByLabelText('Nome'), 'Carro novo')

    await act(async () => {
      resolver({ ok: true })
    })
    await liberar()

    const aindaB = screen.getByRole('form', { name: 'Editar Carro' })
    expect(within(aindaB).getByLabelText('Nome')).toHaveValue('Carro novo')
    expect(
      screen.queryByRole('form', { name: 'Editar Viagem' }),
    ).not.toBeInTheDocument()
  })

  it('excluir a meta A em voo não cancela a confirmação pendente da meta B', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    vi.mocked(api).mockImplementation(
      async (path: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (method === 'GET' && path === '/api/accounts') return contas
        if (method === 'GET') return duas
        return promessa
      },
    )
    const user = userEvent.setup()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(within(viagem).getByRole('button', { name: 'Excluir' }))
    await user.click(
      within(viagem).getByRole('button', { name: 'Confirmar exclusão' }),
    )

    await user.click(
      within(cartao('Carro')).getByRole('button', { name: 'Excluir' }),
    )
    expect(
      within(cartao('Carro')).getByRole('button', {
        name: 'Confirmar exclusão',
      }),
    ).toBeInTheDocument()

    await act(async () => {
      resolver({ ok: true })
    })
    await liberar()

    expect(
      within(cartao('Carro')).getByRole('button', {
        name: 'Confirmar exclusão',
      }),
    ).toBeInTheDocument()
  })

  it('uma leitura antiga que responde depois da nova não sobrescreve a lista', async () => {
    const leituras: Array<ReturnType<typeof suspensa<unknown>>> = []
    vi.mocked(api).mockImplementation(
      async (path: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (method === 'GET' && path === '/api/accounts') return contas
        if (method === 'GET') {
          if (leituras.length === 0) {
            leituras.push(suspensa())
            return duas
          } // carga inicial
          const l = suspensa<unknown>()
          leituras.push(l)
          return l.promessa
        }
        return { ok: true }
      },
    )
    const user = userEvent.setup()
    render(<MetasPage />)
    const viagem = await screen.findByRole('listitem', { name: 'Viagem' })
    await user.click(within(viagem).getByRole('button', { name: 'Excluir' }))
    await user.click(
      within(viagem).getByRole('button', { name: 'Confirmar exclusão' }),
    )
    await waitFor(() => expect(leituras).toHaveLength(2)) // recarga 1 pendente

    await user.click(
      within(cartao('Carro')).getByRole('button', { name: 'Excluir' }),
    )
    await user.click(
      within(cartao('Carro')).getByRole('button', {
        name: 'Confirmar exclusão',
      }),
    )
    await waitFor(() => expect(leituras).toHaveLength(3)) // recarga 2 pendente

    await act(async () => {
      leituras[2].resolver([])
    }) // a mais nova: lista vazia
    await liberar()
    expect(await screen.findByText(/Nenhuma meta ainda/)).toBeInTheDocument()

    await act(async () => {
      leituras[1].resolver(duas)
    }) // a antiga chega tarde
    await liberar()
    expect(screen.getByText(/Nenhuma meta ainda/)).toBeInTheDocument()
    expect(
      screen.queryByRole('listitem', { name: 'Viagem' }),
    ).not.toBeInTheDocument()
  })
})

const { default: _meta, ...historias } = todasAsHistorias

describe('metas.stories — os estados do cartão', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (el: HTMLElement) => void> = {
      EmAndamento: (el) => {
        expect(within(el).getByText('25%')).toBeInTheDocument()
        expect(within(el).getByText(/por mês/)).toBeInTheDocument()
      },
      SemPrazo: (el) => {
        expect(within(el).queryByText(/por mês/)).not.toBeInTheDocument()
        expect(within(el).queryByText(/Prazo/)).not.toBeInTheDocument()
      },
      Concluida: (el) =>
        expect(within(el).getByText('Concluída')).toBeInTheDocument(),
      Atrasada: (el) =>
        expect(within(el).getByText('Atrasada')).toBeInTheDocument(),
      ContaArquivada: (el) => {
        expect(
          within(el).queryByRole('button', { name: 'Editar' }),
        ).not.toBeInTheDocument()
        expect(within(el).getByText(/conta arquivada/i)).toBeInTheDocument()
      },
      NaReserva: (el) =>
        expect(
          within(el).getByText(/reserva de emergência/),
        ).toBeInTheDocument(),
    }
    expect(Object.keys(historias).sort()).toEqual(Object.keys(esperado).sort())
    for (const [nome, historia] of Object.entries(historias)) {
      const { container, unmount } = render(
        <ul>
          <CartaoDaMeta {...metaHistorias.args} {...historia.args} />
        </ul>,
      )
      esperado[nome](container.querySelector('li') as HTMLElement)
      unmount()
    }
  })
})
