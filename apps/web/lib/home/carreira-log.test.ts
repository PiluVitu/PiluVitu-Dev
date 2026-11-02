import { logDaCarreira } from './carreira-log'

describe('logDaCarreira', () => {
  it.each([
    ['Mar, 2024 - Atualmente', '2024-03', 'mar. 2024 – atualmente'],
    ['Dez, 2023 - Out, 2024', '2023-12', 'dez. 2023 – out. 2024'],
    ['Dez, 2024 - Dez, 2024', '2024-12', 'dez. 2024'],
    ['Dez, 2025', '2025-12', 'dez. 2025'],
  ])('%s', (date, data, periodo) => {
    expect(logDaCarreira(date)).toEqual({ data, periodo })
  })

  it('texto fora do formato passa intacto, sem data', () => {
    expect(logDaCarreira('desde sempre')).toEqual({
      data: '',
      periodo: 'desde sempre',
    })
  })
})
