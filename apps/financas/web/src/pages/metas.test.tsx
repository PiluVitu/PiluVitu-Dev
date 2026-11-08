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

const HOJE = '2026-11-07'

const meta = (patch: Partial<MetaView> = {}): MetaView => ({
  id: 'g-viagem',
  name: 'Viagem de julho',
  target_cents: 800000,
  target_date: '2027-06-30',
  account_id: 'a-poup',
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

const quatro = [
  meta(),
  meta({
    id: 'g-note',
    name: 'Notebook novo',
    account_id: 'a-cdb',
    account_name: 'Investimento CDB',
    target_cents: 650000,
    target_date: '2027-03-31',
    balance_cents: 212000,
    pct: 32,
    missing_cents: 438000,
    months_left: 5,
    monthly_needed_cents: 87600,
  }),
  meta({
    id: 'g-curso',
    name: 'Curso de inglês',
    account_id: 'a-cc',
    account_name: 'Conta corrente',
    target_cents: 240000,
    target_date: '2026-10-31',
    balance_cents: 240000,
    pct: 100,
    status: 'concluida',
    missing_cents: 0,
    months_left: null,
    monthly_needed_cents: null,
  }),
  meta({
    id: 'g-obra',
    name: 'Reforma da cozinha',
    account_id: 'a-poup2',
    account_name: 'Poupança 2',
    target_cents: 1200000,
    target_date: '2026-10-31',
    balance_cents: 220000,
    pct: 18,
    status: 'atrasada',
    missing_cents: 980000,
    months_left: null,
    monthly_needed_cents: null,
  }),
]

const conta = (
  id: string,
  name: string,
  kind: string,
  balance_cents: number,
) => ({
  id,
  name,
  scope: 'PF',
  kind,
  closing_day: null,
  due_day: null,
  balance_cents,
})
const contas = [
  conta('a-poup', 'Poupança', 'savings', 465000),
  conta('a-cdb', 'Investimento CDB', 'investment', 212000),
  conta('a-cc', 'Conta corrente', 'checking', 240000),
  conta('a-poup2', 'Poupança 2', 'savings', 220000),
  conta('a-livre', 'Caixinha livre', 'cash', 30000),
  conta('a-cartao', 'Cartão teste', 'credit_card', -15000),
  conta('a-vale', 'Vale refeição', 'benefit', 5000),
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
        return opts.metas ? opts.metas() : quatro
      return opts.other ? opts.other(path, init ?? {}) : { ok: true }
    },
  )
}

const cartao = (nome: string) => screen.getByRole('listitem', { name: nome })
const folha = (nome: string) => screen.getByRole('dialog', { name: nome })

async function montar(opts?: Parameters<typeof mockApi>[0]) {
  mockApi(opts)
  const user = userEvent.setup()
  render(<MetasPage hoje={HOJE} />)
  await screen.findByRole('list', { name: 'Metas' })
  return user
}

describe('MetasPage — leitura', () => {
  it('mostra os três KPIs: guardado, falta guardar e ritmo por mês', async () => {
    await montar()
    const kpis = screen.getByRole('region', { name: 'Resumo das metas' })
    expect(within(kpis).getByText('R$ 11.370,00')).toBeInTheDocument()
    expect(
      within(kpis).getByText('em 4 metas · 1 concluída'),
    ).toBeInTheDocument()
    expect(within(kpis).getByText('R$ 17.530,00')).toBeInTheDocument()
    expect(
      within(kpis).getByText('para fechar as 3 em andamento'),
    ).toBeInTheDocument()
    expect(within(kpis).getByText('R$ 1.294,75')).toBeInTheDocument()
    expect(
      within(kpis).getByText('soma do que cada meta com prazo pede'),
    ).toBeInTheDocument()
  })

  it('cartão em andamento: selo No ritmo, prazo, falta e ritmo mensal', async () => {
    await montar()
    const c = cartao('Viagem de julho')
    expect(within(c).getByText('No ritmo')).toBeInTheDocument()
    expect(within(c).getByText('R$ 4.650,00')).toBeInTheDocument()
    expect(within(c).getByText('de R$ 8.000,00')).toBeInTheDocument()
    expect(within(c).getByText('58%')).toBeInTheDocument()
    expect(within(c).getByText('30/06/2027')).toBeInTheDocument()
    expect(within(c).getByText('R$ 3.350,00')).toBeInTheDocument()
    expect(
      within(c).getByText('R$ 418,75 por mês · 8 meses'),
    ).toBeInTheDocument()
    expect(within(c).getByText('Poupança')).toBeInTheDocument()
  })

  it('cartão concluído e cartão atrasado ganham selo e texto próprios', async () => {
    await montar()
    const ok = cartao('Curso de inglês')
    expect(within(ok).getByText('Concluída')).toBeInTheDocument()
    expect(within(ok).getByText('nada, meta batida')).toBeInTheDocument()
    expect(
      within(ok).queryByRole('link', { name: /Registrar aporte/ }),
    ).not.toBeInTheDocument()
    const atrasada = cartao('Reforma da cozinha')
    expect(within(atrasada).getByText('Atrasada')).toBeInTheDocument()
    expect(
      within(atrasada).getByText('prazo passou · R$ 9.800,00 em aberto'),
    ).toBeInTheDocument()
  })

  it('Registrar aporte leva ao Lançar/transferir com a conta da meta como destino', async () => {
    await montar()
    expect(
      within(cartao('Viagem de julho')).getByRole('link', {
        name: 'Registrar aporte',
      }),
    ).toHaveAttribute('href', '#/lancar/transferir?para=a-poup')
  })

  it('meta de conta arquivada não tem Editar nem Registrar aporte', async () => {
    await montar({ metas: () => [meta({ editable: false })] })
    const c = cartao('Viagem de julho')
    expect(
      within(c).queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument()
    expect(
      within(c).queryByRole('link', { name: /Registrar aporte/ }),
    ).not.toBeInTheDocument()
    expect(within(c).getByText(/conta arquivada/i)).toBeInTheDocument()
    expect(
      within(c).getByRole('button', { name: 'Excluir' }),
    ).toBeInTheDocument()
  })

  it('avisa quando a conta também está na reserva de emergência', async () => {
    await montar({ metas: () => [meta({ reserve_overlap: true })] })
    expect(
      screen.getByText(/também conta na reserva de emergência/),
    ).toBeInTheDocument()
  })
})

describe('MetasPage — estados', () => {
  it('carregando mostra o esqueleto', async () => {
    vi.mocked(api).mockImplementation(() => new Promise(() => {}))
    const { container } = render(<MetasPage hoje={HOJE} />)
    expect(await screen.findByText('Carregando as metas…')).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('erro mostra a causa e deixa tentar de novo', async () => {
    let tentativa = 0
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === '/api/accounts') return contas
      if (++tentativa === 1)
        throw new ApiError(500, 'internal', 'o servidor não respondeu')
      return quatro
    })
    const user = userEvent.setup()
    render(<MetasPage hoje={HOJE} />)
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Não foi possível carregar as metas')
    expect(alerta).toHaveTextContent('o servidor não respondeu')
    await user.click(
      within(alerta).getByRole('button', { name: 'Tentar de novo' }),
    )
    expect(
      await screen.findByRole('list', { name: 'Metas' }),
    ).toBeInTheDocument()
  })

  it('vazio convida a criar a primeira meta', async () => {
    mockApi({ metas: () => [] })
    const user = userEvent.setup()
    render(<MetasPage hoje={HOJE} />)
    expect(await screen.findByText('Nenhuma meta ainda')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Criar a primeira meta' }),
    )
    expect(folha('Nova meta')).toBeInTheDocument()
  })
})

describe('MetasPage — folha Nova meta', () => {
  it('só oferece contas sem meta que guardam dinheiro, com o saldo no rótulo', async () => {
    const user = await montar()
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const opcoes = within(
      within(folha('Nova meta')).getByLabelText('Conta onde o dinheiro fica'),
    )
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(opcoes).toEqual(['Escolha uma conta', 'Caixinha livre · R$ 300,00'])
  })

  it('a prévia do ritmo acompanha o que se digita', async () => {
    const user = await montar({
      metas: () => [meta({ id: 'x', account_id: 'a-outra' })],
    })
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const f = within(folha('Nova meta'))
    expect(
      f.getByText('Preencha o valor e a conta para ver o ritmo.'),
    ).toBeInTheDocument()
    await user.selectOptions(
      f.getByLabelText('Conta onde o dinheiro fica'),
      'a-poup',
    )
    await user.type(f.getByLabelText('Valor da meta'), '8.000,00')
    expect(
      f.getByText(
        'Já tem R$ 4.650,00 (58%). Defina um prazo para ver quanto guardar por mês.',
      ),
    ).toBeInTheDocument()
    await user.type(f.getByLabelText('Prazo (opcional)'), '2027-06-30')
    expect(
      f.getByText(
        'Já tem R$ 4.650,00 (58%). Para chegar em 30/06/2027, guarde R$ 418,75 por mês durante 8 meses.',
      ),
    ).toBeInTheDocument()
  })

  it('cria a meta enviando centavos, a conta e o prazo', async () => {
    const user = await montar()
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const f = within(folha('Nova meta'))
    await user.type(f.getByLabelText('Nome'), 'Reforma')
    await user.type(f.getByLabelText('Valor da meta'), '3.000,00')
    await user.type(f.getByLabelText('Prazo (opcional)'), '2027-12-31')
    await user.selectOptions(
      f.getByLabelText('Conta onde o dinheiro fica'),
      'a-livre',
    )
    await user.click(f.getByRole('button', { name: 'Salvar meta' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/goals', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Reforma',
          target_cents: 300000,
          account_id: 'a-livre',
          target_date: '2027-12-31',
        }),
      }),
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Nova meta' }),
      ).not.toBeInTheDocument(),
    )
  })

  it.each([
    ['sem nome', { nome: '', valor: '100', conta: 'a-livre' }, /nome/i],
    ['valor inválido', { nome: 'X', valor: 'abc', conta: 'a-livre' }, /valor/i],
    ['valor zero', { nome: 'X', valor: '0', conta: 'a-livre' }, /valor/i],
    ['sem conta', { nome: 'X', valor: '100', conta: '' }, /conta/i],
  ])('%s mostra o erro e não chama a API', async (_t, e, texto) => {
    const user = await montar()
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const f = within(folha('Nova meta'))
    if (e.nome) await user.type(f.getByLabelText('Nome'), e.nome)
    await user.type(f.getByLabelText('Valor da meta'), e.valor)
    if (e.conta)
      await user.selectOptions(
        f.getByLabelText('Conta onde o dinheiro fica'),
        e.conta,
      )
    await user.click(f.getByRole('button', { name: 'Salvar meta' }))
    expect(f.getByRole('alert')).toHaveTextContent(texto)
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0)
  })

  it('mostra o erro do servidor dentro da folha', async () => {
    const user = await montar({
      other: () => {
        throw new ApiError(
          422,
          'constraint_violation',
          'essa conta já tem uma meta',
        )
      },
    })
    await user.click(
      within(cartao('Viagem de julho')).getByRole('button', { name: 'Editar' }),
    )
    const f = within(folha('Editar Viagem de julho'))
    await user.click(f.getByRole('button', { name: 'Salvar meta' }))
    expect(await f.findByRole('alert')).toHaveTextContent(/já tem uma meta/)
  })
})

describe('MetasPage — editar e excluir', () => {
  it('editar abre a folha com os valores atuais e envia o PUT', async () => {
    const user = await montar()
    await user.click(
      within(cartao('Viagem de julho')).getByRole('button', { name: 'Editar' }),
    )
    const f = within(folha('Editar Viagem de julho'))
    expect(f.getByLabelText('Nome')).toHaveValue('Viagem de julho')
    expect(f.getByLabelText('Valor da meta')).toHaveValue('R$ 8.000,00')
    expect(f.getByLabelText('Prazo (opcional)')).toHaveValue('2027-06-30')
    await user.clear(f.getByLabelText('Nome'))
    await user.type(f.getByLabelText('Nome'), 'Viagem longa')
    await user.click(f.getByRole('button', { name: 'Salvar meta' }))
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/goals/g-viagem', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Viagem longa',
          target_cents: 800000,
          account_id: 'a-poup',
          target_date: '2027-06-30',
        }),
      }),
    )
  })

  it('exclui em dois passos', async () => {
    const user = await montar()
    const c = cartao('Viagem de julho')
    await user.click(within(c).getByRole('button', { name: 'Excluir' }))
    expect(api).not.toHaveBeenCalledWith('/api/goals/g-viagem', {
      method: 'DELETE',
    })
    await user.click(
      within(c).getByRole('button', { name: 'Confirmar exclusão' }),
    )
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/goals/g-viagem', {
        method: 'DELETE',
      }),
    )
  })

  it('cancelar a exclusão não chama a API', async () => {
    const user = await montar()
    const c = cartao('Viagem de julho')
    await user.click(within(c).getByRole('button', { name: 'Excluir' }))
    await user.click(within(c).getByRole('button', { name: 'Cancelar' }))
    expect(
      within(c).getByRole('button', { name: 'Excluir' }),
    ).toBeInTheDocument()
    expect(
      vi.mocked(api).mock.calls.filter(([, i]) => i?.method === 'DELETE'),
    ).toHaveLength(0)
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
  it('salvar em voo não fecha a folha reaberta depois de Cancelar', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    const user = await montar({ other: () => promessa })
    await user.click(
      within(cartao('Viagem de julho')).getByRole('button', { name: 'Editar' }),
    )
    const antiga = within(folha('Editar Viagem de julho'))
    await user.click(antiga.getByRole('button', { name: 'Salvar meta' }))
    await user.click(antiga.getByRole('button', { name: 'Cancelar' }))

    await user.click(
      within(cartao('Viagem de julho')).getByRole('button', { name: 'Editar' }),
    )
    const nova = within(folha('Editar Viagem de julho'))
    await user.clear(nova.getByLabelText('Nome'))
    await user.type(nova.getByLabelText('Nome'), 'Viagem nova')

    await act(async () => {
      resolver({ ok: true })
    })
    await liberar()

    expect(
      within(folha('Editar Viagem de julho')).getByLabelText('Nome'),
    ).toHaveValue('Viagem nova')
  })

  it('criar em voo não fecha a folha de nova meta reaberta', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    const user = await montar({ other: () => promessa })
    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    const primeira = within(folha('Nova meta'))
    await user.type(primeira.getByLabelText('Nome'), 'Primeira')
    await user.type(primeira.getByLabelText('Valor da meta'), '100')
    await user.selectOptions(
      primeira.getByLabelText('Conta onde o dinheiro fica'),
      'a-livre',
    )
    await user.click(primeira.getByRole('button', { name: 'Salvar meta' }))
    await user.click(primeira.getByRole('button', { name: 'Cancelar' }))

    await user.click(screen.getByRole('button', { name: 'Nova meta' }))
    await user.type(
      within(folha('Nova meta')).getByLabelText('Nome'),
      'Segunda',
    )

    await act(async () => {
      resolver({ ok: true })
    })
    await liberar()

    expect(within(folha('Nova meta')).getByLabelText('Nome')).toHaveValue(
      'Segunda',
    )
  })

  it('excluir a meta A em voo não cancela a confirmação pendente da meta B', async () => {
    const { promessa, resolver } = suspensa<unknown>()
    const user = await montar({ other: () => promessa })
    const a = cartao('Viagem de julho')
    await user.click(within(a).getByRole('button', { name: 'Excluir' }))
    await user.click(
      within(a).getByRole('button', { name: 'Confirmar exclusão' }),
    )

    await user.click(
      within(cartao('Notebook novo')).getByRole('button', { name: 'Excluir' }),
    )
    expect(
      within(cartao('Notebook novo')).getByRole('button', {
        name: 'Confirmar exclusão',
      }),
    ).toBeInTheDocument()

    await act(async () => {
      resolver({ ok: true })
    })
    await liberar()

    expect(
      within(cartao('Notebook novo')).getByRole('button', {
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
            return quatro
          }
          const l = suspensa<unknown>()
          leituras.push(l)
          return l.promessa
        }
        return { ok: true }
      },
    )
    const user = userEvent.setup()
    render(<MetasPage hoje={HOJE} />)
    await screen.findByRole('list', { name: 'Metas' })
    const a = cartao('Viagem de julho')
    await user.click(within(a).getByRole('button', { name: 'Excluir' }))
    await user.click(
      within(a).getByRole('button', { name: 'Confirmar exclusão' }),
    )
    await waitFor(() => expect(leituras).toHaveLength(2))

    const b = cartao('Notebook novo')
    await user.click(within(b).getByRole('button', { name: 'Excluir' }))
    await user.click(
      within(b).getByRole('button', { name: 'Confirmar exclusão' }),
    )
    await waitFor(() => expect(leituras).toHaveLength(3))

    await act(async () => {
      leituras[2].resolver([])
    })
    await liberar()
    expect(await screen.findByText('Nenhuma meta ainda')).toBeInTheDocument()

    await act(async () => {
      leituras[1].resolver(quatro)
    })
    await liberar()
    expect(screen.getByText('Nenhuma meta ainda')).toBeInTheDocument()
    expect(
      screen.queryByRole('listitem', { name: 'Viagem de julho' }),
    ).not.toBeInTheDocument()
  })
})

const { default: _meta, ...historias } = todasAsHistorias

describe('metas.stories — os estados do cartão', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (el: HTMLElement) => void> = {
      NoRitmo: (el) => {
        expect(within(el).getByText('No ritmo')).toBeInTheDocument()
        expect(within(el).getByText(/por mês/)).toBeInTheDocument()
      },
      SemPrazo: (el) => {
        expect(within(el).getByText('Em andamento')).toBeInTheDocument()
        expect(within(el).getAllByText('sem prazo')).toHaveLength(2)
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
