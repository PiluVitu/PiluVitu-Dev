import { describe, expect, it } from 'vitest'
import {
  primeiroNaoReconhecido,
  somarFrames,
  type ResultadoFrame,
} from './resultado'

const linha = (idx: number, rotulo: string, seletor = `input#c${idx}`) => ({
  idx,
  rotulo,
  seletor,
})

const TOPO: ResultadoFrame = {
  preenchidos: [linha(1, 'Nome'), linha(2, 'E-mail'), linha(5, 'CEP')],
  naoReconhecidos: [linha(4, 'Código de indicação', 'input[name="ref_code"]')],
  recusados: [linha(3, 'Senha', 'input[name="senha"]')],
  contentType: 'text/html',
  iframesDeFora: 1,
}
const QUADRO: ResultadoFrame = {
  preenchidos: [linha(1, 'Número do cartão')],
  naoReconhecidos: [linha(2, 'Como nos conheceu?', 'select#origem')],
  recusados: [],
  contentType: 'text/html',
  iframesDeFora: 0,
}

describe('somarFrames', () => {
  it('soma X, Y e k de todos os frames e ignora frame sem resultado', () => {
    const resumo = somarFrames([
      { documentId: 'quadro', frameId: 7, result: QUADRO },
      { documentId: 'morto', frameId: 9, result: null },
      { documentId: 'sem-script', frameId: 11, result: undefined },
      { documentId: 'topo', frameId: 0, result: TOPO },
    ])
    expect(resumo).toMatchObject({ x: 4, y: 7, k: 3 })
  })

  it('lista o frame 0 primeiro, na ordem do DOM, e marca o recusado', () => {
    const resumo = somarFrames([
      { documentId: 'quadro', frameId: 7, result: QUADRO },
      { documentId: 'topo', frameId: 0, result: TOPO },
    ])
    expect(resumo.naoReconhecidos).toEqual([
      {
        documentId: 'topo',
        idx: 3,
        rotulo: 'Senha (recusou o valor)',
        seletor: 'input[name="senha"]',
      },
      {
        documentId: 'topo',
        idx: 4,
        rotulo: 'Código de indicação',
        seletor: 'input[name="ref_code"]',
      },
      {
        documentId: 'quadro',
        idx: 2,
        rotulo: 'Como nos conheceu?',
        seletor: 'select#origem',
      },
    ])
  })

  it('contentType e iframes de fora vêm só do frame 0', () => {
    const resumo = somarFrames([
      {
        documentId: 'quadro',
        frameId: 7,
        result: { ...QUADRO, contentType: 'application/xml', iframesDeFora: 5 },
      },
      { documentId: 'topo', frameId: 0, result: TOPO },
    ])
    expect(resumo).toMatchObject({ contentType: 'text/html', iframesDeFora: 1 })
  })

  it('sem nenhum resultado tudo é zero', () => {
    expect(somarFrames([])).toEqual({
      x: 0,
      y: 0,
      k: 0,
      naoReconhecidos: [],
      contentType: '',
      iframesDeFora: 0,
    })
  })
})

describe('primeiroNaoReconhecido', () => {
  it('é o menor idx entre não reconhecidos e recusados', () => {
    expect(primeiroNaoReconhecido(TOPO)).toBe(3)
  })

  it('é undefined quando tudo foi preenchido', () => {
    expect(
      primeiroNaoReconhecido({ ...TOPO, naoReconhecidos: [], recusados: [] }),
    ).toBeUndefined()
  })
})
