import { render, screen } from '@testing-library/react'
import type { DefaultTooltipContentProps, TooltipValueType } from 'recharts'
import { ChartContainer, ChartTooltipContent, type ChartConfig } from './chart'

const config = {
  entrou: { label: 'Entrou', color: 'hsl(var(--primary))' },
} satisfies ChartConfig

// `ChartTooltipContent` (chart.tsx) tipa `payload` a partir de
// `TooltipValueType` (exportado por `recharts`) + um `TooltipNameType`
// local ao componente (`number | string`, não exportado) — instanciar o
// genérico aqui com tipos CONCRETOS (`number`/`string`) em vez dos mesmos
// tipos largos quebra por variância de função no campo opcional
// `formatter` (contravariância de parâmetro). `TooltipNameType` abaixo
// reproduz a MESMA união (`number | string`) que o componente usa
// internamente — nome igual, propósito igual, sem precisar exportar o tipo
// privado de `chart.tsx` só pra isto.
type TooltipNameType = number | string

// Payload mínimo válido pra `RechartsPrimitive.Tooltip`/`ChartTooltipContent`
// — `graphicalItemId` é a única chave obrigatória do tipo `Payload` do
// recharts (o resto é opcional); os demais campos espelham o que um
// `<Bar dataKey="entrou">` de verdade produziria.
const payload: NonNullable<
  DefaultTooltipContentProps<TooltipValueType, TooltipNameType>['payload']
> = [
  {
    dataKey: 'entrou',
    name: 'entrou',
    value: 100,
    color: 'hsl(var(--primary))',
    fill: 'hsl(var(--primary))',
    payload: { mes: 'Jan', entrou: 100 },
    graphicalItemId: 'bar-entrou',
  },
]

describe('ChartContainer', () => {
  it('renderiza os filhos dentro do slot data-slot="chart"', () => {
    const { container } = render(
      <ChartContainer config={config} data-testid="grafico">
        <div>conteúdo do gráfico</div>
      </ChartContainer>,
    )

    const slot = container.querySelector('[data-slot="chart"]')
    expect(slot).toBeInTheDocument()
    expect(screen.getByTestId('grafico')).toBe(slot)
    expect(screen.getByText('conteúdo do gráfico')).toBeInTheDocument()
  })

  it('gera CSS custom properties por série a partir de `config.color`, escopadas ao id do gráfico', () => {
    const { container } = render(
      <ChartContainer config={config} id="fluxo">
        <div>conteúdo</div>
      </ChartContainer>,
    )

    const style = container.querySelector('style')
    expect(style).not.toBeNull()
    // Uma seção por tema (claro "" e escuro ".dark") — mesma cor nas duas
    // porque este config usa `color`, não `theme` (que varia por tema).
    expect(style?.innerHTML).toContain('[data-chart=chart-fluxo]')
    expect(style?.innerHTML).toContain('.dark [data-chart=chart-fluxo]')
    expect(style?.innerHTML).toContain('--color-entrou: hsl(var(--primary));')
  })

  it('sem nenhuma série com `color`/`theme` no config, não injeta <style> nenhum', () => {
    const semCor = { entrou: { label: 'Entrou' } } satisfies ChartConfig
    const { container } = render(
      <ChartContainer config={semCor}>
        <div>conteúdo</div>
      </ChartContainer>,
    )

    expect(container.querySelector('style')).toBeNull()
  })
})

describe('ChartTooltipContent', () => {
  it('não renderiza nada quando o tooltip está inativo', () => {
    render(
      <ChartContainer config={config}>
        <ChartTooltipContent active={false} payload={payload} label="Jan" />
      </ChartContainer>,
    )

    expect(screen.queryByText('Jan')).not.toBeInTheDocument()
    expect(screen.queryByText('Entrou')).not.toBeInTheDocument()
    expect(screen.queryByText('100')).not.toBeInTheDocument()
  })

  it('mostra o rótulo (header), o nome da série via config.label e o valor formatado quando ativo', () => {
    render(
      <ChartContainer config={config}>
        <ChartTooltipContent active payload={payload} label="Jan" />
      </ChartContainer>,
    )

    // Header: "Jan" não está no config, cai no fallback literal.
    expect(screen.getByText('Jan')).toBeInTheDocument()
    // Nome do item: vem de config['entrou'].label, não do dataKey cru.
    expect(screen.getByText('Entrou')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('useChart lança fora de um <ChartContainer /> — o mesmo erro que qualquer consumidor futuro vai bater se esquecer o wrapper', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    expect(() =>
      render(<ChartTooltipContent active payload={payload} label="Jan" />),
    ).toThrow('useChart must be used within a <ChartContainer />')

    consoleError.mockRestore()
  })
})
