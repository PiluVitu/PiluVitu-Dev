import { describe, expect, test } from 'vitest'
import {
  isTimeoutErro,
  lerCorpoErroLimitado,
  LIMITE_CORPO_ERRO_BYTES,
  mensagemTimeout,
} from './http'

describe('lerCorpoErroLimitado', () => {
  test('devolve o corpo inteiro quando está abaixo do limite', async () => {
    const res = new Response('corpo pequeno de erro')
    await expect(lerCorpoErroLimitado(res)).resolves.toBe(
      'corpo pequeno de erro',
    )
  })

  test('corpo vazio devolve string vazia', async () => {
    const res = new Response('')
    await expect(lerCorpoErroLimitado(res)).resolves.toBe('')
  })

  test('sem corpo nenhum (res.body null) devolve string vazia, não lança', async () => {
    const res = new Response(null, { status: 204 })
    await expect(lerCorpoErroLimitado(res)).resolves.toBe('')
  })

  test('corta em BYTES no limite — não baixa o corpo inteiro pra memória', async () => {
    // Corpo maior que o limite: só os primeiros LIMITE_CORPO_ERRO_BYTES
    // bytes voltam.
    const corpoGigante = 'x'.repeat(LIMITE_CORPO_ERRO_BYTES + 5000)
    const res = new Response(corpoGigante)
    const lido = await lerCorpoErroLimitado(res)
    expect(lido.length).toBeLessThanOrEqual(LIMITE_CORPO_ERRO_BYTES)
    expect(lido).toBe('x'.repeat(LIMITE_CORPO_ERRO_BYTES))
  })

  test('trim() remove espaço nas pontas, mesma disciplina do bytes.TrimSpace do Go', async () => {
    const res = new Response('  erro com espaço em volta  \n')
    await expect(lerCorpoErroLimitado(res)).resolves.toBe(
      'erro com espaço em volta',
    )
  })
})

describe('isTimeoutErro', () => {
  test('true pra DOMException TimeoutError (o que AbortSignal.timeout() produz neste runtime — medido)', () => {
    expect(isTimeoutErro(new DOMException('excedeu', 'TimeoutError'))).toBe(
      true,
    )
  })

  test('true pra DOMException AbortError (AbortController manual sem reason) — checado por segurança', () => {
    expect(isTimeoutErro(new DOMException('abortado', 'AbortError'))).toBe(true)
  })

  test('false pra outros DOMException', () => {
    expect(isTimeoutErro(new DOMException('outra coisa', 'NetworkError'))).toBe(
      false,
    )
  })

  test('false pra erro comum (TypeError de rede, etc.)', () => {
    expect(isTimeoutErro(new TypeError('fetch failed'))).toBe(false)
  })

  test('false pra valores que não são Error nenhum', () => {
    expect(isTimeoutErro('string qualquer')).toBe(false)
    expect(isTimeoutErro(null)).toBe(false)
    expect(isTimeoutErro(undefined)).toBe(false)
  })
})

describe('mensagemTimeout', () => {
  test('formata segundos, não milissegundos', () => {
    expect(mensagemTimeout('devto', 30_000)).toBe(
      'devto: tempo limite de 30s excedido',
    )
  })

  test('com contexto, aparece entre parênteses no final', () => {
    expect(
      mensagemTimeout('bluesky', 30_000, '/xrpc/com.atproto.repo.createRecord'),
    ).toBe(
      'bluesky: tempo limite de 30s excedido (/xrpc/com.atproto.repo.createRecord)',
    )
  })

  test('sem contexto, sem parênteses nenhum', () => {
    expect(mensagemTimeout('mastodon', 5_000)).not.toContain('(')
  })
})
