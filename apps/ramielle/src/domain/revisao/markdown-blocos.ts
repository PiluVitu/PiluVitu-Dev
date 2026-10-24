export type Bloco = { tipo: 'prosa' | 'passthrough'; texto: string }

// Mesmo conjunto do str.isspace() do Python: o trim() do JS difere (remove o
// U+FEFF, mantém U+001C–U+001F e U+0085) e mudaria a classificação de um bloco.
const ESPACO_PYTHON =
  '\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000'

function despir(texto: string): string {
  let inicio = 0
  let fim = texto.length
  while (inicio < fim && ESPACO_PYTHON.includes(texto[inicio])) inicio++
  while (fim > inicio && ESPACO_PYTHON.includes(texto[fim - 1])) fim--
  return texto.slice(inicio, fim)
}

function linhasComQuebra(texto: string): string[] {
  if (texto === '') return []
  const partes = texto.split('\n')
  const linhas = partes.slice(0, -1).map((p) => p + '\n')
  const ultima = partes[partes.length - 1]
  if (ultima !== '') linhas.push(ultima)
  return linhas
}

function ePassthrough(linhas: string[]): boolean {
  const primeira = linhas.map(despir).find((l) => l !== '') ?? ''
  if (primeira === '') return true
  return ['|', '<', '>', '!['].some((p) => primeira.startsWith(p))
}

export function dividirBlocos(entrada: string): Bloco[] {
  const linhas = linhasComQuebra(entrada)
  const blocos: Bloco[] = []
  let atual: string[] = []
  let atualVazio = false

  const descarregar = () => {
    if (atual.length === 0) return
    const tipo = atualVazio || ePassthrough(atual) ? 'passthrough' : 'prosa'
    blocos.push({ tipo, texto: atual.join('') })
    atual = []
    atualVazio = false
  }

  let i = 0
  while (i < linhas.length) {
    const linha = linhas[i]
    const despida = despir(linha)

    if (despida.startsWith('```')) {
      descarregar()
      const cerca = [linha]
      i++
      while (i < linhas.length) {
        cerca.push(linhas[i])
        const fechou = despir(linhas[i]).startsWith('```')
        i++
        if (fechou) break
      }
      blocos.push({ tipo: 'passthrough', texto: cerca.join('') })
      continue
    }

    const vazia = despida === ''
    if (atual.length > 0 && vazia !== atualVazio) descarregar()
    atualVazio = vazia
    atual.push(linha)
    i++
  }

  descarregar()
  return blocos
}

const BORDA = ' \t\r\n'

export function restaurarBordas(original: string, corrigido: string): string {
  let inicio = 0
  while (inicio < original.length && BORDA.includes(original[inicio])) inicio++
  let fim = original.length
  while (fim > 0 && BORDA.includes(original[fim - 1])) fim--
  return original.slice(0, inicio) + corrigido + original.slice(fim)
}
