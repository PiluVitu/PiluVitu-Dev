import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
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

type Chamada = { url: string; method: string; body: string | undefined }

/**
 * Mock de `fetch` (não de `api`) — de propósito: só no nível de transporte
 * dá pra provar que o CONTEÚDO BRUTO do arquivo nunca é enviado (ver teste
 * dedicado abaixo). `chamadas` acumula toda requisição feita, pra inspeção.
 */
function mockRede(opts: {
  chamadas: Chamada[]
  // `purchase_date`/`amount_cents`/`description` são opcionais aqui só pra
  // não reescrever os fixtures antigos, que só se importam com o
  // `imported_id` — o payload REAL de `GET /api/transactions` sempre traz
  // as 20 colunas (`listTransactions` faz `SELECT` de todas). Os testes da
  // dedupe HEURÍSTICA preenchem os três, porque é sobre eles que ela decide.
  transacoesExistentes?: Array<{
    imported_id: string | null
    import_source?: string | null
    purchase_date?: string
    amount_cents?: number
    description?: string
  }>
  // Fatia ④ — conexão do Pluggy salva pra conta 'a1' (`settings`, chave
  // `pluggy:a1`). `undefined` = nenhuma conexão configurada ainda, que é o
  // estado da maioria dos testes deste arquivo.
  conexaoPluggySalva?: string
  // Resposta de `GET /api/pluggy/transactions`.
  pluggyResposta?: {
    linhas: unknown[]
    rejeitadas?: Array<{ index: number; id: string; motivo: string }>
  }
  pluggyErro?: { status: number; code: string; message: string }
  // `GET /api/settings/:key` caindo — a conexão do Pluggy é capacidade
  // OPCIONAL e não pode derrubar o import por arquivo.
  settingsFalha?: boolean
  // Lista que `GET /api/categories` devolve. O default e `categories`;
  // passar uma lista MENOR simula categoria arquivada (a rota filtra
  // `archived_at IS NULL`, entao arquivada some da resposta).
  categoriasVisiveis?: typeof categories
  resultadoImport?: (rows: unknown[]) => {
    total: number
    imported: number
    skipped: number
  }
  // Mapa de colunas já salvo pra conta 'a1' — simula uma importação
  // anterior daquele banco (GET /api/settings/:key devolve isso em vez de
  // `value: null`). `undefined` = nada salvo ainda (comportamento default).
  mapaImportSalvo?: string
  // Regras de categorização automática que `GET /api/rules` devolve.
  // Default: nenhuma — o comportamento pré-fatia (só `default_category_id`)
  // continua sendo o que a maioria dos testes deste arquivo exercita.
  regras?: unknown[]
  // `GET /api/rules` devolvendo 500 — o estado REAL de produção enquanto a
  // migration 0009 não é aplicada (ela é ação manual do dono). Ver o teste
  // dedicado abaixo.
  regrasFalha?: boolean
  // Segura `GET /api/rules` ate o teste liberar: simula a resposta
  // chegando DEPOIS de o dono escolher o arquivo — a janela silenciosa que
  // o `disabled` do input existe pra fechar.
  regrasAtraso?: Promise<void>
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
        if (url.includes('/api/rules')) {
          if (opts.regrasFalha)
            return respondErro(500, 'internal_error', 'erro interno')
          if (opts.regrasAtraso)
            return opts.regrasAtraso.then(() => respondJson(opts.regras ?? []))
          return respondJson(opts.regras ?? [])
        }
        if (url.includes('/api/categories'))
          return respondJson(opts.categoriasVisiveis ?? categories)
        if (method === 'POST' && url.includes('/api/transactions/import')) {
          const rows = (
            body ? (JSON.parse(body) as { rows: unknown[] }) : { rows: [] }
          ).rows
          const resultado = opts.resultadoImport
            ? opts.resultadoImport(rows)
            : { total: rows.length, imported: rows.length, skipped: 0 }
          return respondJson(resultado, 201)
        }
        // Mapa de colunas — GET|PUT /api/settings/:key (backend genérico,
        // não localStorage). PUT ecoa o value enviado; GET devolve o mapa
        // pré-semeado pra este teste (ou null, se nenhum foi passado).
        if (url.includes('/api/pluggy/transactions')) {
          if (opts.pluggyErro) {
            return respondErro(
              opts.pluggyErro.status,
              opts.pluggyErro.code,
              opts.pluggyErro.message,
            )
          }
          const r = opts.pluggyResposta ?? { linhas: [] }
          return respondJson({
            account_id: 'pluggy-acc',
            item_id: 'pluggy-item',
            from: '2026-07-19',
            to: '2026-08-19',
            paginas: 1,
            recebidas: r.linhas.length + (r.rejeitadas?.length ?? 0),
            linhas: r.linhas,
            rejeitadas: r.rejeitadas ?? [],
          })
        }
        if (url.includes('/api/settings/')) {
          const key = decodeURIComponent(url.split('/api/settings/')[1])
          if (opts.settingsFalha)
            return respondErro(500, 'internal_error', 'erro interno')
          if (method === 'PUT') {
            const parsed = body
              ? (JSON.parse(body) as { value: string })
              : { value: '' }
            // O GET seguinte (a recarga de `mutarERecarregar`) precisa ler o
            // que acabou de ser gravado — senão a tela nunca sairia do
            // formulário e o teste passaria por um motivo errado.
            if (key.startsWith('pluggy:'))
              opts.conexaoPluggySalva = parsed.value
            return respondJson({ key, value: parsed.value })
          }
          if (key.startsWith('pluggy:')) {
            return respondJson({ key, value: opts.conexaoPluggySalva ?? null })
          }
          return respondJson({ key, value: opts.mapaImportSalvo ?? null })
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
})

async function irParaConferencia(chamadas: Chamada[]) {
  render(<ImportarPage />)
  await waitFor(() =>
    expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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

    // Salvo via PUT /api/settings/:key (backend genérico), não localStorage
    // — dois dispositivos (Android pra lançar, MacBook pra revisar)
    // precisam ver o MESMO mapa.
    const chamadaPut = chamadas.find(
      (c) => c.method === 'PUT' && c.url.includes('/api/settings/'),
    )
    expect(chamadaPut).toBeDefined()
    expect(chamadaPut!.url).toBe('/api/settings/import_map%3Aa1')
    expect(JSON.parse(chamadaPut!.body as string)).toEqual({
      value: JSON.stringify({
        data: 0,
        valor: 1,
        descricao: 2,
        temCabecalho: false,
      }),
    })
  })

  test('mapa já salvo pra conta (backend) pula a etapa de mapeamento na próxima importação', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      mapaImportSalvo: JSON.stringify({
        data: 0,
        valor: 1,
        descricao: 2,
        temCabecalho: false,
      }),
    })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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

  test('categoria default ARQUIVADA não é sugerida nem enviada em silêncio', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      // `GET /api/categories` filtra `archived_at IS NULL`, então uma
      // categoria arquivada simplesmente NÃO vem na lista — mas o
      // `payees.default_category_id` de p1 continua apontando pra ela
      // (nada atualiza esse campo quando a categoria é arquivada).
      categoriasVisiveis: [
        {
          id: 'c-transporte',
          name: 'Transporte',
          kind: 'expense',
          slug: 'transporte',
        },
      ],
    })
    const usuario = await irParaConferencia(chamadas)

    // ⚠️ O `<select>` sempre mostraria vazio (o id não casa com nenhuma
    // `<option>`). A asserção que importa é a de BAIXO: o que vai no envio.
    expect(screen.getByTestId('categoria-0')).toHaveValue('')

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    const envio = chamadas.find((c) =>
      c.url.includes('/api/transactions/import'),
    )
    const corpo = JSON.parse(String(envio?.body)) as {
      rows: Array<{ category_id: string | null }>
    }
    // Antes do conserto, o id arquivado ia daqui e o lançamento nascia com
    // uma categoria que nenhuma tela lista — invisível no relatório, sem
    // erro nenhum.
    expect(corpo.rows[0].category_id).toBeNull()
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
    // ⑤ O aviso de duplicata virou badge do design system + a instrução em
    // texto ao lado — o rótulo curto é o que se lê de relance, a frase
    // continua dizendo o que fazer.
    expect(within(linha0).getByText('Já importada')).toHaveClass('inline-flex')
    expect(within(linha0).getByTestId('duplicada-0')).toHaveTextContent(
      'Marque para forçar',
    )
    expect(
      within(linha0).getByRole('checkbox', { name: /\d{2}\/\d{2}\/\d{4}/ }),
    ).not.toBeChecked()

    const linha1 = screen.getByTestId('linha-1')
    expect(within(linha1).queryByTestId('duplicada-1')).not.toBeInTheDocument()
    expect(
      within(linha1).getByRole('checkbox', { name: /\d{2}\/\d{2}\/\d{4}/ }),
    ).toBeChecked()

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
    await usuario.click(
      within(linha0).getByRole('checkbox', { name: /\d{2}\/\d{2}\/\d{4}/ }),
    )
    expect(
      within(linha0).getByRole('checkbox', { name: /\d{2}\/\d{2}\/\d{4}/ }),
    ).toBeChecked()

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
          if (url.includes('/api/rules')) return respondJson([])
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
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
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

  // Duas linhas com o MESMO FITID no MESMO arquivo — a limitação do hash
  // (spec §5), reproduzida por duas transações com id-base idêntico (não
  // precisa ser CSV/hash pra isso acontecer: FITID duplicado no próprio
  // extrato do banco é o mesmo defeito). Antes da disambiguação por
  // posição (`ocorrencia`), as duas chegariam ao servidor com o MESMO
  // imported_id e a segunda seria descartada em silêncio pelo dedupe
  // intra-requisição do backend — mesmo com as duas marcadas, mesmo sem
  // nenhuma delas aparecer como "duplicada" na tela (nada no `existentes`
  // do servidor bateria, porque nenhuma das duas tinha sido importada
  // antes). Este teste prova que as duas nascem como ids DISTINTOS desde a
  // montagem da conferência.
  test('duas linhas com o mesmo id-base no mesmo arquivo recebem ids distintos e as duas importam', async () => {
    const OFX_MESMO_FITID = `<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260710120000[-3:BRT]
<TRNAMT>-8.00
<FITID>FITID-DUP
<MEMO>Cafe 1
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260710120000[-3:BRT]
<TRNAMT>-8.00
<FITID>FITID-DUP
<MEMO>Cafe 2
</STMTTRN>
</BANKTRANLIST>
</OFX>`
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoOfx(OFX_MESMO_FITID),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )

    // Nenhuma das duas aparece como duplicata — nem uma da outra.
    expect(screen.queryByTestId('duplicada-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('duplicada-1')).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('linha-0')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).toBeChecked()
    expect(
      within(screen.getByTestId('linha-1')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).toBeChecked()

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
    const ids = enviado.rows.map((r) => r.imported_id)
    expect(new Set(ids).size).toBe(2) // os dois ids são DISTINTOS
    expect(ids).toContain('FITID-DUP')
  })

  // O teste que o review pediu explicitamente: forçar uma duplicata, depois
  // reimportar o MESMO arquivo e forçar a MESMA linha de novo (o dono
  // esquecendo que já tinha forçado, ou reimportando o extrato sem
  // querer) NÃO pode criar uma terceira linha. Prova tanto o efeito
  // (contagem de linhas no "servidor" simulado não cresce na 2ª rodada)
  // quanto a causa (o imported_id enviado é BYTE A BYTE o mesmo nas duas
  // rodadas — a determinismo que sustenta o dedupe do backend reconhecer a
  // segunda força como já vista).
  test('forçar a mesma duplicata em duas importações do mesmo arquivo não faz o total de linhas crescer', async () => {
    // Servidor simulado com estado real (não só respostas fixas): começa
    // com FITID-1 já importado (de uma sessão anterior, fora deste teste).
    const idsNoServidor = new Set<string>(['FITID-1'])
    const chamadas: Chamada[] = []

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
          if (url.includes('/api/rules')) return respondJson([])
          if (url.includes('/api/categories')) return respondJson(categories)
          if (method === 'POST' && url.includes('/api/transactions/import')) {
            const rows = (
              JSON.parse(body as string) as {
                rows: Array<{ imported_id: string }>
              }
            ).rows
            let imported = 0
            let skipped = 0
            for (const row of rows) {
              if (idsNoServidor.has(row.imported_id)) {
                skipped++
                continue
              }
              idsNoServidor.add(row.imported_id)
              imported++
            }
            return respondJson({ total: rows.length, imported, skipped }, 201)
          }
          if (url.includes('/api/transactions')) {
            return respondJson(
              [...idsNoServidor].map((id) => ({ imported_id: id })),
            )
          }
          throw new Error(`rota inesperada em teste: ${method} ${url}`)
        }),
    )

    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()

    // Rodada 1: FITID-1 já existe (duplicata) — força; FITID-2 é novo.
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoOfx(OFX_DUAS_LINHAS),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      within(screen.getByTestId('linha-0')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    )
    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    // FITID-1 (já existia) + FITID-2 (importada) + FITID-1:forcado (forçada).
    expect(idsNoServidor.size).toBe(3)

    // Reinicia e reimporta o MESMO arquivo — cenário do review: reimportar
    // por engano, ou esquecer que a duplicata já tinha sido forçada.
    await usuario.click(
      screen.getByRole('button', { name: /Nova importação/i }),
    )
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoOfx(OFX_DUAS_LINHAS),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )

    // As DUAS linhas agora batem contra algo já existente no servidor
    // (FITID-1 da rodada 1, FITID-2 REALMENTE importada na rodada 1) — as
    // duas vêm desmarcadas por padrão.
    expect(
      within(screen.getByTestId('linha-0')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).not.toBeChecked()
    expect(
      within(screen.getByTestId('linha-1')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).not.toBeChecked()

    // Força a linha 0 DE NOVO — sem tocar na linha 1.
    await usuario.click(
      within(screen.getByTestId('linha-0')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    )
    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    // Nada novo entrou — o total de ids no "servidor" não cresceu.
    expect(idsNoServidor.size).toBe(3)
    expect(screen.getByTestId('resultado-resumo')).toHaveTextContent(
      '0 importadas',
    )
    expect(screen.getByTestId('resultado-resumo')).toHaveTextContent(
      '1 já existiam',
    )

    // E a CAUSA da não-duplicação: o imported_id enviado pro campo forçado
    // é byte a byte o MESMO nas duas rodadas.
    const chamadasImport = chamadas.filter(
      (c) => c.method === 'POST' && c.url.includes('/transactions/import'),
    )
    expect(chamadasImport).toHaveLength(2)
    const idForcado = (rodada: number) =>
      (
        JSON.parse(chamadasImport[rodada].body as string) as {
          rows: Array<{ imported_id: string }>
        }
      ).rows.find((r) => r.imported_id.startsWith('FITID-1'))!.imported_id
    expect(idForcado(1)).toBe(idForcado(0))
  })
})

// Task 6 (docs/superpowers/specs/2026-07-27-financas-import-design.md, §10):
// a prova de ponta a ponta que sustenta a fatia inteira. Não é mais um
// cenário isolado — é o fluxo COMPLETO: parseia um OFX real (formato SGML de
// banco de verdade, TRNTYPE/DTPOSTED/TRNAMT/FITID/MEMO), confirma pela tela
// de verdade, os lançamentos aparecem no "banco" — e reimportar O MESMO
// ARQUIVO, byte a byte, não cria linha nova.
//
// O "banco" simulado (`tabelaTransactions`) não é um Set de ids: é um array
// de linhas completas, com a MESMA regra de dedupe em CÓDIGO DE APLICAÇÃO
// que `importTransactions` (`src/domain/import.ts`) usa de verdade —
// filtra por `imported_id` já existente NAQUELA conta antes de inserir,
// nunca dependendo de um índice único pra barrar (`db.batch()` reverteria a
// sequência inteira se um INSERT multi-row violasse UNIQUE no meio). Só a
// REDE é mockada (fetch) — `parseOfx`, `prepararConferencia`,
// `enviarConfirmadas` e o dedupe do "servidor" rodam de verdade.
describe('ImportarPage — Task 6: ponta a ponta (spec §10)', () => {
  const OFX_E2E = `<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260705120000[-3:BRT]
<TRNAMT>-58.30
<FITID>E2E-FITID-1
<MEMO>Supermercado Extra
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260706120000[-3:BRT]
<TRNAMT>-120.00
<FITID>E2E-FITID-2
<MEMO>Posto Ipiranga
</STMTTRN>
</BANKTRANLIST>
</OFX>`

  type LinhaTabela = {
    imported_id: string
    purchase_date: string
    amount_cents: number
    description: string
  }

  function montarBancoSimulado(chamadas: Chamada[]) {
    const tabelaTransactions: LinhaTabela[] = []

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
          if (url.includes('/api/rules')) return respondJson([])
          if (url.includes('/api/categories')) return respondJson(categories)
          if (method === 'POST' && url.includes('/api/transactions/import')) {
            const parsed = JSON.parse(body as string) as {
              rows: LinhaTabela[]
            }
            // MESMA regra de `importTransactions`: dedupe por imported_id
            // já visto NAQUELA "conta" (aqui só existe uma), verificado
            // ANTES de inserir — nunca um índice único fazendo esse
            // trabalho por trás.
            const jaVistos = new Set(
              tabelaTransactions.map((t) => t.imported_id),
            )
            let imported = 0
            let skipped = 0
            for (const row of parsed.rows) {
              if (jaVistos.has(row.imported_id)) {
                skipped++
                continue
              }
              tabelaTransactions.push({
                imported_id: row.imported_id,
                purchase_date: row.purchase_date,
                amount_cents: row.amount_cents,
                description: row.description,
              })
              jaVistos.add(row.imported_id)
              imported++
            }
            return respondJson(
              { total: parsed.rows.length, imported, skipped },
              201,
            )
          }
          if (url.includes('/api/transactions')) {
            return respondJson(
              tabelaTransactions.map((t) => ({ imported_id: t.imported_id })),
            )
          }
          throw new Error(`rota inesperada em teste: ${method} ${url}`)
        }),
    )

    return tabelaTransactions
  }

  test('parseia um OFX real, confirma, os lançamentos aparecem — e reimportar o MESMO arquivo não cria linha nova', async () => {
    const chamadas: Chamada[] = []
    const tabelaTransactions = montarBancoSimulado(chamadas)

    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
    )
    const usuario = userEvent.setup()

    // RODADA 1 — banco vazio, arquivo novo.
    expect(tabelaTransactions).toHaveLength(0)

    await usuario.upload(screen.getByLabelText(/Arquivo/i), arquivoOfx(OFX_E2E))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )

    // Banco vazio ⇒ nenhuma linha é duplicata, as duas nascem marcadas.
    expect(screen.queryByTestId('duplicada-0')).not.toBeInTheDocument()
    expect(screen.queryByTestId('duplicada-1')).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('linha-0')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).toBeChecked()
    expect(
      within(screen.getByTestId('linha-1')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).toBeChecked()

    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('resultado-resumo')).toHaveTextContent(
      '2 importadas, 0 já existiam',
    )

    // "Os lançamentos aparecem": dado ESTRUTURADO correto no "banco" — não
    // só a contagem, os valores que o parser de verdade extraiu do OFX.
    expect(tabelaTransactions).toHaveLength(2)
    expect(tabelaTransactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          imported_id: 'E2E-FITID-1',
          purchase_date: '2026-07-05',
          amount_cents: -5830,
          description: expect.stringContaining('Supermercado Extra'),
        }),
        expect.objectContaining({
          imported_id: 'E2E-FITID-2',
          purchase_date: '2026-07-06',
          amount_cents: -12000,
          description: expect.stringContaining('Posto Ipiranga'),
        }),
      ]),
    )

    const antesDaReimportacao = tabelaTransactions.length // 2

    // RODADA 2 — reimporta O MESMO ARQUIVO, byte a byte (o cenário real: o
    // dono baixa o extrato de novo e importa sem lembrar que já importou).
    await usuario.click(
      screen.getByRole('button', { name: /Nova importação/i }),
    )
    await usuario.upload(screen.getByLabelText(/Arquivo/i), arquivoOfx(OFX_E2E))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )

    // As DUAS linhas agora batem contra o que está no "banco" — duplicatas,
    // desmarcadas por padrão.
    expect(screen.getByTestId('duplicada-0')).toBeInTheDocument()
    expect(screen.getByTestId('duplicada-1')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('linha-0')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).not.toBeChecked()
    expect(
      within(screen.getByTestId('linha-1')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).not.toBeChecked()

    // Nada marcado ⇒ o botão fica desabilitado — a tela real nem deixa
    // reenviar por acidente (não é só que o servidor pularia).
    expect(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    ).toBeDisabled()

    // A PROVA do slice inteiro (spec §10: "Importar o mesmo arquivo duas
    // vezes não cria linha nova — provado contando transactions antes e
    // depois"): a contagem antes da rodada 2 e depois dela é a MESMA.
    expect(tabelaTransactions).toHaveLength(antesDaReimportacao) // 2 antes, 2 depois — nada mudou
  })
})

// Task 2 (fatia ⑨ — UI/UX): o dono foi procurar import de PDF nesta tela e
// não achou (o CLI existe, `scripts/pdf-import.mjs`, mas a tela nunca
// mencionava). A dúvida concreta dele foi "preciso deixar um servidor
// ligado no PC?" — a tela precisa responder isso, não só citar o comando.
describe('ImportarPage — PDF: a tela explica o caminho (Task 2, fatia ⑨)', () => {
  test('explica o comando do CLI, diz que nenhum servidor precisa ficar ligado, e não promete botão', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
    )

    // O comando exato, citado por extenso — não só "existe um CLI".
    expect(
      screen.getByText(
        /node apps\/financas\/scripts\/pdf-import\.mjs fatura\.pdf/,
      ),
    ).toBeInTheDocument()

    // A dúvida literal do dono: precisa de servidor ligado? Resposta tem
    // que estar na tela, não só num doc.
    expect(
      screen.getByText(/nenhum servidor precisa (estar|ficar) ligado/i),
    ).toBeInTheDocument()

    // Explica por que é comando e não botão (Ollama exige GPU/Metal, sem
    // instance type de Containers com GPU) — não deixa a decisão muda.
    expect(screen.getByText(/GPU|Metal/)).toBeInTheDocument()

    // Diz que o CSV gerado entra pela mesma tela.
    expect(screen.getAllByText(/csv/i).length).toBeGreaterThan(0)
  })

  test('não promete botão que não existe: o input de arquivo continua sem aceitar .pdf', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
    )

    const input = screen.getByLabelText(/Arquivo/i)
    expect(input).toHaveAttribute('accept', '.ofx,.qfx,.csv')
    expect(input.getAttribute('accept')).not.toMatch(/pdf/i)
  })
})

// ---------------------------------------------------------------------------
// Categorização automática por REGRA (fase 1) — a sugestão passa a vir das
// regras E do `payees.default_category_id`.
// ---------------------------------------------------------------------------

type RegraDeTeste = {
  id: string
  name: string
  match_text: string | null
  match_account_id: string | null
  match_min_cents: number | null
  match_max_cents: number | null
  match_direction: 'expense' | 'income' | null
  set_category_id: string | null
  set_payee_id: string | null
  set_is_business: number | null
  priority: number
  active: number
  created_at: string
  updated_at: string
}

function regra(patch: Partial<RegraDeTeste> = {}): RegraDeTeste {
  return {
    id: 'r1',
    name: 'regra',
    match_text: null,
    match_account_id: null,
    match_min_cents: null,
    match_max_cents: null,
    match_direction: null,
    set_category_id: null,
    set_payee_id: null,
    set_is_business: null,
    priority: 100,
    active: 1,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...patch,
  }
}

async function confirmarELerRows(
  usuario: ReturnType<typeof userEvent.setup>,
  chamadas: Chamada[],
) {
  await usuario.click(
    screen.getByRole('button', { name: /Confirmar importação/i }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: /Importação concluída/i }),
    ).toBeInTheDocument(),
  )
  const envio = chamadas.find((c) => c.url.includes('/api/transactions/import'))
  return (
    JSON.parse(String(envio?.body)) as {
      rows: Array<{
        category_id: string | null
        payee_id: string | null
        is_business: number
      }>
    }
  ).rows
}

describe('ImportarPage — regras de categorização', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('⚠️ quando a regra e o default do favorecido DISCORDAM, a regra vence', async () => {
    // Linha 0 é "Padaria X PagSeguro": o payee p1 casa e o
    // `default_category_id` dele é 'c-alimentacao'. A regra manda
    // 'c-transporte'. Se o default vencesse, uma regra JAMAIS conseguiria
    // corrigir um favorecido já cadastrado.
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regras: [
        regra({
          name: 'Padaria → Transporte',
          match_text: 'padaria',
          set_category_id: 'c-transporte',
        }),
      ],
    })
    const usuario = await irParaConferencia(chamadas)

    expect(screen.getByTestId('categoria-0')).toHaveValue('c-transporte')
    // A linha que a regra não tocou continua no default de sempre.
    expect(screen.getByTestId('categoria-1')).toHaveValue('')

    const rows = await confirmarELerRows(usuario, chamadas)
    expect(rows[0].category_id).toBe('c-transporte')
  })

  test('a tela diz POR QUE a linha foi categorizada, nomeando a regra', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regras: [
        regra({
          name: 'Padaria → Transporte',
          match_text: 'padaria',
          set_category_id: 'c-transporte',
        }),
      ],
    })
    await irParaConferencia(chamadas)

    expect(screen.getByTestId('regras-0')).toHaveTextContent(
      'Sugerido pela regra "Padaria → Transporte"',
    )
    // Linha que nenhuma regra tocou não ganha explicação nenhuma.
    expect(screen.queryByTestId('regras-1')).not.toBeInTheDocument()
  })

  test('duas regras em conflito: a tela mostra a ORDEM, não só o vencedor', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regras: [
        regra({
          id: 'a',
          name: 'Padaria',
          priority: 100,
          match_text: 'padaria',
          set_category_id: 'c-alimentacao',
        }),
        regra({
          id: 'b',
          name: 'PagSeguro',
          priority: 200,
          match_text: 'pagseguro',
          set_category_id: 'c-transporte',
        }),
      ],
    })
    await irParaConferencia(chamadas)

    expect(screen.getByTestId('categoria-0')).toHaveValue('c-transporte')
    expect(screen.getByTestId('regras-0')).toHaveTextContent(
      'Padaria → PagSeguro',
    )
  })

  test('regra PAUSADA não sugere nada', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regras: [
        regra({
          match_text: 'padaria',
          set_category_id: 'c-transporte',
          active: 0,
        }),
      ],
    })
    await irParaConferencia(chamadas)
    expect(screen.getByTestId('categoria-0')).toHaveValue('c-alimentacao')
  })

  test('⚠️ regra apontando pra categoria ARQUIVADA não é enviada em silêncio, e a tela AVISA', async () => {
    // O mesmo defeito de 6ba822c, agora pelo caminho novo. `GET
    // /api/categories` esconde arquivada, mas `rules.set_category_id`
    // continua apontando pra ela (a FK só dispara em DELETE, e arquivar não
    // é DELETE).
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      categoriasVisiveis: [
        {
          id: 'c-transporte',
          name: 'Transporte',
          kind: 'expense',
          slug: 'transporte',
        },
      ],
      regras: [
        regra({
          name: 'Uber → arquivada',
          match_text: 'uber',
          set_category_id: 'c-alimentacao',
        }),
      ],
    })
    const usuario = await irParaConferencia(chamadas)

    expect(screen.getByTestId('categoria-1')).toHaveValue('')
    // "A regra não casou" e "a regra casou e a categoria dela sumiu" deixam
    // a mesma tela por motivos opostos — só um dos dois pede ação.
    expect(screen.getByTestId('sugestao-descartada-1')).toBeInTheDocument()

    const rows = await confirmarELerRows(usuario, chamadas)
    expect(rows[1].category_id).toBeNull()
  })

  test('regra marca PJ: o checkbox nasce marcado e o envio leva is_business 1', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regras: [
        regra({
          name: 'Padaria é PJ',
          match_text: 'padaria',
          set_is_business: 1,
        }),
      ],
    })
    const usuario = await irParaConferencia(chamadas)

    expect(screen.getByTestId('pj-0')).toBeChecked()
    expect(screen.getByTestId('pj-1')).not.toBeChecked()

    const rows = await confirmarELerRows(usuario, chamadas)
    expect(rows[0].is_business).toBe(1)
    expect(rows[1].is_business).toBe(0)
  })

  test('⚠️ o PJ sugerido por regra CONTINUA sendo sugestão — desmarcar chega ao servidor', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regras: [regra({ match_text: 'padaria', set_is_business: 1 })],
    })
    const usuario = await irParaConferencia(chamadas)

    await usuario.click(screen.getByTestId('pj-0'))
    expect(screen.getByTestId('pj-0')).not.toBeChecked()

    const rows = await confirmarELerRows(usuario, chamadas)
    expect(rows[0].is_business).toBe(0)
  })

  test('sem regra nenhuma, o comportamento é o de antes — e is_business vai explícito', async () => {
    // Antes desta fatia a chave nunca era enviada e TODA linha importada
    // nascia PF por omissão. Agora ela vai sempre, com o valor que a tela
    // mostra.
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    const usuario = await irParaConferencia(chamadas)

    expect(screen.getByTestId('categoria-0')).toHaveValue('c-alimentacao')
    const rows = await confirmarELerRows(usuario, chamadas)
    expect(rows[0].is_business).toBe(0)
    expect(rows[0].category_id).toBe('c-alimentacao')
  })

  test('regra por FAIXA de valor casa pela magnitude, não pelo sinal', async () => {
    // -45,90 (linha 0) e -12,50 (linha 1). Faixa 2000..9999 centavos pega
    // só a primeira — com o valor cru (negativo), não pegaria nenhuma.
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regras: [
        regra({
          name: 'Gasto médio',
          match_min_cents: 2000,
          match_max_cents: 9999,
          set_category_id: 'c-transporte',
        }),
      ],
    })
    await irParaConferencia(chamadas)

    expect(screen.getByTestId('categoria-0')).toHaveValue('c-transporte')
    expect(screen.getByTestId('categoria-1')).toHaveValue('')
  })
  test('⚠️ regras que ainda NÃO chegaram travam o arquivo — nunca sugerem calado', async () => {
    // Regressão introduzida pelo próprio fix que tirou `/api/rules` do
    // `Promise.all`: antes, o `await` garantia a ordem de brinde. Depois,
    // MEDIDO com a resposta chegando 3 s tarde, existia uma janela em que a
    // tela parecia pronta, o dono escolhia o arquivo, e a conferência era
    // montada SEM regra nenhuma e SEM alerta — sugerindo a categoria do
    // favorecido em vez da da regra, em silêncio.
    let liberar!: () => void
    const atraso = new Promise<void>((r) => {
      liberar = r
    })
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      regrasAtraso: atraso,
      regras: [
        regra({ match_text: 'PADARIA', set_category_id: 'c-transporte' }),
      ],
    })
    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
    )

    // A tela está de pé, MAS o arquivo não aceita nada ainda — e diz por quê.
    expect(screen.getByLabelText(/Arquivo/i)).toBeDisabled()
    expect(screen.getByTestId('regras-carregando')).toBeInTheDocument()

    liberar()
    await waitFor(() => expect(screen.getByLabelText(/Arquivo/i)).toBeEnabled())
    expect(screen.queryByTestId('regras-carregando')).not.toBeInTheDocument()

    // E agora a regra de fato vale: a sugestão vem dela, não do favorecido.
    const usuario = userEvent.setup()
    await usuario.upload(
      screen.getByLabelText(/Arquivo/i),
      arquivoOfx(OFX_DUAS_LINHAS),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('categoria-0')).toHaveValue('c-transporte')
  })

  test('⚠️ /api/rules FORA DO AR não derruba a tela — import não precisa de regra', async () => {
    // MEDIDO em Chrome real com `/api/rules` devolvendo 500: `#/importar`
    // renderizava **só** um `<p role="alert">erro interno</p>` — sem `<h1>`,
    // sem select de conta, sem input de arquivo. E é alcançável AGORA: a
    // migration `0009` (que cria a tabela `rules`) é ação MANUAL do dono, e
    // publicar o Worker antes dela faz `GET /api/rules` 500ar — derrubando
    // uma tela que hoje funciona. Mesma classe de defeito do achado C2 (a
    // tabela `settings` ausente 500ava TRÊS telas).
    const chamadas: Chamada[] = []
    mockRede({ chamadas, regrasFalha: true })
    const usuario = await irParaConferencia(chamadas)

    // A tela chegou inteira até a conferência, e a sugestão degradou pro
    // `payees.default_category_id` — que é como o import funcionava ANTES
    // das regras existirem. Degradado, não morto.
    expect(screen.getByTestId('categoria-0')).toHaveValue('c-alimentacao')
    expect(screen.queryByTestId('regras-0')).not.toBeInTheDocument()

    // Degradar não é engolir: a tela DIZ que as sugestões vieram sem regras.
    expect(screen.getByTestId('regras-indisponiveis')).toHaveTextContent(
      /sugest(õ|o)es v(ê|e)m s(ó|o) do favorecido/i,
    )

    // E confirmar continua funcionando de ponta a ponta.
    const rows = await confirmarELerRows(usuario, chamadas)
    expect(rows).toHaveLength(2)
    expect(rows[0].category_id).toBe('c-alimentacao')
  })

  test('com as regras NO AR, o aviso de indisponível não aparece', async () => {
    // Controle positivo: sem ele, um aviso renderizado SEMPRE passaria acima.
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    await irParaConferencia(chamadas)
    expect(screen.queryByTestId('regras-indisponiveis')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Fatia ④ — Pluggy como TERCEIRA ORIGEM do mesmo pipeline.
//
// ⚠️ Relógio FIXO no describe inteiro (`toFake: ['Date']`, nunca
// `useFakeTimers()` puro — `waitFor`/`userEvent` dependem de `setTimeout`
// real por baixo): a janela default é calculada a partir de HOJE, e sem
// fixar o relógio o teste do "um mês, não doze" viraria uma bomba de
// calendário.
// ---------------------------------------------------------------------------
describe('ImportarPage — Pluggy (fatia ④)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-19T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const CONEXAO = JSON.stringify({
    item_id: 'item-do-nubank',
    account_id: 'conta-do-nubank',
  })

  const LINHA_COMPRA = {
    imported_id: 'pluggy-tx-1',
    purchase_date: '2026-08-15',
    amount_cents: -18990,
    description: 'Mercado',
  }

  async function abrir() {
    render(<ImportarPage />)
    await waitFor(() =>
      expect(screen.getByTestId('pagina-importar')).toBeInTheDocument(),
    )
    return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  }

  test('sem conexão salva mostra o formulário, não o botão de sincronizar', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    await abrir()

    await waitFor(() =>
      expect(
        screen.getByLabelText(/Id da conta no Pluggy/),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Sincronizar com o banco' }),
    ).not.toBeInTheDocument()
  })

  test('salvar a conexão grava na chave da conta e libera o botão', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByLabelText(/Id da conta no Pluggy/),
      ).toBeInTheDocument(),
    )
    await usuario.type(
      screen.getByLabelText(/Id da conexão \(item\)/),
      'item-do-nubank',
    )
    await usuario.type(
      screen.getByLabelText(/Id da conta no Pluggy/),
      'conta-do-nubank',
    )
    await usuario.click(screen.getByRole('button', { name: 'Salvar conexão' }))

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    const put = chamadas.find(
      (c) => c.method === 'PUT' && c.url.includes('pluggy'),
    )
    expect(put?.url).toContain('/api/settings/pluggy%3Aa1')
    expect(JSON.parse(put?.body ?? '{}')).toEqual({ value: CONEXAO })
  })

  test('o período nasce com UM MÊS, nunca com os 12 que o banco guarda', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, conexaoPluggySalva: CONEXAO })
    await abrir()

    await waitFor(() => expect(screen.getByLabelText('De')).toBeInTheDocument())
    expect(screen.getByLabelText('De')).toHaveValue('2026-07-19')
    expect(screen.getByLabelText('Até')).toHaveValue('2026-08-19')
  })

  test('sincronizar manda conta, conexão e janela — e cai na MESMA conferência do arquivo', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyResposta: { linhas: [LINHA_COMPRA] },
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )

    const params = new URLSearchParams(
      (
        chamadas.find((c) => c.url.includes('/api/pluggy/transactions'))?.url ??
        ''
      ).split('?')[1],
    )
    expect(params.get('account_id')).toBe('conta-do-nubank')
    expect(params.get('item_id')).toBe('item-do-nubank')
    expect(params.get('from')).toBe('2026-07-19')
    expect(params.get('to')).toBe('2026-08-19')

    // A linha chega na conferência com o VALOR e o SINAL que o servidor
    // mapeou — e é justamente isso que o dono precisa poder conferir.
    expect(screen.getByText('Mercado')).toBeInTheDocument()
    expect(screen.getByText('-R$ 189,90')).toBeInTheDocument()
    expect(screen.getByText('15/08/2026')).toBeInTheDocument()
    // Todo o resto do pipeline continua: checkbox por linha, selects de
    // payee/categoria.
    expect(screen.getByTestId('payee-0')).toBeInTheDocument()
  })

  test('o envio usa import_source "pluggy" (o CHECK do schema já aceitava)', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyResposta: { linhas: [LINHA_COMPRA] },
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/ }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('resultado-resumo')).toBeInTheDocument(),
    )
    const envio = chamadas.find((c) =>
      c.url.includes('/api/transactions/import'),
    )
    const corpo = JSON.parse(envio?.body ?? '{}') as {
      import_source: string
      account_id: string
      rows: Array<{ imported_id: string; amount_cents: number }>
    }
    expect(corpo.import_source).toBe('pluggy')
    expect(corpo.account_id).toBe('a1')
    expect(corpo.rows[0]).toMatchObject({
      imported_id: 'pluggy-tx-1',
      amount_cents: -18990,
    })
  })

  test('PRIMEIRA importação pelo banco avisa sobre sinal e data', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyResposta: { linhas: [LINHA_COMPRA] },
      // Já existe histórico na conta, mas NADA vindo do Pluggy.
      transacoesExistentes: [
        { imported_id: 'FITID-antigo', import_source: 'ofx' },
      ],
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )

    const aviso = await screen.findByTestId('pluggy-primeiro-import')
    expect(aviso).toHaveTextContent(/sinal/)
    expect(aviso).toHaveTextContent(/data/)
  })

  test('a partir da SEGUNDA o aviso some sozinho — sem botão de dispensar, sem flag', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyResposta: { linhas: [LINHA_COMPRA] },
      transacoesExistentes: [
        { imported_id: 'pluggy-tx-antiga', import_source: 'pluggy' },
      ],
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Conferir importação' }),
      ).toBeInTheDocument(),
    )

    expect(
      screen.queryByTestId('pluggy-primeiro-import'),
    ).not.toBeInTheDocument()
  })

  test('o aviso NÃO aparece numa importação por arquivo (é do Pluggy, não da tela)', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    await irParaConferencia(chamadas)

    expect(
      screen.queryByTestId('pluggy-primeiro-import'),
    ).not.toBeInTheDocument()
  })

  test('a fatura aberta que ficou de fora aparece COM MOTIVO, nunca sucesso mudo', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyResposta: {
        linhas: [LINHA_COMPRA],
        rejeitadas: [
          {
            index: 1,
            id: 'pluggy-tx-2',
            motivo:
              'status PENDING — só POSTED é importado. Num cartão isso é a fatura ainda aberta.',
          },
        ],
      },
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )

    const bloco = await screen.findByTestId('pluggy-rejeitadas')
    expect(bloco).toHaveTextContent(/1 lançamento\(s\)/)
    expect(bloco).toHaveTextContent(/fatura ainda aberta/)
  })

  test('conexão caída: mensagem do servidor + a dica que nomeia o app Meu Pluggy', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyErro: {
        status: 409,
        code: 'pluggy_item_disconnected',
        message:
          'a conexão com o banco caiu e o Pluggy está pedindo autenticação de novo.',
      },
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )

    const erro = await screen.findByTestId('pluggy-erro')
    expect(erro).toHaveTextContent(/a conexão com o banco caiu/)
    expect(screen.getByTestId('pluggy-dica')).toHaveTextContent(/Meu Pluggy/)
    // A tela NÃO cai: o import por arquivo continua alcançável.
    expect(screen.getByLabelText(/Arquivo/i)).toBeInTheDocument()
  })

  test('desligado ≠ conexão caída: a dica fala dos secrets e não manda reconectar', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyErro: {
        status: 503,
        code: 'pluggy_disabled',
        message: 'A sincronização com o Pluggy está desligada.',
      },
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )

    const dica = await screen.findByTestId('pluggy-dica')
    expect(dica).toHaveTextContent(/PLUGGY_CLIENT_ID/)
    expect(dica).not.toHaveTextContent(/Meu Pluggy/)
  })

  test('janela invertida é barrada no cliente, sem gastar requisição', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, conexaoPluggySalva: CONEXAO })
    const usuario = await abrir()

    await waitFor(() => expect(screen.getByLabelText('De')).toBeInTheDocument())
    await usuario.clear(screen.getByLabelText('De'))
    await usuario.type(screen.getByLabelText('De'), '2026-08-31')
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )

    expect(await screen.findByTestId('pluggy-erro')).toHaveTextContent(
      /não pode ser depois/,
    )
    expect(
      chamadas.filter((c) => c.url.includes('/api/pluggy/transactions')),
    ).toHaveLength(0)
  })

  test('janela sem movimento não vira conferência vazia — diz que não é erro', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      conexaoPluggySalva: CONEXAO,
      pluggyResposta: { linhas: [] },
    })
    const usuario = await abrir()

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Sincronizar com o banco' }),
      ).toBeInTheDocument(),
    )
    await usuario.click(
      screen.getByRole('button', { name: 'Sincronizar com o banco' }),
    )

    expect(await screen.findByTestId('pluggy-erro')).toHaveTextContent(
      /não é erro/,
    )
    expect(
      screen.queryByRole('heading', { name: 'Conferir importação' }),
    ).not.toBeInTheDocument()
  })

  test('a conexão fora do ar NÃO derruba o import por arquivo', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas, settingsFalha: true })
    await abrir()

    // Capacidade OPCIONAL caindo não pode apagar a PRINCIPAL — a mesma
    // lição que `/api/rules` já custou nesta tela.
    await waitFor(() =>
      expect(screen.getByLabelText(/Arquivo/i)).toBeInTheDocument(),
    )
    expect(screen.getByTestId('pagina-importar')).toBeInTheDocument()
    expect(screen.getByLabelText(/Id da conta no Pluggy/)).toBeInTheDocument()
  })
})

/**
 * ⚠️ O DEFEITO: a dedupe não cruza origens, e a tela afirmava o contrário.
 *
 * MEDIDO no D1 real — a MESMA compra (`2026-07-10`, `-18990`,
 * `SUPERMERCADO XPTO`) importada por OFX (`imported_id` = FITID) e depois
 * por Pluggy (`imported_id` = UUID) deu `skipped: 0`, DUAS linhas,
 * `SUM(amount_cents) = -37980`. E a tela dizia "1 linha(s) encontrada(s).
 * 0 já parecem importadas — desmarcadas por padrão", com o checkbox
 * PRÉ-MARCADO e nenhuma palavra sobre o limite da checagem.
 *
 * `uq_tx_imported` é `(account_id, imported_id)` e FITID ≠ UUID ≠ hash de
 * CSV: não existe colisão pro índice ver. Dedupe EXATA entre origens é
 * impossível — o que estes testes travam é (a) a frase parar de afirmar o
 * que não sabe e (b) o palpite aparecer, com motivo, sem tirar a decisão
 * do dono.
 */
describe('ImportarPage — dedupe entre origens', () => {
  test('a frase diz sobre o que cada checagem vale — nunca "0 já parecem importadas" e pronto', async () => {
    const chamadas: Chamada[] = []
    mockRede({ chamadas })
    await irParaConferencia(chamadas)

    expect(screen.getByTestId('conferencia-resumo')).toHaveTextContent(
      '2 linha(s) encontrada(s). 0 com id já importado nesta conta; 0 com data (±1 dia) e valor batendo em lançamento de OUTRA origem — todas essas vêm desmarcadas.',
    )
    const limite = screen.getByTestId('conferencia-limite-dedupe')
    expect(limite).toHaveTextContent(/só enxerga a MESMA origem/)
    expect(limite).toHaveTextContent(/palpite/)
  })

  test('a MESMA compra já importada por OUTRA origem nasce DESMARCADA, com o motivo e a linha que colide', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      // O FITID é outro (o Pluggy carimbou um UUID) — a dedupe exata é
      // cega. Data e valor são os da linha FITID-1 do OFX.
      transacoesExistentes: [
        {
          imported_id: '5c8f2e10-0f4a-4a1e-9a2e-000000000001',
          import_source: 'pluggy',
          purchase_date: '2026-07-10',
          amount_cents: -4590,
          description: 'Padaria',
        },
      ],
    })
    await irParaConferencia(chamadas)

    const linha0 = screen.getByTestId('linha-0')
    // Não é a checagem exata — é a heurística.
    expect(within(linha0).queryByTestId('duplicada-0')).not.toBeInTheDocument()
    const aviso = within(linha0).getByTestId('provavel-duplicata-0')
    expect(aviso).toHaveTextContent('Talvez duplicada')
    // ③ o motivo E o que ela colide, à vista.
    expect(aviso).toHaveTextContent(/Mesmo valor e mesma data/)
    expect(aviso).toHaveTextContent('sincronização com o banco')
    expect(aviso).toHaveTextContent('10/07/2026')
    expect(aviso).toHaveTextContent('R$ 45,90')
    expect(aviso).toHaveTextContent('Padaria')
    expect(
      within(linha0).getByRole('checkbox', { name: /\d{2}\/\d{2}\/\d{4}/ }),
    ).not.toBeChecked()

    // A linha genuinamente nova continua marcada.
    const linha1 = screen.getByTestId('linha-1')
    expect(
      within(linha1).queryByTestId('provavel-duplicata-1'),
    ).not.toBeInTheDocument()
    expect(
      within(linha1).getByRole('checkbox', { name: /\d{2}\/\d{2}\/\d{4}/ }),
    ).toBeChecked()

    expect(screen.getByTestId('conferencia-resumo')).toHaveTextContent(
      '0 com id já importado nesta conta; 1 com data (±1 dia) e valor batendo em lançamento de OUTRA origem',
    )
  })

  test('1 dia de diferença entre origens também é sinalizado (a conversão de fuso)', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesExistentes: [
        {
          imported_id: 'uuid-do-pluggy',
          import_source: 'pluggy',
          purchase_date: '2026-07-11',
          amount_cents: -4590,
          description: 'Padaria',
        },
      ],
    })
    await irParaConferencia(chamadas)

    expect(screen.getByTestId('provavel-duplicata-0')).toHaveTextContent(
      /Mesmo valor e 1 dia de diferença/,
    )
  })

  test('lançamento MANUAL (sem imported_id) também colide — é onde a dedupe exata nunca teve chance', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesExistentes: [
        {
          imported_id: null,
          import_source: null,
          purchase_date: '2026-07-10',
          amount_cents: -4590,
          description: 'padaria da esquina',
        },
      ],
    })
    await irParaConferencia(chamadas)

    expect(screen.getByTestId('provavel-duplicata-0')).toHaveTextContent(
      'lançamento manual',
    )
  })

  test('O DONO PODE MARCAR MESMO ASSIM — e a linha vai com o id natural, sem :forcado', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesExistentes: [
        {
          imported_id: 'uuid-do-pluggy',
          import_source: 'pluggy',
          purchase_date: '2026-07-10',
          amount_cents: -4590,
          description: 'Padaria',
        },
      ],
    })
    const usuario = await irParaConferencia(chamadas)

    const linha0 = screen.getByTestId('linha-0')
    await usuario.click(
      within(linha0).getByRole('checkbox', { name: /\d{2}\/\d{2}\/\d{4}/ }),
    )
    await usuario.click(
      screen.getByRole('button', { name: /Confirmar importação/i }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /Importação concluída/i }),
      ).toBeInTheDocument(),
    )

    const envio = chamadas.find((c) => c.url.includes('/transactions/import'))
    const corpo = JSON.parse(String(envio?.body)) as {
      rows: Array<{ imported_id: string }>
    }
    expect(corpo.rows.map((r) => r.imported_id)).toEqual(['FITID-1', 'FITID-2'])
  })

  test('a MESMA origem NÃO dispara o palpite — quem manda ali é o id, e dois cafés iguais são legítimos', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      // Mesma data/valor da linha FITID-1, mas veio de OFX, igual ao que
      // está sendo importado agora: a dedupe exata é autoritativa e a
      // heurística só somaria falso positivo.
      transacoesExistentes: [
        {
          imported_id: 'OUTRO-FITID',
          import_source: 'ofx',
          purchase_date: '2026-07-10',
          amount_cents: -4590,
          description: 'Padaria X',
        },
      ],
    })
    await irParaConferencia(chamadas)

    expect(screen.queryByTestId('provavel-duplicata-0')).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('linha-0')).getByRole('checkbox', {
        name: /\d{2}\/\d{2}\/\d{4}/,
      }),
    ).toBeChecked()
  })

  test('id já importado mostra a certeza, nunca o palpite, mesmo quando os dois batem', async () => {
    const chamadas: Chamada[] = []
    mockRede({
      chamadas,
      transacoesExistentes: [
        {
          imported_id: 'FITID-1',
          import_source: 'pluggy',
          purchase_date: '2026-07-10',
          amount_cents: -4590,
          description: 'Padaria',
        },
      ],
    })
    await irParaConferencia(chamadas)

    const linha0 = screen.getByTestId('linha-0')
    expect(within(linha0).getByTestId('duplicada-0')).toBeInTheDocument()
    expect(
      within(linha0).queryByTestId('provavel-duplicata-0'),
    ).not.toBeInTheDocument()
  })
})
