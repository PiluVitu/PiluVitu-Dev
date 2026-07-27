import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ImportarPage, IMPORT_BATCH_SIZE } from './importar'

const accounts = [
  {
    id: 'a1',
    name: 'Nubank cartão',
    scope: 'PF',
    kind: 'credit_card',
    closing_day: 5,
    due_day: 15,
    balance_cents: 0,
  },
]

const payees = [
  {
    id: 'p1',
    name: 'Padaria X',
    norm_name: 'PADARIA X',
    kind: 'merchant',
    default_category_id: 'c-alimentacao',
  },
  {
    id: 'p2',
    name: 'Uber',
    norm_name: 'UBER',
    kind: 'merchant',
    default_category_id: null,
  },
]

const categories = [
  {
    id: 'c-alimentacao',
    name: 'Alimentação',
    kind: 'expense',
    slug: 'alimentacao',
  },
  {
    id: 'c-transporte',
    name: 'Transporte',
    kind: 'expense',
    slug: 'transporte',
  },
]

// Duas transações: FITID-1 (vai bater com uma transação "já existente" no
// mock — duplicata) e FITID-2 (nova). MEMOs escolhidos pra baterem com
// payees.norm_name acima, provando a sugestão de payee/categoria.
const OFX_DUAS_LINHAS = `<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260710120000[-3:BRT]
<TRNAMT>-45.90
<FITID>FITID-1
<MEMO>Padaria X PagSeguro
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260711120000[-3:BRT]
<TRNAMT>-12.50
<FITID>FITID-2
<MEMO>Uber
</STMTTRN>
</BANKTRANLIST>
</OFX>`

function ofxComNTransacoes(n: number): string {
  const blocos = Array.from({ length: n }, (_, i) => {
    const dia = String(10 + (i % 15)).padStart(2, '0')
    return `<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>202607${dia}120000[-3:BRT]
<TRNAMT>-${(10 + i).toFixed(2)}
<FITID>FITID-N-${i}
<MEMO>Loja ${i}
</STMTTRN>`
  }).join('\n')
  return `<OFX>\n<BANKTRANLIST>\n${blocos}\n</BANKTRANLIST>\n</OFX>`
}

// Sem cabeçalho, delimitador ';' (mais ';' que ',' na 1a linha — a vírgula
// decimal do valor conta como ',' também, então o fixture precisa de pelo
// menos 2 ';' pra vencer). Colunas: data(0) ; valor(1) ; descrição(2).
const CSV_SEM_MAPA_SALVO =
  '10/07/2026;-45,90;Padaria X PagSeguro\n11/07/2026;-12,50;Uber'

function arquivoOfx(texto: string, nome = 'extrato.ofx'): File {
  return new File([texto], nome, { type: 'application/x-ofx' })
}

function arquivoCsv(texto: string, nome = 'fatura.csv'): File {
  return new File([texto], nome, { type: 'text/csv' })
}

function respondJson(data: unknown, status = 200) {
  return Promise.resolve({
    status,
    json: async () => ({ ok: true, data, notifications: [] }),
  })
}

type Chamada = { url: string; method: string; body: string | undefined }

/**
 * Mock de `fetch` (não de `api`) — de propósito: só no nível de transporte
 * dá pra provar que o CONTEÚDO BRUTO do arquivo nunca é enviado (ver teste
 * dedicado abaixo). `chamadas` acumula toda requisição feita, pra inspeção.
 */
function mockRede(opts: {
  chamadas: Chamada[]
  transacoesExistentes?: Array<{ imported_id: string | null }>
  resultadoImport?: (rows: unknown[]) => {
    total: number
    imported: number
    skipped: number
  }
}) {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        const body = init?.body as string | undefined
        opts.chamadas.push({ url, method, body })

        if (url.includes('/api/accounts')) return respondJson(accounts)
        if (url.includes('/api/payees')) return respondJson(payees)
        if (url.includes('/api/categories')) return respondJson(categories)
        if (method === 'POST' && url.includes('/api/transactions/import')) {
          const rows = (
            body ? (JSON.parse(body) as { rows: unknown[] }) : { rows: [] }
          ).rows
          const resultado = opts.resultadoImport
            ? opts.resultadoImport(rows)
            : { total: rows.length, imported: rows.length, skipped: 0 }
          return respondJson(resultado, 201)
        }
        if (url.includes('/api/transactions')) {
          return respondJson(opts.transacoesExistentes ?? [])
        }
        throw new Error(`rota inesperada em teste: ${method} ${url}`)
      }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function irParaConferencia(chamadas: Chamada[]) {
  render(<ImportarPage />)
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Importar' }),
    ).toBeInTheDocument(),
  )
  const usuario = userEvent.setup()
  const input = screen.getByLabelText(/Arquivo/i)
  await usuario.upload(input, arquivoOfx(OFX_DUAS_LINHAS))
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Conferir importação' }),
    ).toBeInTheDocument(),
  )
  return usuario
}

describe('ImportarPage — Task 4: leitura e mapeamento', () => {
  test('tela inicial mostra seleção de conta e de arquivo', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Importar' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Conta')).toBeInTheDocument()
    expect(screen.getByLabelText(/Arquivo/i)).toBeInTheDocument()
  })

  test('OFX vai direto pra conferência — não existe etapa de mapeamento pra OFX', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    await irParaConferencia(chamadas)
    expect(
      screen.queryByRole('heading', { name: 'Mapear colunas do CSV' }),
    ).not.toBeInTheDocument()
  })

  test('CSV sem mapa salvo mostra a etapa de mapeamento com as primeiras linhas', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Importar' }),
      ).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoCsv(CSV_SEM_MAPA_SALVO),
    )

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Mapear colunas do CSV' }),
      ).toBeInTheDocument(),
    )
    const preview = screen.getByTestId('preview-csv')
    expect(within(preview).getByText('Padaria X PagSeguro')).toBeInTheDocument()
    expect(within(preview).getByText('10/07/2026')).toBeInTheDocument()
  })

  test('confirmar o mapeamento parseia o CSV, salva o mapa e vai pra conferência', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Importar' }),
      ).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoCsv(CSV_SEM_MAPA_SALVO),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Mapear colunas do CSV' }),
      ).toBeInTheDocument(),
    )

    // Fixture já bate com os defaults (data=0, valor=1, descrição=2) — só
    // confirma.
    await usuario.click(
      screen.getByRole('button', { name: /Usar este mapeamento/i }),
    )

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Padaria X PagSeguro')).toBeInTheDocument()
    expect(screen.getByText('-R$ 45,90')).toBeInTheDocument()

    const salvo = localStorage.getItem('financas-import-mapa:a1')
    expect(salvo).not.toBeNull()
    expect(JSON.parse(salvo as string)).toEqual({
      data: 0,
      valor: 1,
      descricao: 2,
      temCabecalho: false,
    })
  })

  test('mapa já salvo pra conta pula a etapa de mapeamento na próxima importação', async () => {
    localStorage.setItem(
      'financas-import-mapa:a1',
      JSON.stringify({ data: 0, valor: 1, descricao: 2, temCabecalho: false }),
    )
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Importar' }),
      ).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoCsv(CSV_SEM_MAPA_SALVO),
    )

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('heading', { name: 'Mapear colunas do CSV' }),
    ).not.toBeInTheDocument()
  })

  test('arquivo malformado mostra erro em vez de travar a tela', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Importar' }),
      ).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoOfx('isto não é um OFX de verdade'),
    )
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  test('ajuda do mapeamento abre no clique (popover, não tooltip)', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Importar' }),
      ).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoCsv(CSV_SEM_MAPA_SALVO),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Mapear colunas do CSV' }),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText(/adivinhar/i)).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Ajuda sobre/i }))
    expect(screen.getByText(/adivinhar/i)).toBeInTheDocument()
  })
})

describe('ImportarPage — Task 5: tela de conferência', () => {
  test('cada linha mostra data, valor, descrição, payee sugerido e categoria sugerida', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    await irParaConferencia(chamadas)

    expect(screen.getByText('10/07/2026')).toBeInTheDocument()
    expect(screen.getByText('-R$ 45,90')).toBeInTheDocument()
    expect(screen.getByText('Padaria X PagSeguro')).toBeInTheDocument()

    // Linha 0 (FITID-1, "Padaria X PagSeguro") sugere o payee p1 e a
    // categoria default dele.
    expect(screen.getByTestId('payee-0')).toHaveValue('p1')
    expect(screen.getByTestId('categoria-0')).toHaveValue('c-alimentacao')
    // Linha 1 (FITID-2, "Uber") sugere p2, sem categoria default.
    expect(screen.getByTestId('payee-1')).toHaveValue('p2')
    expect(screen.getByTestId('categoria-1')).toHaveValue('')
  })

  test('linha já importada aparece marcada como duplicata e desmarcada por padrão — e confirmar não a envia', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesExistentes: [{ imported_id: 'FITID-1' }],
    })
    const usuario = await irParaConferencia(chamadas)

    const linha0 = screen.getByTestId('linha-0')
    expect(within(linha0).getByTestId('duplicada-0')).toBeInTheDocument()
    expect(within(linha0).getByRole('checkbox')).not.toBeChecked()

    const linha1 = screen.getByTestId('linha-1')
    expect(within(linha1).queryByTestId('duplicada-1')).not.toBeInTheDocument()
    expect(within(linha1).getByRole('checkbox')).toBeChecked()

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    const chamadaImport = chamadas.find((c) =>
      c.url.includes('/transactions/import'),
    )
    expect(chamadaImport).toBeDefined()
    const enviado = JSON.parse(chamadaImport!.body as string) as {
      rows: Array<{ imported_id: string }>
    }
    expect(enviado.rows).toHaveLength(1)
    expect(enviado.rows[0].imported_id).toBe('FITID-2')
  })

  test('dá para forçar uma duplicata marcando de novo o checkbox', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesExistentes: [{ imported_id: 'FITID-1' }],
    })
    const usuario = await irParaConferencia(chamadas)

    const linha0 = screen.getByTestId('linha-0')
    await usuario.click(within(linha0).getByRole('checkbox'))
    expect(within(linha0).getByRole('checkbox')).toBeChecked()

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    const chamadaImport = chamadas.find((c) =>
      c.url.includes('/transactions/import'),
    )
    const enviado = JSON.parse(chamadaImport!.body as string) as {
      rows: Array<{ imported_id: string }>
    }
    expect(enviado.rows).toHaveLength(2)
    // A duplicata forçada NUNCA sai com o imported_id original — reenviar
    // com o mesmo id faria o próprio dedupe do backend (que roda por
    // account_id+imported_id) pular de novo, e a "força" seria um no-op
    // silencioso. Precisa de um id disambiguado.
    const forcada = enviado.rows.find((r) =>
      r.imported_id.startsWith('FITID-1'),
    )
    expect(forcada).toBeDefined()
    expect(forcada!.imported_id).not.toBe('FITID-1')
    const naoForcada = enviado.rows.find((r) => r.imported_id === 'FITID-2')
    expect(naoForcada).toBeDefined()
  })

  test('dá para trocar o payee sugerido antes de confirmar', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    const usuario = await irParaConferencia(chamadas)

    await usuario.selectOptions(screen.getByTestId('payee-1'), '')

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    const chamadaImport = chamadas.find((c) =>
      c.url.includes('/transactions/import'),
    )
    const enviado = JSON.parse(chamadaImport!.body as string) as {
      rows: Array<{ imported_id: string; payee_id: string | null }>
    }
    const linhaUber = enviado.rows.find((r) => r.imported_id === 'FITID-2')
    expect(linhaUber?.payee_id).toBeNull()
  })

  test('confirmar envia só as linhas marcadas', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesExistentes: [{ imported_id: 'FITID-1' }],
    })
    const usuario = await irParaConferencia(chamadas)

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    const chamadaImport = chamadas.find((c) =>
      c.url.includes('/transactions/import'),
    )
    const enviado = JSON.parse(chamadaImport!.body as string) as {
      rows: unknown[]
    }
    expect(enviado.rows).toHaveLength(1)
  })

  test('o conteúdo bruto do arquivo nunca é enviado — só campos estruturados', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    const usuario = await irParaConferencia(chamadas)

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    expect(chamadas.length).toBeGreaterThan(0)
    for (const chamada of chamadas) {
      const corpo = chamada.body ?? ''
      // Marcadores que só existem no arquivo OFX BRUTO (cabeçalho SGML e
      // tags de agregação) — nunca deveriam aparecer em nenhum payload
      // estruturado que a tela monta.
      expect(corpo).not.toContain('OFXHEADER')
      expect(corpo).not.toContain('BANKTRANLIST')
      expect(corpo).not.toContain('STMTTRN')
      expect(corpo).not.toContain('DTPOSTED')
      expect(corpo).not.toContain('TRNAMT')
    }
  })

  test('lote grande mostra progresso visível entre os envios (nunca um spinner indeterminado)', async () => {
    const n = IMPORT_BATCH_SIZE * 2 + 20 // 3 lotes: cheio, cheio, parcial
    const texto = ofxComNTransacoes(n)
    const chamadas: Chamada[] = []
    const adiados: Array<() => void> = []

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input)
          const method = init?.method ?? 'GET'
          const body = init?.body as string | undefined
          chamadas.push({ url, method, body })

          if (url.includes('/api/accounts')) return respondJson(accounts)
          if (url.includes('/api/payees')) return respondJson(payees)
          if (url.includes('/api/categories')) return respondJson(categories)
          if (method === 'POST' && url.includes('/api/transactions/import')) {
            const rows = (JSON.parse(body as string) as { rows: unknown[] })
              .rows
            return new Promise((resolve) => {
              adiados.push(() =>
                resolve({
                  status: 201,
                  json: async () => ({
                    ok: true,
                    data: {
                      total: rows.length,
                      imported: rows.length,
                      skipped: 0,
                    },
                    notifications: [],
                  }),
                }),
              )
            })
          }
          if (url.includes('/api/transactions')) return respondJson([])
          throw new Error(`rota inesperada em teste: ${method} ${url}`)
        }),
    )

    render(<ImportarPage />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Importar' }),
      ).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()
    await usuario.upload(screen.getByLabelText(/Arquivo/i), arquivoOfx(texto))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )

    await waitFor(() => expect(adiados).toHaveLength(1))
    expect(screen.getByTestId('progresso')).toHaveTextContent(`0 de ${n}`)

    adiados[0]()
    await waitFor(() => expect(adiados).toHaveLength(2))
    expect(screen.getByTestId('progresso')).toHaveTextContent(
      `${IMPORT_BATCH_SIZE} de ${n}`,
    )

    adiados[1]()
    await waitFor(() => expect(adiados).toHaveLength(3))
    expect(screen.getByTestId('progresso')).toHaveTextContent(
      `${IMPORT_BATCH_SIZE * 2} de ${n}`,
    )

    adiados[2]()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('resultado-resumo')).toHaveTextContent(
      `${n} importadas`,
    )

    const chamadasImport = chamadas.filter((c) =>
      c.url.includes('/transactions/import'),
    )
    expect(chamadasImport).toHaveLength(3)
  })
})
