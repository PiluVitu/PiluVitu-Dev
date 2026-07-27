import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { HomePage } from './home'

vi.mock('../api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api')>()
  return { ...real, api: vi.fn() }
})

const reportVazio = {
  competences: [
    '2026-08',
    '2026-09',
    '2026-10',
    '2026-11',
    '2026-12',
    '2027-01',
  ],
  rows: [],
  totals: [0, 0, 0, 0, 0, 0],
  fixed_net_cents: 360000,
  pct_of_fixed_net: [0, 0, 0, 0, 0, 0],
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('HomePage', () => {
  it('mostra o título Início e monta o bloco Comprometido', async () => {
    vi.mocked(api).mockResolvedValue(reportVazio)

    render(<HomePage />)

    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Comprometido' }),
      ).toBeInTheDocument(),
    )
  })

  it('um bloco em erro não derruba a home — o resto da tela continua de pé', async () => {
    vi.mocked(api).mockRejectedValue(new Error('falhou'))

    render(<HomePage />)

    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // o título continua no ar — o erro ficou contido no card do bloco
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument()
  })
})
