import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderEstatico } from '@/lib/render-estatico'
import { AdminLoginScreen } from './admin-login-screen'

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

function botao(nome: RegExp): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) =>
    nome.test(x.textContent ?? ''),
  )
  if (!b) throw new Error(`botão ${nome} não encontrado`)
  return b
}

describe('AdminLoginScreen', () => {
  it('mostra "Entrar com passkey" ao lado do Google quando o navegador suporta', () => {
    const raiz = renderEstatico(
      <AdminLoginScreen
        onLogin={() => {}}
        onPasskeyLogin={async () => {}}
        passkeySuportado
      />,
    )
    const textos = [...raiz.querySelectorAll('button')].map(
      (b) => b.textContent,
    )
    expect(textos).toEqual(['Entrar com Google', 'Entrar com passkey'])
  })

  it('sem suporte a WebAuthn, esconde o botão e explica', () => {
    const raiz = renderEstatico(
      <AdminLoginScreen
        onLogin={() => {}}
        onPasskeyLogin={async () => {}}
        passkeySuportado={false}
      />,
    )
    expect(raiz.textContent).not.toContain('Entrar com passkey')
    expect(raiz.textContent).toMatch(/navegador não suporta passkeys/i)
  })

  it('sem handler de passkey, mostra só o Google', () => {
    const raiz = renderEstatico(<AdminLoginScreen onLogin={() => {}} />)
    expect(raiz.querySelectorAll('button')).toHaveLength(1)
    expect(raiz.textContent).not.toMatch(/passkey/i)
  })

  it('clique na passkey desabilita os dois botões enquanto entra', async () => {
    let resolver: () => void = () => {}
    const onPasskeyLogin = jest.fn(
      () => new Promise<void>((r) => (resolver = r)),
    )
    act(() =>
      root.render(
        <AdminLoginScreen
          onLogin={() => {}}
          onPasskeyLogin={onPasskeyLogin}
          passkeySuportado
        />,
      ),
    )
    await act(async () => botao(/entrar com passkey/i).click())

    expect(onPasskeyLogin).toHaveBeenCalledTimes(1)
    expect(botao(/entrando/i).disabled).toBe(true)
    expect(botao(/entrar com google/i).disabled).toBe(true)
    await act(async () => resolver())
  })

  it('erro da passkey aparece inline e reabilita os botões', async () => {
    const onPasskeyLogin = jest.fn(() =>
      Promise.reject(new Error('Operação cancelada.')),
    )
    act(() =>
      root.render(
        <AdminLoginScreen
          onLogin={() => {}}
          onPasskeyLogin={onPasskeyLogin}
          passkeySuportado
        />,
      ),
    )
    await act(async () => botao(/entrar com passkey/i).click())

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Operação cancelada.',
    )
    expect(botao(/entrar com passkey/i).disabled).toBe(false)
    expect(botao(/entrar com google/i).disabled).toBe(false)
  })
})
