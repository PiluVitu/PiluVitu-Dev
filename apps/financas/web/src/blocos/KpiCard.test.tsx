import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FaixaKpi, KpiCard } from './KpiCard'

describe('KpiCard', () => {
  it('mostra rótulo, valor e contexto', () => {
    render(
      <KpiCard
        rotulo="Total que devo"
        valor="R$ 4.200,00"
        contexto="3 dívidas em aberto"
        data-testid="k"
      />,
    )

    expect(screen.getByText('Total que devo')).toBeInTheDocument()
    expect(screen.getByTestId('k-valor')).toHaveTextContent('R$ 4.200,00')
    expect(screen.getByText('3 dívidas em aberto')).toBeInTheDocument()
  })

  it('sem contexto, não renderiza a linha de contexto', () => {
    const { container } = render(<KpiCard rotulo="Pausadas" valor="1" />)

    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  // ⚠️ `tabular-nums` é lei do módulo: sem ela os dígitos têm larguras
  // diferentes e uma faixa de 4 KPIs deixa de alinhar entre si.
  it('o valor é sempre tabular-nums', () => {
    render(<KpiCard rotulo="Gasto" valor="R$ 3.412,80" data-testid="k" />)

    expect(screen.getByTestId('k-valor')).toHaveClass('tabular-nums')
  })

  it('o rótulo sai em versalete mono (a assinatura do design system)', () => {
    render(<KpiCard rotulo="Comprometido" valor="68%" />)

    const rotulo = screen.getByText('Comprometido')
    expect(rotulo).toHaveClass('font-mono', 'uppercase', 'text-[10px]')
  })

  it('alerta: tinge valor e contexto de --destructive', () => {
    render(
      <KpiCard
        rotulo="Comprometido"
        valor="68%"
        contexto="acima do limiar de 50%"
        alerta
        data-testid="k"
      />,
    )

    expect(screen.getByTestId('k-valor')).toHaveClass('text-destructive')
    expect(screen.getByText('acima do limiar de 50%')).toHaveClass(
      'text-destructive',
    )
  })

  // O contrapositivo: sem `alerta`, nada de vermelho. Sem este caso, um
  // cartão vermelho o tempo todo passaria no teste acima sem provar nada.
  it('sem alerta: nada em --destructive', () => {
    render(
      <KpiCard
        rotulo="Reserva"
        valor="2,6 a 3,3 meses"
        contexto="abaixo da meta"
        data-testid="k"
      />,
    )

    expect(screen.getByTestId('k-valor')).not.toHaveClass('text-destructive')
    expect(screen.getByText('abaixo da meta')).toHaveClass(
      'text-muted-foreground',
    )
  })

  // ⚠️ Cor não pode ser o único canal (lei do módulo, ver CLAUDE.md): o
  // cartão em alerta precisa dizer POR QUE em texto, não só ficar vermelho.
  it('alerta sem contexto continua legível — o texto é quem carrega o porquê', () => {
    render(<KpiCard rotulo="Pior mês" valor="68% · set/26" alerta />)

    expect(screen.getByText('68% · set/26')).toBeInTheDocument()
  })
})

describe('FaixaKpi', () => {
  it('acomoda os cartões num grid que cai sozinho pra 1 coluna', () => {
    render(
      <FaixaKpi data-testid="faixa">
        <KpiCard rotulo="A" valor="1" />
        <KpiCard rotulo="B" valor="2" />
      </FaixaKpi>,
    )

    const faixa = screen.getByTestId('faixa')
    expect(faixa.className).toContain('auto-fit')
    expect(faixa.className).toContain('minmax(190px,1fr)')
  })
})
