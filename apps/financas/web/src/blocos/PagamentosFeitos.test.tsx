import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PagamentosFeitos, type BillPaymentView } from './PagamentosFeitos'
import metaHistorias, * as todasAsHistorias from './PagamentosFeitos.stories'

const PAGAMENTO: BillPaymentView = {
  transfer_id: 'tr1',
  competence: '2026-08',
  paid_on: '2026-09-05',
  amount_cents: 184790,
  line_count: 40,
  from_account_id: 'a1',
  from_account_name: 'Conta corrente',
}

describe('PagamentosFeitos', () => {
  it('cada pagamento mostra competencia por extenso, data, valor, origem e N', () => {
    render(
      <PagamentosFeitos
        pagamentos={[PAGAMENTO]}
        erro={null}
        desabilitado={false}
        onDesfazer={() => {}}
      />,
    )

    const item = within(screen.getByTestId('pagamento-tr1'))
    // O mesmo rótulo de competência do resto do painel ("Fatura de ago/26").
    expect(item.getByText('Fatura de ago/26')).toBeInTheDocument()
    expect(item.getByText('R$ 1.847,90')).toBeInTheDocument()
    expect(item.getByTestId('pagamento-tr1-detalhe')).toHaveTextContent(
      'Pago em 05/09/2026 · de "Conta corrente" · 40 lançamentos',
    )
  })

  it('um lancamento so fica no singular', () => {
    render(
      <PagamentosFeitos
        pagamentos={[{ ...PAGAMENTO, line_count: 1 }]}
        erro={null}
        desabilitado={false}
        onDesfazer={() => {}}
      />,
    )
    expect(screen.getByTestId('pagamento-tr1-detalhe')).toHaveTextContent(
      /· 1 lançamento$/,
    )
  })

  it('o toque em "Desfazer pagamento" entrega o pagamento certo, sem chamar nada sozinho', async () => {
    const usuario = userEvent.setup()
    const onDesfazer = vi.fn()
    const outro = { ...PAGAMENTO, transfer_id: 'tr2', competence: '2026-07' }
    render(
      <PagamentosFeitos
        pagamentos={[PAGAMENTO, outro]}
        erro={null}
        desabilitado={false}
        onDesfazer={onDesfazer}
      />,
    )

    await usuario.click(screen.getByTestId('desfazer-tr2'))
    expect(onDesfazer).toHaveBeenCalledTimes(1)
    expect(onDesfazer).toHaveBeenCalledWith(outro)
  })

  it('o botao de desfazer tem alvo de 44 px e nome que diz QUAL fatura', () => {
    render(
      <PagamentosFeitos
        pagamentos={[PAGAMENTO]}
        erro={null}
        desabilitado={false}
        onDesfazer={() => {}}
      />,
    )
    const botao = screen.getByTestId('desfazer-tr1')
    // Botão com borda própria: `ALVO_LINHA` (min-h-11 = 44 px), nunca o
    // `-mx-2` do link de texto, que puxaria a borda pra cima do vizinho.
    expect(botao.className).toContain('min-h-11')
    expect(botao.className).not.toContain('-mx-2')
    expect(botao).toHaveTextContent('Desfazer pagamento')
    // Com 12 pagamentos na lista, "Desfazer pagamento" × 12 é o mesmo nome
    // repetido para o leitor de tela; o aria-label diferencia.
    expect(botao).toHaveAccessibleName(
      'Desfazer pagamento da fatura de ago/26 (R$ 1.847,90)',
    )
    // WCAG 2.5.3 (Label in Name): o nome COMEÇA pelo texto visível, senão
    // quem usa controle por voz diz "tocar Desfazer pagamento" e nada acontece.
    expect(botao.getAttribute('aria-label')).toMatch(
      new RegExp(`^${botao.textContent}`),
    )
  })

  it('desabilitado trava todos os botoes', () => {
    render(
      <PagamentosFeitos
        pagamentos={[PAGAMENTO, { ...PAGAMENTO, transfer_id: 'tr2' }]}
        erro={null}
        desabilitado
        onDesfazer={() => {}}
      />,
    )
    expect(screen.getByTestId('desfazer-tr1')).toBeDisabled()
    expect(screen.getByTestId('desfazer-tr2')).toBeDisabled()
  })

  it('sem pagamento registrado (ou ainda carregando) a secao nao aparece', () => {
    const { container, rerender } = render(
      <PagamentosFeitos
        pagamentos={[]}
        erro={null}
        desabilitado={false}
        onDesfazer={() => {}}
      />,
    )
    // Pagamento antigo (anterior ao registro) não aparece aqui: mostrar a
    // seção vazia num cartão que só tem pagamentos antigos diria "nunca
    // pagou", o que é falso.
    expect(container).toBeEmptyDOMElement()

    rerender(
      <PagamentosFeitos
        pagamentos={null}
        erro={null}
        desabilitado={false}
        onDesfazer={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('erro ao carregar fica contido na secao', () => {
    render(
      <PagamentosFeitos
        pagamentos={null}
        erro="o servidor não respondeu"
        desabilitado={false}
        onDesfazer={() => {}}
      />,
    )
    expect(screen.getByTestId('pagamentos-erro')).toHaveTextContent(
      'Não consegui carregar os pagamentos feitos: o servidor não respondeu',
    )
  })
})

const { default: _meta, ...historias } = todasAsHistorias

describe('PagamentosFeitos.stories — os estados da secao', () => {
  it('cada story mostra o estado que o nome promete', () => {
    const esperado: Record<string, (el: HTMLElement) => void> = {
      UmPagamento: (el) => {
        expect(within(el).getAllByRole('listitem')).toHaveLength(1)
        expect(within(el).getByText('Fatura de ago/26')).toBeInTheDocument()
      },
      VariosPagamentos: (el) => {
        expect(within(el).getAllByRole('listitem')).toHaveLength(2)
        expect(within(el).getByText(/· 1 lançamento$/)).toBeInTheDocument()
      },
      Travado: (el) =>
        expect(
          within(el).getByRole('button', {
            name: /^Desfazer pagamento da fatura/,
          }),
        ).toBeDisabled(),
      ErroAoCarregar: (el) =>
        expect(
          within(el).getByText(/Não consegui carregar os pagamentos feitos/),
        ).toBeInTheDocument(),
      SemPagamentos: (el) => expect(el).toBeEmptyDOMElement(),
    }
    expect(Object.keys(historias).sort()).toEqual(Object.keys(esperado).sort())
    for (const [nome, historia] of Object.entries(historias)) {
      const { container, unmount } = render(
        <PagamentosFeitos {...metaHistorias.args} {...historia.args} />,
      )
      esperado[nome](container)
      unmount()
    }
  })
})
