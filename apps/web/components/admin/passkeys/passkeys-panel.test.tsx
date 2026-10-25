import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderEstatico } from '@/lib/render-estatico'
import type { Passkey } from '@/lib/admin/passkey'
import { PasskeysPanel, type PasskeysPanelProps } from './passkeys-panel'

const lista: Passkey[] = [
  {
    id: 'pk-1',
    name: 'MacBook',
    createdAt: '2026-10-20T15:00:00.000Z',
    deviceType: 'multiDevice',
    backedUp: true,
  },
  { id: 'pk-2', name: null, createdAt: '2026-10-21T15:00:00.000Z' },
]

const base: PasskeysPanelProps = {
  suportado: true,
  carregando: false,
  erro: null,
  passkeys: [],
  cadastrando: false,
  removendoId: null,
  onCadastrar: () => {},
  onRemover: () => {},
  onTentarDeNovo: () => {},
}

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function montar(props: Partial<PasskeysPanelProps>) {
  act(() => root.render(<PasskeysPanel {...base} {...props} />))
}

function botao(nome: RegExp): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find(
    (x) =>
      nome.test(x.textContent ?? '') ||
      nome.test(x.getAttribute('aria-label') ?? ''),
  )
  if (!b) throw new Error(`botão ${nome} não encontrado`)
  return b
}

function digitar(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!
  act(() => {
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('PasskeysPanel', () => {
  it('vazio: explica e oferece o cadastro', () => {
    const raiz = renderEstatico(<PasskeysPanel {...base} />)
    expect(raiz.textContent).toMatch(/nenhuma passkey cadastrada/i)
    expect(raiz.textContent).toContain('Cadastrar passkey')
  })

  it('lista: nome, data de criação em pt-BR e botão de remover por item', () => {
    const raiz = renderEstatico(<PasskeysPanel {...base} passkeys={lista} />)
    const itens = raiz.querySelectorAll('li')
    expect(itens).toHaveLength(2)
    expect(itens[0].textContent).toContain('MacBook')
    expect(itens[0].textContent).toContain('20 de out. de 2026')
    expect(itens[1].textContent).toContain('Passkey sem nome')
    expect(
      raiz.querySelector('button[aria-label="Remover a passkey MacBook"]'),
    ).not.toBeNull()
  })

  it('carregando: não mostra a lista nem o vazio', () => {
    const raiz = renderEstatico(<PasskeysPanel {...base} carregando />)
    expect(raiz.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(raiz.textContent).not.toMatch(/nenhuma passkey/i)
  })

  it('erro: mostra a mensagem e o tentar de novo chama o handler', async () => {
    const onTentarDeNovo = jest.fn()
    montar({ erro: 'Sua sessão expirou.', onTentarDeNovo })
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Sua sessão expirou.',
    )
    await act(async () => botao(/tentar de novo/i).click())
    expect(onTentarDeNovo).toHaveBeenCalled()
  })

  it('sem suporte: explica e não oferece o cadastro, mas a lista continua removível', () => {
    const raiz = renderEstatico(
      <PasskeysPanel {...base} suportado={false} passkeys={lista} />,
    )
    expect(raiz.textContent).toMatch(/navegador não suporta passkeys/i)
    expect(raiz.textContent).not.toContain('Cadastrar passkey')
    expect(raiz.querySelectorAll('li')).toHaveLength(2)
  })

  it('cadastrar manda o nome digitado', async () => {
    const onCadastrar = jest.fn()
    montar({ onCadastrar })
    const input = container.querySelector('input') as HTMLInputElement
    digitar(input, 'iPhone')
    await act(async () => botao(/cadastrar passkey/i).click())
    expect(onCadastrar).toHaveBeenCalledWith('iPhone')
  })

  it('cadastro concluído limpa o nome do aparelho', async () => {
    let concluir: (ok: boolean) => void = () => {}
    const onCadastrar = jest.fn(
      () => new Promise<boolean>((r) => (concluir = r)),
    )
    montar({ onCadastrar })
    const input = container.querySelector('input') as HTMLInputElement
    digitar(input, 'iPhone')
    await act(async () => botao(/cadastrar passkey/i).click())
    expect(input.value).toBe('iPhone')
    await act(async () => concluir(true))
    expect(input.value).toBe('')
  })

  it('cadastro que falhou mantém o nome para tentar de novo', async () => {
    const onCadastrar = jest.fn(async () => false)
    montar({ onCadastrar })
    const input = container.querySelector('input') as HTMLInputElement
    digitar(input, 'iPhone')
    await act(async () => botao(/cadastrar passkey/i).click())
    expect(input.value).toBe('iPhone')
  })

  // O ramielle recusa cadastro em sessão aberta pela passkey
  // (PASSKEY_EXIGE_LOGIN_GOOGLE); o texto avisa antes da tentativa.
  it('avisa que o cadastro exige ter entrado pelo Google', () => {
    const raiz = renderEstatico(<PasskeysPanel {...base} />)
    expect(raiz.textContent).toMatch(
      /para cadastrar uma passkey você precisa ter entrado pelo google/i,
    )
  })

  it('cadastrando: botão desabilitado com texto de progresso', () => {
    montar({ cadastrando: true })
    expect(botao(/cadastrando/i).disabled).toBe(true)
  })

  it('remover chama o handler com o id e desabilita o item em remoção', async () => {
    const onRemover = jest.fn()
    montar({ passkeys: lista, onRemover })
    await act(async () => botao(/remover a passkey macbook/i).click())
    expect(onRemover).toHaveBeenCalledWith('pk-1')

    montar({ passkeys: lista, onRemover, removendoId: 'pk-1' })
    expect(botao(/remover a passkey macbook/i).disabled).toBe(true)
  })
})
