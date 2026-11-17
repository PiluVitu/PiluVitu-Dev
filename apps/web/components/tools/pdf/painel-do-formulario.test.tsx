import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { Formulario } from '@piluvitu/tools/pdf-regras'
import type { FocoNoCampo } from './formulario'
import { FORMULARIO_DE_TESTE } from './motor-falso'
import { PainelDoFormulario } from './painel-do-formulario'
import { TEXTOS } from './textos'
import { useFormularioDoPdf } from './use-formulario-do-pdf'

const T = TEXTOS.formulario

let container: HTMLDivElement
let root: Root
let focos: (FocoNoCampo | null)[]
let registrados: Map<string, HTMLElement>
let mudancas: unknown[]

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  focos = []
  registrados = new Map()
  mudancas = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

// A tela guarda os valores pelo hook; aqui ele faz o mesmo papel.
function NaTela({
  formulario,
  desabilitado,
}: {
  formulario: Formulario
  desabilitado?: boolean
}) {
  const estado = useFormularioDoPdf(formulario)
  return (
    <>
      <PainelDoFormulario
        formulario={formulario}
        valores={estado.valores}
        erros={estado.erros}
        desabilitado={desabilitado}
        registrar={(id, elemento, opcao) => {
          const chave = opcao === undefined ? `${id}` : `${id}:${opcao}`
          if (elemento) registrados.set(chave, elemento)
          else registrados.delete(chave)
        }}
        aoMudar={(valor, recusados) => {
          mudancas.push(valor)
          estado.mudar(valor, recusados)
        }}
        aoFocar={(foco) => focos.push(foco)}
      />
      <button type="button">fora do formulário</button>
    </>
  )
}

function montar(
  formulario: Formulario = FORMULARIO_DE_TESTE,
  desabilitado = false,
) {
  act(() =>
    root.render(<NaTela formulario={formulario} desabilitado={desabilitado} />),
  )
}

const q = (testId: string) =>
  container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

// O controle pelo nome acessível que vem do label (o texto inteiro do label ligado).
function controle<T extends HTMLElement = HTMLInputElement>(rotulo: string): T {
  const label = Array.from(container.querySelectorAll('label')).find(
    (l) => l.textContent?.trim() === rotulo,
  )
  if (!label) throw new Error(`sem o rótulo "${rotulo}"`)
  const alvo = label.htmlFor
    ? document.getElementById(label.htmlFor)
    : label.querySelector('input')
  return alvo as T
}

function grupo(legenda: string) {
  const achado = Array.from(container.querySelectorAll('fieldset')).find(
    (f) => f.querySelector('legend')?.textContent?.trim() === legenda,
  )
  if (!achado) throw new Error(`sem o grupo "${legenda}"`)
  return achado
}

const descricao = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim())
    .join(' | ')

async function digitar(
  campo: HTMLInputElement | HTMLTextAreaElement,
  valor: string,
) {
  const prototipo =
    campo instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototipo, 'value')!.set!.call(campo, valor)
    campo.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function clicar(alvo: HTMLElement) {
  await act(async () => {
    alvo.focus()
    alvo.click()
  })
}

async function escolher(select: HTMLSelectElement, texto: string) {
  const opcao = Array.from(select.options).find((o) => o.textContent === texto)!
  await act(async () => {
    select.value = opcao.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('a estrutura', () => {
  it('um form de verdade, sem validação do navegador, titulado "Formulário do PDF", com o resumo', () => {
    montar()
    const form = container.querySelector('form')!
    expect(form.noValidate).toBe(true)
    const titulo = document.getElementById(
      form.getAttribute('aria-labelledby')!,
    )!
    expect(titulo.tagName).toBe('H2')
    expect(titulo.textContent).toBe('Formulário do PDF')
    expect(q('formulario-resumo')!.textContent).toBe('9 campos em 2 páginas.')
  })

  it('um fieldset por página, com a legend "Página N", e os campos na ordem de Tab do PDF', () => {
    montar()
    const paginas = Array.from(
      container.querySelectorAll<HTMLFieldSetElement>(
        '[data-testid="formulario-pagina"]',
      ),
    )
    expect(
      paginas.map((p) => p.querySelector(':scope > legend')!.textContent),
    ).toEqual(['Página 1', 'Página 2'])
    expect(
      paginas.map((p) =>
        Array.from(
          p.querySelectorAll<HTMLElement>('[data-testid="formulario-campo"]'),
        ).map((c) => Number(c.dataset.id)),
      ),
    ).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8],
    ])
  })
})

describe('cada tipo de campo', () => {
  it('texto: input com label ligado, "obrigatório" no rótulo, aria-required, a página e o contador', async () => {
    montar()
    const nome = controle('Nome completo (obrigatório)')
    expect(nome.tagName).toBe('INPUT')
    expect(nome.getAttribute('aria-required')).toBe('true')
    expect(nome.maxLength).toBe(40)
    expect(descricao(nome)).toBe('Na página 1. | 0 de 40 caracteres')
    await digitar(nome, 'Ana Souza')
    expect(descricao(nome)).toBe('Na página 1. | 9 de 40 caracteres')
    expect(mudancas.at(-1)).toEqual({
      id: 0,
      nome: 'pessoa.nome',
      tipo: 'texto',
      valor: 'Ana Souza',
    })
  })

  it('texto multilinha vira textarea, sem contador quando não há tamanho máximo', () => {
    montar()
    const endereco = controle<HTMLTextAreaElement>('Endereço')
    expect(endereco.tagName).toBe('TEXTAREA')
    expect(endereco.hasAttribute('aria-required')).toBe(false)
    expect(descricao(endereco)).toBe('Na página 1.')
  })

  it('caixa de marcar vira checkbox', async () => {
    montar()
    const aceito = controle('Aceito os termos (obrigatório)')
    expect(aceito.type).toBe('checkbox')
    expect(aceito.checked).toBe(false)
    await clicar(aceito)
    expect(aceito.checked).toBe(true)
    expect(mudancas.at(-1)).toEqual({
      id: 2,
      nome: 'aceito',
      tipo: 'caixa',
      marcada: true,
    })
  })

  it('botões de opção: um fieldset com legend e um radio por opção; "Limpar a escolha" quando não é obrigatório', async () => {
    montar()
    const plano = grupo('plano')
    expect(plano.getAttribute('role')).toBe('radiogroup')
    const radios = Array.from(
      plano.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    )
    expect(radios.map((r) => r.closest('label')!.textContent)).toEqual([
      'Básico',
      'Completo',
    ])
    expect(q('formulario-limpar-escolha')).toBeNull()

    await clicar(radios[1])
    expect(radios[1].checked).toBe(true)
    expect(mudancas.at(-1)).toEqual({
      id: 3,
      nome: 'plano',
      tipo: 'opcoes',
      valor: 'Completo',
    })

    const limpar = q('formulario-limpar-escolha')!
    expect(limpar.textContent).toBe('Limpar a escolha')
    await clicar(limpar)
    expect(radios.every((r) => !r.checked)).toBe(true)
    expect(mudancas.at(-1)).toMatchObject({ id: 3, valor: null })
    // O botão some; o foco vai para a primeira opção, e não para o body.
    expect(document.activeElement).toBe(radios[0])
  })

  it('suspensa: select com "(nenhuma)" e as opções; o valor do arquivo fora delas não se perde', async () => {
    montar()
    const uf = controle<HTMLSelectElement>('Estado')
    expect(uf.tagName).toBe('SELECT')
    expect(Array.from(uf.options).map((o) => o.textContent)).toEqual([
      '(nenhuma)',
      'SP',
      'RJ',
      'MG',
    ])
    expect(uf.selectedOptions[0].textContent).toBe('SP')
    await escolher(uf, 'RJ')
    expect(mudancas.at(-1)).toEqual({
      id: 5,
      nome: 'uf',
      tipo: 'suspensa',
      valor: 'RJ',
    })
    await escolher(uf, '(nenhuma)')
    expect(mudancas.at(-1)).toMatchObject({ valor: null })

    act(() => root.unmount())
    root = createRoot(container)
    montar({
      ...FORMULARIO_DE_TESTE,
      campos: FORMULARIO_DE_TESTE.campos.map((c) =>
        c.tipo === 'suspensa' ? { ...c, valor: 'DF' } : c,
      ),
    })
    const comExtra = controle<HTMLSelectElement>('Estado')
    expect(Array.from(comExtra.options).map((o) => o.textContent)).toEqual([
      '(nenhuma)',
      'SP',
      'RJ',
      'MG',
      'DF',
    ])
    expect(comExtra.selectedOptions[0].textContent).toBe('DF')
  })

  it('lista de escolha múltipla: um fieldset de checkboxes', async () => {
    montar()
    const interesses = grupo('Interesses')
    const caixas = Array.from(
      interesses.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )
    expect(
      caixas.map((c) => [c.closest('label')!.textContent, c.checked]),
    ).toEqual([
      ['Azul', true],
      ['Verde', false],
      ['Vermelho', false],
    ])
    await clicar(caixas[1])
    expect(mudancas.at(-1)).toEqual({
      id: 6,
      nome: 'interesses',
      tipo: 'lista',
      valores: ['Azul', 'Verde'],
    })
  })

  it('lista de escolha única vira select', () => {
    montar({
      ...FORMULARIO_DE_TESTE,
      campos: FORMULARIO_DE_TESTE.campos.map((c) =>
        c.tipo === 'lista' ? { ...c, multipla: false } : c,
      ),
    })
    const interesses = controle<HTMLSelectElement>('Interesses')
    expect(interesses.tagName).toBe('SELECT')
    expect(interesses.selectedOptions[0].textContent).toBe('Azul')
  })

  it('somente leitura: o campo readOnly com o valor e o motivo', () => {
    montar()
    const protocolo = controle('Protocolo')
    expect(protocolo.readOnly).toBe(true)
    expect(protocolo.value).toBe('2026-0042')
    expect(descricao(protocolo)).toContain(T.naoPreenchivel.somente_leitura)
  })

  it('assinatura digital e botão aparecem no lugar deles, sem controle, com o motivo', () => {
    montar()
    const assinatura = container.querySelector<HTMLElement>(
      '[data-testid="formulario-campo"][data-id="7"]',
    )!
    expect(assinatura.textContent).toContain('Assinatura digital')
    expect(assinatura.textContent).toContain(
      T.naoPreenchivel.assinatura_digital,
    )
    expect(assinatura.querySelector('input, select, textarea')).toBeNull()
    const botao = container.querySelector<HTMLElement>(
      '[data-testid="formulario-campo"][data-id="8"]',
    )!
    expect(botao.textContent).toContain(T.naoPreenchivel.botao)
  })
})

describe('o que a tela fica sabendo', () => {
  it('caractere fora das fontes do PDF nem entra, e o erro do campo vem em role=alert, ligado a ele', async () => {
    montar()
    const nome = controle('Nome completo (obrigatório)')
    await digitar(nome, 'Ana 😀')
    expect(nome.value).toBe('Ana ')
    const erro = q('formulario-erro')!
    expect(erro.getAttribute('role')).toBe('alert')
    expect(erro.textContent).toMatch(/fontes do PDF não/)
    expect(nome.getAttribute('aria-invalid')).toBe('true')
    expect(descricao(nome)).toContain(erro.textContent!)

    await digitar(nome, 'Ana S')
    expect(q('formulario-erro')).toBeNull()
  })

  it('focar um controle chama aoFocar com o widget dele (no radio, o da opção), e sair do form, com null', async () => {
    montar()
    await act(async () => controle('Estado').focus())
    expect(focos.at(-1)).toEqual({ campo: 5, widget: 0 })
    const radios = grupo('plano').querySelectorAll<HTMLInputElement>('input')
    await act(async () => radios[1].focus())
    expect(focos.at(-1)).toEqual({ campo: 3, widget: 1 })
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button:not([data-testid])')!
        .focus(),
    )
    expect(focos.at(-1)).toBeNull()
  })

  it('cada controle é registrado pelo id do campo, e cada radio também pela opção', () => {
    montar()
    expect(registrados.get('0')).toBe(controle('Nome completo (obrigatório)'))
    expect(registrados.get('5')).toBe(controle('Estado'))
    const radios = grupo('plano').querySelectorAll<HTMLInputElement>('input')
    expect(registrados.get('3')).toBe(radios[0])
    expect(registrados.get('3:Completo')).toBe(radios[1])
    expect(registrados.has('7')).toBe(false)
  })

  it('desabilitado (montando o PDF): o form fica inert', () => {
    montar(FORMULARIO_DE_TESTE, true)
    expect(container.querySelector('form')!.hasAttribute('inert')).toBe(true)
  })
})

describe('os avisos do topo', () => {
  it('sem formulário: diz que não tem campos, sem form', () => {
    montar({ tipo: 'nenhum' })
    expect(container.textContent).toContain(T.semFormulario)
    expect(container.querySelector('form')).toBeNull()
  })

  it('XFA puro: explica e não oferece o formulário', () => {
    montar({ tipo: 'xfa' })
    expect(q('formulario-aviso-xfa')!.textContent).toBe(T.xfa)
    expect(container.querySelector('form')).toBeNull()
  })

  it('ilegível: explica, sem form', () => {
    montar({ tipo: 'ilegivel' })
    expect(container.textContent).toContain(T.ilegivel)
    expect(container.querySelector('form')).toBeNull()
  })

  it('híbrido e assinado digitalmente: o aviso de cada um, com o formulário', () => {
    montar({
      ...FORMULARIO_DE_TESTE,
      hibrido: true,
      assinadoDigitalmente: true,
    })
    expect(q('formulario-aviso-hibrido')!.textContent).toBe(T.hibrido)
    expect(q('formulario-aviso-assinado')!.textContent).toBe(
      T.assinadoDigitalmente,
    )
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('com formulário, diz que a página mostra os campos como estão no arquivo', () => {
    montar()
    expect(container.textContent).toContain(T.paginaMostraOriginal)
    expect(q('formulario-aviso-hibrido')).toBeNull()
    expect(q('formulario-aviso-assinado')).toBeNull()
  })
})
