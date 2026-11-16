'use client'

import { createContext, useContext, useMemo, useState } from 'react'

export type DocumentoPdf = {
  /** O PDF aberto, só na memória da aba; nunca vai para storage nem para a rede. */
  arquivo: File | null
  guardar(arquivo: File): void
  soltar(): void
}

const Contexto = createContext<DocumentoPdf | null>(null)

// Mora no layout de /tools/pdf: o arquivo passa de um modo para outro e some quando a pessoa sai do editor.
export function DocumentoPdfProvider({
  children,
  arquivoInicial = null,
}: {
  children: React.ReactNode
  /** Para stories e testes: o editor já aberto com um PDF, como quem chega do mesclar. */
  arquivoInicial?: File | null
}) {
  const [arquivo, setArquivo] = useState<File | null>(arquivoInicial)
  const valor = useMemo<DocumentoPdf>(
    () => ({ arquivo, guardar: setArquivo, soltar: () => setArquivo(null) }),
    [arquivo],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useDocumentoPdf(): DocumentoPdf {
  const documento = useContext(Contexto)
  if (!documento) {
    throw new Error('useDocumentoPdf precisa do DocumentoPdfProvider')
  }
  return documento
}
