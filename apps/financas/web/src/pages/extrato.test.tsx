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
  FILTROS_VAZIOS,
  formatarData,
  mensagemDeExclusao,
  PAGINA,
  queryDoExtrato,
  resumoDosFiltros,
  totaisPendentes,
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
        // Mesmos filtros do `buildListTransactionsQuery` real
        // (`src/domain/transactions.ts`): igualdade em conta, faixa fechada
        // em `purchase_date`. Sem replicá-los aqui, um teste de filtro
        // passaria contra uma tela que montasse a query e nunca a usasse.
        const conta = qs.get('account_id')
        if (conta !== null) rows = rows.filter((r) => r.account_id === conta)
        const desde = qs.get('from')
        if (desde !== null) rows = rows.filter((r) => r.purchase_date >= desde)
        const ateQuando = qs.get('to')
        if (ateQuando !== null)
          rows = rows.filter((r) => r.purchase_date <= ateQuando)
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

/**
 * Os filtros moram num `Sheet` desde a fatia da reforma — abrir o painel
 * virou pré-requisito pra alcançar qualquer controle de filtro.
 *
 * ⚠️ **Fechar não é zelo, é necessidade:** o painel é modal (o Radix prende
 * o foco e desliga o ponteiro fora dele), então um teste que mexe num filtro
 * e DEPOIS numa linha do extrato falha em `pointer-events` se o painel ficar
 * aberto. Um helper só faz as três etapas, pra nenhum teste esquecer a
 * terceira.
 */
async function comFiltros(
  user: ReturnType<typeof comRelogio>,
  acao: () => Promise<void>,
) {
  await user.click(screen.getByTestId('abrir-filtros'))
  await screen.findByTestId('painel-filtros')
  await acao()
  await user.click(screen.getByTestId('ver-resultado'))
  await waitFor(() =>
    expect(screen.queryByTestId('painel-filtros')).not.toBeInTheDocument(),
  )
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

    await comFiltros(user, async () => {
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
    })

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

    await comFiltros(user, async () => {
      await user.click(screen.getByTestId('filtro-nao-pagos'))
    })

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

    await comFiltros(user, async () => {
      await user.click(screen.getByTestId('filtro-nao-pagos'))
    })
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

  it('a recusa se rola para dentro da vista com "nearest" — nunca "center"', async () => {
    const user = comRelogio()
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const estado: Estado = { linhas: [tx({ id: 't1' })] }
    estado.mutacao = async () => {
      throw new ApiError(422, 'protected_field', 'recusado pelo servidor.')
    }
    montarApi(estado)
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('editar-t1'))
    const valor = screen.getByLabelText('Valor')
    await user.clear(valor)
    await user.type(valor, '200,00')
    scroll.mockClear()
    await user.click(screen.getByTestId('salvar-t1'))

    await screen.findByTestId('erro-linha-t1')

    // ⚠️ O ARGUMENTO é a asserção, não a chamada. Medido no Chrome real a
    // 390x844: com o botão na zona do polegar (`bottom:844`), o alerta
    // inline nascia em `top:852` — 0 px visíveis. `'nearest'` conserta isso
    // rolando o mínimo; `'center'`/`'start'` rolariam SEMPRE, inclusive
    // quando o alerta já estava visível, tirando o dono do lugar onde ele
    // tocou — que é exatamente o motivo de o erro ser inline e não no topo.
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
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

describe('ExtratoPage — quanto falta pagar (o filtro respondia com CONTAGEM)', () => {
  it('totaisPendentes separa saída de entrada e NUNCA neta uma contra a outra', () => {
    // ⚠️ O caso que decide o desenho: uma receita ainda não recebida no meio
    // de despesas ainda não pagas. Um saldo líquido (soma com sinal) daria
    // -R$ 100,00 e a tela diria "falta pagar R$ 100,00" — a dívida real é
    // R$ 300,00, e a receita não paga nada.
    const linhas = [
      tx({ id: 't1', amount_cents: -20000 }),
      tx({ id: 't2', amount_cents: -10000 }),
      tx({ id: 't3', amount_cents: 20000 }),
    ]
    expect(totaisPendentes(linhas)).toEqual({
      falta_sair_cents: 30000,
      falta_entrar_cents: 20000,
    })
    expect(totaisPendentes([])).toEqual({
      falta_sair_cents: 0,
      falta_entrar_cents: 0,
    })
  })

  it('com o filtro ligado, SOMA em reais — não só conta linhas', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', amount_cents: -18900 }),
        tx({ id: 't2', amount_cents: -120050, purchase_date: '2026-07-19' }),
        // já paga: não pode entrar na soma do "falta pagar"
        tx({ id: 't3', amount_cents: -500000, settled_at: '2026-07-10' }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')
    expect(screen.queryByTestId('total-pendente')).not.toBeInTheDocument()

    await comFiltros(user, async () => {
      await user.click(screen.getByTestId('filtro-nao-pagos'))
    })
    // a linha já paga some — sinal observável de que a lista filtrada chegou
    await waitFor(() =>
      expect(screen.queryByTestId('linha-t3')).not.toBeInTheDocument(),
    )
    // 189,00 + 1.200,50 = 1.389,50 — nunca os 5.000,00 da linha já paga
    expect(screen.getByTestId('total-pendente')).toHaveTextContent(
      'Falta pagar R$ 1.389,50',
    )
    expect(screen.getByTestId('total-pendente')).not.toHaveTextContent(
      'R$ 6.389,50',
    )
  })

  it('receita pendente aparece SEPARADA, nunca abatendo o que falta pagar', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', amount_cents: -30000 }),
        tx({ id: 't2', amount_cents: 20000, purchase_date: '2026-07-19' }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')
    await comFiltros(user, async () => {
      await user.click(screen.getByTestId('filtro-nao-pagos'))
    })

    await waitFor(() =>
      expect(screen.getByTestId('total-pendente')).toHaveTextContent(
        'Falta pagar R$ 300,00',
      ),
    )
    expect(screen.getByTestId('total-pendente')).toHaveTextContent(
      'falta entrar R$ 200,00',
    )
    // o líquido (R$ 100,00) não pode aparecer em lugar nenhum
    expect(screen.getByTestId('total-pendente')).not.toHaveTextContent(
      'R$ 100,00',
    )
  })

  it('⚠️ a lista é PAGINADA: com mais páginas por vir, a soma se declara parcial', async () => {
    const user = comRelogio()
    // PAGINA linhas não pagas ⇒ a resposta vem cheia ⇒ `temMais` fica true
    const linhas = Array.from({ length: PAGINA }, (_, i) =>
      tx({
        id: `t${i}`,
        amount_cents: -10000,
        purchase_date: `2026-07-${String(28 - i).padStart(2, '0')}`,
        created_at: `2026-07-${String(28 - i).padStart(2, '0')}T10:00:00Z`,
      }),
    )
    montarApi({ linhas })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t0')
    await comFiltros(user, async () => {
      await user.click(screen.getByTestId('filtro-nao-pagos'))
    })

    await waitFor(() =>
      expect(screen.getByTestId('carregar-mais')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('resumo-carregado')).toHaveTextContent(
      /só do que carregou até aqui/i,
    )
    expect(screen.getByTestId('resumo-carregado')).not.toHaveTextContent(
      /cobre tudo/i,
    )
  })

  it('sem mais páginas, a soma diz que cobre tudo que falta marcar como pago', async () => {
    const user = comRelogio()
    montarApi({ linhas: [tx({ id: 't1', amount_cents: -18900 })] })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')
    await comFiltros(user, async () => {
      await user.click(screen.getByTestId('filtro-nao-pagos'))
    })

    await waitFor(() =>
      expect(screen.getByTestId('resumo-carregado')).toHaveTextContent(
        /cobre tudo que falta marcar como pago/i,
      ),
    )
    expect(screen.queryByTestId('carregar-mais')).not.toBeInTheDocument()
  })
})

describe('ExtratoPage — alvo de toque e status como badge', () => {
  it('apagar e editar são alvos de 44px, e o destrutivo NÃO fica colado no editar', async () => {
    comRelogio()
    montarApi({ linhas: [tx({ id: 't1' })] })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    // ⚠️ jsdom não faz layout — o que dá pra afirmar aqui é a REGRA
    // aplicada (a caixa de 44px e a separação), não o pixel. O pixel é
    // medido em Chrome real, fora da suíte.
    for (const id of ['apagar-t1', 'editar-t1', 'marcar-pago-t1']) {
      expect(screen.getByTestId(id).className).toContain('min-h-11')
    }
    // `ml-auto` só no destrutivo: é o que empurra `apagar` pra outra ponta
    // da linha, em vez dos 12px que o separavam de `editar`.
    expect(screen.getByTestId('apagar-t1').className).toContain('ml-auto')
    expect(screen.getByTestId('editar-t1').className).not.toContain('ml-auto')
  })

  it('o estado do lançamento é um badge, não texto solto', async () => {
    comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1' }),
        tx({
          id: 't2',
          settled_at: '2026-07-15',
          purchase_date: '2026-07-15',
          created_at: '2026-07-15T10:00:00Z',
        }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    // `regras.tsx` é a referência: chip com borda/fundo, não um `<p>` cinza.
    for (const id of ['estado-t1', 'estado-t2']) {
      expect(screen.getByTestId(id).className).toMatch(/rounded-full|border/)
    }
    // e o texto não mudou — o contrato da tela continua o mesmo
    expect(screen.getByTestId('estado-t1')).toHaveTextContent(
      'falta marcar como pago',
    )
    expect(screen.getByTestId('estado-t2')).toHaveTextContent(
      'pago em 15/07/2026',
    )
  })
})

// ---------------------------------------------------------------------------
// Filtros no `Sheet` — o card de 218 px que abria a tela saiu do caminho.
// ---------------------------------------------------------------------------

describe('resumoDosFiltros / queryDoExtrato — puros', () => {
  const nome = (id: string) => (id === 'a1' ? 'Nubank PJ' : '—')

  it('sem nenhum filtro, o resumo é VAZIO (e o contador, portanto, some)', () => {
    expect(resumoDosFiltros(FILTROS_VAZIOS, nome)).toEqual([])
  })

  it('nomeia a conta, nunca o id', () => {
    expect(
      resumoDosFiltros({ ...FILTROS_VAZIOS, contaId: 'a1' }, nome),
    ).toEqual(['Nubank PJ'])
  })

  it('conta desconhecida ainda conta como filtro ativo — some o nome, nunca o filtro', () => {
    // A lista de contas pode ter falhado (efeito separado, ver a tela). O
    // que não pode acontecer é o chip esconder que HÁ um recorte por conta.
    expect(
      resumoDosFiltros({ ...FILTROS_VAZIOS, contaId: 'sumida' }, nome),
    ).toEqual(['—'])
  })

  it('período conta como UMA dimensão, com as duas pontas preenchidas', () => {
    expect(
      resumoDosFiltros(
        { ...FILTROS_VAZIOS, de: '2026-07-01', ate: '2026-07-31' },
        nome,
      ),
    ).toEqual(['01/07/2026 a 31/07/2026'])
  })

  it('uma ponta só vira "desde" ou "até"', () => {
    expect(
      resumoDosFiltros({ ...FILTROS_VAZIOS, de: '2026-07-01' }, nome),
    ).toEqual(['desde 01/07/2026'])
    expect(
      resumoDosFiltros({ ...FILTROS_VAZIOS, ate: '2026-07-31' }, nome),
    ).toEqual(['até 31/07/2026'])
  })

  it('os quatro juntos dão QUATRO — o número que o botão mostra', () => {
    expect(
      resumoDosFiltros(
        {
          contaId: 'a1',
          de: '2026-07-01',
          ate: '2026-07-31',
          somenteNaoPagos: true,
          busca: '  mercado  ',
        },
        nome,
      ),
    ).toEqual([
      'Nubank PJ',
      'falta pagar',
      '01/07/2026 a 31/07/2026',
      'busca "mercado"',
    ])
  })

  it('busca só de espaço não é filtro nenhum', () => {
    expect(resumoDosFiltros({ ...FILTROS_VAZIOS, busca: '   ' }, nome)).toEqual(
      [],
    )
  })

  it('queryDoExtrato manda só o que está preenchido, e a busca NUNCA', () => {
    expect(
      queryDoExtrato({ ...FILTROS_VAZIOS, busca: 'mercado' }, 30).toString(),
    ).toBe('limit=30')
    expect(
      queryDoExtrato(
        {
          contaId: 'a1',
          de: '2026-07-01',
          ate: '2026-07-31',
          somenteNaoPagos: true,
          busca: 'mercado',
        },
        30,
        '2026-07-01|2026-07-01T10:00:00Z|t9',
      ).toString(),
    ).toBe(
      'limit=30&account_id=a1&from=2026-07-01&to=2026-07-31&settled=0&before=2026-07-01%7C2026-07-01T10%3A00%3A00Z%7Ct9',
    )
  })
})

describe('ExtratoPage — filtros no painel', () => {
  it('a tela abre sem formulário de filtro: só o botão, e sem contador', async () => {
    comRelogio()
    montarApi({ linhas: [tx({ id: 't1' })] })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    expect(screen.getByTestId('abrir-filtros')).toBeInTheDocument()
    expect(screen.queryByTestId('painel-filtros')).not.toBeInTheDocument()
    // Nenhum controle de filtro ocupa a tela antes do dono pedir.
    expect(screen.queryByTestId('filtro-nao-pagos')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Buscar/)).not.toBeInTheDocument()
    // Sem filtro não há chip nem número — ruído zero no caso comum.
    expect(screen.queryByTestId('filtros-contador')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filtros-resumo')).not.toBeInTheDocument()
  })

  it('com o painel FECHADO, o chip diz o que está filtrado e o botão diz quantos', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', account_id: 'a1' }),
        tx({ id: 't2', account_id: 'a2', settled_at: '2026-07-15' }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t2')

    await comFiltros(user, async () => {
      await user.selectOptions(screen.getByTestId('filtro-conta'), 'a1')
      await user.click(screen.getByTestId('filtro-nao-pagos'))
    })

    // O painel está fechado — e o estado do filtro continua na tela.
    expect(screen.queryByTestId('painel-filtros')).not.toBeInTheDocument()
    expect(screen.getByTestId('filtros-resumo')).toHaveTextContent(
      'Nubank · falta pagar',
    )
    expect(screen.getByTestId('filtros-contador')).toHaveTextContent('2')
  })

  it('filtrar por conta muda o que é BUSCADO (?account_id=), não só o que é exibido', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', account_id: 'a1', description: 'Starlink' }),
        tx({ id: 't2', account_id: 'a2', description: 'Aporte' }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t2')

    await comFiltros(user, async () => {
      await user.selectOptions(screen.getByTestId('filtro-conta'), 'a2')
    })

    await waitFor(() =>
      expect(screen.queryByTestId('linha-t1')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('linha-t2')).toBeInTheDocument()
    const url = vi
      .mocked(api)
      .mock.calls.map((c) => String(c[0]))
      .filter((p) => p.startsWith('/api/transactions'))
      .at(-1)
    expect(url).toContain('account_id=a2')
  })

  it('o período vira ?from=/?to= e recorta a lista', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', purchase_date: '2026-07-20' }),
        tx({ id: 't2', purchase_date: '2026-06-10', description: 'Antigo' }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t2')

    await comFiltros(user, async () => {
      fireEvent.change(screen.getByTestId('filtro-de'), {
        target: { value: '2026-07-01' },
      })
      fireEvent.change(screen.getByTestId('filtro-ate'), {
        target: { value: '2026-07-31' },
      })
    })

    await waitFor(() =>
      expect(screen.queryByTestId('linha-t2')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('linha-t1')).toBeInTheDocument()
    const url = vi
      .mocked(api)
      .mock.calls.map((c) => String(c[0]))
      .filter((p) => p.startsWith('/api/transactions'))
      .at(-1)
    expect(url).toContain('from=2026-07-01')
    expect(url).toContain('to=2026-07-31')
  })

  it('"carregar mais" leva os filtros junto, não só o cursor', async () => {
    // ⚠️ Sem isto, a página 2 traria linhas de OUTRA conta pro fim de uma
    // lista que o dono acabou de filtrar — e nada na tela diria por quê.
    const user = comRelogio()
    montarApi({
      linhas: Array.from({ length: PAGINA + 5 }, (_, i) =>
        tx({
          id: `t${i}`,
          account_id: 'a1',
          purchase_date: '2026-07-20',
          created_at: `2026-07-20T10:00:${String(i).padStart(2, '0')}Z`,
        }),
      ),
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t0')

    await comFiltros(user, async () => {
      await user.selectOptions(screen.getByTestId('filtro-conta'), 'a1')
    })
    await waitFor(() =>
      expect(screen.getByTestId('carregar-mais')).toBeEnabled(),
    )

    await user.click(screen.getByTestId('carregar-mais'))
    await screen.findByTestId(`linha-t${PAGINA}`)

    const url = vi
      .mocked(api)
      .mock.calls.map((c) => String(c[0]))
      .filter((p) => p.includes('before='))
      .at(-1)
    expect(url).toContain('account_id=a1')
  })

  it('lista vazia POR FILTRO não diz "Nenhum lançamento ainda"', async () => {
    // A mentira mais cara desta tela: o dono concluiria que o livro-caixa
    // está vazio quando o que está vazio é o recorte que ele mesmo ligou.
    const user = comRelogio()
    montarApi({ linhas: [tx({ id: 't1', account_id: 'a1' })] })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await comFiltros(user, async () => {
      await user.selectOptions(screen.getByTestId('filtro-conta'), 'a2')
    })

    const vazio = await screen.findByTestId('vazio')
    expect(vazio).toHaveTextContent(/Nenhum lançamento bate com os filtros/)
    expect(vazio).toHaveTextContent('Cofre')
    expect(vazio.textContent).not.toMatch(/Nenhum lançamento ainda/)
  })

  it('"limpar" zera tudo: o chip some e a lista volta inteira', async () => {
    const user = comRelogio()
    montarApi({
      linhas: [
        tx({ id: 't1', account_id: 'a1' }),
        tx({ id: 't2', account_id: 'a2', description: 'Aporte' }),
      ],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t2')

    await comFiltros(user, async () => {
      await user.selectOptions(screen.getByTestId('filtro-conta'), 'a1')
    })
    await waitFor(() =>
      expect(screen.queryByTestId('linha-t2')).not.toBeInTheDocument(),
    )

    await user.click(screen.getByTestId('limpar-filtros'))

    await screen.findByTestId('linha-t2')
    expect(screen.queryByTestId('filtros-resumo')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filtros-contador')).not.toBeInTheDocument()
  })

  it('data inicial depois da final é avisada — lista vazia ali não significa "não há nada"', async () => {
    const user = comRelogio()
    montarApi({ linhas: [tx({ id: 't1' })] })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    await user.click(screen.getByTestId('abrir-filtros'))
    await screen.findByTestId('painel-filtros')
    expect(screen.queryByTestId('periodo-invalido')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('filtro-de'), {
      target: { value: '2026-07-31' },
    })
    fireEvent.change(screen.getByTestId('filtro-ate'), {
      target: { value: '2026-07-01' },
    })

    expect(await screen.findByTestId('periodo-invalido')).toHaveTextContent(
      /data inicial é depois da final/,
    )
  })

  it('⚠️ o RODAPÉ diz de que recorte é a contagem — o chip do topo rola pra fora', async () => {
    // MEDIDO pelo revisor: com 30 linhas e filtro de conta ativo, rolado ao
    // fim (`scrollY 4954` de 5798), o chip fica em `top:-4807` e o botão
    // "Filtros" em `top:-4818` — os DOIS a **0 px visíveis**. O único texto
    // perto do polegar dizia "30 lançamento(s) carregado(s)." sem qualificar
    // o recorte: olhar uma lista PARCIAL achando que é tudo, que é a pior
    // leitura possível numa tela de extrato.
    const user = comRelogio()
    montarApi({
      linhas: [tx({ id: 't1' }), tx({ id: 't2', account_id: 'a2' })],
    })
    render(<ExtratoPage />)
    await screen.findByTestId('linha-t1')

    // Sem filtro: a contagem NÃO ganha qualificação nenhuma.
    expect(screen.getByTestId('resumo-carregado').textContent).not.toMatch(/—/)

    await comFiltros(user, async () => {
      await user.selectOptions(screen.getByTestId('filtro-conta'), 'a1')
    })

    // Com filtro: o rodapé nomeia o recorte, sem depender do chip lá em cima.
    await waitFor(() =>
      expect(screen.getByTestId('resumo-carregado')).toHaveTextContent(
        /—.*Nubank/,
      ),
    )
  })
})
