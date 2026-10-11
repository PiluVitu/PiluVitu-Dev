import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { foraDaVotacao } from '@/lib/medicao'
import { renderEstatico } from '@/lib/render-estatico'
import { MedicaoDaVercel } from './medicao-da-vercel'

const props: Record<string, unknown> = {}
jest.mock('@vercel/analytics/next', () => ({
  Analytics: (recebidas: Record<string, unknown>) => {
    props.analytics = recebidas
    return <span data-testid="web-analytics" />
  },
}))
jest.mock('@vercel/speed-insights/next', () => ({
  SpeedInsights: (recebidas: Record<string, unknown>) => {
    props.speedInsights = recebidas
    return <span data-testid="speed-insights" />
  },
}))

const medido = (raiz: HTMLElement, id: string) =>
  raiz.querySelector(`[data-testid="${id}"]`)

// Só a produção da Vercel mede: o preview gastaria as cotas grátis da conta (50 mil eventos por
// mês do Web Analytics e 10 mil em 30 dias do Speed Insights, divididas entre os 5 projetos), e o
// build local, o E2E e o Storybook não têm os scripts. No modo draft quem vê é o dono.
describe('MedicaoDaVercel', () => {
  beforeEach(() => {
    delete props.analytics
    delete props.speedInsights
  })

  it('carrega o Web Analytics e o Speed Insights na produção da Vercel', () => {
    const raiz = renderEstatico(<MedicaoDaVercel ambiente="production" />)
    expect(medido(raiz, 'web-analytics')).not.toBeNull()
    expect(medido(raiz, 'speed-insights')).not.toBeNull()
  })

  it('os dois descartam a votação antes de enviar', () => {
    renderEstatico(<MedicaoDaVercel ambiente="production" />)
    expect(props.analytics).toMatchObject({ beforeSend: foraDaVotacao })
    expect(props.speedInsights).toMatchObject({ beforeSend: foraDaVotacao })
  })

  it.each([['preview'], ['development'], [undefined]])(
    'não carrega nada com VERCEL_ENV=%s',
    (ambiente) => {
      expect(
        renderEstatico(<MedicaoDaVercel ambiente={ambiente} />).innerHTML,
      ).toBe('')
    },
  )

  it('não carrega nada no modo draft, nem na produção', () => {
    expect(
      renderEstatico(<MedicaoDaVercel ambiente="production" rascunho />)
        .innerHTML,
    ).toBe('')
  })

  // O renderToStaticMarkup não passa pela fronteira servidor → cliente, e este teste ficaria verde
  // com o beforeSend no componente de servidor. Medido em 2026-10-11: assim, o next build com
  // VERCEL_ENV=production quebra no /tasks com "Functions cannot be passed directly to Client
  // Components" ({beforeSend: function}). Quem passa a função tem de ser de cliente.
  it('quem passa o beforeSend é um componente de cliente, e o de servidor não importa a Vercel', () => {
    const cliente = readFileSync(
      join(__dirname, 'medicao-da-vercel-cliente.tsx'),
      'utf8',
    )
    expect(cliente.trimStart().startsWith("'use client'")).toBe(true)
    expect(cliente).toContain('beforeSend={foraDaVotacao}')
    const servidor = readFileSync(
      join(__dirname, 'medicao-da-vercel.tsx'),
      'utf8',
    )
    expect(servidor).not.toContain('beforeSend')
    expect(servidor).not.toContain('@vercel/')
  })
})
