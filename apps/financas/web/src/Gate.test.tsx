import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mensagemDeErro } from './Gate'

const { fetchFake } = vi.hoisted(() => ({ fetchFake: vi.fn() }))

function respostaSessao(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('mensagemDeErro', () => {
  test('null quando não há código na URL', () => {
    expect(mensagemDeErro(null)).toBeNull()
  })

  test('mensagem amigável para nao_autorizado', () => {
    expect(mensagemDeErro('nao_autorizado')).toBe(
      'Esta conta do Google não tem acesso a este aplicativo.',
    )
  })

  test('mensagem genérica com o código para qualquer outro erro', () => {
    expect(mensagemDeErro('outro_erro')).toBe(
      'Não foi possível entrar (outro_erro).',
    )
  })
})

describe('Gate', () => {
  // O client real do Better Auth guarda a sessão num átomo do nanostores
  // que só refaz fetch no PRIMEIRO listen() de uma instância "inativa" —
  // no unmount ela fica "ativa" por mais 1s (constante interna da lib)
  // antes de resetar. Um client ÚNICO compartilhado entre os 4 testes
  // (via vi.mock hoisted, que roda a factory uma vez só) faz o 2º/3º
  // teste herdarem o resultado do fetch do 1º em vez de rebuscar — o
  // FAIL fica: sessão nunca aparece porque nenhum fetch novo dispara.
  // Fix: vi.doMock (chamável de novo por teste, ao contrário do vi.mock
  // hoisted) + vi.resetModules() antes de reimportar ./Gate — cada
  // teste monta seu PRÓPRIO client (seu próprio átomo) do zero.
  async function montarGateComClientFresco() {
    vi.resetModules()
    vi.doMock('./auth-client', async () => {
      const { createAuthClient } = await import('better-auth/react')
      const client = createAuthClient({
        fetchOptions: { customFetchImpl: fetchFake },
      })
      return {
        authClient: client,
        useSession: client.useSession,
        signIn: client.signIn,
        signOut: client.signOut,
      }
    })
    return import('./Gate')
  }

  beforeEach(() => {
    fetchFake.mockReset()
  })

  test('enquanto pending, não renderiza o conteúdo protegido nem a tela de login', async () => {
    fetchFake.mockImplementation(() => new Promise(() => {})) // nunca resolve
    const { Gate } = await montarGateComClientFresco()
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    expect(screen.getByText('carregando…')).toBeDefined()
    expect(screen.queryByText('SEGREDO')).toBeNull()
    expect(screen.queryByText('Entrar com Google')).toBeNull()
  })

  test('sem sessão mostra a tela de login, sem o conteúdo protegido', async () => {
    fetchFake.mockResolvedValue(respostaSessao(null))
    const { Gate } = await montarGateComClientFresco()
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() =>
      expect(screen.getByText('Entrar com Google')).toBeDefined(),
    )
    expect(screen.queryByText('SEGREDO')).toBeNull()
  })

  test('com sessão válida renderiza o conteúdo protegido', async () => {
    fetchFake.mockResolvedValue(
      respostaSessao({
        user: { id: 'u1', email: 'dono@exemplo.com', name: 'Dono' },
        session: {
          id: 's1',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        },
      }),
    )
    const { Gate } = await montarGateComClientFresco()
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() => expect(screen.getByText('SEGREDO')).toBeDefined())
    expect(screen.queryByText('Entrar com Google')).toBeNull()
  })

  test('?error=nao_autorizado renderiza a mensagem em role="alert"', async () => {
    fetchFake.mockResolvedValue(respostaSessao(null))
    window.history.pushState({}, '', '/login?error=nao_autorizado')
    const { Gate } = await montarGateComClientFresco()
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Esta conta do Google não tem acesso a este aplicativo.',
      ),
    )
  })
})
