import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopiado } from './use-copiado'

describe('useCopiado', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('marca uma chave por 1,4 s', () => {
    const { result } = renderHook(() => useCopiado())
    act(() => result.current.marcar('pessoais:CPF'))
    expect(result.current.chave).toBe('pessoais:CPF')
    act(() => vi.advanceTimersByTime(1399))
    expect(result.current.chave).toBe('pessoais:CPF')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.chave).toBeNull()
  })

  it('copiar de novo reinicia a contagem', () => {
    const { result } = renderHook(() => useCopiado())
    act(() => result.current.marcar('pessoais:CPF'))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.marcar('pessoais:CPF'))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.chave).toBe('pessoais:CPF')
    act(() => vi.advanceTimersByTime(400))
    expect(result.current.chave).toBeNull()
  })

  it('só uma chave por vez, e limpar apaga na hora', () => {
    const { result } = renderHook(() => useCopiado())
    act(() => result.current.marcar('pessoais:CPF'))
    act(() => result.current.marcar('email:E-mail'))
    expect(result.current.chave).toBe('email:E-mail')
    act(() => result.current.limpar())
    expect(result.current.chave).toBeNull()
  })
})
