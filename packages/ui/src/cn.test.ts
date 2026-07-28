import { cn } from './cn'

describe('cn', () => {
  test('resolve conflito de utilitário Tailwind mantendo o último (p-2 p-4 → p-4)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  test('ignora valores condicionais falsy', () => {
    expect(
      cn('block', false && 'hidden', null, undefined, 0 && 'invisible'),
    ).toBe('block')
  })

  test('funde array aninhado de classes', () => {
    expect(cn(['flex', ['items-center', 'gap-2']], 'text-sm')).toBe(
      'flex items-center gap-2 text-sm',
    )
  })
})
