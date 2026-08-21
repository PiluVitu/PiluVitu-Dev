import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from './App'

vi.mock('./auth-client', () => ({
  useSession: () => ({
    data: {
      user: { id: 'u1', email: 'dono@exemplo.com', name: 'Dono' },
      session: {},
    },
    isPending: false,
  }),
  signIn: { social: vi.fn() },
  signOut: vi.fn(),
}))

// Fix round 1 (Task 8, IMPORTANT do review): o fallback genérico `: []` pra
// QUALQUER rota não reconhecida já quebrou duas vezes em silêncio — primeiro
// pra `/reports/commitments` (CommitmentsPage espera objeto, `[].fixed_net_cents`
// vira `formatBRL(undefined)`), depois pra `/reports/by-category`
// (BlocoCategorias também espera objeto, `[].rows.length` era `TypeError`
// antes até de chegar no `formatBRL`). As duas vezes, o sintoma não foi o
// teste falhando — foi um "N errors" solto no relatório do Vitest, fácil de
// não notar num `PASS` superficial. Terceira rota nova = terceira vez que
// alguém teria que redescobrir isso. Em vez de esperar a quarta: toda rota
// precisa estar EXPLICITAMENTE listada abaixo; a que não estiver rejeita com
// uma mensagem dizendo qual — mesma filosofia de `home.test.tsx`/
// `BlocoCategorias.test.tsx` ("rota inesperada em teste: ..."). Uma rota
// esquecida agora vira um `role="alert"` visível (o bloco/tela mostra o erro
// contido, do jeito normal) em vez de um crash silencioso de shape errado —
// alto o bastante pra não passar despercebido, sem re-quebrar a suíte
// inteira se um teste específico não olhar pra aquele bloco.
function mockFetchVazio() {
  const respond = (data: unknown) =>
    Promise.resolve({
      status: 200,
      json: async () => ({ ok: true, data, notifications: [] }),
    })

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)

      // CommitmentsPage/BlocoComprometido — objeto, não lista. totals/
      // pct_of_fixed_net são FAIXA {min,max} desde a Task 6 (fatia ⑥); [] é
      // válido pros dois formatos (nenhuma competência), sem mudança aqui.
      if (url.includes('/api/reports/commitments')) {
        return respond({
          competences: [],
          rows: [],
          totals: [],
          fixed_net_cents: 0,
          pct_of_fixed_net: [],
        })
      }
      // FluxoPage (Task 3, fatia ⑧) — objeto, não lista.
      if (url.includes('/api/reports/cashflow')) {
        return respond({ meses: [], linhas: [] })
      }
      // BlocoCategorias (Task 8) — objeto, não lista.
      if (url.includes('/api/reports/by-category')) {
        return respond({ competence: '', rows: [], total_cents: 0 })
      }
      // AccountsPage/BlocoSaldos — lista.
      if (url.includes('/api/accounts')) return respond([])
      // DividasPage/BlocoDividas — lista (`?status=open` e
      // `?status=open&direction=i_owe` caem na mesma verificação).
      if (url.includes('/api/debts')) return respond([])
      // DividasPage (`carregar`, Promise.all com /api/debts acima) — lista.
      if (url.includes('/api/payees')) return respond([])
      // ConfigPage (Task 10) — objeto, não lista.
      if (url.includes('/api/settings')) return respond({ fixed_net_cents: 0 })
      // RecorrentesPage (Task 5, fatia ⑥) — três listas.
      if (url.includes('/api/recurring')) return respond([])
      // RegrasPage — a listagem é lista; /api/rules/matches é OBJETO (e
      // precisa vir ANTES, senão `includes('/api/rules')` captura os dois e
      // a tela recebe um array onde espera `{scanned, counts}`).
      if (url.includes('/api/rules/matches'))
        return respond({ scanned: 0, counts: {}, scan_limit: 1000 })
      if (url.includes('/api/rules')) return respond([])
      if (url.includes('/api/categories')) return respond([])
      // ReservaPage (Task 2/3, fatia ⑦) — objeto, não lista. `meses: null` é
      // o estado real de producao hoje (sem recorrente cadastrada).
      if (url.includes('/api/reserve')) {
        return respond({
          saldo_cents: 0,
          meta_cents: { min: 0, max: 0 },
          meses: null,
          contas: [],
          goal_months: 3,
        })
      }
      // InsightPage (Task 5, fatia ⑨) — dois objetos, não listas. `latest:
      // null` é o estado real de produção hoje (comando do Mac nunca
      // rodou) — a própria propriedade que esta tela existe pra sustentar.
      if (url.includes('/api/insights/numbers')) {
        return respond({
          competence: '',
          previous_competence: '',
          top_categories: [],
          total_cents: 0,
          previous_total_cents: 0,
          variation_cents: 0,
          variation_pct: null,
          biggest_increase: null,
        })
      }
      if (url.includes('/api/insights/latest')) return respond(null)
      // ImportarPage (Tasks 4-5, fatia ②) — GET /api/payees já coberto
      // acima (DividasPage). /api/transactions só é chamado depois de um
      // arquivo ser lido (checagem de duplicata) — este teste de rota nunca
      // chega lá, mas listado por precaução, mesma disciplina do resto
      // deste allowlist.
      if (url.includes('/api/transactions')) return respond([])

      return Promise.reject(new Error(`rota inesperada em teste: ${url}`))
    }),
  )
}

const LARGURA_PADRAO = window.innerWidth

/**
 * ⚠️ **A casca é DUAS, e só uma existe no DOM por vez** (`useMenorQueMd`,
 * `lib/breakpoint.ts`): abaixo de 768px a top bar + tab bar + `Sheet` do
 * "Mais"; de 768 pra cima a sidebar do desktop. Nunca `md:hidden`/`hidden
 * md:flex` — com CSS os dois markups coexistiriam e cada `getByRole('link',
 * …)` desta suíte acharia DOIS "Extrato" (jsdom não computa CSS).
 *
 * O default do jsdom é 1024, ou seja, **desktop** — é a casca que a maioria
 * dos testes deste arquivo exercita. Quem precisa da tab bar/`Sheet` chama
 * isto ANTES de `render`.
 */
function emCelular() {
  window.innerWidth = 390
}

afterEach(() => {
  window.location.hash = ''
  window.innerWidth = LARGURA_PADRAO
  vi.unstubAllGlobals()
})

describe('App — roteamento por hash com Gate autenticado', () => {
  test('mostra o e-mail da sessão no cabeçalho', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByText('dono@exemplo.com')).toBeDefined(),
    )
  })

  // getByRole('heading', ...), não getByText: o <h1> de cada tela repete o
  // MESMO texto do link de nav sempre visível (<a href="#/dividas">Dívidas</a>
  // ao lado de <h1>Dívidas</h1>) — getByText('Dívidas') dá "Found multiple
  // elements" assim que a página carrega (DividasPage não tem gate de
  // loading antes do <h1>, ao contrário de Contas/Comprometido). Query por
  // role também torna o teste real: por texto puro, Contas/Comprometido
  // "passavam" batendo só no link do nav antes do fetch assíncrono resolver,
  // sem nunca provar que a página certa realmente montou. Mesma regra vale
  // pro <h1>Início</h1> da home (Task 6) — o nav ganhou um link "Início".
  test('hash default (#/) mostra a tela Início (home)', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
  })

  // Task 6: #/contas deixou de ser o default, mas continua acessível
  // explicitamente — é o que este teste prova.
  test('#/contas continua acessível mesmo não sendo mais o default', async () => {
    mockFetchVazio()
    window.location.hash = '#/contas'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Contas' })).toBeDefined(),
    )
  })

  test('#/dividas mostra a tela Dívidas', async () => {
    mockFetchVazio()
    window.location.hash = '#/dividas'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Dívidas' })).toBeDefined(),
    )
  })

  // Task 5 (fatia ⑥): nova rota, mesmo padrão das demais (link no <nav> +
  // entrada na cadeia do AppShell).
  test('#/recorrentes mostra a tela Recorrentes', async () => {
    mockFetchVazio()
    window.location.hash = '#/recorrentes'
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Recorrentes' }),
      ).toBeDefined(),
    )
  })

  // Categorização por regra (fase 1): nova rota, mesmo padrão das demais
  // (link no menu "Mais" + entrada na cadeia do AppShell).
  test('#/regras mostra a tela Regras', async () => {
    mockFetchVazio()
    window.location.hash = '#/regras'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Regras' })).toBeDefined(),
    )
  })

  // ⚠️ A transferência é SUB-ROTA de `#/lancar`, não um destino novo: o nav
  // não ganhou nenhum item (medição do custo em `AbasLancar`,
  // `pages/new-entry.tsx`). Este par de testes é o que prova as duas metades
  // — a tela certa aparece, e a pílula "Lançar" continua sendo a ativa.
  test('#/lancar mostra o formulário de lançamento (a aba padrão)', async () => {
    mockFetchVazio()
    window.location.hash = '#/lancar'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId('form-lancamento')).toBeDefined(),
    )
    expect(screen.queryByTestId('form-transferencia')).toBeNull()
  })

  test('#/lancar/transferir troca o formulário SEM tirar "Lançar" do nav', async () => {
    mockFetchVazio()
    window.location.hash = '#/lancar/transferir'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId('form-transferencia')).toBeDefined(),
    )
    expect(screen.queryByTestId('form-lancamento')).toBeNull()
    // `resolveRoute` é `startsWith('#/lancar')` — é isso que faz a sub-rota
    // custar zero ao estado ativo do nav.
    expect(
      within(screen.getByRole('navigation')).getByRole('link', {
        name: 'Lançar',
      }),
    ).toHaveAttribute('aria-current', 'page')
  })

  // Task 2/3 (fatia ⑦): nova rota, mesmo padrão das demais (link no <nav> +
  // entrada na cadeia do AppShell).
  test('#/reserva mostra a tela Reserva de emergência', async () => {
    mockFetchVazio()
    window.location.hash = '#/reserva'
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Reserva de emergência' }),
      ).toBeDefined(),
    )
  })

  test('#/comprometido mostra a tela Comprometido', async () => {
    mockFetchVazio()
    window.location.hash = '#/comprometido'
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Comprometido' }),
      ).toBeDefined(),
    )
  })

  // Task 3 (fatia ⑧): nova rota, mesmo padrão das demais (link no <nav> +
  // entrada na cadeia do AppShell).
  test('#/fluxo mostra a tela Fluxo de caixa', async () => {
    mockFetchVazio()
    window.location.hash = '#/fluxo'
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Fluxo de caixa' }),
      ).toBeDefined(),
    )
  })

  // Task 5 (fatia ⑨): nova rota, mesmo padrão das demais (link no <nav> +
  // entrada na cadeia do AppShell).
  test('#/insight mostra a tela Insight', async () => {
    mockFetchVazio()
    window.location.hash = '#/insight'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Insight' })).toBeDefined(),
    )
  })

  // Fatia de categorias: nova rota, mesmo padrão das demais (link no <nav> +
  // entrada na cadeia do AppShell).
  test('#/categorias mostra a tela Categorias', async () => {
    mockFetchVazio()
    window.location.hash = '#/categorias'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Categorias' })).toBeDefined(),
    )
  })

  // Tasks 4-5 (fatia ②): nova rota, mesmo padrão das demais (link no <nav> +
  // entrada na cadeia do AppShell).
  test('#/importar mostra a tela Importar', async () => {
    mockFetchVazio()
    window.location.hash = '#/importar'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Importar' })).toBeDefined(),
    )
  })

  // Fatia do extrato: nova rota, mesmo padrão das demais (link no <nav> +
  // entrada na cadeia do AppShell).
  test('#/extrato mostra a tela Extrato', async () => {
    mockFetchVazio()
    window.location.hash = '#/extrato'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Extrato' })).toBeDefined(),
    )
  })

  // Task 10: nova rota, mesmo padrão das demais (link no <nav> + entrada na
  // cadeia do AppShell).
  test('#/configuracoes mostra a tela Configurações', async () => {
    mockFetchVazio()
    window.location.hash = '#/configuracoes'
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Configurações' }),
      ).toBeDefined(),
    )
  })

  // Evidência direta (fix round 1, Task 8) de que o fallback de
  // `mockFetchVazio` falha ALTO numa rota não wireada, em vez de devolver
  // `[]` em silêncio — a exigência central do review. Não passa por
  // nenhuma tela: chama o `fetch` stubado diretamente com uma rota
  // inventada e prova que a promise REJEITA com a mensagem que nomeia a
  // rota, exatamente o comportamento que faltava antes deste fix (a versão
  // anterior teria devolvido `Promise.resolve({ status: 200, ... data: [] })`
  // pra esta mesma chamada, sem avisar nada).
  test('mockFetchVazio: rota não wireada rejeita alto, não devolve `[]` em silêncio', async () => {
    mockFetchVazio()
    await expect(fetch('/api/rota-inventada-para-este-teste')).rejects.toThrow(
      'rota inesperada em teste: /api/rota-inventada-para-este-teste',
    )
  })
})

// Task 2 (fatia ⑨ — UI/UX): o nav virou navegação de verdade, com estado
// ativo. `getByRole('link', { name: ... })`, nunca `getByText` — mesma
// disciplina do resto deste arquivo, e ainda mais necessária aqui porque
// estes testes leem `aria-current` do próprio link do nav (role `link`,
// nunca colide com o `role heading` do <h1> homônimo da tela).
describe('App — nav: estado ativo segue a rota corrente', () => {
  test('hash default (#/) marca "Início" como ativo, mais nenhum outro', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Dívidas' })).not.toHaveAttribute(
      'aria-current',
    )
    expect(
      screen.getByRole('link', { name: 'Comprometido' }),
    ).not.toHaveAttribute('aria-current')
  })

  test('#/dividas marca "Dívidas" como ativo e desmarca "Início"', async () => {
    mockFetchVazio()
    window.location.hash = '#/dividas'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Dívidas' })).toBeDefined(),
    )
    expect(screen.getByRole('link', { name: 'Dívidas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  test('trocar de hash muda qual link está ativo (não fica preso no primeiro)', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
    expect(screen.getByRole('link', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    window.location.hash = '#/comprometido'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Comprometido' }),
      ).toBeDefined(),
    )
    expect(screen.getByRole('link', { name: 'Comprometido' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Início' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  test('#/extrato marca "Extrato" como ativo', async () => {
    mockFetchVazio()
    window.location.hash = '#/extrato'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Extrato' })).toBeDefined(),
    )
    expect(screen.getByRole('link', { name: 'Extrato' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  // ⚠️ O painel do "Mais" virou um `Sheet` (era `dropdown-menu`), e `Sheet`
  // **não emite `menuitem`** — o conteúdo é um `role="dialog"` com `<a>` de
  // verdade dentro. Estes testes contavam `menuitem`; passaram a contar
  // `dialog` + `link`, que é o que a árvore acessível de fato tem agora.
  test('#/categorias marca "Categorias" como ativo (dentro do "Mais")', async () => {
    emCelular()
    mockFetchVazio()
    window.location.hash = '#/categorias'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Categorias' })).toBeDefined(),
    )
    await userEvent.click(screen.getByTestId('nav-mais'))
    const painel = await screen.findByRole('dialog')
    expect(
      within(painel).getByRole('link', { name: 'Categorias' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  test('#/insight marca "Insight" como ativo (dentro do "Mais")', async () => {
    emCelular()
    mockFetchVazio()
    window.location.hash = '#/insight'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Insight' })).toBeDefined(),
    )
    await userEvent.click(screen.getByTestId('nav-mais'))
    const painel = await screen.findByRole('dialog')
    expect(
      within(painel).getByRole('link', { name: 'Insight' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  // ⚠️ O slot "Mais" da tab bar não pode ASSUMIR o rótulo da seção (era o que
  // o gatilho do `dropdown-menu` fazia): num slot de 78×56px, "Fluxo de
  // caixa" não caberia. Quem responde "onde estou" agora é o `<h1>` da top
  // bar — e o slot continua marcado, pelos MESMOS dois canais dos outros
  // (cor + trilho) mais o `data-secao-ativa`.
  test('numa rota do "Mais", o slot fica marcado e o título aparece na top bar', async () => {
    emCelular()
    mockFetchVazio()
    window.location.hash = '#/fluxo'
    render(<App />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Fluxo de caixa' }),
      ).toBeDefined(),
    )
    const slot = screen.getByTestId('nav-mais')
    expect(slot).toHaveTextContent('Mais')
    expect(slot).toHaveAttribute('data-secao-ativa', 'true')
    expect(slot.className).toContain('border-primary')
  })

  test('#/regras marca o slot "Mais" como seção ativa', async () => {
    emCelular()
    mockFetchVazio()
    window.location.hash = '#/regras'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Regras' })).toBeDefined(),
    )
    expect(screen.getByTestId('nav-mais')).toHaveAttribute(
      'data-secao-ativa',
      'true',
    )
  })

  // O contrapositivo do teste acima: numa rota PRIMÁRIA o slot volta a ser um
  // "Mais" neutro. Sem este caso, um slot marcado como ativo o TEMPO TODO
  // passaria no teste anterior sem provar nada.
  test('numa rota primária o slot "Mais" não se marca como seção ativa', async () => {
    emCelular()
    mockFetchVazio()
    window.location.hash = '#/extrato'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Extrato' })).toBeDefined(),
    )
    const slot = screen.getByTestId('nav-mais')
    expect(slot).toHaveTextContent('Mais')
    expect(slot).not.toHaveAttribute('data-secao-ativa')
    expect(slot.className).toContain('border-transparent')
  })

  // ⚠️ O ponto da fatia: a barra encolheu de 13 pílulas pra 4 slots + "Mais",
  // mas NENHUM destino sumiu do app.
  //
  // ⚠️ Os 14 rótulos são LITERAIS aqui de propósito. Uma versão anterior
  // deste teste somava `barra.length + menu.length` e comparava com uma
  // constante exportada de `App.tsx` — que era derivada das MESMAS duas
  // listas. Apagar um destino encolhia os dois lados da igualdade e o teste
  // continuava verde (MEDIDO por mutação). Uma asserção derivada do código
  // sob teste não testa esse código.
  test('nenhum destino sumiu: os 14 continuam alcançáveis (4 na barra, 10 no "Mais")', async () => {
    emCelular()
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Início', 'Lançar', 'Extrato', 'Dívidas'])

    await userEvent.click(screen.getByTestId('nav-mais'))
    const painel = await screen.findByRole('dialog')
    expect(
      within(painel)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Comprometido',
      'Importar',
      'Contas',
      'Categorias',
      'Recorrentes',
      'Regras',
      'Fluxo de caixa',
      'Insight',
      'Reserva',
      'Configurações',
    ])
  })

  // A sidebar do desktop é a TERCEIRA superfície alimentada pela mesma lista
  // — e a única que mostra os 14 de uma vez. Sem este caso, um destino que
  // sumisse SÓ dela passaria batido (o teste acima roda a 390px).
  test('no desktop, a sidebar lista os 14 destinos e não existe tab bar', async () => {
    mockFetchVazio()
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-bar')).toBeNull()
    expect(screen.queryByTestId('nav-mais')).toBeNull()

    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Início',
      'Lançar',
      'Extrato',
      'Dívidas',
      'Comprometido',
      'Importar',
      'Contas',
      'Categorias',
      'Recorrentes',
      'Regras',
      'Fluxo de caixa',
      'Insight',
      'Reserva',
      'Configurações',
    ])
  })

  // ⚠️ A armadilha que fazia esta fatia falhar em silêncio: com
  // `md:hidden`/`hidden md:flex` os DOIS navs ficariam no DOM (jsdom não
  // computa CSS) e todo `getByRole('link', { name: 'Extrato' })` desta suíte
  // passaria a achar dois. Este caso é o gate disso, nos dois lados.
  test('só UM dos dois navs existe por vez — "Extrato" nunca é ambíguo', async () => {
    emCelular()
    mockFetchVazio()
    const { unmount } = render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
    expect(screen.getByTestId('tab-bar')).toBeInTheDocument()
    expect(screen.queryByTestId('sidebar')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Extrato' })).toHaveLength(1)
    unmount()

    window.innerWidth = LARGURA_PADRAO
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )
    expect(screen.getAllByRole('link', { name: 'Extrato' })).toHaveLength(1)
  })

  // #/dividas/:id (detalhe de uma dívida) não é um link próprio no nav —
  // continua fazendo parte da "seção" Dívidas. Mock de fetch dedicado (não
  // `mockFetchVazio`, que devolve `[]` genérico pra `/api/debts` — aqui
  // `DebtDetailPage` precisa do shape de OBJETO de `/api/debts/:id`).
  test('#/dividas/:id mantém "Dívidas" ativo no nav (detalhe é parte da seção)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input)
        const respond = (data: unknown) =>
          Promise.resolve({
            status: 200,
            json: async () => ({ ok: true, data, notifications: [] }),
          })
        if (url.includes('/api/debts/d1')) {
          return respond({
            debt: {
              id: 'd1',
              title: 'Empréstimo',
              direction: 'i_owe',
              status: 'open',
            },
            items: [],
            payments: [],
          })
        }
        if (url.includes('/api/accounts')) return respond([])
        return Promise.reject(new Error(`rota inesperada em teste: ${url}`))
      }),
    )
    window.location.hash = '#/dividas/d1'
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Dívidas' })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    )
  })
})

describe('App — alvo de toque da casca', () => {
  // ⚠️ Os slots da tab bar são `min-h-14` (56 px), não `min-h-11` (44) — a
  // barra empilha ícone + rótulo, e 44 px espremeriam os dois. Os destinos do
  // "Mais" e os botões da top bar continuam nos 44 de sempre
  // (`lib/touch.ts`).
  test('os 5 slots da tab bar têm 56px de altura', async () => {
    emCelular()
    mockFetchVazio()
    window.location.hash = '#/'
    render(<App />)

    const nav = await screen.findByRole('navigation', {
      name: 'Navegação principal',
    })
    const slots = [
      ...within(nav).getAllByRole('link'),
      screen.getByTestId('nav-mais'),
    ]
    expect(slots).toHaveLength(5)
    for (const slot of slots) expect(slot.className).toContain('min-h-14')
  })

  test('os destinos do "Mais" e os botões da top bar têm 44px', async () => {
    const user = userEvent.setup()
    emCelular()
    mockFetchVazio()
    window.location.hash = '#/'
    render(<App />)

    expect((await screen.findByTestId('alternar-tema')).className).toContain(
      'size-11',
    )
    expect(screen.getByTestId('abrir-conta').className).toContain('size-11')

    await user.click(screen.getByTestId('nav-mais'))
    const painel = await screen.findByRole('dialog')
    const destinos = within(painel).getAllByRole('link')
    expect(destinos.length).toBeGreaterThan(0)
    for (const destino of destinos)
      expect(destino.className).toContain('min-h-11')
  })
})

describe('App — top bar do celular', () => {
  test('o título é o da rota corrente e acompanha a troca de hash', async () => {
    emCelular()
    mockFetchVazio()
    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Início' })).toBeDefined(),
    )

    window.location.hash = '#/extrato'
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Extrato' })).toBeDefined(),
    )
    expect(screen.queryByRole('heading', { name: 'Início' })).toBeNull()
  })

  // O `<header>` de 32 px com e-mail e Sair morreu; os dois foram pro painel
  // do "Mais", que o botão de conta da top bar também abre.
  test('o botão de conta abre o painel, com e-mail e Sair', async () => {
    const user = userEvent.setup()
    emCelular()
    mockFetchVazio()
    render(<App />)

    await user.click(await screen.findByTestId('abrir-conta'))

    const painel = await screen.findByRole('dialog')
    expect(within(painel).getByText('dono@exemplo.com')).toBeInTheDocument()
    expect(
      within(painel).getByRole('button', { name: 'Sair' }),
    ).toBeInTheDocument()
  })

  test('o painel agrupa os destinos com os quatro cabeçalhos', async () => {
    const user = userEvent.setup()
    emCelular()
    mockFetchVazio()
    render(<App />)

    await user.click(await screen.findByTestId('nav-mais'))
    const painel = await screen.findByRole('dialog')

    for (const titulo of ['Dia a dia', 'Cadastro', 'Análise', 'Sistema'])
      expect(within(painel).getByText(titulo)).toBeInTheDocument()
  })

  test('tocar um destino do painel fecha o painel', async () => {
    const user = userEvent.setup()
    emCelular()
    mockFetchVazio()
    render(<App />)

    await user.click(await screen.findByTestId('nav-mais'))
    const painel = await screen.findByRole('dialog')
    await user.click(within(painel).getByRole('link', { name: 'Contas' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
