import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { atualizarTitulosMenu, criarMenus, ITENS_INSERIR, MENU } from './menus'

// O fakeBrowser não implementa contextMenus: create/removeAll/update viram stubs.
const criar = vi.fn()
const removerTudo = vi.fn(async () => undefined)
const atualizar = vi.fn(async () => undefined)

interface Criado {
  id: string
  title?: string
  type?: string
  parentId?: string
  contexts: string[]
}
const criados = () =>
  criar.mock.calls.map(([propriedades]) => propriedades as Criado)

beforeEach(() => {
  criar.mockReset()
  removerTudo.mockClear()
  atualizar.mockReset()
  atualizar.mockResolvedValue(undefined)
  Object.assign(fakeBrowser.contextMenus, {
    create: criar,
    removeAll: removerTudo,
    update: atualizar,
  })
})

describe('ITENS_INSERIR', () => {
  it('são os 23 itens do 1g, na ordem, em 5 grupos de 7, 7, 3, 4 e 2', () => {
    expect(ITENS_INSERIR.map((i) => i.rotulo)).toEqual([
      'Nome completo',
      'Data de nascimento',
      'CPF',
      'RG',
      'Celular',
      'E-mail',
      'Senha',
      'CEP',
      'Rua',
      'Número',
      'Complemento',
      'Bairro',
      'Cidade',
      'UF',
      'Razão social',
      'Nome fantasia',
      'CNPJ',
      'Cartão: número',
      'Cartão: nome impresso',
      'Cartão: validade',
      'Cartão: CVV',
      'PIS/NIS',
      'Título de eleitor',
    ])
    expect(
      [1, 2, 3, 4, 5].map(
        (g) => ITENS_INSERIR.filter((i) => i.grupo === g).length,
      ),
    ).toEqual([7, 7, 3, 4, 2])
    expect(ITENS_INSERIR.map((i) => i.kind)).toEqual([
      'nomeCompleto',
      'nascimento',
      'cpf',
      'rg',
      'celular',
      'email',
      'senha',
      'cep',
      'logradouro',
      'numeroEndereco',
      'complemento',
      'bairro',
      'cidade',
      'uf',
      'razaoSocial',
      'nomeFantasia',
      'cnpj',
      'cartaoNumero',
      'cartaoNome',
      'cartaoValidade',
      'cartaoCvv',
      'pis',
      'tituloEleitor',
    ])
  })
})

describe('criarMenus', () => {
  it('apaga os menus antigos antes de criar', async () => {
    await criarMenus(null)
    expect(removerTudo).toHaveBeenCalledTimes(1)
    expect(removerTudo.mock.invocationCallOrder[0]).toBeLessThan(
      criar.mock.invocationCallOrder[0],
    )
  })

  it('monta o nível de cima do 1g com os contextos certos', async () => {
    await criarMenus(null)
    const topo = criados().filter((c) => c.parentId === undefined)
    expect(topo).toEqual([
      {
        id: MENU.preencher,
        title: 'Preencher esta página',
        contexts: ['page', 'editable'],
      },
      { id: 'separador-1', type: 'separator', contexts: ['page', 'editable'] },
      { id: MENU.inserir, title: 'Inserir', contexts: ['editable'] },
      { id: 'separador-2', type: 'separator', contexts: ['page', 'editable'] },
      {
        id: MENU.novaPessoa,
        title: 'Nova pessoa',
        contexts: ['page', 'editable'],
      },
      {
        id: MENU.abrirCaixa,
        title: 'Abrir caixa de entrada',
        contexts: ['page', 'editable'],
      },
    ])
  })

  it('põe os 23 itens e 4 separadores dentro de Inserir, só em campos editáveis', async () => {
    await criarMenus(null)
    const filhos = criados().filter((c) => c.parentId === MENU.inserir)
    expect(filhos).toHaveLength(27)
    expect(
      filhos.every(
        (c) => c.contexts.length === 1 && c.contexts[0] === 'editable',
      ),
    ).toBe(true)
    expect(
      filhos
        .map((c) =>
          c.type === 'separator' ? '|' : c.id.replace('inserir:', ''),
        )
        .join(' '),
    ).toBe(
      'nomeCompleto nascimento cpf rg celular email senha | cep logradouro numeroEndereco complemento bairro cidade uf | razaoSocial nomeFantasia cnpj | cartaoNumero cartaoNome cartaoValidade cartaoCvv | pis tituloEleitor',
    )
  })

  it('mostra o CPF e o CEP da pessoa no título; sem pessoa, só o rótulo', async () => {
    await criarMenus(PESSOA_DOURADA)
    const titulo = (id: string) => criados().find((c) => c.id === id)?.title
    expect(titulo('inserir:cpf')).toBe(`CPF · ${PESSOA_DOURADA.cpf}`)
    expect(titulo('inserir:cep')).toBe(`CEP · ${PESSOA_DOURADA.endereco.cep}`)
    expect(titulo('inserir:email')).toBe('E-mail')

    criar.mockReset()
    await criarMenus(null)
    expect(titulo('inserir:cpf')).toBe('CPF')
    expect(titulo('inserir:cep')).toBe('CEP')
  })
})

describe('atualizarTitulosMenu', () => {
  it('atualiza só os títulos de CPF e CEP', async () => {
    await atualizarTitulosMenu(PESSOA_DOURADA)
    expect(atualizar.mock.calls).toEqual([
      ['inserir:cpf', { title: `CPF · ${PESSOA_DOURADA.cpf}` }],
      ['inserir:cep', { title: `CEP · ${PESSOA_DOURADA.endereco.cep}` }],
    ])
  })

  it('não quebra quando o menu ainda não existe', async () => {
    atualizar.mockRejectedValue(
      new Error('Cannot find menu item with id inserir:cpf'),
    )
    await expect(atualizarTitulosMenu(null)).resolves.toBeUndefined()
  })
})
