import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { browser, type Browser } from 'wxt/browser'

export const MENU = {
  preencher: 'preencher',
  inserir: 'inserir',
  novaPessoa: 'nova-pessoa',
  abrirCaixa: 'abrir-caixa',
} as const

export const PREFIXO_INSERIR = 'inserir:'

export const ITENS_INSERIR: readonly {
  kind: FieldKind
  rotulo: string
  grupo: 1 | 2 | 3 | 4 | 5
}[] = [
  { kind: 'nomeCompleto', rotulo: 'Nome completo', grupo: 1 },
  { kind: 'nascimento', rotulo: 'Data de nascimento', grupo: 1 },
  { kind: 'cpf', rotulo: 'CPF', grupo: 1 },
  { kind: 'rg', rotulo: 'RG', grupo: 1 },
  { kind: 'celular', rotulo: 'Celular', grupo: 1 },
  { kind: 'email', rotulo: 'E-mail', grupo: 1 },
  { kind: 'senha', rotulo: 'Senha', grupo: 1 },
  { kind: 'cep', rotulo: 'CEP', grupo: 2 },
  { kind: 'logradouro', rotulo: 'Rua', grupo: 2 },
  { kind: 'numeroEndereco', rotulo: 'Número', grupo: 2 },
  { kind: 'complemento', rotulo: 'Complemento', grupo: 2 },
  { kind: 'bairro', rotulo: 'Bairro', grupo: 2 },
  { kind: 'cidade', rotulo: 'Cidade', grupo: 2 },
  { kind: 'uf', rotulo: 'UF', grupo: 2 },
  { kind: 'razaoSocial', rotulo: 'Razão social', grupo: 3 },
  { kind: 'nomeFantasia', rotulo: 'Nome fantasia', grupo: 3 },
  { kind: 'cnpj', rotulo: 'CNPJ', grupo: 3 },
  { kind: 'cartaoNumero', rotulo: 'Cartão: número', grupo: 4 },
  { kind: 'cartaoNome', rotulo: 'Cartão: nome impresso', grupo: 4 },
  { kind: 'cartaoValidade', rotulo: 'Cartão: validade', grupo: 4 },
  { kind: 'cartaoCvv', rotulo: 'Cartão: CVV', grupo: 4 },
  { kind: 'pis', rotulo: 'PIS/NIS', grupo: 5 },
  { kind: 'tituloEleitor', rotulo: 'Título de eleitor', grupo: 5 },
]

type Propriedades = Browser.contextMenus.CreateProperties
type ItemInserir = (typeof ITENS_INSERIR)[number]

const PAGINA_E_CAMPO: Propriedades['contexts'] = ['page', 'editable']
const CAMPO: Propriedades['contexts'] = ['editable']

function tituloDoItem(item: ItemInserir, pessoa: Pessoa | null): string {
  if (pessoa && item.kind === 'cpf') return `CPF · ${pessoa.cpf}`
  if (pessoa && item.kind === 'cep') return `CEP · ${pessoa.endereco.cep}`
  return item.rotulo
}

export async function criarMenus(pessoa: Pessoa | null): Promise<void> {
  await browser.contextMenus.removeAll()
  const criar = (propriedades: Propriedades) =>
    browser.contextMenus.create(propriedades)
  criar({
    id: MENU.preencher,
    title: 'Preencher esta página',
    contexts: PAGINA_E_CAMPO,
  })
  criar({ id: 'separador-1', type: 'separator', contexts: PAGINA_E_CAMPO })
  criar({ id: MENU.inserir, title: 'Inserir', contexts: CAMPO })
  ITENS_INSERIR.forEach((item, i) => {
    if (i > 0 && ITENS_INSERIR[i - 1].grupo !== item.grupo) {
      criar({
        id: `inserir-separador-${item.grupo}`,
        parentId: MENU.inserir,
        type: 'separator',
        contexts: CAMPO,
      })
    }
    criar({
      id: `${PREFIXO_INSERIR}${item.kind}`,
      parentId: MENU.inserir,
      title: tituloDoItem(item, pessoa),
      contexts: CAMPO,
    })
  })
  criar({ id: 'separador-2', type: 'separator', contexts: PAGINA_E_CAMPO })
  criar({ id: MENU.novaPessoa, title: 'Nova pessoa', contexts: PAGINA_E_CAMPO })
  criar({
    id: MENU.abrirCaixa,
    title: 'Abrir caixa de entrada',
    contexts: PAGINA_E_CAMPO,
  })
}

export async function atualizarTitulosMenu(
  pessoa: Pessoa | null,
): Promise<void> {
  const comValor = ITENS_INSERIR.filter(
    (item) => item.kind === 'cpf' || item.kind === 'cep',
  )
  await Promise.all(
    comValor.map((item) =>
      browser.contextMenus
        .update(`${PREFIXO_INSERIR}${item.kind}`, {
          title: tituloDoItem(item, pessoa),
        })
        // Menu ainda não criado: criarMenus o cria já com o título certo.
        .catch(() => undefined),
    ),
  )
}
