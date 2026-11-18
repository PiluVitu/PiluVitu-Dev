import {
  LIMITE_DO_DESFAZER_DAS_PAGINAS,
  apagarPaginas,
  desfazerPaginas,
  marcar,
  marcarTodas,
  montagemDaBancada,
  mudarPaginas,
  mudouDoInicio,
  paginasIniciais,
  posicoesMarcadas,
  semMarcadas,
  type PaginaDaBancada,
} from './bancada'
import { CENA_VAZIA, incluirObjeto } from './objetos'
import type { ObjetoNaTela } from './motor'

const ids = (lista: readonly PaginaDaBancada[]) => lista.map(({ id }) => id)

const retangulo: ObjetoNaTela = {
  id: 'r',
  tipo: 'retangulo',
  x: 0,
  y: 0,
  largura: 10,
  altura: 10,
  cor: '#000000',
  espessura: 1,
}

describe('as páginas da Bancada', () => {
  it('começam com o arquivo inteiro na ordem, sem giro, sem marcada e sem desfazer', () => {
    const paginas = paginasIniciais(3)

    expect(paginas.lista).toEqual([
      { id: 'a0p0', origem: { arquivo: 0, indice: 0 }, giro: 0 },
      { id: 'a0p1', origem: { arquivo: 0, indice: 1 }, giro: 0 },
      { id: 'a0p2', origem: { arquivo: 0, indice: 2 }, giro: 0 },
    ])
    expect(paginas.marcadas).toEqual([])
    expect(paginas.passado).toEqual([])
  })

  it('a seleção guarda a ordem em que as páginas foram marcadas, sem passo no desfazer', () => {
    let paginas = paginasIniciais(4)
    paginas = marcar(paginas, 'a0p3', true)
    paginas = marcar(paginas, 'a0p1', true)
    paginas = marcar(paginas, 'a0p3', true)

    expect(paginas.marcadas).toEqual(['a0p3', 'a0p1'])
    expect(posicoesMarcadas(paginas)).toEqual([1, 3])
    expect(paginas.passado).toEqual([])

    paginas = marcar(paginas, 'a0p3', false)
    expect(paginas.marcadas).toEqual(['a0p1'])
  })

  it('marcar todas põe as que faltam no fim, na ordem do documento; e limpar tira todas', () => {
    let paginas = marcar(paginasIniciais(4), 'a0p2', true)
    paginas = marcarTodas(paginas)

    expect(paginas.marcadas).toEqual(['a0p2', 'a0p0', 'a0p1', 'a0p3'])
    expect(semMarcadas(paginas).marcadas).toEqual([])
  })

  it('cada mudança da lista empilha um passo, e desfazer volta lista e seleção; sem refazer', () => {
    const inicio = marcar(paginasIniciais(3), 'a0p0', true)
    const girada = mudarPaginas(inicio, {
      lista: inicio.lista.map((p, i) => (i === 0 ? { ...p, giro: 90 } : p)),
      marcadas: inicio.marcadas,
    })
    const apagada = mudarPaginas(girada, apagarPaginas(girada, [0]))

    expect(ids(apagada.lista)).toEqual(['a0p1', 'a0p2'])
    expect(apagada.marcadas).toEqual([])

    const umaVez = desfazerPaginas(apagada)
    expect(umaVez.lista[0]).toMatchObject({ id: 'a0p0', giro: 90 })
    expect(umaVez.marcadas).toEqual(['a0p0'])

    const duasVezes = desfazerPaginas(umaVez)
    expect(duasVezes.lista[0].giro).toBe(0)
    expect(duasVezes.passado).toEqual([])
    expect(desfazerPaginas(duasVezes)).toBe(duasVezes)
  })

  it(`o desfazer guarda até ${LIMITE_DO_DESFAZER_DAS_PAGINAS} passos`, () => {
    let paginas = paginasIniciais(2)
    for (let i = 0; i < LIMITE_DO_DESFAZER_DAS_PAGINAS + 5; i++) {
      paginas = mudarPaginas(paginas, {
        lista: [...paginas.lista].reverse(),
        marcadas: [],
      })
    }
    expect(paginas.passado).toHaveLength(LIMITE_DO_DESFAZER_DAS_PAGINAS)
  })

  it('apagar tira as páginas da lista e da seleção, e guarda a ordem das outras marcadas', () => {
    let paginas = paginasIniciais(4)
    paginas = marcar(paginas, 'a0p3', true)
    paginas = marcar(paginas, 'a0p1', true)
    paginas = marcar(paginas, 'a0p0', true)

    const sem = apagarPaginas(paginas, [1])

    expect(ids(sem.lista)).toEqual(['a0p0', 'a0p2', 'a0p3'])
    expect(sem.marcadas).toEqual(['a0p3', 'a0p0'])
  })

  it('mudou do início: ordem, páginas a menos ou giro; marcar não conta', () => {
    const inicio = paginasIniciais(3)
    expect(mudouDoInicio(inicio.lista, 3)).toBe(false)
    expect(mudouDoInicio(marcar(inicio, 'a0p1', true).lista, 3)).toBe(false)
    expect(mudouDoInicio([...inicio.lista].reverse(), 3)).toBe(true)
    expect(mudouDoInicio(inicio.lista.slice(1), 3)).toBe(true)
    expect(
      mudouDoInicio(
        inicio.lista.map((p, i) => (i === 2 ? { ...p, giro: 270 } : p)),
        3,
      ),
    ).toBe(true)
  })

  it('a montagem leva a origem, o giro e a moldura de cada página: sem objetos, a moldura é o giro', () => {
    const lista: PaginaDaBancada[] = [
      { id: 'a0p1', origem: { arquivo: 0, indice: 1 }, giro: 90 },
      { id: 'a0p0', origem: { arquivo: 0, indice: 0 }, giro: 180 },
    ]
    const cena = incluirObjeto(CENA_VAZIA, 'a0p1', retangulo, 0)

    expect(montagemDaBancada(lista, cena)).toEqual([
      { id: 'a0p1', origem: { arquivo: 0, indice: 1 }, giro: 90, moldura: 0 },
      {
        id: 'a0p0',
        origem: { arquivo: 0, indice: 0 },
        giro: 180,
        moldura: 180,
      },
    ])
  })
})

describe('a página em branco na Bancada', () => {
  const branca: PaginaDaBancada = {
    id: 'b0',
    origem: { branca: { largura: 595.28, altura: 841.89 } },
    giro: 0,
  }

  it('mudou do início: uma branca no documento é mudança', () => {
    const inicio = paginasIniciais(2)
    expect(mudouDoInicio([...inicio.lista, branca], 2)).toBe(true)
    expect(mudouDoInicio([branca], 0)).toBe(true)
  })

  it('a montagem leva a branca com o tamanho dela, o giro e a moldura da cena', () => {
    const cena = incluirObjeto(CENA_VAZIA, 'b0', retangulo, 90)

    expect(montagemDaBancada([{ ...branca, giro: 90 }], cena)).toEqual([
      { ...branca, giro: 90, moldura: 90 },
    ])
  })

  // O id da branca nova vem dessa conta: desfazer não a volta, senão a próxima branca herdaria os objetos
  // que a cena ainda guarda da desfeita.
  it('a conta das brancas criadas não volta com o desfazer, nem muda com marcar', () => {
    const inicio = paginasIniciais(1)
    expect(inicio.brancasCriadas).toBe(0)
    const comBranca = {
      ...mudarPaginas(inicio, {
        lista: [...inicio.lista, branca],
        marcadas: [],
      }),
      brancasCriadas: 1,
    }

    expect(marcar(comBranca, 'b0', true).brancasCriadas).toBe(1)
    expect(
      mudarPaginas(comBranca, apagarPaginas(comBranca, [1])).brancasCriadas,
    ).toBe(1)
    expect(desfazerPaginas(comBranca).brancasCriadas).toBe(1)
  })
})
