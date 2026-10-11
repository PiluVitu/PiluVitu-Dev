import { render, screen } from '@testing-library/react'
import { MedicaoDaVercel } from './medicao-da-vercel'

jest.mock('@vercel/analytics/next', () => ({
  Analytics: () => <span data-testid="web-analytics" />,
}))
jest.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: () => <span data-testid="speed-insights" />,
}))

// Só a produção da Vercel mede: o preview gastaria as cotas grátis da conta (50 mil eventos por
// mês do Web Analytics e 10 mil em 30 dias do Speed Insights, divididas entre os 5 projetos), e o
// build local, o E2E e o Storybook não têm os scripts.
describe('MedicaoDaVercel', () => {
  it('carrega o Web Analytics e o Speed Insights na produção da Vercel', () => {
    render(<MedicaoDaVercel ambiente="production" />)
    expect(screen.getByTestId('web-analytics')).toBeInTheDocument()
    expect(screen.getByTestId('speed-insights')).toBeInTheDocument()
  })

  it.each([['preview'], ['development'], [undefined]])(
    'não carrega nada com VERCEL_ENV=%s',
    (ambiente) => {
      const { container } = render(<MedicaoDaVercel ambiente={ambiente} />)
      expect(container).toBeEmptyDOMElement()
    },
  )
})
