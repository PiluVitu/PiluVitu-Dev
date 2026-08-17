import type { Regra } from '@piluvitu/tools/regras'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { descreverAcoes, descreverCondicoes, RegrasPage } from './regras'

const contas = [
  { id: 'a1', name: 'Nubank PJ', scope: 'PJ', kind: 'checking' },
  { id: 'a2', name: 'Cartão PF', scope: 'PF', kind: 'credit_card' },
]
const categorias = [
  { id: 'c-transporte', name: 'Transporte' },
  { id: 'c-alimentacao', name: 'Alimentação' },
]
const payeesFixture = [{ id: 'p1', name: 'Uber' }]

function regra(patch: Partial<Regra> = {}): Regra {
  return {
    id: 'r1',
    name: 'Uber → Transporte',
    match_text: 'UBER',
    match_account_id: null,
    match_min_cents: null,
    match_max_cents: null,
    match_direction: null,
    set_category_id: 'c-transporte',
    set_payee_id: null,
    set_is_business: null,
    priority: 100,
    active: 1,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...patch,
  }
}

type Chamada = { url: string; method: string; body: string | undefined }

function respondJson(data: unknown, status = 200) {
  return Promise.resolve({
    status,
    json: async () => ({ ok: true, data, notifications: [] }),
  })
}

function respondErro(status: number, code: string, message: string) {
  return Promise.resolve({
    status,
    json: async () => ({
      ok: false,
      data: null,
      notifications: [{ type: 'error', code, message }],
    }),
  })
}

function mockRede(opts: {
  chamadas: Chamada[]
  regras?: Regra[]
  matches?: {
    scanned: number
    counts: Record<string, number>
    scan_limit: number
  }
  matchesFalha?: boolean
  erroNaMutacao?: { status: number; code: string; message: string }
}) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        opts.chamadas.push({
          url,
          method,
          body: init?.body as string | undefined,
        })

        // /matches ANTES de /rules: `includes` capturaria os dois.
        if (url.includes('/api/rules/matches')) {
          if (opts.matchesFalha)
            return respondErro(503, 'auth_unavailable', 'sem conexão')
          return respondJson(
            opts.matches ?? { scanned: 0, counts: {}, scan_limit: 1000 },
          )
        }
        if (url.includes('/api/rules')) {
          if (method !== 'GET' && opts.erroNaMutacao)
            return respondErro(
              opts.erroNaMutacao.status,
              opts.erroNaMutacao.code,
              opts.erroNaMutacao.message,
            )
          if (method === 'POST') return respondJson(regra(), 201)
          if (method === 'PUT') return respondJson(regra())
          if (method === 'DELETE') return respondJson({ deleted: true })
          return respondJson(opts.regras ?? [])
        }
        if (url.includes('/api/categories')) return respondJson(categorias)
        if (url.includes('/api/accounts')) return respondJson(contas)
        if (url.includes('/api/payees')) return respondJson(payeesFixture)
        return Promise.reject(new Error(`rota inesperada em teste: ${url}`))
      }),
  )
}

async function montar(opts: Parameters<typeof mockRede>[0]) {
  mockRede(opts)
  render(<RegrasPage />)
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Regras' })).toBeInTheDocument(),
  )
  return userEvent.setup()
}

describe('descreverCondicoes / descreverAcoes', () => {
  const nomeConta = (id: string) =>
    contas.find((c) => c.id === id)?.name ?? null
  const nomeCat = (id: string) =>
    categorias.find((c) => c.id === id)?.name ?? null
  const nomePayee = (id: string) =>
    payeesFixture.find((p) => p.id === id)?.name ?? null

  test('junta os eixos preenchidos e ignora os nulos', () => {
    expect(
      descreverCondicoes(
        regra({
          match_text: 'UBER',
          match_account_id: 'a1',
          match_min_cents: 5000,
          match_max_cents: 20000,
          match_direction: 'expense',
        }),
        nomeConta,
      ),
    ).toBe(
      'descrição contém "UBER" · na conta Nubank PJ · valor entre R$ 50,00 e R$ 200,00 · só saídas',
    )
  })

  test('faixa aberta de um lado só é descrita como piso ou teto', () => {
    expect(
      descreverCondicoes(
        regra({ match_text: null, match_min_cents: 5000 }),
        nomeConta,
      ),
    ).toBe('valor a partir de R$ 50,00')
    expect(
      descreverCondicoes(
        regra({ match_text: null, match_max_cents: 5000 }),
        nomeConta,
      ),
    ).toBe('valor até R$ 50,00')
  })

  test('conta/categoria que sumiu da lista é nomeada como tal, nunca some da frase', () => {
    expect(
      descreverCondicoes(
        regra({ match_text: null, match_account_id: 'fantasma' }),
        nomeConta,
      ),
    ).toContain('(removida)')
    expect(
      descreverAcoes(
        regra({ set_category_id: 'arquivada' }),
        nomeCat,
        nomePayee,
      ),
    ).toContain('(arquivada ou removida)')
  })

  test('⚠️ set_is_business = 0 aparece como "marca PF", não desaparece', () => {
    // Um `if (r.set_is_business)` trataria 0 como "não faz nada" e sumiria
    // com metade das regras de PJ/PF da listagem, em silêncio.
    expect(
      descreverAcoes(
        regra({ set_category_id: null, set_is_business: 0 }),
        nomeCat,
        nomePayee,
      ),
    ).toBe('marca PF')
    expect(
      descreverAcoes(
        regra({ set_category_id: null, set_is_business: 1 }),
        nomeCat,
        nomePayee,
      ),
    ).toBe('marca PJ')
  })
})

describe('RegrasPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('lista as regras traduzindo condições e ações pra português', async () => {
    await montar({ chamadas: [], regras: [regra()] })
    const linha = screen.getByTestId('regra-r1')
    expect(linha).toHaveTextContent('Uber → Transporte')
    expect(linha).toHaveTextContent('Se descrição contém "UBER"')
    expect(linha).toHaveTextContent('Então categoria → Transporte')
  })

  test('⚠️ mostra QUANTAS transações existentes cada regra casaria, e a janela varrida', async () => {
    // O número que o dono usa pra descobrir que "MERCADO" pega 40 linhas e
    // não as 3 que ele imaginou — antes de rodar um import com ela ligada.
    await montar({
      chamadas: [],
      regras: [regra()],
      matches: { scanned: 120, counts: { r1: 13 }, scan_limit: 1000 },
    })
    expect(screen.getByTestId('casaria-r1')).toHaveTextContent(
      'Casaria 13 de 120 lançamento(s) já existentes.',
    )
    // A janela é bounded, e a tela diz isso em vez de vender o número como
    // "o histórico inteiro".
    expect(
      screen.getByText(/contagem sobre os 120 lançamento\(s\) mais recentes/i),
    ).toBeInTheDocument()
  })

  test('regra que não casa nada mostra 0, não some do lugar', async () => {
    await montar({
      chamadas: [],
      regras: [regra()],
      matches: { scanned: 40, counts: {}, scan_limit: 1000 },
    })
    expect(screen.getByTestId('casaria-r1')).toHaveTextContent(
      'Casaria 0 de 40',
    )
  })

  test('⚠️ a contagem falhando NÃO derruba a lista de regras', async () => {
    // Efeito separado, de propósito: um `Promise.all` juntaria o destino dos
    // dois e uma varredura fora do ar apagaria a única coisa desta tela que
    // o dono não consegue obter de outro jeito.
    await montar({ chamadas: [], regras: [regra()], matchesFalha: true })
    expect(screen.getByTestId('regra-r1')).toBeInTheDocument()
    expect(screen.getByTestId('casaria-r1')).toHaveTextContent(
      /Não consegui contar/i,
    )
  })

  test('regra pausada aparece marcada como tal (senão seria inalcançável)', async () => {
    await montar({ chamadas: [], regras: [regra({ active: 0 })] })
    expect(
      within(screen.getByTestId('regra-r1')).getByText('Pausada'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('regra-r1')).getByRole('button', {
        name: 'Reativar',
      }),
    ).toBeInTheDocument()
  })

  test('sem nenhuma regra, a tela ensina a primeira em vez de ficar em branco', async () => {
    await montar({ chamadas: [], regras: [] })
    expect(screen.getByText(/Nenhuma regra ainda/i)).toBeInTheDocument()
  })

  test('criar manda o corpo com condição e ação, e null onde ficou em branco', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [] })

    await usuario.type(screen.getByLabelText('Nome'), 'Uber → Transporte')
    await usuario.type(screen.getByLabelText('Descrição contém'), 'UBER')
    await usuario.selectOptions(
      screen.getByLabelText('Categoria'),
      'c-transporte',
    )
    await usuario.click(screen.getByRole('button', { name: 'Criar regra' }))

    await waitFor(() => {
      const post = chamadas.find(
        (c) => c.method === 'POST' && c.url.includes('/api/rules'),
      )
      expect(post).toBeDefined()
      expect(JSON.parse(String(post?.body))).toEqual({
        name: 'Uber → Transporte',
        match_text: 'UBER',
        match_account_id: null,
        match_min_cents: null,
        match_max_cents: null,
        match_direction: null,
        set_category_id: 'c-transporte',
        set_payee_id: null,
        set_is_business: null,
        priority: 100,
        active: 1,
      })
    })
  })

  test('valor do formulário vira CENTAVOS inteiros, nunca float', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [] })

    await usuario.type(screen.getByLabelText('Nome'), 'Faixa')
    await usuario.type(screen.getByLabelText('Valor mínimo'), '1.234,56')
    await usuario.selectOptions(
      screen.getByLabelText('Categoria'),
      'c-transporte',
    )
    await usuario.click(screen.getByRole('button', { name: 'Criar regra' }))

    await waitFor(() => {
      const post = chamadas.find((c) => c.method === 'POST')
      expect(
        (JSON.parse(String(post?.body)) as { match_min_cents: number })
          .match_min_cents,
      ).toBe(123456)
    })
  })

  test('⚠️ regra SEM CONDIÇÃO é barrada no cliente, sem gastar requisição', async () => {
    // É a regra que recategorizaria o livro-caixa inteiro. O servidor
    // também recusa, mas explicar na hora vale zero round-trip.
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [] })

    await usuario.type(screen.getByLabelText('Nome'), 'catástrofe')
    await usuario.selectOptions(
      screen.getByLabelText('Categoria'),
      'c-transporte',
    )
    await usuario.click(screen.getByRole('button', { name: 'Criar regra' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /casaria com TODOS os lançamentos/i,
    )
    expect(chamadas.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  test('regra SEM AÇÃO é barrada no cliente, sem gastar requisição', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [] })

    await usuario.type(screen.getByLabelText('Nome'), 'inerte')
    await usuario.type(screen.getByLabelText('Descrição contém'), 'UBER')
    await usuario.click(screen.getByRole('button', { name: 'Criar regra' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /pelo menos uma ação/i,
    )
    expect(chamadas.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  test('faixa invertida é barrada no cliente', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [] })

    await usuario.type(screen.getByLabelText('Nome'), 'faixa ruim')
    await usuario.type(screen.getByLabelText('Valor mínimo'), '500,00')
    await usuario.type(screen.getByLabelText('Valor máximo'), '100,00')
    await usuario.selectOptions(
      screen.getByLabelText('Categoria'),
      'c-transporte',
    )
    await usuario.click(screen.getByRole('button', { name: 'Criar regra' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /maior ou igual ao mínimo/i,
    )
    expect(chamadas.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  test('editar preenche o formulário e salva com PUT', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({
      chamadas,
      regras: [regra({ match_min_cents: 5000, priority: 42 })],
    })

    await usuario.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Uber → Transporte')
    expect(screen.getByLabelText('Descrição contém')).toHaveValue('UBER')
    expect(screen.getByLabelText('Valor mínimo')).toHaveValue('50,00')
    expect(screen.getByLabelText('Ordem')).toHaveValue('42')

    await usuario.click(screen.getByRole('button', { name: 'Salvar regra' }))
    await waitFor(() =>
      expect(
        chamadas.find(
          (c) => c.method === 'PUT' && c.url.includes('/api/rules/r1'),
        ),
      ).toBeDefined(),
    )
  })

  test('pausar manda active: 0 sem apagar a regra', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [regra()] })

    await usuario.click(screen.getByRole('button', { name: 'Pausar' }))
    await waitFor(() => {
      const put = chamadas.find((c) => c.method === 'PUT')
      expect(JSON.parse(String(put?.body))).toEqual({ active: 0 })
    })
    expect(chamadas.filter((c) => c.method === 'DELETE')).toHaveLength(0)
  })

  test('⚠️ excluir exige confirmação no Dialog — cancelar não chama a API', async () => {
    // `Dialog` do design system, nunca `window.confirm()` (o Chrome Android
    // passa a devolvê-lo `false` em silêncio, deixando o botão inerte).
    // Conferir que o diálogo ABRIU antes de cancelar é o que faz este teste
    // matar a mutação "chama a API direto".
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [regra()] })

    await usuario.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(
      await screen.findByRole('heading', { name: 'Excluir regra' }),
    ).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(chamadas.filter((c) => c.method === 'DELETE')).toHaveLength(0)
  })

  test('o diálogo diz que excluir NÃO mexe em lançamento já gravado', async () => {
    const usuario = await montar({ chamadas: [], regras: [regra()] })
    await usuario.click(screen.getByRole('button', { name: 'Excluir' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent(
      /não mexe em nenhum lançamento já gravado/i,
    )
    expect(dialogo).toHaveTextContent(/Pausar/)
  })

  test('confirmar a exclusão chama DELETE e recarrega', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({ chamadas, regras: [regra()] })

    await usuario.click(screen.getByRole('button', { name: 'Excluir' }))
    await usuario.click(
      await screen.findByRole('button', { name: 'Confirmar' }),
    )

    await waitFor(() =>
      expect(
        chamadas.find(
          (c) => c.method === 'DELETE' && c.url.includes('/api/rules/r1'),
        ),
      ).toBeDefined(),
    )
    // Recarrega a lista E a contagem — a contagem muda quando uma regra sai.
    await waitFor(() =>
      expect(
        chamadas.filter((c) => c.url.includes('/api/rules/matches')).length,
      ).toBeGreaterThan(1),
    )
  })

  test('erro do servidor aparece na tela sem derrubá-la', async () => {
    const chamadas: Chamada[] = []
    const usuario = await montar({
      chamadas,
      regras: [],
      erroNaMutacao: {
        status: 422,
        code: 'constraint_violation',
        message: 'Referência inválida: a conta informada não existe.',
      },
    })

    await usuario.type(screen.getByLabelText('Nome'), 'x')
    await usuario.type(screen.getByLabelText('Descrição contém'), 'UBER')
    await usuario.selectOptions(
      screen.getByLabelText('Categoria'),
      'c-transporte',
    )
    await usuario.click(screen.getByRole('button', { name: 'Criar regra' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Referência inválida',
    )
    expect(screen.getByRole('heading', { name: 'Regras' })).toBeInTheDocument()
  })

  test('ajuda de "Regras" abre no clique (popover, não tooltip)', async () => {
    const usuario = await montar({ chamadas: [], regras: [] })
    expect(screen.queryByText(/Nada é adivinhado por um modelo/i)).toBeNull()
    await usuario.click(
      screen.getByRole('button', { name: /Ajuda sobre Regras/i }),
    )
    expect(
      await screen.findByText(/Nada é adivinhado por um modelo/i),
    ).toBeInTheDocument()
  })
})
