import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CommitmentReportView } from '../lib/commitments'
import GraficoComprometido from './GraficoComprometido'

const report: CommitmentReportView = {
  competences: [
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
  ],
  rows: [
    {
      account_id: 'a1',
      account_name: 'Nubank cartão',
      cells: [200000, 180000, 150000, 120000, 90000, 60000],
    },
  ],
  totals: [200000, 180000, 150000, 120000, 90000, 60000],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [55, 51, 50, 49, 25, 10],
}

const LARGURA_PADRAO_JSDOM = 1024

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
}

function larguraDoWrapper(container: HTMLElement): string {
  const wrapper = container.querySelector('.recharts-wrapper') as HTMLElement
  return wrapper.style.width
}

afterEach(() => {
  setViewportWidth(LARGURA_PADRAO_JSDOM)
})

describe('GraficoComprometido — largura responsiva (Task 6, fix round 1)', () => {
  // Fix round 1: a largura fixa (640px) original escondia metade da janela
  // de 6 meses no Android (~390px), o dispositivo PRIMÁRIO do dono pra
  // registrar gasto — e `#/` é a tela que ele vê primeiro. Este teste prova
  // que a largura acompanha o viewport, não fica travada em 640.
  it('em viewport estreito (Android, ~390px) a largura acompanha o innerWidth, não fica travada em 640', () => {
    setViewportWidth(390)

    const { container } = render(<GraficoComprometido report={report} />)

    // innerWidth (390) - margem (64) = 326, dentro do piso/teto
    expect(larguraDoWrapper(container)).toBe('326px')
  })

  it('em viewport largo (MacBook) respeita o teto de 640px em vez de esticar sem limite', () => {
    setViewportWidth(1440)

    const { container } = render(<GraficoComprometido report={report} />)

    expect(larguraDoWrapper(container)).toBe('640px')
  })

  it('em viewport muito estreito respeita um piso mínimo em vez de espremer até ilegível', () => {
    setViewportWidth(240)

    const { container } = render(<GraficoComprometido report={report} />)

    expect(larguraDoWrapper(container)).toBe('280px')
  })

  it('acompanha resize em runtime (rotação de tela / redimensionar janela)', () => {
    setViewportWidth(390)
    const { container } = render(<GraficoComprometido report={report} />)
    expect(larguraDoWrapper(container)).toBe('326px')

    setViewportWidth(800)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    expect(larguraDoWrapper(container)).toBe('640px')
  })
})
