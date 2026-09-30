import {
  MAX_AUDIOS,
  MAX_BYTES_TOTAL,
  mover,
  problemaDaFila,
  remover,
} from './fila'

function audio(nome: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], nome, { type: 'audio/ogg' })
}

describe('mover', () => {
  const [a, b, c] = [audio('a'), audio('b'), audio('c')]

  it('sobe um item uma posição', () => {
    expect(mover([a, b, c], 1, -1)).toEqual([b, a, c])
  })

  it('desce um item uma posição', () => {
    expect(mover([a, b, c], 1, 1)).toEqual([a, c, b])
  })

  // A ordem é o que encadeia o contexto entre áudios no Whisper; um
  // movimento para fora da lista não pode embaralhar nada.
  it('não sai pelas bordas', () => {
    expect(mover([a, b, c], 0, -1)).toEqual([a, b, c])
    expect(mover([a, b, c], 2, 1)).toEqual([a, b, c])
  })

  it('não muta a lista original', () => {
    const lista = [a, b, c]
    mover(lista, 0, 1)
    expect(lista).toEqual([a, b, c])
  })
})

describe('remover', () => {
  it('tira só o índice pedido', () => {
    const [a, b, c] = [audio('a'), audio('b'), audio('c')]
    expect(remover([a, b, c], 1)).toEqual([a, c])
  })
})

describe('problemaDaFila', () => {
  it('fila vazia pede ao menos um áudio', () => {
    expect(problemaDaFila([])).toMatch(/ao menos um áudio/)
  })

  it('fila dentro dos limites não tem problema', () => {
    expect(problemaDaFila([audio('a'), audio('b')])).toBeNull()
  })

  it('exatamente MAX_AUDIOS passa; um a mais não', () => {
    const cheia = Array.from({ length: MAX_AUDIOS }, (_, i) => audio(`${i}`))
    expect(problemaDaFila(cheia)).toBeNull()
    expect(problemaDaFila([...cheia, audio('x')])).toMatch(
      new RegExp(`No máximo ${MAX_AUDIOS}`),
    )
  })

  it('soma exatamente no limite passa; um byte a mais não', () => {
    const metade = MAX_BYTES_TOTAL / 2
    expect(problemaDaFila([audio('a', metade), audio('b', metade)])).toBeNull()
    expect(
      problemaDaFila([audio('a', metade), audio('b', metade + 1)]),
    ).toMatch(/40 MB/)
  })
})
