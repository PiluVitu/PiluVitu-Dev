/**
 * Helpers HTTP compartilhados pelos 4 adapters de distribuição — extraídos
 * no fix round 1 da revisão da Task 2. Antes, cada adapter tinha sua PRÓPRIA
 * cópia desta lógica, e a cópia tinha dois bugs reais:
 *
 * 1. **O timeout de 30s não cobria a leitura do corpo** (I1 do fix round 1).
 *    O `clearTimeout(timeoutId)` de um `AbortController` manual rodava no
 *    `finally` do bloco que envolvia só o `fetch(...)` — disparava assim
 *    que os HEADERS chegavam, deixando todo `res.text()`/`res.json()`
 *    posterior SEM limite de tempo nenhum. O `http.Client{Timeout: 30s}` do
 *    Go documenta cobrir "connection time, any redirects, and reading the
 *    response body" — o porte não cobria a última parte. Corrigido: em vez
 *    de `AbortController` + `clearTimeout`, cada `fetch()` recebe
 *    `AbortSignal.timeout(timeoutMs)` DIRETO — sem `clearTimeout` nenhum
 *    pra esquecer, e o mesmo sinal permanece "vivo" (associado ao corpo da
 *    resposta) até a leitura do corpo terminar.
 * 2. **O corpo de erro era lido por inteiro pra memória e só DEPOIS cortado
 *    em unidades UTF-16** (M6). O Go usa `io.LimitReader(res.Body, 4096)` —
 *    nunca baixa mais que 4096 BYTES. `lerCorpoErroLimitado` abaixo lê o
 *    stream em bytes, parando assim que atinge o limite.
 *
 * ⚠️ **`AbortSignal.timeout()` neste runtime (Cloudflare Workers/workerd,
 * medido via `@cloudflare/vitest-pool-workers` — que roda o workerd real,
 * não um shim) produz um `DOMException` com `.name === 'TimeoutError'`, NÃO
 * `'AbortError'`.** `'AbortError'` é o nome que só um `AbortController
 * .abort()` MANUAL (sem `reason`) produz. `isTimeoutErro` checa os dois por
 * segurança, mas é `TimeoutError` que dispara na prática — divergência do
 * que a sugestão inicial do fix round 1 presumia (por analogia, sem medir),
 * corrigida aqui depois de uma inspeção direta do `DOMException.name`
 * dentro deste runtime.
 */

/**
 * Bytes, não caracteres — equivalente ao `io.LimitReader(res.Body, 4096)`
 * que cada adapter Go usa antes de montar a mensagem de erro (`devto.go:60`,
 * `hashnode.go:62`, `bluesky.go:121`, `mastodon.go:58`).
 */
export const LIMITE_CORPO_ERRO_BYTES = 4096

/**
 * Lê no máximo `LIMITE_CORPO_ERRO_BYTES` BYTES do corpo de uma resposta de
 * erro, sem baixar o resto pra memória. Corta em bytes — pode partir um
 * caractere multi-byte UTF-8 ao meio perto do limite; aceitável aqui (é só
 * texto de diagnóstico pro `distribution_targets.error`, não algo
 * re-parseado), e o próprio Go também não se preocupa com isso
 * (`bytes.TrimSpace` sobre bytes crus, sem validação de UTF-8).
 */
export async function lerCorpoErroLimitado(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const pedacos: Uint8Array[] = []
  let total = 0
  try {
    while (total < LIMITE_CORPO_ERRO_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      pedacos.push(value)
      total += value.byteLength
    }
  } finally {
    // Libera o resto do stream sem esperar por ele — nunca baixa o corpo
    // inteiro só pra descartar depois (mesmo objetivo do LimitReader do Go).
    void reader.cancel().catch(() => {})
  }
  const buffer = new Uint8Array(Math.min(total, LIMITE_CORPO_ERRO_BYTES))
  let offset = 0
  for (const pedaco of pedacos) {
    if (offset >= buffer.length) break
    const fatia = pedaco.subarray(0, buffer.length - offset)
    buffer.set(fatia, offset)
    offset += fatia.length
  }
  return new TextDecoder().decode(buffer).trim()
}

/**
 * `true` quando `err` é o `DOMException` que `AbortSignal.timeout()`
 * produz ao disparar — ver o aviso no topo do arquivo sobre `TimeoutError`
 * vs `AbortError`.
 */
export function isTimeoutErro(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'TimeoutError' || err.name === 'AbortError')
  )
}

/** Mensagem fixa de timeout — nunca inclui corpo/URL (mesma disciplina anti-vazamento do resto do arquivo). */
export function mensagemTimeout(
  plataforma: string,
  timeoutMs: number,
  contexto?: string,
): string {
  const sufixo = contexto ? ` (${contexto})` : ''
  return `${plataforma}: tempo limite de ${timeoutMs / 1000}s excedido${sufixo}`
}
