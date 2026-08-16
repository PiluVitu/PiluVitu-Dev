import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api'
import {
  cursorDe,
  ExtratoPage,
  formatarData,
  mensagemDeExclusao,
  PAGINA,
  type TransactionView,
} from './extrato'

// Mockar `api` (não a rede) — mesmo padrão de debt-detail.test.tsx /
// config.test.tsx: `api` já traduz envelope/erro, então testar aqui prova o
// COMPONENTE, não o transporte HTTP (isso é `api.test.ts`).
vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const contas = [
  {
    id: 'a1',
    name: 'Nubank',
    scope: 'PF' as const,
    kind: 'checking',
    closing_day: null,
    due_day: null,
    balance_cents: 0,
  },
  {
    id: 'a2',
    name: 'Cofre',
    scope: 'PF' as const,
    kind: 'savings',
    closing_day: null,
    due_day: null,
    balance_cents: 0,
  },
]

const categorias = [
  { id: 'c1', name: 'Mercado' },
  { id: 'c2', name: 'DAS — Simples Nacional' },
]

function tx(over: Partial<TransactionView> & { id: string }): TransactionView {
  return {
    account_id: 'a1',
    amount_cents: -18900,
    purchase_date: '2026-07-20',
    bill_competence: null,
    settled_at: null,
    description: 'Starlink',
    payee_id: null,
    category_id: 'c1',
    is_business: 0,
    transfer_id: null,
    parent_id: null,
    imported_id: null,
    import_source: null,
    recurring_expense_id: null,
    created_at: '2026-07-20T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    ...over,
  }
}

type Estado = {
  linhas: TransactionView[]
  /** A partir da N-ésima chamada de GET /api/transactions, falhar. */
  falharListagemAPartirDe?: number
  mutacao?: (path: string, init: RequestInit) => Promise<unknown>
}

/**
 * Um "servidor" com estado de verdade, não respostas fixas: replica os
 * filtros (`settled=0`), o cursor de keyset (`before`) e o `limit` do
 * backend real. É isso que faz o teste de "marcar como pago some da lista
 * filtrada" e o de paginação provarem alguma coisa — com respostas fixas,
 * os dois passariam contra uma tela que ignorasse o filtro/cursor.
 */
function montarApi(estado: Estado) {
  let chamadasListagem = 0
  vi.mocked(api).mockImplementation(
    async (path: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method !== 'GET') {
        if (!estado.mutacao)
          throw new Error(`mutação inesperada em teste: ${method} ${path}`)
        return estado.mutacao(path, init ?? {})
      }
      if (path.startsWith('/api/accounts')) return contas as never
      if (path.startsWith('/api/categories')) return categorias as never
      if (path.startsWith('/api/transactions')) {
        chamadasListagem += 1
        if (
          estado.falharListagemAPartirDe !== undefined &&
          chamadasListagem >= estado.falharListagemAPartirDe
        ) {
          throw new ApiError(
            503,
            'auth_unavailable',
            'sem conexão com o servidor',
          )
        }
        const qs = new URLSearchParams(path.split('?')[1] ?? '')
        let rows = estado.linhas
        if (qs.get('settled') === '0')
          rows = rows.filter((r) => r.settled_at === null)
        const before = qs.get('before')
        if (before !== null) {
          const i = rows.findIndex((r) => cursorDe(r) === before)
          rows = i >= 0 ? rows.slice(i + 1) : rows
        }
        return rows.slice(0, Number(qs.get('limit') ?? 200)) as never
      }
      throw new Error(`rota inesperada em teste: ${path}`)
    },
  )
}

// ⚠️ Relógio FIXO em toda a suíte: o default de "marcar como pago" é
// `todayInTeresina()`, e este app já teve dois testes vermelhos por deriva
// de calendário. `shouldAdvanceTime` é o que mantém `waitFor`/`userEvent`
// funcionando (os dois dependem de `setTimeout` por baixo).
function comRelogio(iso = '2026-07-28T12:00:00Z') {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(iso))
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

beforeEach(() => {
  window.innerWidth = 1024
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('ExtratoPage — helpers puros', () => {
  it('formatarData aceita data pura e timestamp completo', () => {
    expect(formatarData('2026-07-20')).toBe('20/07/2026')
    expect(formatarData('2026-07-20T10:00:00Z')).toBe('20/07/2026')
  })

  it('cursorDe tem TRÊS partes — purchase_date, created_at e id', () => {
    expect(cursorDe(tx({ id: 't1' }))).toBe(
      '2026-07-20|2026-07-20T10:00:00Z|t1',
    )
  })

  it('mensagemDeExclusao muda por classe derivável da própria linha', () => {
    expect(mensagemDeExclusao(tx({ id: 't1', transfer_id: 'tr1' }))).toMatch(
      /DUAS pernas/,
    )
    expect(
      mensagemDeExclusao(tx({ id: 't2', imported_id: 'FITID-1' })),
    ).toMatch(/reimportar o mesmo arquivo traz a linha de volta/i)
    expect(mensagemDeExclusao(tx({ id: 't3' }))).toMatch(/o servidor recusa/i)
  })
})

describe('ExtratoPage — lista', () => {
  it('carrega os lançamentos com data, descrição, conta, categoria e valor', async () => {
    comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', description: 'Starlink', amount_cents: -18900 }),
        tx({
          id: 't2',
          description: 'Mercado do mês',
          amount_cents: -5000,
          purchase_date: '2026-07-15',
          created_at: '2026-07-15T10:00:00Z',
          account_id: 'a2',
          category_id: 'c2',
          settled_at: '2026-07-15',
        }),
      ],
    })
    render(<ExtratoPage />)

    const linha = await screen.findByTestId('linha-t1')
    expect(within(linha).getByText('20/07/2026')).toBeInTheDocument()
    expect(within(linha).getByText('Starlink')).toBeInTheDocument()
    expect(within(linha).getByText(/Nubank · Mercado/)).toBeInTheDocument()
    expect(screen.getByTestId('valor-t1')).toHaveTextContent('-R$ 189,00')
    expect(screen.getByTestId('estado-t1')).toHaveTextContent(
      'falta marcar como pago',
    )

    const outra = screen.getByTestId('linha-t2')
    expect(
      within(outra).getByText(/Cofre · DAS — Simples Nacional/),
    ).toBeInTheDocument()
    expect(screen.getByTestId('estado-t2')).toHaveTextContent(
      'pago em 15/07/2026',
    )
  })

  it('a coluna de dinheiro usa tabular-nums (senão não alinha)', async () => {
    comRelogio()
    montarApi({ linhas: [tx({ id: 't1' })] })
    render(<ExtratoPage />)
    expect(await screen.findByTestId('valor-t1')).toHaveClass('tabular-nums')
  })

  it('a ~390px vira card por lançamento, nunca a tabela apertada', async () => {
    comRelogio()
    window.innerWidth = 390
    montarApi({ linhas: [tx({ id: 't1' })] })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')
    expect(screen.getByTestId('extrato-cards')).toBeInTheDocument()
    expect(screen.queryByTestId('extrato-tabela')).not.toBeInTheDocument()
  })

  it('busca textual filtra NO CLIENTE, sem nova requisição', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', description: 'Starlink' }),
        tx({
          id: 't2',
          description: 'Compra do mês',
          account_id: 'a2',
          category_id: 'c2',
        }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')
    const antes = vi.mocked(api).mock.calls.length
    const campo = screen.getByLabelText(/Buscar/)

    await user.type(campo, 'starlink')
    await waitFor(() =>
      expect(screen.queryByTestId('linha-t2')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('linha-t1')).toBeInTheDocument()

    // O termo também alcança o nome da CONTA e o da CATEGORIA, não só a
    // descrição — nenhum dos dois aparece literalmente na linha do banco.
    await user.clear(campo)
    await user.type(campo, 'cofre')
    await waitFor(() =>
      expect(screen.queryByTestId('linha-t1')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('linha-t2')).toBeInTheDocument()

    // Nenhuma das duas buscas foi ao servidor.
    expect(vi.mocked(api).mock.calls.length).toBe(antes)
  })
})

describe('ExtratoPage — filtro "falta marcar como pago"', () => {
  it('manda ?settled=0 e esconde o que já está pago', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', settled_at: null }),
        tx({ id: 't2', settled_at: '2026-07-15', description: 'Mercado' }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t2')

    await user.click(screen.getByTestId('filtro-nao-pagos'))

    await waitFor(() =>
      expect(screen.queryByTestId('linha-t2')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('linha-t1')).toBeInTheDocument()
    const url = vi
      .mocked(api)
      .mock.calls.map((c) => String(c[0]))
      .filter((p) => p.startsWith('/api/transactions'))
      .at(-1)
    expect(url).toContain('settled=0')
  })
})

describe('ExtratoPage — marcar como pago', () => {
  it('some da lista filtrada e manda a data escolhida', async () => {
    const user = comRelogio()
    const estado: Estado = {
      linhas: [
        tx({ id: 't1' }),
        tx({ id: 't2', description: 'Mercado' }),
        // Já pago: é o sinal OBSERVÁVEL de que a lista filtrada terminou de
        // recarregar — sem ele, o teste seguiria clicando num DOM que ainda
        // era o de antes do filtro.
        tx({ id: 't3', description: 'Aluguel', settled_at: '2026-07-10' }),
      ],
    }
    const corpos: unknown[] = []
    estado.mutacao = async (path, init) => {
      corpos.push({ path, body: JSON.parse(String(init.body)) })
      const alvo = estado.linhas.find((l) => path.includes(`/${l.id}/`))
      if (alvo) alvo.settled_at = '2026-07-26'
      return {}
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t3')

    await user.click(screen.getByTestId('filtro-nao-pagos'))
    await waitFor(() =>
      expect(screen.queryByTestId('linha-t3')).not.toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('marcar-pago-t1'))
    fireEvent.change(screen.getByLabelText('Pago em'), {
      target: { value: '2026-07-26' },
    })
    await user.click(screen.getByTestId('confirmar-pago-t1'))

    await waitFor(() =>
      expect(screen.queryByTestId('linha-t1')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('linha-t2')).toBeInTheDocument()
    expect(corpos).toEqual([
      {
        path: '/api/transactions/t1/settle',
        body: { settled_at: '2026-07-26' },
      },
    ])
  })

  it('o default é HOJE em Teresina, nunca a data UTC', async () => {
    // 01:00 UTC de 01/08 é 22h de 31/07 em Teresina (UTC−3). Um default em
    // UTC gravaria 2026-08-01 — a linha cairia no mês seguinte.
    const user = comRelogio('2026-08-01T01:00:00Z')
    const estado: Estado = { linhas: [tx({ id: 't1' })] }
    const corpos: unknown[] = []
    estado.mutacao = async (_path, init) => {
      corpos.push(JSON.parse(String(init.body)))
      return {}
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('marcar-pago-t1'))
    expect(screen.getByLabelText('Pago em')).toHaveValue('2026-07-31')
    await user.click(screen.getByTestId('confirmar-pago-t1'))

    await waitFor(() => expect(corpos).toEqual([{ settled_at: '2026-07-31' }]))
  })
})

describe('ExtratoPage — editar', () => {
  it('nível A: manda SÓ o campo que mudou, mesmo numa parcela', async () => {
    const user = comRelogio()
    const estado: Estado = { linhas: [tx({ id: 't1' })] }
    const corpos: unknown[] = []
    estado.mutacao = async (path, init) => {
      corpos.push({
        path,
        method: init.method,
        body: JSON.parse(String(init.body)),
      })
      estado.linhas[0].category_id = 'c2'
      return {}
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    await user.selectOptions(
      screen.getByLabelText('Categoria'),
      'DAS — Simples Nacional',
    )
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() => expect(corpos.length).toBe(1))
    // Só `category_id` — nada de `amount_cents`/`purchase_date`/`account_id`
    // inalterados, que numa parcela fariam o servidor recusar uma edição
    // que só trocava a categoria.
    expect(corpos[0]).toEqual({
      path: '/api/transactions/t1',
      method: 'PATCH',
      body: { category_id: 'c2' },
    })
  })

  it('nível B numa linha com dono: a mensagem do servidor aparece e o formulário fica aberto', async () => {
    const user = comRelogio()
    const estado: Estado = { linhas: [tx({ id: 't1' })] }
    estado.mutacao = async () => {
      throw new ApiError(
        422,
        'protected_field',
        'esta linha é uma parcela de um parcelamento: cancele o parcelamento inteiro em vez de mexer no valor de uma parcela.',
      )
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    const valor = screen.getByLabelText('Valor')
    await user.clear(valor)
    await user.type(valor, '200,00')
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() =>
      expect(screen.getByTestId('erro-linha-t1')).toHaveTextContent(
        /cancele o parcelamento inteiro/i,
      ),
    )
    // Aberto: a recusa não pode levar embora o que o dono digitou.
    expect(screen.getByTestId('form-edicao-t1')).toBeInTheDocument()
  })

  it('valor ilegível é barrado no cliente, sem gastar requisição', async () => {
    const user = comRelogio()
    const estado: Estado = { linhas: [tx({ id: 't1' })] }
    estado.mutacao = async () => {
      throw new Error('não deveria chamar a API')
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    const valor = screen.getByLabelText('Valor')
    await user.clear(valor)
    await user.type(valor, 'cento e oitenta')
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() =>
      expect(screen.getByTestId('erro-linha-t1')).toHaveTextContent(
        /Valor inválido/i,
      ),
    )
    expect(
      vi.mocked(api).mock.calls.filter((c) => (c[1] as RequestInit)?.method),
    ).toHaveLength(0)
  })
})

/**
 * ⚠️ Defeito ② — MEDIDO ponta a ponta no Chrome real: campo nascia
 * `-R$ 13.600,00`, o dono digitava `12.000,00` (sem redigitar o `-`) e o
 * `PATCH` saía com `amount_cents: 1200000` POSITIVO, sem erro nenhum. A
 * despesa virava entrada: saldo errado em 2× o valor, a linha sumia de
 * `byCategory` (que filtra `< 0`) e entrava como "entrou" no fluxo de caixa.
 *
 * Todas as asserções aqui são de VALOR (o número exato que sai no corpo),
 * nunca de presença — "mandou `amount_cents`" passaria com o sinal trocado,
 * que é exatamente o defeito.
 */
describe('ExtratoPage — editar valor: o sinal vem do "Entrada", nunca digitado', () => {
  function estadoComMutacaoEspiada(linhas: TransactionView[]) {
    const estado: Estado = { linhas }
    const corpos: Record<string, unknown>[] = []
    estado.mutacao = async (_path, init) => {
      corpos.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return {}
    }
    montarApi(estado)
    return corpos
  }

  it('o campo nasce SEM sinal e o PATCH sai NEGATIVO numa despesa', async () => {
    const user = comRelogio()
    const corpos = estadoComMutacaoEspiada([
      tx({ id: 't1', amount_cents: -1360000, description: 'Notebook' }),
    ])
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    // Nasce sem o `-`: não há sinal pra o dono redigitar (nem esquecer).
    expect(screen.getByLabelText('Valor')).toHaveValue('R$ 13.600,00')
    expect(screen.getByTestId('ed-entrada-t1')).not.toBeChecked()

    await user.clear(screen.getByLabelText('Valor'))
    await user.type(screen.getByLabelText('Valor'), '12.000,00')
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() => expect(corpos.length).toBe(1))
    expect(corpos[0]).toEqual({ amount_cents: -1200000 })
  })

  it('marcar "Entrada" é o que torna o valor POSITIVO', async () => {
    const user = comRelogio()
    const corpos = estadoComMutacaoEspiada([
      tx({ id: 't1', amount_cents: -1360000 }),
    ])
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    await user.click(screen.getByTestId('ed-entrada-t1'))
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() => expect(corpos.length).toBe(1))
    expect(corpos[0]).toEqual({ amount_cents: 1360000 })
  })

  it('uma linha que JÁ é entrada abre com o checkbox marcado e volta igual', async () => {
    const user = comRelogio()
    const corpos = estadoComMutacaoEspiada([
      tx({ id: 't1', amount_cents: 500000, description: 'Freela' }),
    ])
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    expect(screen.getByLabelText('Valor')).toHaveValue('R$ 5.000,00')
    expect(screen.getByTestId('ed-entrada-t1')).toBeChecked()

    // Só a descrição muda: o valor volta com o MESMO sinal, então
    // `amount_cents` nem entra no corpo.
    await user.type(screen.getByLabelText('Descrição'), ' de julho')
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() => expect(corpos.length).toBe(1))
    expect(corpos[0]).toEqual({ description: 'Freela de julho' })
  })

  it('não tocar no valor NÃO manda amount_cents (senão o servidor recusaria uma parcela)', async () => {
    const user = comRelogio()
    const corpos = estadoComMutacaoEspiada([
      tx({ id: 't1', amount_cents: -1360000 }),
    ])
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    await user.selectOptions(
      screen.getByLabelText('Categoria'),
      'DAS — Simples Nacional',
    )
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() => expect(corpos.length).toBe(1))
    expect(corpos[0]).toEqual({ category_id: 'c2' })
    expect(corpos[0]).not.toHaveProperty('amount_cents')
  })

  it('digitar o "-" é RECUSADO — não vira entrada em silêncio nem some por Math.abs', async () => {
    const user = comRelogio()
    const corpos = estadoComMutacaoEspiada([
      tx({ id: 't1', amount_cents: -1360000 }),
    ])
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    await user.clear(screen.getByLabelText('Valor'))
    await user.type(screen.getByLabelText('Valor'), '-12.000,00')
    await user.click(screen.getByTestId('salvar-t1'))

    await waitFor(() =>
      expect(screen.getByTestId('erro-linha-t1')).toHaveTextContent(
        /sem sinal/i,
      ),
    )
    expect(corpos).toEqual([])
  })
})

describe('ExtratoPage — apagar', () => {
  it('pede confirmação e a mensagem diz o que aquele apagar faz (transferência)', async () => {
    const user = comRelogio()
    const estado: Estado = {
      linhas: [
        tx({ id: 't1', transfer_id: 'tr1', description: 'Para o Cofre' }),
      ],
    }
    const chamadas: string[] = []
    estado.mutacao = async (path, init) => {
      chamadas.push(`${String(init.method)} ${path}`)
      estado.linhas = []
      return { transfer_id: 'tr1', deleted_ids: ['t1', 't9'] }
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('apagar-t1'))
    const dialogo = await screen.findByRole('dialog')
    expect(
      within(dialogo).getByRole('heading', { name: 'Apagar lançamento' }),
    ).toBeInTheDocument()
    expect(dialogo).toHaveTextContent(/as DUAS pernas somem juntas/i)

    await user.click(within(dialogo).getByRole('button', { name: 'Confirmar' }))

    await waitFor(() =>
      expect(screen.queryByTestId('linha-t1')).not.toBeInTheDocument(),
    )
    expect(chamadas).toEqual(['DELETE /api/transactions/t1'])
  })

  it('linha importada avisa que reimportar traz de volta', async () => {
    const user = comRelogio()
    montarApi({ linhas: [tx({ id: 't1', imported_id: 'FITID-1' })] })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('apagar-t1'))
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      /reimportar o mesmo arquivo traz a linha de volta/i,
    )
  })

  it('cancelar no diálogo não chama a API', async () => {
    const user = comRelogio()
    const estado: Estado = { linhas: [tx({ id: 't1' })] }
    estado.mutacao = async () => {
      throw new Error('não deveria apagar')
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')
    const antes = vi.mocked(api).mock.calls.length

    await user.click(screen.getByTestId('apagar-t1'))
    const dialogo = await screen.findByRole('dialog')
    // Confirmar que o diálogo ABRIU antes de cancelar: um botão inerte
    // falharia já aqui, e não na asserção sobre a API.
    expect(dialogo).toHaveTextContent(/Apagar "Starlink"/)
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(vi.mocked(api).mock.calls.length).toBe(antes)
    expect(screen.getByTestId('linha-t1')).toBeInTheDocument()
  })

  it('sucesso no DELETE mas falha na RECARGA não diz que a exclusão falhou', async () => {
    const user = comRelogio()
    const estado: Estado = {
      linhas: [tx({ id: 't1' })],
      // 1ª = carga inicial (ok); a 2ª (a recarga pós-DELETE) falha.
      falharListagemAPartirDe: 2,
    }
    const chamadas: string[] = []
    estado.mutacao = async (path, init) => {
      chamadas.push(`${String(init.method)} ${path}`)
      return { id: 't1', deleted: true }
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('apagar-t1'))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Confirmar',
      }),
    )

    const alerta = await screen.findByTestId('erro-linha-t1')
    // O DELETE ACONTECEU — a mensagem tem que dizer isso, e nunca repetir a
    // mensagem do GET (503 "sem conexão"), que faria o dono clicar de novo
    // e receber um 404 "não encontrado" parecendo falha.
    expect(alerta).toHaveTextContent(/foi apagado/i)
    expect(alerta).toHaveTextContent(/Não clique de novo/i)
    expect(alerta).not.toHaveTextContent(/sem conexão/i)
    expect(chamadas).toEqual(['DELETE /api/transactions/t1'])
  })
})

/**
 * ⚠️ Defeito ① — MEDIDO no Chrome real a 390×844, com 30 linhas e um DELETE
 * recusado (422 `transaction_has_owner`) na linha t28: a recusa renderizava
 * em `{top:-3828, bottom:-3788, scrollY:4181, visivelNoViewport:false}` —
 * 3.828 px ACIMA do viewport. Pro dono, o botão "apagar" era inerte.
 *
 * jsdom não faz layout, então "visível no viewport" é aferido pela única
 * propriedade que o produz de fato e que dá pra medir aqui: o alerta é
 * DESCENDENTE da linha em que o dedo está, e não existe nenhum alerta fora
 * da lista. As três mutações têm caso próprio — as três escreviam no MESMO
 * `<p>` do topo.
 */
describe('ExtratoPage — a recusa aparece NA LINHA, nunca no topo da página', () => {
  const trinta = Array.from({ length: 30 }, (_, i) =>
    tx({
      id: `t${i}`,
      description: `Lançamento ${i}`,
      purchase_date: '2026-07-20',
      created_at: '2026-07-20T10:00:00Z',
    }),
  )

  it('DELETE recusado escreve dentro de linha-t28, e nada no topo', async () => {
    const user = comRelogio()
    window.innerWidth = 390
    const estado: Estado = { linhas: [...trinta] }
    estado.mutacao = async () => {
      throw new ApiError(
        422,
        'transaction_has_owner',
        'esta linha é um pagamento de dívida: use DELETE /api/debts/:id/payments/:paymentId pra apagá-la junto com o pagamento.',
      )
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t28')

    await user.click(screen.getByTestId('apagar-t28'))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Confirmar',
      }),
    )

    const linha = await screen.findByTestId('linha-t28')
    await waitFor(() =>
      expect(within(linha).getByRole('alert')).toHaveTextContent(
        /use DELETE \/api\/debts/i,
      ),
    )
    // A mensagem CRUA do domínio (a que nomeia a porta certa) sobrevive
    // inteira — nada de "não foi possível apagar" genérico.
    expect(within(linha).getByTestId('erro-linha-t28')).toHaveTextContent(
      'esta linha é um pagamento de dívida: use DELETE /api/debts/:id/payments/:paymentId pra apagá-la junto com o pagamento.',
    )
    // Nenhum alerta no topo: o `<p>` de página fica pro que não é de linha.
    expect(screen.queryByTestId('acao-erro')).not.toBeInTheDocument()
    // E nenhuma OUTRA linha ganha o erro.
    expect(
      within(screen.getByTestId('linha-t0')).queryByRole('alert'),
    ).not.toBeInTheDocument()
  })

  it('PATCH recusado escreve dentro da linha, com o formulário ainda aberto', async () => {
    const user = comRelogio()
    window.innerWidth = 390
    const estado: Estado = { linhas: [...trinta] }
    estado.mutacao = async () => {
      throw new ApiError(
        422,
        'protected_field',
        'esta linha é uma parcela de um parcelamento: cancele o parcelamento inteiro.',
      )
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t28')

    await user.click(screen.getByTestId('editar-t28'))
    await user.clear(screen.getByLabelText('Valor'))
    await user.type(screen.getByLabelText('Valor'), '200,00')
    await user.click(screen.getByTestId('salvar-t28'))

    const linha = await screen.findByTestId('linha-t28')
    await waitFor(() =>
      expect(within(linha).getByTestId('erro-linha-t28')).toHaveTextContent(
        /cancele o parcelamento inteiro/i,
      ),
    )
    expect(within(linha).getByTestId('form-edicao-t28')).toBeInTheDocument()
    expect(screen.queryByTestId('acao-erro')).not.toBeInTheDocument()
  })

  it('settle recusado escreve dentro da linha', async () => {
    const user = comRelogio()
    window.innerWidth = 390
    const estado: Estado = { linhas: [...trinta] }
    estado.mutacao = async () => {
      throw new ApiError(404, 'not_found', 'não encontrado ou já liquidado')
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t28')

    await user.click(screen.getByTestId('marcar-pago-t28'))
    await user.click(screen.getByTestId('confirmar-pago-t28'))

    const linha = await screen.findByTestId('linha-t28')
    await waitFor(() =>
      expect(within(linha).getByTestId('erro-linha-t28')).toHaveTextContent(
        /já liquidado/i,
      ),
    )
    expect(screen.queryByTestId('acao-erro')).not.toBeInTheDocument()
  })

  it('o erro some quando o dono começa outra ação na mesma linha', async () => {
    const user = comRelogio()
    window.innerWidth = 390
    const estado: Estado = { linhas: [...trinta] }
    estado.mutacao = async () => {
      throw new ApiError(422, 'transaction_has_owner', 'recusado pelo domínio')
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t28')

    await user.click(screen.getByTestId('apagar-t28'))
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Confirmar',
      }),
    )
    await screen.findByTestId('erro-linha-t28')

    await user.click(screen.getByTestId('editar-t28'))
    expect(screen.queryByTestId('erro-linha-t28')).not.toBeInTheDocument()
  })
})

describe('ExtratoPage — carregar mais (keyset)', () => {
  it('pagina com cursor de TRÊS partes e o botão some no fim', async () => {
    const user = comRelogio()
    // PAGINA + 2 linhas: a 1ª página enche, a 2ª volta incompleta.
    const linhas = Array.from({ length: PAGINA + 2 }, (_, i) =>
      tx({
        id: `t${i}`,
        description: `Lançamento ${i}`,
        purchase_date: '2026-07-20',
        created_at: '2026-07-20T10:00:00Z',
      }),
    )
    montarApi({ linhas })
    render(<ExtratoPage />)
    await screen.findByTestId(`linha-t${PAGINA - 1}`)
    expect(screen.queryByTestId(`linha-t${PAGINA}`)).not.toBeInTheDocument()

    await user.click(screen.getByTestId('carregar-mais'))

    await waitFor(() =>
      expect(screen.getByTestId(`linha-t${PAGINA + 1}`)).toBeInTheDocument(),
    )
    // ⚠️ As PAGINA+2 linhas têm purchase_date E created_at IDÊNTICOS (é o
    // que um plano de parcelas grava). Com cursor de duas partes, o
    // "servidor" deste teste não acharia a borda e a página 2 repetiria/
    // pularia linhas — o defeito medido no backend.
    const url = vi
      .mocked(api)
      .mock.calls.map((c) => String(c[0]))
      .find((p) => p.includes('before='))
    expect(url).toContain(
      `before=${encodeURIComponent(`2026-07-20|2026-07-20T10:00:00Z|t${PAGINA - 1}`)}`,
    )
    expect(screen.queryByTestId('carregar-mais')).not.toBeInTheDocument()
  })
})
