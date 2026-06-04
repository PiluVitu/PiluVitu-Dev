'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'

async function jsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error?.message ?? 'Falha na operação')
  return body
}

export interface UploadInput {
  filename: string
  base64: string
  contentType?: string
}

export function useMediaMutations() {
  const qc = useQueryClient()
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['admin', 'media'] })

  const upload = useMutation({
    mutationFn: (
      input: UploadInput,
    ): Promise<{ path: string; filename: string }> =>
      fetch('/api/admin/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(jsonOrThrow),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (filename: string) =>
      fetch(`/api/admin/media/${filename}`, { method: 'DELETE' }).then(
        jsonOrThrow,
      ),
    onSuccess: invalidate,
  })

  return { upload, remove }
}

/** Reads a File as { base64 (no data: prefix), contentType }. */
export async function fileToUpload(file: File): Promise<{
  filename: string
  base64: string
  contentType: string
}> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = String(reader.result)
      resolve(r.slice(r.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return { filename: file.name, base64, contentType: file.type }
}
