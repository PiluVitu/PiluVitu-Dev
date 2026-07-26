import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mensagemDeErro } from './Gate'

const { fetchFake } = vi.hoisted(() => ({ fetchFake: vi.fn() }))

function respostaSessao(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const SESSAO_VALIDA = {
  user: { id: 'u1', email: 'dono@exemplo.com', name: 'Dono' },
  session: {
    id: 's1',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  },
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
  //
  // Retorna também os exports de ./auth-client (signOut, useSession,
  // authClient) da MESMA geração do módulo — necessário pro teste de
  // signOut, que precisa disparar o signOut do MESMO client que o Gate
  // renderizado está lendo, não um client novo/diferente.
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
    const gateModule = await import('./Gate')
    const authModule = await import('./auth-client')
    return { ...gateModule, ...authModule }
  }

  beforeEach(() => {
    fetchFake.mockReset()
  })

  // MINOR 4 (fix round 1): o teste de '?error=...' abaixo muda pathname
  // (pushState) sem restaurar — sem isto, o próximo teste (deste ou de
  // outro describe do MESMO arquivo) herdaria '/login' como pathname.
  afterEach(() => {
    window.history.pushState({}, '', '/')
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

  test('sem sessão mostra a tela de login, sem o conteúdo protegido nem a mensagem de falha de checagem', async () => {
    // mockImplementation (não mockResolvedValue): mockResolvedValue reusa a
    // MESMA instância de Response pra toda chamada — um Response só deixa
    // ler o body uma vez. Um fetchSession() ATRASADO de um teste anterior
    // (setTimeout(0) do onMount, ver comentário de montarGateComClientFresco
    // acima) pode disparar DEPOIS que este teste já começou, consumindo o
    // mesmo Response e fazendo a leitura DESTE teste falhar com "Body has
    // already been read" — MEDIDO rodando só os 2 primeiros testes juntos.
    fetchFake.mockImplementation(() => Promise.resolve(respostaSessao(null)))
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
    // MINOR 2 (fix round 1): "sem sessão" simples (fetch OK, sem sessão)
    // não é a mesma coisa que "não consegui checar" — não pode mostrar a
    // mensagem de falha de verificação quando a checagem funcionou.
    expect(
      screen.queryByText('Não consegui verificar sua sessão. Tente novamente.'),
    ).toBeNull()
  })

  test('com sessão válida renderiza o conteúdo protegido', async () => {
    fetchFake.mockImplementation(() =>
      Promise.resolve(respostaSessao(SESSAO_VALIDA)),
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
    fetchFake.mockImplementation(() => Promise.resolve(respostaSessao(null)))
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

  // MINOR 2 (fix round 1): 503 (ou rede fora) na primeira checagem de
  // sessão resolve `data: null` do mesmo jeito que "não tem sessão" —
  // sem distinguir por `error`, o dono via a IDÊNTICA tela de um
  // visitante nunca autenticado, sem nada dizendo que a checagem em si
  // falhou. Gate continua gateando só por `!sessao` (não passou a exigir
  // sessão por `error` — isso re-abriria o bug que o comentário original
  // documentava: um blip de rede deslogando o dono à toa); a mudança é
  // aditiva, só na MENSAGEM mostrada.
  test('sem sessão E com erro na checagem (503) distingue "falha ao checar" de "não logado"', async () => {
    fetchFake.mockImplementation(() =>
      Promise.resolve(respostaSessao({ message: 'indisponível' }, 503)),
    )
    const { Gate } = await montarGateComClientFresco()
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() =>
      expect(
        screen.getByText('Não consegui verificar sua sessão. Tente novamente.'),
      ).toBeDefined(),
    )
    // A tela de login continua disponível — 503 não é um beco sem saída,
    // o dono ainda pode tentar entrar de novo.
    expect(screen.getByText('Entrar com Google')).toBeDefined()
    expect(screen.queryByText('SEGREDO')).toBeNull()
  })

  // MINOR 3 (fix round 1): a review traçou proxy.mjs (onSuccess do
  // /sign-out dispara o átomo $sessionSignal) + session-refresh.mjs
  // (assinante do sinal chama fetchSession de novo) + config.mjs
  // (atomListeners mapeia '/sign-out' pro sinal) e confirmou que um
  // signOut() bem-sucedido refaz o /get-session NA MESMA aba — mas
  // nenhum teste provava isso. `autenticado` simula o estado do lado
  // servidor: antes do POST /sign-out, /get-session devolve a sessão
  // válida; a partir do POST, devolve null.
  test('signOut limpa a sessão e re-gateia o conteúdo protegido', async () => {
    let autenticado = true
    fetchFake.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/sign-out')) {
        autenticado = false
        return Promise.resolve(respostaSessao({ success: true }))
      }
      return Promise.resolve(respostaSessao(autenticado ? SESSAO_VALIDA : null))
    })
    const { Gate, signOut } = await montarGateComClientFresco()
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    await waitFor(() => expect(screen.getByText('SEGREDO')).toBeDefined())

    await act(async () => {
      await signOut()
    })

    await waitFor(() =>
      expect(screen.getByText('Entrar com Google')).toBeDefined(),
    )
    expect(screen.queryByText('SEGREDO')).toBeNull()
  })
})

// IMPORTANT 1 (fix round 1): callbackURL fixo em '/' fazia um login
// disparado de qualquer tela que não fosse a inicial (ex.: sessão expirou
// em #/dividas) voltar pra #/contas depois do round trip do Google —
// useHash() (App.tsx) cai no default assim que não há hash NENHUM na URL,
// e o Better Auth navega pra callbackURL sem hash nenhum. Mock leve de
// signIn.social (não o client real): o que está sob teste aqui é só a
// CONSTRUÇÃO do argumento dentro de Gate.tsx, não o transporte HTTP do
// Better Auth (isso já é coberto pelos testes com client real acima).
describe('Gate — callbackURL preserva a rota (hash) atual', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  async function montarGateSemSessao(social: ReturnType<typeof vi.fn>) {
    vi.resetModules()
    vi.doMock('./auth-client', () => ({
      useSession: () => ({ data: null, error: null, isPending: false }),
      signIn: { social },
      signOut: vi.fn(),
    }))
    return import('./Gate')
  }

  test('clicar em "Entrar com Google" na #/dividas preserva a rota em callbackURL', async () => {
    window.location.hash = '#/dividas'
    const social = vi.fn()
    const { Gate } = await montarGateSemSessao(social)
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    fireEvent.click(screen.getByText('Entrar com Google'))
    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/#/dividas' }),
    )
  })

  // Interação com o default de useHash(): a URL de verdade nunca tem
  // '#/contas' escrito nela quando a rota é a default — useHash() só
  // aplica esse default NO ESTADO REACT, `window.location.hash` fica
  // string vazia. callbackURL precisa continuar caindo em '/' (não
  // '/#/contas' inventado, nem '/#') pra não mudar o comportamento já
  // coberto pelos 4 testes acima do describe('Gate').
  test('sem hash na URL (rota default), callbackURL cai em "/"', async () => {
    window.location.hash = ''
    const social = vi.fn()
    const { Gate } = await montarGateSemSessao(social)
    render(
      <Gate>
        <p>SEGREDO</p>
      </Gate>,
    )
    fireEvent.click(screen.getByText('Entrar com Google'))
    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/' }),
    )
  })
})
