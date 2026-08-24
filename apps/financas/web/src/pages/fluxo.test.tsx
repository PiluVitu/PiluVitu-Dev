import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FluxoPage } from './fluxo'

function setLarguraJanela(largura: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: largura,
  })
}

// Janela com um mês NEGATIVO e um mês zerado — o negativo é o que a tela
// precisa destacar, o zerado é a prova que a tabela existe pra dar.
const reportComNegativo = {
  meses: ['2026-06', '2026-07', '2026-08'],
  linhas: [
    {
      competence: '2026-06',
      entrou_cents: 500000,
      saiu_cents: 200000,
      saldo_cents: 300000,
      acumulado_cents: 300000,
    },
    {
      competence: '2026-07',
      entrou_cents: 0,
      saiu_cents: 0,
      saldo_cents: 0,
      acumulado_cents: 300000,
    },
    {
      competence: '2026-08',
      entrou_cents: 100000,
      saiu_cents: 450000,
      saldo_cents: -350000,
      acumulado_cents: -50000,
    },
  ],
}

const reportBase = {
  meses: ['2026-06', '2026-07'],
  linhas: [
    {
      competence: '2026-06',
      entrou_cents: 500000,
      saiu_cents: 200000,
      saldo_cents: 300000,
      acumulado_cents: 300000,
    },
    // mês zerado de propósito — cobre "mês vazio aparece zerado, não ausente".
    {
      competence: '2026-07',
      entrou_cents: 0,
      saiu_cents: 0,
      saldo_cents: 0,
      acumulado_cents: 300000,
    },
  ],
}

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FluxoPage', () => {
  it('mostra entrou, saiu, saldo e acumulado por mês', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )
    const linha = within(screen.getByTestId('linha-2026-06'))
    expect(linha.getByTestId('entrou')).toHaveTextContent('R$ 5.000,00')
    expect(linha.getByTestId('saiu')).toHaveTextContent('R$ 2.000,00')
    expect(linha.getByTestId('saldo')).toHaveTextContent('R$ 3.000,00')
    expect(linha.getByTestId('acumulado')).toHaveTextContent('R$ 3.000,00')
  })

  it('mês sem movimento aparece zerado na tabela, não some da lista', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-07')).toBeInTheDocument(),
    )
    const linha = within(screen.getByTestId('linha-2026-07'))
    expect(linha.getByTestId('entrou')).toHaveTextContent('R$ 0,00')
    expect(linha.getByTestId('saiu')).toHaveTextContent('R$ 0,00')
    expect(linha.getByTestId('saldo')).toHaveTextContent('R$ 0,00')
    // acumulado migra o saldo do mês anterior, nunca zera.
    expect(linha.getByTestId('acumulado')).toHaveTextContent('R$ 3.000,00')
  })

  it('pede 12 meses por padrão, terminando no mês corrente', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: reportBase,
      notifications: [],
    })

    render(<FluxoPage />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/reports/cashflow?from=')
    expect(url).toContain('months=12')
  })

  // A PROVA que importa: uma SEGUNDA chamada de rede com a janela nova —
  // não só o <select> mudando de valor visualmente / estado local mudando.
  it('o seletor de janela REFAZ a busca — asserção na segunda chamada de fetch', async () => {
    const fetchMock = mockFetch({
      ok: true,
      data: reportBase,
      notifications: [],
    })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Janela'), {
      target: { value: '24' },
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const segundaUrl = String(fetchMock.mock.calls[1][0])
    expect(segundaUrl).toContain('months=24')
    // a primeira chamada usava months=12 — prova que a URL realmente mudou,
    // não é a mesma chamada repetida.
    expect(String(fetchMock.mock.calls[0][0])).toContain('months=12')
  })

  it('estado vazio (nenhum mês com entrada ou saída) explica que só lançamento liquidado entra', async () => {
    mockFetch({
      ok: true,
      data: {
        meses: ['2026-06', '2026-07'],
        linhas: [
          {
            competence: '2026-06',
            entrou_cents: 0,
            saiu_cents: 0,
            saldo_cents: 0,
            acumulado_cents: 0,
          },
          {
            competence: '2026-07',
            entrou_cents: 0,
            saiu_cents: 0,
            saldo_cents: 0,
            acumulado_cents: 0,
          },
        ],
      },
      notifications: [],
    })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByText(/liquidado/i)).toBeInTheDocument(),
    )
    // Explica a distinção com o Comprometido: parcela prevista é
    // compromisso, não caixa.
    expect(screen.getByText(/comprometido/i)).toBeInTheDocument()
    // sem dado nenhum, o gráfico (lazy) não deveria montar.
    expect(screen.queryByTestId('grafico-fluxo')).not.toBeInTheDocument()
  })

  it('com dado real (não vazio) não mostra a explicação de estado vazio', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/liquidado/i)).not.toBeInTheDocument()
  })

  it('mostra o erro da API', async () => {
    mockFetch(
      {
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'invalid_query',
            message: 'competencia invalida: 2026-8',
          },
        ],
      },
      400,
    )

    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'competencia invalida',
      ),
    )
  })

  it('ajuda: "Fluxo de caixa" abre no clique explicando o que entra na tela', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    mockFetch({ ok: true, data: reportBase, notifications: [] })
    const user = userEvent.setup()

    render(<FluxoPage />)
    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )

    await user.click(
      screen.getByRole('button', { name: 'Ajuda sobre Fluxo de caixa' }),
    )
    expect(await screen.findByText(/liquidado/i)).toBeInTheDocument()
  })

  // ③ Quatro colunas de dinheiro lidas de cima a baixo — sem tabular-nums
  // os dígitos não alinham entre os meses.
  it('as quatro colunas de dinheiro usam tabular-nums', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })

    render(<FluxoPage />)
    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )

    const linha = within(screen.getByTestId('linha-2026-06'))
    for (const celula of ['entrou', 'saiu', 'saldo', 'acumulado']) {
      expect(linha.getByTestId(celula)).toHaveClass('tabular-nums')
    }
  })

  // ③ A tabela CONTINUA (é a prova de "mês zerado aparece"), mas ganhou o
  // que faltava: sinal de mês negativo, TOTAL da janela, e 3 colunas no
  // celular.
  describe('tabela: negativo, TOTAL e colapso mobile', () => {
    afterEach(() => setLarguraJanela(1024))

    it('destaca o mês que fechou negativo, e só ele', async () => {
      mockFetch({ ok: true, data: reportComNegativo, notifications: [] })

      render(<FluxoPage />)

      const negativo = await screen.findByTestId('linha-2026-08')
      expect(within(negativo).getByTestId('saldo')).toHaveClass(
        'text-destructive',
      )
      // Controles: nem o mês positivo nem o ZERADO são destacados — um
      // `<= 0` no lugar de `< 0` pintaria o mês zerado de vermelho.
      const positivo = screen.getByTestId('linha-2026-06')
      expect(within(positivo).getByTestId('saldo')).not.toHaveClass(
        'text-destructive',
      )
      const zerado = screen.getByTestId('linha-2026-07')
      expect(within(zerado).getByTestId('saldo')).not.toHaveClass(
        'text-destructive',
      )
    })

    it('soma o TOTAL da janela (entrou, saiu e saldo)', async () => {
      mockFetch({ ok: true, data: reportComNegativo, notifications: [] })

      render(<FluxoPage />)

      await screen.findByTestId('linha-total')
      expect(screen.getByTestId('total-entrou')).toHaveTextContent(
        'R$ 6.000,00',
      )
      expect(screen.getByTestId('total-saiu')).toHaveTextContent('R$ 6.500,00')
      expect(screen.getByTestId('total-saldo')).toHaveTextContent('-R$ 500,00')
    })

    it('o TOTAL negativo também é destacado', async () => {
      mockFetch({ ok: true, data: reportComNegativo, notifications: [] })

      render(<FluxoPage />)

      await screen.findByTestId('linha-total')
      expect(screen.getByTestId('total-saldo')).toHaveClass('text-destructive')
    })

    it('NÃO soma o acumulado — somar saldo corrente não significa nada', async () => {
      mockFetch({ ok: true, data: reportComNegativo, notifications: [] })

      render(<FluxoPage />)

      await screen.findByTestId('linha-total')
      // A soma ingênua (300000 + 300000 - 50000 = R$ 5.500,00) não pode
      // aparecer em lugar nenhum da linha de TOTAL.
      expect(screen.getByTestId('total-acumulado')).toHaveTextContent('—')
      expect(screen.getByTestId('linha-total')).not.toHaveTextContent(
        'R$ 5.500,00',
      )
    })

    it('em 390px colapsa pra 3 colunas (mês, saldo, acumulado)', async () => {
      setLarguraJanela(390)
      mockFetch({ ok: true, data: reportComNegativo, notifications: [] })

      render(<FluxoPage />)

      const linha = await screen.findByTestId('linha-2026-08')
      expect(within(linha).getByTestId('saldo')).toBeInTheDocument()
      expect(within(linha).getByTestId('acumulado')).toBeInTheDocument()
      // Entrou/Saiu são o detalhe de COMO o saldo se formou — saem do DOM,
      // não ficam escondidos por CSS (jsdom não computa CSS).
      expect(within(linha).queryByTestId('entrou')).not.toBeInTheDocument()
      expect(within(linha).queryByTestId('saiu')).not.toBeInTheDocument()
      expect(screen.queryByTestId('total-entrou')).not.toBeInTheDocument()
    })

    it('mesmo colapsada, a tabela continua provando que mês zerado aparece', async () => {
      setLarguraJanela(390)
      mockFetch({ ok: true, data: reportComNegativo, notifications: [] })

      render(<FluxoPage />)

      const zerado = await screen.findByTestId('linha-2026-07')
      expect(within(zerado).getByTestId('saldo')).toHaveTextContent('R$ 0,00')
    })

    it('acompanha resize em runtime: encolher pra 390px tira Entrou/Saiu', async () => {
      mockFetch({ ok: true, data: reportComNegativo, notifications: [] })

      render(<FluxoPage />)

      await screen.findByTestId('linha-total')
      expect(screen.getByTestId('total-entrou')).toBeInTheDocument()

      setLarguraJanela(390)
      act(() => {
        window.dispatchEvent(new Event('resize'))
      })

      expect(screen.queryByTestId('total-entrou')).not.toBeInTheDocument()
      expect(screen.getByTestId('total-saldo')).toBeInTheDocument()
    })
  })

  describe('uma grafia só de competência na tela', () => {
    it('a tabela rotula o mês como o gráfico (ago/26), nunca 2026-08 cru', () => {
      // ⚠️ MEDIDO em Chrome real a 390×844, na MESMA tela: o eixo X do
      // gráfico lia `set/26`/`nov/26`/`jan/27` (`GraficoFluxo` já passava
      // por `rotuloCompetencia`) enquanto a tabela logo abaixo lia
      // `2026-08`/`2026-09`/`2027-01`. Duas grafias do mesmo mês, uma acima
      // da outra, e a que fica na tabela é a única forma ISO — a que o dono
      // nunca vê em nenhuma outra tela do app (`#/comprometido`, `#/insight`
      // e os blocos da home já usam `rotuloCompetencia`).
      //
      // Não é cosmético: ler "2026-08" ao lado de "set/26" força a
      // conversão de cabeça pra saber se são o mesmo mês, exatamente na
      // linha em que o dono está conferindo um número.
      //
      // ⚠️ O `data-testid` continua sendo a competência CRUA
      // (`linha-2026-06`) de propósito — é identidade, não rótulo; mudá-lo
      // quebraria as asserções desta suíte sem nada ganhar.
      mockFetch({ ok: true, data: reportBase, notifications: [] })

      render(<FluxoPage />)

      return waitFor(() => {
        const linha = screen.getByTestId('linha-2026-06')
        expect(within(linha).getByTestId('competencia')).toHaveTextContent(
          'jun/26',
        )
        expect(linha.textContent).not.toContain('2026-06')
      })
    })
  })
})

describe('FluxoPage — a linguagem: cabeçalho em versalete e UMA manchete', () => {
  it('os cabeçalhos da tabela usam ROTULO (versalete mono)', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })
    render(<FluxoPage />)

    await waitFor(() =>
      expect(screen.getByTestId('linha-2026-06')).toBeInTheDocument(),
    )
    const cabecalho = screen.getByRole('columnheader', { name: 'Acumulado' })
    expect(cabecalho.className).toContain('font-mono')
    expect(cabecalho.className).toContain('uppercase')
    expect(cabecalho.className).toContain('tracking-[0.18em]')
  })

  it('manchete: SÓ o saldo da janela em destaque; entrou/saiu viram contexto', async () => {
    // ⚠️ UM herói, não três. Os três totais existiam só no `<tfoot>`, no
    // mesmo 14px de cada linha, no FIM de uma tabela de até 24 meses.
    mockFetch({ ok: true, data: reportBase, notifications: [] })
    render(<FluxoPage />)

    const manchete = await screen.findByTestId('manchete-saldo')
    // 300000 + 0
    expect(
      within(manchete).getByTestId('manchete-saldo-valor'),
    ).toHaveTextContent('R$ 3.000,00')
    expect(
      within(manchete).getByTestId('manchete-saldo-valor').className,
    ).toContain('text-3xl')
    // entrou/saiu no contexto, nunca como um segundo e terceiro destaque
    expect(manchete).toHaveTextContent('Entrou R$ 5.000,00')
    expect(manchete).toHaveTextContent('saiu R$ 2.000,00')
    expect(
      within(manchete).queryByText('R$ 5.000,00', { selector: '.text-3xl' }),
    ).toBeNull()
  })

  it('janela negativa: a manchete fica destructive', async () => {
    mockFetch({ ok: true, data: reportComNegativo, notifications: [] })
    render(<FluxoPage />)

    const valor = await screen.findByTestId('manchete-saldo-valor')
    // 300000 + 0 + (-350000)
    expect(valor).toHaveTextContent('-R$ 500,00')
    expect(valor.className).toContain('text-destructive')
  })

  it('janela ZERADA não é pintada como problema (`< 0`, nunca `<= 0`)', async () => {
    mockFetch({
      ok: true,
      data: {
        meses: ['2026-06'],
        linhas: [
          {
            competence: '2026-06',
            entrou_cents: 200000,
            saiu_cents: 200000,
            saldo_cents: 0,
            acumulado_cents: 0,
          },
        ],
      },
      notifications: [],
    })
    render(<FluxoPage />)

    const valor = await screen.findByTestId('manchete-saldo-valor')
    expect(valor).toHaveTextContent('R$ 0,00')
    expect(valor.className).not.toContain('text-destructive')
  })

  // ① Hierarquia: manchete (resposta) → gráfico (forma) → tabela (detalhe).
  // Antes o gráfico ficava num Card e a tabela logo abaixo, NUA — dois blocos
  // de peso idêntico repetindo o mesmo dado, sem nada dizendo qual é qual.
  it('a tabela ganha rótulo de seção que a nomeia e a subordina ao gráfico', async () => {
    mockFetch({ ok: true, data: reportBase, notifications: [] })
    render(<FluxoPage />)

    const rotulo = await screen.findByText('Mês a mês')

    // A assinatura em versalete mono — some se virar um título comum.
    expect(rotulo.className).toContain('font-mono')
    expect(rotulo.className).toContain('uppercase')

    // ⚠️ A frase diz POR QUE a tabela continua existindo (decisão nº 4): uma
    // barra de valor 0 não renderiza `<path>` no recharts, então só a tabela
    // prova que o mês zerado aparece.
    expect(
      screen.getByText(/meses sem movimento, que aparecem zerados aqui/i),
    ).toBeInTheDocument()

    // E a tabela de fato vive dentro da mesma seção do rótulo.
    const secao = rotulo.closest('div')?.parentElement as HTMLElement
    expect(within(secao).getByTestId('linha-total')).toBeInTheDocument()
  })
})
