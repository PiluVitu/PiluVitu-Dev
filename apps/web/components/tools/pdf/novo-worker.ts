// Fica sozinho neste arquivo porque o Jest (CommonJS) não compila import.meta.
export function novoWorkerDePdf(): Worker {
  return new Worker(new URL('./pdf.worker.ts', import.meta.url))
}
