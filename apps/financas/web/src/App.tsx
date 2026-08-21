import {
  CircleUser,
  Download,
  Filter,
  Gauge,
  HandCoins,
  House,
  Laptop,
  type LucideIcon,
  Menu,
  Moon,
  PiggyBank,
  Plus,
  Receipt,
  Repeat,
  Settings,
  Sparkles,
  Sun,
  Tags,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@piluvitu/ui/sheet'
import { signOut, useSession } from './auth-client'
import { Gate } from './Gate'
import { useMenorQueMd } from './lib/breakpoint'
import { competenciaAtual } from './lib/dates'
import { aplicarTema, type Tema, temaSalvo } from './lib/theme'
import { AccountsPage } from './pages/accounts'
import { CategoriasPage } from './pages/categorias'
import { CommitmentsPage } from './pages/commitments'
import { ConfigPage } from './pages/config'
import { DebtDetailPage } from './pages/debt-detail'
import { DividasPage } from './pages/DividasPage'
import { ExtratoPage } from './pages/extrato'
import { FluxoPage } from './pages/fluxo'
import { HomePage } from './pages/home'
import { ImportarPage } from './pages/importar'
import { InsightPage } from './pages/insight'
import { NewEntryPage } from './pages/new-entry'
import { RecorrentesPage } from './pages/recorrentes'
import { RegrasPage } from './pages/regras'
import { ReservaPage } from './pages/reserva'
import { TransferirPage } from './pages/transferir'

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

// Única fonte de verdade pra "qual tela o hash corrente resolve" — usada
// TANTO pra decidir o que renderizar QUANTO pra marcar o destino ativo na
// navegação. Duas cópias da mesma cadeia de precedência (uma pro render,
// outra pro nav) é exatamente o tipo de duplicação que diverge
// silenciosamente numa edição futura — um item novo na cadeia de render que
// esqueça o irmão no nav deixaria a tela certa aparecer com NENHUM destino
// marcado como ativo, sem erro nenhum. `#/dividas/:id` (detalhe) resolve pro
// mesmo `RouteKey` de `#/dividas` de propósito — é a mesma "seção" pro nav,
// mesmo sendo uma tela diferente pro render (`debtId` decide isso à parte).
type RouteKey =
  | 'home'
  | 'contas'
  | 'categorias'
  | 'dividas'
  | 'extrato'
  | 'comprometido'
  | 'fluxo'
  | 'insight'
  | 'lancar'
  | 'recorrentes'
  | 'regras'
  | 'reserva'
  | 'importar'
  | 'configuracoes'

export function resolveRoute(hash: string): RouteKey {
  // `startsWith('#/dividas/')` já cobre o caso `hash === '#/dividas/'`
  // (toda string é prefixo de si mesma) — só falta o exato sem barra.
  if (hash.startsWith('#/dividas/') || hash === '#/dividas') return 'dividas'
  if (hash === '#/extrato' || hash === '#/extrato/') return 'extrato'
  if (hash.startsWith('#/comprometido')) return 'comprometido'
  if (hash === '#/fluxo' || hash === '#/fluxo/') return 'fluxo'
  if (hash === '#/insight' || hash === '#/insight/') return 'insight'
  if (hash.startsWith('#/lancar')) return 'lancar'
  if (hash === '#/recorrentes' || hash === '#/recorrentes/')
    return 'recorrentes'
  if (hash === '#/regras' || hash === '#/regras/') return 'regras'
  if (hash === '#/reserva' || hash === '#/reserva/') return 'reserva'
  if (hash === '#/importar' || hash === '#/importar/') return 'importar'
  if (hash === '#/contas' || hash === '#/contas/') return 'contas'
  if (hash === '#/categorias' || hash === '#/categorias/') return 'categorias'
  if (hash === '#/configuracoes' || hash === '#/configuracoes/')
    return 'configuracoes'
  return 'home'
}

/**
 * ⚠️ **O `<h1>` de cada tela mora AQUI, não dentro das 16 páginas.**
 *
 * Antes desta fatia, cada página renderizava o próprio `<h1>` — e a soma
 * disso com a barra de pílulas (81 px, que rolava pra fora da tela e nunca
 * voltava) mais um `<header>` de 32 px empurrava o primeiro conteúdo pra
 * y=161 de 844 no Android do dono. O título é a MESMA informação que a barra
 * de navegação já precisa carregar ("onde estou"); renderizá-lo duas vezes,
 * uma delas gastando uma faixa própria de altura, é o desperdício mais caro
 * da tela.
 *
 * Com o título aqui, ele aparece na top bar fixa no celular e acima do
 * conteúdo no desktop — sempre visível, nunca duplicado, e nenhuma página
 * precisa lembrar de escrevê-lo.
 *
 * ⚠️ `#/dividas/:id` resolve pra `dividas` (é a mesma seção), então a top bar
 * lê "Dívidas"; o NOME da dívida continua na própria tela (é dado carregado
 * lá dentro, que este mapa estático não tem como conhecer).
 */
export const TITULO_DA_ROTA: Record<RouteKey, string> = {
  home: 'Início',
  contas: 'Contas',
  categorias: 'Categorias',
  dividas: 'Dívidas',
  extrato: 'Extrato',
  comprometido: 'Comprometido',
  fluxo: 'Fluxo de caixa',
  insight: 'Insight',
  lancar: 'Lançar',
  recorrentes: 'Recorrentes',
  regras: 'Regras',
  reserva: 'Reserva de emergência',
  importar: 'Importar',
  configuracoes: 'Configurações',
}

type NavItem = {
  href: string
  label: string
  route: RouteKey
  icon: LucideIcon
}
type NavGrupo = { titulo: string; itens: NavItem[] }

/**
 * Os 14 destinos, agrupados. **Uma lista só** alimenta os três lugares que
 * mostram navegação — a tab bar do celular (que consome as 4 primeiras
 * entradas de DIA A DIA), o `Sheet` do "Mais" (que consome todo o resto) e a
 * sidebar do desktop (que consome tudo). Três listas separadas divergiriam:
 * um destino novo acrescentado só num deles ficaria inalcançável no outro,
 * sem erro nenhum.
 */
const GRUPOS: NavGrupo[] = [
  {
    titulo: 'Dia a dia',
    itens: [
      { href: '#/', label: 'Início', route: 'home', icon: House },
      { href: '#/lancar', label: 'Lançar', route: 'lancar', icon: Plus },
      { href: '#/extrato', label: 'Extrato', route: 'extrato', icon: Receipt },
      {
        href: '#/dividas',
        label: 'Dívidas',
        route: 'dividas',
        icon: HandCoins,
      },
      {
        href: '#/comprometido',
        label: 'Comprometido',
        route: 'comprometido',
        icon: Gauge,
      },
      {
        href: '#/importar',
        label: 'Importar',
        route: 'importar',
        icon: Download,
      },
    ],
  },
  {
    titulo: 'Cadastro',
    itens: [
      { href: '#/contas', label: 'Contas', route: 'contas', icon: Wallet },
      {
        href: '#/categorias',
        label: 'Categorias',
        route: 'categorias',
        icon: Tags,
      },
      {
        href: '#/recorrentes',
        label: 'Recorrentes',
        route: 'recorrentes',
        icon: Repeat,
      },
      { href: '#/regras', label: 'Regras', route: 'regras', icon: Filter },
    ],
  },
  {
    titulo: 'Análise',
    itens: [
      {
        href: '#/fluxo',
        label: 'Fluxo de caixa',
        route: 'fluxo',
        icon: TrendingUp,
      },
      { href: '#/insight', label: 'Insight', route: 'insight', icon: Sparkles },
      {
        href: '#/reserva',
        label: 'Reserva',
        route: 'reserva',
        icon: PiggyBank,
      },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      {
        href: '#/configuracoes',
        label: 'Configurações',
        route: 'configuracoes',
        icon: Settings,
      },
    ],
  },
]

/**
 * As 4 rotas que ganham slot próprio na tab bar do celular — as que o dono
 * abre todos os dias. O 5º slot é o "Mais".
 *
 * ⚠️ **Comprometido SAIU da barra, e isso não o afasta um toque sequer**: o
 * `BlocoComprometido` é o primeiro bloco de `#/` (`pages/home.tsx`), então
 * ele continua sendo a primeira coisa que o dono vê ao abrir o app.
 */
const ROTAS_NA_BARRA: RouteKey[] = ['home', 'lancar', 'extrato', 'dividas']

const TODOS_OS_ITENS: NavItem[] = GRUPOS.flatMap((g) => g.itens)

const ITENS_DA_BARRA: NavItem[] = ROTAS_NA_BARRA.map((r) => {
  const item = TODOS_OS_ITENS.find((i) => i.route === r)
  // Nunca acontece com a lista acima — existe pra um rename de rota falhar
  // alto em vez de sumir com um slot da barra em silêncio.
  if (!item) throw new Error(`rota sem item de navegação: ${r}`)
  return item
})

/** Os grupos do `Sheet`: tudo que não coube na tab bar, sem grupo vazio. */
const GRUPOS_NO_SHEET: NavGrupo[] = GRUPOS.map((g) => ({
  titulo: g.titulo,
  itens: g.itens.filter((i) => !ROTAS_NA_BARRA.includes(i.route)),
})).filter((g) => g.itens.length > 0)

const CLASSE_CABECALHO_GRUPO =
  'text-muted-foreground px-2 font-mono text-[11px] font-semibold tracking-[0.2em] uppercase'

/**
 * ⚠️ **Item ativo = `bg-primary text-primary-foreground`, nunca
 * `--accent-soft`.** Aquele token carrega alpha, e o gate de contraste
 * (`packages/ui/src/contraste.test.ts`) não compõe alpha — o par ativo
 * ficaria fora de qualquer medição. O par `primary`/`primary-foreground` é
 * medido e passa AA com folga (7,47:1).
 */
const CLASSE_ITEM_ATIVO = 'bg-primary text-primary-foreground'
const CLASSE_ITEM_INATIVO =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground'

/** A marca — literal de `apps/web/components/admin/admin-sidebar.tsx`. */
function Marca() {
  return (
    <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-lg font-bold">
      P
    </span>
  )
}

const PROXIMO_TEMA: Record<Tema, Tema> = {
  claro: 'escuro',
  escuro: 'sistema',
  sistema: 'claro',
}

const ROTULO_TEMA: Record<Tema, string> = {
  claro: 'Tema claro',
  escuro: 'Tema escuro',
  sistema: 'Tema do sistema',
}

/**
 * Ciclo claro → escuro → sistema, num alvo de 44×44 (`size-11`).
 *
 * ⚠️ `temaSalvo()` lê `localStorage`, que **lança** (não só devolve `null`)
 * em storage particionado/privado — mesmo achado M5 já pago em
 * `index.html`/`main.tsx`. Aqui a exceção seria no render da top bar, ou
 * seja, o app inteiro em branco por causa de um botão de tema.
 */
function BotaoTema() {
  const [tema, setTema] = useState<Tema>(() => {
    try {
      return temaSalvo()
    } catch {
      return 'sistema'
    }
  })

  const Icone = tema === 'claro' ? Sun : tema === 'escuro' ? Moon : Laptop

  return (
    <button
      type="button"
      data-testid="alternar-tema"
      aria-label={`${ROTULO_TEMA[tema]} — trocar para ${ROTULO_TEMA[PROXIMO_TEMA[tema]].toLowerCase()}`}
      className="text-muted-foreground hover:bg-accent hover:text-accent-foreground grid size-11 shrink-0 cursor-pointer place-items-center rounded-md transition-colors"
      onClick={() => {
        const proximo = PROXIMO_TEMA[tema]
        setTema(proximo)
        try {
          aplicarTema(proximo)
        } catch {
          // storage indisponível: o tema não persiste, mas a tela não cai.
        }
      }}
    >
      <Icone className="size-5" aria-hidden="true" />
    </button>
  )
}

function ItemDeLista({
  item,
  ativo,
  onNavegar,
}: {
  item: NavItem
  ativo: boolean
  onNavegar?: () => void
}) {
  const Icone = item.icon
  return (
    <a
      href={item.href}
      aria-current={ativo ? 'page' : undefined}
      onClick={onNavegar}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm transition-colors',
        ativo ? CLASSE_ITEM_ATIVO : CLASSE_ITEM_INATIVO,
      )}
    >
      <Icone className="size-4 shrink-0" aria-hidden="true" />
      {item.label}
    </a>
  )
}

/**
 * O painel do "Mais": um `Sheet` que sobe de BAIXO — perto do polegar, não no
 * meio da tela. Carrega o e-mail e o Sair no topo (foi o `<header>` de 32 px
 * que morreu nesta fatia) e os 10 destinos que não couberam na tab bar.
 *
 * ⚠️ **`Sheet` não emite `menuitem`** (o `dropdown-menu` que ele substitui
 * emitia): o conteúdo é um `role="dialog"` com `<a>` de verdade dentro. Os
 * testes que contavam `menuitem` passaram a contar `dialog` + `link`.
 */
function PainelMais({
  route,
  email,
  fechar,
}: {
  route: RouteKey
  email: string | undefined
  fechar: () => void
}) {
  return (
    <SheetContent
      side="bottom"
      data-testid="painel-mais"
      aria-label="Mais destinos"
      className="max-h-[85vh] overflow-y-auto pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
    >
      <SheetTitle className="sr-only">Mais destinos</SheetTitle>
      <div className="flex items-center justify-between gap-3 border-b pb-4">
        <span className="text-muted-foreground truncate text-sm">{email}</span>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0"
          onClick={() => signOut()}
        >
          Sair
        </Button>
      </div>
      <div className="flex flex-col gap-5 pt-4">
        {GRUPOS_NO_SHEET.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-1">
            <p className={CLASSE_CABECALHO_GRUPO}>{grupo.titulo}</p>
            {grupo.itens.map((item) => (
              <ItemDeLista
                key={item.href}
                item={item}
                ativo={item.route === route}
                onNavegar={fechar}
              />
            ))}
          </div>
        ))}
      </div>
    </SheetContent>
  )
}

/**
 * Tab bar fixa embaixo, 5 slots.
 *
 * ⚠️ **O estado ativo tem DOIS canais, cor E forma** — `text-primary` mais um
 * trilho `border-t-2 border-primary`. Cor sozinha não é sinal: é a mesma
 * disciplina já paga nas barras do Comprometido (sob sol, em escala de cinza
 * ou para protanopia/deuteranopia, duas cores viram a mesma), e aqui o alvo é
 * um Android usado na rua.
 */
function TabBar({ route }: { route: RouteKey }) {
  const naBarra = ROTAS_NA_BARRA.includes(route)

  const classeSlot = (ativo: boolean) =>
    cn(
      'flex min-h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-t-2 text-[10px] font-medium transition-colors',
      ativo
        ? 'border-primary text-primary'
        : 'text-muted-foreground border-transparent',
    )

  return (
    <nav
      aria-label="Navegação principal"
      data-testid="tab-bar"
      className="bg-background fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom,0px)]"
    >
      {ITENS_DA_BARRA.map((item) => {
        const ativo = item.route === route
        const Icone = item.icon
        return (
          <a
            key={item.href}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={classeSlot(ativo)}
          >
            <Icone className="size-5" aria-hidden="true" />
            {item.label}
          </a>
        )
      })}
      <SheetTrigger asChild>
        <button
          type="button"
          data-testid="nav-mais"
          data-secao-ativa={!naBarra ? 'true' : undefined}
          aria-label={
            naBarra
              ? 'Mais destinos'
              : `Mais destinos — ${TITULO_DA_ROTA[route]} é a seção atual`
          }
          className={classeSlot(!naBarra)}
        >
          <Menu className="size-5" aria-hidden="true" />
          Mais
        </button>
      </SheetTrigger>
    </nav>
  )
}

/** Top bar do celular: marca + título da rota + tema + conta. */
function TopBar({
  route,
  onAbrirConta,
}: {
  route: RouteKey
  onAbrirConta: () => void
}) {
  return (
    <header className="bg-background/95 sticky top-0 z-40 flex h-14 items-center gap-2 border-b px-4 backdrop-blur-sm">
      <Marca />
      <h1 className="truncate text-base font-semibold tracking-tight">
        {TITULO_DA_ROTA[route]}
      </h1>
      <div className="ml-auto flex shrink-0 items-center">
        <BotaoTema />
        <button
          type="button"
          data-testid="abrir-conta"
          aria-label="Conta e mais destinos"
          onClick={onAbrirConta}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground grid size-11 shrink-0 cursor-pointer place-items-center rounded-md transition-colors"
        >
          <CircleUser className="size-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

/** A sidebar do desktop — literal da `AdminSidebar` de `apps/web`. */
function Sidebar({ route, email }: { route: RouteKey; email?: string }) {
  return (
    <aside
      data-testid="sidebar"
      className="bg-card/40 sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r px-4 py-6"
    >
      <a href="#/" className="flex items-center gap-2 px-2">
        <Marca />
        <span className="text-lg font-semibold">finanças</span>
      </a>

      {/*
        O `aria-label` fica no `<nav>`, não no `<aside>`: `<aside>` mapeia pra
        `complementary`, então rotulá-lo não daria nome a nenhuma
        `navigation` — e a tab bar do celular usa exatamente esse nome.
      */}
      <nav
        aria-label="Navegação principal"
        className="flex flex-1 flex-col gap-6"
      >
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo} className="flex flex-col gap-1">
            <p className={CLASSE_CABECALHO_GRUPO}>{grupo.titulo}</p>
            {grupo.itens.map((item) => (
              <ItemDeLista
                key={item.href}
                item={item}
                ativo={item.route === route}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-2 border-t pt-4">
        <span className="text-muted-foreground truncate px-2 text-xs">
          {email}
        </span>
        <div className="flex items-center gap-1 px-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11 flex-1"
            onClick={() => signOut()}
          >
            Sair
          </Button>
          <BotaoTema />
        </div>
      </div>
    </aside>
  )
}

function Tela({
  route,
  debtId,
  transferindo,
}: {
  route: RouteKey
  debtId: string | null
  transferindo: boolean
}) {
  if (debtId) return <DebtDetailPage debtId={debtId} />
  switch (route) {
    case 'dividas':
      return <DividasPage />
    case 'extrato':
      return <ExtratoPage />
    case 'comprometido':
      return <CommitmentsPage from={competenciaAtual()} />
    case 'fluxo':
      return <FluxoPage />
    case 'insight':
      return <InsightPage />
    case 'lancar':
      return transferindo ? <TransferirPage /> : <NewEntryPage />
    case 'recorrentes':
      return <RecorrentesPage />
    case 'regras':
      return <RegrasPage />
    case 'reserva':
      return <ReservaPage />
    case 'importar':
      return <ImportarPage />
    case 'contas':
      return <AccountsPage />
    case 'categorias':
      return <CategoriasPage />
    case 'configuracoes':
      return <ConfigPage />
    default:
      return <HomePage />
  }
}

function AppShell() {
  const { data: sessao } = useSession()
  const hash = useHash()
  const menorQueMd = useMenorQueMd()
  const [mais, setMais] = useState(false)

  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null
  const route = resolveRoute(hash)
  // A aba de transferência é uma SUB-rota de `#/lancar`, não um destino novo:
  // `resolveRoute` já resolve qualquer `#/lancar*` pra `'lancar'` (é
  // `startsWith`), então o slot "Lançar" da tab bar continua ativo.
  const transferindo = hash.startsWith('#/lancar/transferir')
  const tela = (
    <Tela route={route} debtId={debtId} transferindo={transferindo} />
  )

  // ⚠️ **UM SÓ dos dois navs é renderizado — nunca `md:hidden`/`hidden
  // md:flex`.** Com CSS, os dois markups ficariam no DOM ao mesmo tempo; jsdom
  // não computa CSS, e os ~20 `getByRole('link', { name: … })` da suíte
  // passariam a achar DOIS "Extrato". Ver `lib/breakpoint.ts`.
  if (!menorQueMd) {
    return (
      <div className="flex min-h-screen">
        <Sidebar route={route} email={sessao?.user.email} />
        <main className="mx-auto max-w-3xl flex-1 space-y-6 px-6 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {TITULO_DA_ROTA[route]}
          </h1>
          {tela}
        </main>
      </div>
    )
  }

  return (
    // O `Sheet` embrulha os dois porque o `SheetTrigger` mora na tab bar e o
    // botão de conta (top bar) abre o MESMO painel — é lá que o e-mail e o
    // Sair passaram a morar, depois que o `<header>` de 32px morreu.
    <Sheet open={mais} onOpenChange={setMais}>
      <TopBar route={route} onAbrirConta={() => setMais(true)} />
      <main className="space-y-6 px-4 pt-4 pb-[calc(3.5rem+1.5rem+env(safe-area-inset-bottom,0px))]">
        {tela}
      </main>
      <TabBar route={route} />
      <PainelMais
        route={route}
        email={sessao?.user.email}
        fechar={() => setMais(false)}
      />
    </Sheet>
  )
}

export function App() {
  return (
    <Gate>
      <AppShell />
    </Gate>
  )
}
