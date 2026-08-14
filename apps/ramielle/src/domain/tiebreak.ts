/**
 * Desempate auditável/recomputável — porte 1:1 das duas funções PURAS de
 * `apps/api/internal/votacao/tiebreak.go` (`TiebreakSeed`,
 * `PickTiebreakIndex`). Sem D1, sem HTTP: só bytes in, bytes/índice out —
 * mesma razão de isolamento de `domain/tally.ts` (é o tipo de lógica que dá
 * pra testar contra um vetor dourado sem nenhum binding no meio).
 *
 * ⚠️ **M8 (revisão final): "provably-fair" foi trocado por "auditável/
 * recomputável" em toda a fatia** (aqui, `domain/votes.ts`,
 * `routes/votacao.ts`, `apps/ramielle/CLAUDE.md`) — termo herdado do Go
 * mas afirmado aqui como se fosse um fato MEDIDO, quando não é: o
 * `server_nonce` sai público na própria resposta, o que garante que
 * qualquer pessoa consegue RECOMPUTAR o sorteio a partir do que a API
 * devolveu (é o que os parágrafos abaixo e os testes provam de verdade).
 * "Provably-fair" no sentido técnico do termo (não-manipulável nem PELO
 * SERVIDOR) exigiria um COMMIT prévio do nonce antes de ver a entropia do
 * cliente — não é o que este desenho faz, nem o que o Go faz. O resultado
 * tem que ser **auditável**: qualquer pessoa com `clientEntropy`,
 * `serverNonce` (os dois saem em hex na resposta/registro de auditoria),
 * `sessionId` e os `tiedIds` tem que conseguir recomputar o MESMO vencedor.
 * Isso significa bit a bit igual ao Go, não "um sorteio justo qualquer" —
 * daí o vetor dourado em `routes/__fixtures__/go-parity.json#tiebreak`,
 * gerado rodando o Go de verdade (ver `domain/tiebreak.test.ts` e o report
 * da Task 5).
 */

/**
 * `Uint8Array<ArrayBuffer>` em vez do `Uint8Array` bare em toda esta
 * arquivo — TS 5.7+ tornou `Uint8Array` genérico sobre o tipo do buffer que
 * o apoia, com DEFAULT `ArrayBufferLike` (não `ArrayBuffer`); a assinatura
 * de `SubtleCrypto#digest` (`worker-configuration.d.ts`) pede
 * `ArrayBufferView<ArrayBuffer>`. Os dois defaults DIVERGEM, e sem esta
 * anotação explícita o compilador rejeita passar um `Uint8Array` "normal"
 * pro `crypto.subtle.digest(...)`. Todo array de bytes deste arquivo é de
 * fato apoiado num `ArrayBuffer` real (nunca `SharedArrayBuffer`) — é só
 * precisão de tipo, nenhuma mudança de comportamento em runtime.
 */
type Bytes = Uint8Array<ArrayBuffer>

/**
 * `uint64BE` do Go (`binary.BigEndian.PutUint64`) — 8 bytes big-endian.
 * `BigInt(n)` + `DataView#setBigUint64` em vez de qualquer operador
 * bitwise: os ids são `INTEGER` do D1 (seguros até 2^53 como `number`), e
 * `setBigUint64` grava a representação de 64 bits corretamente sem passar
 * por uma conversão de 32 bits no meio do caminho.
 */
function uint64BE(n: number): Bytes {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigUint64(0, BigInt(n), false)
  return bytes
}

function concatBytes(...parts: Bytes[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * Porte de `TiebreakSeed` (`tiebreak.go:11-25`): SHA-256 sobre
 * `clientEntropy || serverNonce || uint64BE(sessionId) || uint64BE(id)...`.
 *
 * ⚠️ **Os `tiedIds` são ordenados ASCENDENTE antes de escrever no hash** —
 * exatamente como o Go (`sort.Slice`) — para o seed independer da ordem em
 * que o chamador passou os ids (reprodutível/auditável mesmo que dois
 * clientes montem a lista em ordens diferentes). Mutar essa linha pra não
 * ordenar é a mutação obrigatória do brief da Task 5: o teste do vetor
 * dourado usa `tiedIds` FORA de ordem de propósito e tem que quebrar sem
 * o sort.
 *
 * Assíncrona porque `crypto.subtle.digest` é assíncrono no runtime do
 * Worker (WebCrypto, não o `crypto/sha256` síncrono do Go).
 */
export async function tiebreakSeed(
  clientEntropy: Bytes,
  serverNonce: Bytes,
  sessionId: number,
  tiedIds: number[],
): Promise<Bytes> {
  const sortedIds = [...tiedIds].sort((a, b) => a - b)
  const message = concatBytes(
    clientEntropy,
    serverNonce,
    uint64BE(sessionId),
    ...sortedIds.map(uint64BE),
  )
  const digest = await crypto.subtle.digest('SHA-256', message)
  return new Uint8Array(digest)
}

/**
 * Porte de `PickTiebreakIndex` (`tiebreak.go:28-46`): rejection sampling
 * sobre janelas de 32 bits BIG-ENDIAN do seed. `limit` é a maior múltipla
 * de `n` que cabe em 2^32; um `x` lido é aceito (e vira `x % n`) só se
 * `x < limit` — o que descarta o "resto" do espaço de 32 bits que não
 * daria pra distribuir igualmente entre os `n` buckets, evitando viés.
 *
 * ⚠️ **`limit` usa `Number`, não operadores bitwise.** `2 ** 32` (4 294 967
 * 296) é exatamente representável como `number` (bem abaixo de 2^53), e
 * `Math.floor(2**32 / n) * n` reproduz fielmente o `uint64` do Go — que o
 * comentário do Go explica ser DE PROPÓSITO: pra `n` potência de 2 (ex.:
 * `n=8`), `limit` vale EXATAMENTE `2^32`, e um `uint32` (ou qualquer
 * operador `|`/`>>>`/`<<` do JS, que trunca pra inteiro de 32 bits com
 * sinal) daria 0 ali — o loop nunca aceitaria window nenhuma, infinito. O
 * vetor dourado inclui `n=8` justo pra pegar essa aresta.
 *
 * `DataView#getUint32(off, false)` lê a janela big-endian sem bitwise
 * nenhum, devolvendo um `number` sem sinal correto (0..2^32-1) direto.
 *
 * Quando os bytes acabam sem nenhum `x < limit`, re-hasheia o buffer atual
 * (`sha256(cur)`) e continua — astronomicamente improvável de disparar,
 * mas é o que o Go faz, não um `throw`.
 */
export async function pickTiebreakIndex(
  seed: Bytes,
  n: number,
): Promise<number> {
  if (n <= 1) return 0
  const limit = Math.floor(2 ** 32 / n) * n

  let cur = seed
  for (;;) {
    for (let offset = 0; offset + 4 <= cur.length; offset += 4) {
      const view = new DataView(cur.buffer, cur.byteOffset + offset, 4)
      const x = view.getUint32(0, false)
      if (x < limit) return x % n
    }
    const digest = await crypto.subtle.digest('SHA-256', cur)
    cur = new Uint8Array(digest)
  }
}

/**
 * `hex.DecodeString` do Go: aceita só um número PAR de caracteres, todos do
 * alfabeto hex (`0-9a-fA-F`) — devolve `null` (nunca lança) pra quem chama
 * decidir o 400 `invalid_entropy`. String vazia é hex válido (array vazio),
 * a checagem de "pelo menos 16 bytes" é responsabilidade de quem chama
 * (a rota), não desta função.
 */
export function hexToBytes(hex: string): Bytes | null {
  if (hex.length % 2 !== 0) return null
  if (!/^[0-9a-fA-F]*$/.test(hex)) return null

  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.substr(i * 2, 2), 16)
  }
  return out
}

/** `hex.EncodeToString` do Go — sempre minúsculo, sempre par. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
