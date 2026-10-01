import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { browser, type Browser } from 'wxt/browser'

export const MENU = {
  preencher: 'botai-preencher',
  inserir: 'botai-inserir',
  novaPessoa: 'botai-nova-pessoa',
  abrirCaixa: 'botai-abrir-caixa',
} as const

export const PREFIXO_INSERIR = 'botai-inserir:'

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
type Contextos = NonNullable<Propriedades['contexts']>
type ItemInserir = (typeof ITENS_INSERIR)[number]

function contextos(...base: Contextos): Contextos {
  // No Firefox 'editable' não inclui campo de senha; o Chrome recusaria o contexto 'password'.
  return import.meta.env.FIREFOX
    ? ([...base, 'password'] as unknown as Contextos)
    : base
}

function tituloDoItem(item: ItemInserir, pessoa: Pessoa | null): string {
  if (pessoa && item.kind === 'cpf') return `CPF · ${pessoa.cpf}`
  if (pessoa && item.kind === 'cep') return `CEP · ${pessoa.endereco.cep}`
  return item.rotulo
}

export async function criarMenus(pessoa: Pessoa | null): Promise<void> {
  await browser.contextMenus.removeAll()
  const paginaECampo = contextos('page', 'editable')
  const campo = contextos('editable')
  const criar = (propriedades: Propriedades) =>
    browser.contextMenus.create(propriedades)
  criar({
    id: MENU.preencher,
    title: 'Preencher esta página',
    contexts: paginaECampo,
  })
  criar({ id: 'botai-sep-1', type: 'separator', contexts: paginaECampo })
  criar({ id: MENU.inserir, title: 'Inserir', contexts: campo })
  ITENS_INSERIR.forEach((item, i) => {
    if (i > 0 && ITENS_INSERIR[i - 1].grupo !== item.grupo) {
      criar({
        id: `botai-sep-inserir-${item.grupo}`,
        parentId: MENU.inserir,
        type: 'separator',
        contexts: campo,
      })
    }
    criar({
      id: `${PREFIXO_INSERIR}${item.kind}`,
      parentId: MENU.inserir,
      title: tituloDoItem(item, pessoa),
      contexts: campo,
    })
  })
  criar({ id: 'botai-sep-2', type: 'separator', contexts: paginaECampo })
  criar({ id: MENU.novaPessoa, title: 'Nova pessoa', contexts: paginaECampo })
  criar({
    id: MENU.abrirCaixa,
    title: 'Abrir caixa de entrada',
    contexts: paginaECampo,
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
