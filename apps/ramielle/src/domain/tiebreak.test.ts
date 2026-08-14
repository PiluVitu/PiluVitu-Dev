/**
 * Vetor dourado do desempate — vale bit a bit contra `hex(TiebreakSeed(...))`
 * e `PickTiebreakIndex(seed, n)` de `apps/api/internal/votacao/tiebreak.go`,
 * gerados rodando o Go de verdade (`go run` num `apps/api/cmd/paritytmp/
 * main.go` descartável — ver o report da Task 5 pra saída literal e a
 * confirmação de `git status --porcelain` limpo depois de apagar o
 * diretório). Um vetor escrito à mão não prova paridade nenhuma; este prova.
 */
import { describe, expect, test } from 'vitest'
import goParity from '../routes/__fixtures__/go-parity.json'
import {
  bytesToHex,
  hexToBytes,
  pickTiebreakIndex,
  tiebreakSeed,
} from './tiebreak'

const fixture = goParity.tiebreak

describe('tiebreakSeed — vetor dourado', () => {
  test('hex(tiebreakSeed(...)) bate EXATAMENTE com o Go, mesmo com tiedIds fora de ordem', async () => {
    const clientEntropy = hexToBytes(fixture.clientEntropyHex)
    const serverNonce = hexToBytes(fixture.serverNonceHex)
    if (clientEntropy === null || serverNonce === null) {
      throw new Error('fixture com hex inválido')
    }

    const seed = await tiebreakSeed(
      clientEntropy,
      serverNonce,
      fixture.sessionId,
      fixture.tiedIds,
    )

    expect(seed.length).toBe(32)
    expect(bytesToHex(seed)).toBe(fixture.seedHex)
  })

  test('é independente da ordem de entrada dos tiedIds (a função ordena internamente)', async () => {
    const clientEntropy = hexToBytes(fixture.clientEntropyHex)
    const serverNonce = hexToBytes(fixture.serverNonceHex)
    if (clientEntropy === null || serverNonce === null) {
      throw new Error('fixture com hex inválido')
    }

    const seedOrdemFixture = await tiebreakSeed(
      clientEntropy,
      serverNonce,
      fixture.sessionId,
      fixture.tiedIds, // [42, 7, 19]
    )
    const seedOrdemAscendente = await tiebreakSeed(
      clientEntropy,
      serverNonce,
      fixture.sessionId,
      [7, 19, 42],
    )
    const seedOrdemReversa = await tiebreakSeed(
      clientEntropy,
      serverNonce,
      fixture.sessionId,
      [42, 19, 7],
    )

    expect(bytesToHex(seedOrdemAscendente)).toBe(bytesToHex(seedOrdemFixture))
    expect(bytesToHex(seedOrdemReversa)).toBe(bytesToHex(seedOrdemFixture))
  })
})

describe('pickTiebreakIndex — vetor dourado', () => {
  test.each(Object.entries(fixture.pickIndexByN))(
    'n=%s devolve o mesmo índice que PickTiebreakIndex do Go',
    async (n, expectedIdx) => {
      const seed = hexToBytes(fixture.seedHex)
      if (seed === null) throw new Error('fixture com hex inválido')

      const idx = await pickTiebreakIndex(seed, Number(n))
      expect(idx).toBe(expectedIdx)
    },
  )

  // ⚠️ n=8 é o caso do brief: potência de 2, onde `limit` teria que valer
  // exatamente 2^32 (o Go mantém `limit` em uint64 de propósito — um
  // uint32 daria 0 ali). Índice sempre em [0, n), nunca undefined/NaN por
  // um loop que nunca aceita nenhuma janela.
  test('n=8 (potência de 2) devolve índice determinístico em [0, 8) — não quebra o cálculo do limite', async () => {
    const seed = hexToBytes(fixture.seedHex)
    if (seed === null) throw new Error('fixture com hex inválido')

    const idx = await pickTiebreakIndex(seed, 8)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(8)
    expect(idx).toBe(fixture.pickIndexByN['8'])
  })

  test('n<=1 devolve 0 sem tentar ler nenhuma janela (espelha o guard do Go)', async () => {
    const seed = new Uint8Array(0)
    expect(await pickTiebreakIndex(seed, 1)).toBe(0)
    expect(await pickTiebreakIndex(seed, 0)).toBe(0)
  })
})

describe('tiebreak.routeScenario — segundo vetor dourado (serverNonce de 32 bytes)', () => {
  // ⚠️ Mesma metodologia do vetor acima, mas com um serverNonce de 32
  // bytes — o tamanho REAL que a rota gera via `crypto.getRandomValues`
  // (o vetor principal usa 16 só pra testar as funções puras isoladas).
  // `routes/votacao.test.ts` mocka `crypto.getRandomValues` pra devolver
  // EXATAMENTE este nonce e confere que a ROTA produz `winnerMovieId` —
  // este teste prova que as funções puras, sozinhas, já concordam com o Go
  // pra esse cenário; o teste de rota prova que o HTTP wiring não perde
  // essa paridade no caminho.
  const cenario = fixture.routeScenario

  test('seed e índice batem com o Go para o cenário usado no teste de rota', async () => {
    const clientEntropy = hexToBytes(cenario.clientEntropyHex)
    const serverNonce = hexToBytes(cenario.serverNonceHex)
    if (clientEntropy === null || serverNonce === null) {
      throw new Error('fixture com hex inválido')
    }
    expect(serverNonce.length).toBe(32)

    const seed = await tiebreakSeed(
      clientEntropy,
      serverNonce,
      cenario.sessionId,
      cenario.tiedIds,
    )
    expect(bytesToHex(seed)).toBe(cenario.seedHex)

    const idx = await pickTiebreakIndex(seed, 3)
    expect(idx).toBe(cenario.idx)

    const sortedTiedIds = [...cenario.tiedIds].sort((a, b) => a - b)
    expect(sortedTiedIds[idx]).toBe(cenario.winnerMovieId)
  })
})

describe('hexToBytes / bytesToHex', () => {
  test('roundtrip preserva os bytes', () => {
    const bytes = hexToBytes('00ff10')
    expect(bytes).not.toBeNull()
    if (bytes === null) return
    expect(Array.from(bytes)).toEqual([0x00, 0xff, 0x10])
    expect(bytesToHex(bytes)).toBe('00ff10')
  })

  test('comprimento ímpar devolve null (hex inválido)', () => {
    expect(hexToBytes('abc')).toBeNull()
  })

  test('caractere fora do alfabeto hex devolve null', () => {
    expect(hexToBytes('zz')).toBeNull()
  })

  test('string vazia devolve um array vazio, não null', () => {
    const bytes = hexToBytes('')
    expect(bytes).not.toBeNull()
    expect(bytes?.length).toBe(0)
  })
})
