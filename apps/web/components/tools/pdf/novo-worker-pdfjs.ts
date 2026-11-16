// Fica sozinho neste arquivo porque o Jest (CommonJS) não compila import.meta.
export function novoWorkerDoPdfjs(): Worker {
  return new Worker(
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
    { type: 'module' },
  )
}
