import { useEffect, useState } from 'react'

interface Marca {
  chave: string | null
  vez: number
}

export function useCopiado(ms = 1400) {
  const [marca, setMarca] = useState<Marca>({ chave: null, vez: 0 })

  useEffect(() => {
    if (marca.chave === null) return
    const temporizador = setTimeout(
      () => setMarca((m) => ({ chave: null, vez: m.vez })),
      ms,
    )
    return () => clearTimeout(temporizador)
  }, [marca, ms])

  return {
    chave: marca.chave,
    marcar: (chave: string) => setMarca((m) => ({ chave, vez: m.vez + 1 })),
    limpar: () => setMarca((m) => ({ chave: null, vez: m.vez })),
  }
}
