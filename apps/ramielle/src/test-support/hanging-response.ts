/**
 * Helper de teste COMPARTILHADO pelos 4 adapters de distribuição
 * (`lib/publishers/*.test.ts`) — extraído no fix round 1 da Task 2 (mesmo
 * critério de extração que `gsheets-mock.ts` já documenta: usado por mais
 * de uma cópia de teste).
 *
 * Simula uma plataforma que responde os HEADERS normalmente mas nunca
 * termina de mandar o CORPO — o cenário exato da armadilha I1: sem o
 * `AbortSignal` cobrindo a leitura do corpo (não só o `fetch()` inicial), o
 * adapter travaria pra sempre. `signal`, quando passado, é o MESMO
 * `AbortSignal` que o mock de `fetch` recebeu de `init.signal` — abortar
 * esse sinal (por timeout ou não) erra o stream, simulando o que o runtime
 * de verdade faz quando o `AbortSignal` de um `fetch()` dispara enquanto o
 * corpo ainda está sendo lido.
 */
export function respostaComCorpoQueNuncaResolve(
  status: number,
  signal?: AbortSignal | null,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (!signal) return // nunca enqueue, nunca close — corpo "estola" pra sempre.
      if (signal.aborted) {
        controller.error(
          signal.reason ?? new DOMException('abortado', 'AbortError'),
        )
        return
      }
      signal.addEventListener('abort', () => {
        controller.error(
          signal.reason ?? new DOMException('abortado', 'AbortError'),
        )
      })
    },
  })
  return new Response(stream, { status })
}
