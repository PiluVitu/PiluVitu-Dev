import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { NumeroCard } from './NumeroCard'
import { ROTULO } from '../lib/tipografia'

/**
 * ⚠️ jsdom não computa layout — nenhuma asserção aqui mede pixel. O que estas
 * asserções travam é a REGRA aplicada (a classe de escala, a presença ou
 * ausência dos centavos, o padding responsivo); a largura de fato foi MEDIDA
 * em Chrome real a 390×844, e está registrada no `CLAUDE.md` do módulo.
 */
describe('NumeroCard', () => {
  test('grid de 2 colunas: 24px e valor SEM centavos', () => {
    render(
      <NumeroCard
        rotulo="Comprometido"
        valorCents={2112250}
        escala="grid"
        data-testid="n"
      />,
    )

    const valor = screen.getByTestId('n-valor')
    expect(valor).toHaveTextContent('R$ 21.123')
    // A asserção que importa é a NEGATIVA: os centavos não podem aparecer numa
    // caixa de 139px. `toHaveTextContent('R$ 21.123')` sozinho passaria com
    // 'R$ 21.123,50' (é substring).
    expect(valor.textContent).toBe('R$ 21.123')
    expect(valor).toHaveClass('text-2xl', 'font-semibold', 'tabular-nums')
    expect(valor).not.toHaveClass('text-3xl')
  })

  test('card de largura total: 30px e valor COM centavos', () => {
    render(
      <NumeroCard
        rotulo="Saldo PJ"
        valorCents={2112250}
        escala="heroi"
        data-testid="n"
      />,
    )

    const valor = screen.getByTestId('n-valor')
    expect(valor.textContent).toBe('R$ 21.122,50')
    expect(valor).toHaveClass('text-3xl', 'font-semibold', 'tabular-nums')
    expect(valor).not.toHaveClass('text-2xl')
  })

  // ⚠️ `tabular-nums` é lei do app (dezenas de ocorrências): sem ela, uma
  // coluna de valores lida de cima a baixo deixa de alinhar.
  test.each(['heroi', 'grid'] as const)(
    'escala %s sempre carrega tabular-nums',
    (escala) => {
      render(
        <NumeroCard
          rotulo="X"
          valorCents={100000}
          escala={escala}
          data-testid="n"
        />,
      )
      expect(screen.getByTestId('n-valor')).toHaveClass('tabular-nums')
    },
  )

  test('o rótulo usa a assinatura do admin (versalete mono), não texto solto', () => {
    render(
      <NumeroCard rotulo="Comprometido" valorCents={100000} escala="grid" />,
    )

    const rotulo = screen.getByText('Comprometido')
    // Conferido contra `apps/web/components/admin/stat-card.tsx:19`.
    for (const classe of ROTULO.split(' ')) {
      expect(rotulo).toHaveClass(classe)
    }
    expect(rotulo).toHaveClass('font-mono', 'uppercase', 'tracking-[0.18em]')
  })

  test('contexto opcional: aparece quando dado, some quando não', () => {
    const { rerender } = render(
      <NumeroCard
        rotulo="Alimentação"
        valorCents={-45000}
        escala="grid"
        contexto="+R$ 120 a mais que julho"
      />,
    )
    expect(screen.getByText('+R$ 120 a mais que julho')).toBeInTheDocument()

    rerender(
      <NumeroCard rotulo="Alimentação" valorCents={-45000} escala="grid" />,
    )
    expect(
      screen.queryByText('+R$ 120 a mais que julho'),
    ).not.toBeInTheDocument()
  })

  // ⚠️ A 390px o shell já tira 32px; `p-6` (24) deixaria 310px de caixa útil,
  // `p-4` (16) deixa 326. De `sm` pra cima volta aos 24.
  test('padding é p-4 sm:p-6, nunca p-6 cru', () => {
    const { container } = render(
      <NumeroCard rotulo="X" valorCents={100000} escala="grid" />,
    )
    const card = container.firstElementChild as HTMLElement
    expect(card).toHaveClass('p-4', 'sm:p-6')
    expect(card).not.toHaveClass('p-6')
  })

  // ⚠️ `shadow-ds` é `0 18px 40px rgb(0 0 0 / 0.45)` — desenhada pro tema
  // escuro do site. No claro do finanças viraria borrão em volta de todo card.
  test('NÃO adota shadow-ds', () => {
    const { container } = render(
      <NumeroCard rotulo="X" valorCents={100000} escala="grid" />,
    )
    expect(container.firstElementChild).not.toHaveClass('shadow-ds')
  })

  test('valor negativo mantém o sinal nas duas escalas', () => {
    const { rerender } = render(
      <NumeroCard
        rotulo="Saldo"
        valorCents={-2112250}
        escala="grid"
        data-testid="n"
      />,
    )
    expect(screen.getByTestId('n-valor').textContent).toBe('-R$ 21.123')

    rerender(
      <NumeroCard
        rotulo="Saldo"
        valorCents={-2112250}
        escala="heroi"
        data-testid="n"
      />,
    )
    expect(screen.getByTestId('n-valor').textContent).toBe('-R$ 21.122,50')
  })
})

test('valorClassName aplica SÓ no valor, sem tocar rótulo nem contexto', () => {
  // Existe pro caso em que o próprio número muda de significado — o saldo
  // negativo da janela em `#/fluxo`. Não serve pra trocar a escala: quem
  // decide tamanho E centavos juntos continua sendo `escala`.
  render(
    <NumeroCard
      rotulo="Saldo"
      valorCents={-50000}
      escala="heroi"
      valorClassName="text-destructive"
      contexto="entrou menos do que saiu"
      data-testid="n"
    />,
  )

  const valor = screen.getByTestId('n-valor')
  expect(valor.className).toContain('text-destructive')
  expect(valor.className).toContain('text-3xl')
  expect(screen.getByText('Saldo').className).not.toContain('text-destructive')
  expect(screen.getByText('entrou menos do que saiu').className).not.toContain(
    'text-destructive',
  )
})
