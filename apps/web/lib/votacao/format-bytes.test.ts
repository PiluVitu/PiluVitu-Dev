import { formatBackupSize } from './format-bytes'

describe('formatBackupSize', () => {
  it('bytes puros, abaixo de 1024', () => {
    expect(formatBackupSize(0)).toBe('0 B')
    expect(formatBackupSize(1)).toBe('1 B')
    expect(formatBackupSize(1023)).toBe('1023 B')
  })

  it('KB a partir de 1024 (arredondado, sem casa decimal)', () => {
    expect(formatBackupSize(1024)).toBe('1 KB')
    expect(formatBackupSize(2048)).toBe('2 KB')
    expect(formatBackupSize(1_500)).toBe('1 KB')
  })

  it('MB a partir de 1_048_576 (uma casa decimal)', () => {
    expect(formatBackupSize(1_048_576)).toBe('1.0 MB')
    expect(formatBackupSize(1_258_291)).toBe('1.2 MB')
  })

  it('fronteira exata: 1_048_575 (o maior valor que ainda é KB, não MB)', () => {
    expect(formatBackupSize(1_048_575)).toBe('1024 KB')
  })
})
