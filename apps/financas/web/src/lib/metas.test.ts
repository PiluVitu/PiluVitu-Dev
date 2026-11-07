import { describe, expect, it } from 'vitest'
import { formatPrazo, larguraDaBarra, plural, rotuloDoStatus } from './metas'

describe('metas', () => {
  it('limita a barra entre 0 e 100', () => {
    expect(larguraDaBarra(40)).toBe(40)
    expect(larguraDaBarra(180)).toBe(100)
    expect(larguraDaBarra(-3)).toBe(0)
  })
  it('formata o prazo em dia/mês/ano', () => {
    expect(formatPrazo('2027-06-30')).toBe('30/06/2027')
  })
  it('só concluída e atrasada ganham rótulo', () => {
    expect(rotuloDoStatus('concluida')).toBe('Concluída')
    expect(rotuloDoStatus('atrasada')).toBe('Atrasada')
    expect(rotuloDoStatus('em_andamento')).toBeNull()
  })
  it('pluraliza', () => {
    expect(plural(1, 'mês', 'meses')).toBe('1 mês')
    expect(plural(3, 'mês', 'meses')).toBe('3 meses')
  })
})
