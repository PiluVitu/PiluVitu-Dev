// Espelham os limites do ramielle (`routes/transcricao.ts`) e do promeia:
// barrar aqui evita subir 40 MB pelo túnel só para ouvir "não" do outro lado.
export const MAX_AUDIOS = 10
export const MAX_BYTES_TOTAL = 40 * 1024 * 1024

export function mover<T>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  const alvo = indice + direcao
  if (alvo < 0 || alvo >= lista.length) return lista
  const copia = [...lista]
  ;[copia[indice], copia[alvo]] = [copia[alvo], copia[indice]]
  return copia
}

export function remover<T>(lista: T[], indice: number): T[] {
  return lista.filter((_, i) => i !== indice)
}

export function problemaDaFila(audios: File[]): string | null {
  if (audios.length === 0) return 'Escolha ao menos um áudio.'
  if (audios.length > MAX_AUDIOS) {
    return `No máximo ${MAX_AUDIOS} áudios por vez — há ${audios.length}.`
  }
  const total = audios.reduce((soma, a) => soma + a.size, 0)
  if (total > MAX_BYTES_TOTAL) {
    return `Os áudios somam mais que ${MAX_BYTES_TOTAL / (1024 * 1024)} MB.`
  }
  return null
}
