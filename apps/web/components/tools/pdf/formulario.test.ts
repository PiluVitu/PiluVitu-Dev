import type { CampoDoFormulario } from '@piluvitu/tools/pdf-regras'
import {
  caixasDoFoco,
  campoNoPonto,
  ehPreenchivel,
  obrigatoriosVazios,
  opcoesNaOrdem,
  paginaDoFoco,
  rolagemParaMostrar,
  temControle,
  valoresIniciais,
  valoresMudados,
} from './formulario'
import { FORMULARIO_DE_TESTE } from './motor-falso'

const { campos } = FORMULARIO_DE_TESTE

const campo = <T extends CampoDoFormulario['tipo']>(id: number, tipo: T) => {
  const achado = campos.find((c) => c.id === id)
  if (!achado || achado.tipo !== tipo) throw new Error(`sem o campo ${id}`)
  return achado as CampoDoFormulario & { tipo: T }
}

describe('o que dá para preencher', () => {
  it('texto, caixa, opções, suspensa e lista, sem motivo para não preencher', () => {
    expect(campos.filter(ehPreenchivel).map((c) => c.id)).toEqual([
      0, 1, 2, 3, 5, 6,
    ])
  })

  it('o somente leitura de texto ainda tem controle (o campo readOnly); /Sig e botão não', () => {
    expect(campos.filter(temControle).map((c) => c.id)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
  })
})

describe('valores', () => {
  it('os iniciais vêm do arquivo, só dos campos que dá para preencher', () => {
    const valores = valoresIniciais(campos)
    expect([...valores.keys()]).toEqual([0, 1, 2, 3, 5, 6])
    expect(valores.get(0)).toEqual({
      id: 0,
      nome: 'pessoa.nome',
      tipo: 'texto',
      valor: '',
    })
    expect(valores.get(2)).toEqual({
      id: 2,
      nome: 'aceito',
      tipo: 'caixa',
      marcada: false,
    })
    expect(valores.get(5)).toEqual({
      id: 5,
      nome: 'uf',
      tipo: 'suspensa',
      valor: 'SP',
    })
    expect(valores.get(6)).toEqual({
      id: 6,
      nome: 'interesses',
      tipo: 'lista',
      valores: ['Azul'],
    })
  })

  it('mudados: só o que difere do arquivo, na ordem dos campos; a lista sem ordem', () => {
    const valores = new Map(valoresIniciais(campos))
    expect(valoresMudados(campos, valores)).toEqual([])

    valores.set(6, {
      id: 6,
      nome: 'interesses',
      tipo: 'lista',
      valores: ['Azul'],
    })
    valores.set(5, { id: 5, nome: 'uf', tipo: 'suspensa', valor: 'RJ' })
    valores.set(0, {
      id: 0,
      nome: 'pessoa.nome',
      tipo: 'texto',
      valor: 'Ana',
    })
    expect(valoresMudados(campos, valores).map((v) => v.id)).toEqual([0, 5])

    const lista = campo(6, 'lista')
    const outraOrdem = new Map(
      valoresIniciais([{ ...lista, valores: ['Azul', 'Verde'] }]),
    )
    outraOrdem.set(6, {
      id: 6,
      nome: 'interesses',
      tipo: 'lista',
      valores: ['Verde', 'Azul'],
    })
    expect(
      valoresMudados([{ ...lista, valores: ['Azul', 'Verde'] }], outraOrdem),
    ).toEqual([])
    outraOrdem.set(6, {
      id: 6,
      nome: 'interesses',
      tipo: 'lista',
      valores: ['Verde'],
    })
    expect(
      valoresMudados([{ ...lista, valores: ['Azul', 'Verde'] }], outraOrdem),
    ).toHaveLength(1)
  })

  it('voltar ao valor do arquivo deixa de ser mudança', () => {
    const valores = new Map(valoresIniciais(campos))
    valores.set(2, { id: 2, nome: 'aceito', tipo: 'caixa', marcada: true })
    expect(valoresMudados(campos, valores)).toHaveLength(1)
    valores.set(2, { id: 2, nome: 'aceito', tipo: 'caixa', marcada: false })
    expect(valoresMudados(campos, valores)).toEqual([])
  })

  it('obrigatórios vazios: texto só com espaços, caixa desmarcada, sem escolha, lista vazia', () => {
    const valores = new Map(valoresIniciais(campos))
    expect(obrigatoriosVazios(campos, valores).map((c) => c.id)).toEqual([0, 2])
    valores.set(0, {
      id: 0,
      nome: 'pessoa.nome',
      tipo: 'texto',
      valor: '   ',
    })
    valores.set(2, { id: 2, nome: 'aceito', tipo: 'caixa', marcada: true })
    expect(obrigatoriosVazios(campos, valores).map((c) => c.id)).toEqual([0])

    const obrigatorios: CampoDoFormulario[] = [
      { ...campo(3, 'opcoes'), obrigatorio: true },
      { ...campo(6, 'lista'), obrigatorio: true, valores: [] },
    ]
    expect(
      obrigatoriosVazios(obrigatorios, valoresIniciais(obrigatorios)).map(
        (c) => c.id,
      ),
    ).toEqual([3, 6])
  })
})

describe('as opções de botões de opção, na ordem dos widgets', () => {
  it('sem repetir, primeiro as dos widgets, depois as que só a lista tem, e o valor do arquivo que não está nelas', () => {
    const plano = campo(3, 'opcoes')
    expect(opcoesNaOrdem(plano)).toEqual(['Básico', 'Completo'])
    expect(
      opcoesNaOrdem({
        ...plano,
        opcoes: ['Completo', 'Básico', 'Família'],
        valor: 'Antigo',
        widgets: [
          { ...plano.widgets[1] },
          { ...plano.widgets[0] },
          { ...plano.widgets[1], caixa: { ...plano.widgets[1].caixa, y: 400 } },
        ],
      }),
    ).toEqual(['Completo', 'Básico', 'Família', 'Antigo'])
  })
})

describe('o lugar do campo na página', () => {
  it('o clique cai no widget de menor área que contém o ponto, só nos campos com controle', () => {
    expect(campoNoPonto(campos, 0, { x: 80, y: 130 })).toEqual({
      campo: 0,
      widget: 0,
    })
    expect(campoNoPonto(campos, 0, { x: 205, y: 295 })).toEqual({
      campo: 3,
      widget: 1,
    })
    expect(campoNoPonto(campos, 0, { x: 10, y: 10 })).toBeNull()
    // O /Sig e o botão não têm controle no formulário.
    expect(campoNoPonto(campos, 1, { x: 100, y: 620 })).toBeNull()

    const dentro: CampoDoFormulario[] = [
      {
        ...campo(1, 'texto'),
        widgets: [
          { pagina: 0, caixa: { x: 0, y: 0, largura: 300, altura: 300 } },
        ],
      },
      {
        ...campo(2, 'caixa'),
        widgets: [
          { pagina: 0, caixa: { x: 100, y: 100, largura: 10, altura: 10 } },
        ],
      },
    ]
    expect(campoNoPonto(dentro, 0, { x: 105, y: 105 })).toEqual({
      campo: 2,
      widget: 0,
    })
    // Em qualquer ordem: o menor ganha mesmo vindo antes do maior.
    expect(campoNoPonto([...dentro].reverse(), 0, { x: 105, y: 105 })).toEqual({
      campo: 2,
      widget: 0,
    })
  })

  it('o destaque: os widgets do campo na página aberta; no botão de opção, só os da opção focada', () => {
    expect(caixasDoFoco(campos, { campo: 3, widget: 1 }, 0)).toEqual([
      { x: 200, y: 290, largura: 14, altura: 14 },
    ])
    expect(caixasDoFoco(campos, { campo: 3, widget: 1 }, 1)).toEqual([])
    expect(caixasDoFoco(campos, { campo: 5, widget: 0 }, 1)).toEqual([
      { x: 72, y: 100, largura: 120, altura: 22 },
    ])
    expect(caixasDoFoco(campos, null, 0)).toEqual([])
    expect(caixasDoFoco(campos, { campo: 99, widget: 0 }, 0)).toEqual([])
  })

  it('a página do foco é a do widget focado', () => {
    expect(paginaDoFoco(campos, { campo: 5, widget: 0 })).toBe(1)
    expect(paginaDoFoco(campos, { campo: 0, widget: 0 })).toBe(0)
    expect(paginaDoFoco(campos, { campo: 0, widget: 3 })).toBeNull()
    expect(paginaDoFoco(campos, null)).toBeNull()
  })
})

describe('rolagemParaMostrar', () => {
  const vista = { x: 0, y: 0, largura: 400, altura: 300 }

  it('caixa já à vista, com a margem: não rola', () => {
    expect(
      rolagemParaMostrar({ x: 50, y: 50, largura: 40, altura: 20 }, vista, 16),
    ).toBeNull()
  })

  it('caixa abaixo ou à direita: rola só até ela aparecer com a margem', () => {
    expect(
      rolagemParaMostrar(
        { x: 500, y: 700, largura: 40, altura: 20 },
        vista,
        16,
      ),
    ).toEqual({ x: 500 + 40 + 16 - 400, y: 700 + 20 + 16 - 300 })
  })

  it('caixa acima ou à esquerda: rola até o começo dela, menos a margem, sem passar de 0', () => {
    expect(
      rolagemParaMostrar(
        { x: 10, y: 120, largura: 40, altura: 20 },
        { ...vista, x: 200, y: 400 },
        16,
      ),
    ).toEqual({ x: 0, y: 104 })
  })

  it('caixa maior que a vista: o começo dela aparece', () => {
    expect(
      rolagemParaMostrar(
        { x: 0, y: 900, largura: 100, altura: 600 },
        vista,
        16,
      ),
    ).toEqual({ x: 0, y: 884 })
  })
})
