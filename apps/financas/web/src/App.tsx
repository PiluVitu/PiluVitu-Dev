import { useEffect, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@piluvitu/ui/dropdown-menu'
import { signOut, useSession } from './auth-client'
import { Gate } from './Gate'
import { competenciaAtual } from './lib/dates'
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
// TANTO pra decidir o que renderizar QUANTO pra marcar o link ativo no nav.
// Duas cópias da mesma cadeia de precedência (uma pro render, outra pro
// nav) é exatamente o tipo de duplicação que diverge silenciosamente numa
// edição futura — um item novo na cadeia de render que esqueça o irmão no
// nav deixaria a tela certa aparecer com NENHUM link marcado como ativo,
// sem erro nenhum. `#/dividas/:id` (detalhe) resolve pro mesmo `RouteKey`
// de `#/dividas` de propósito — é a mesma "seção" pro nav, mesmo sendo uma
// tela diferente pro render (`debtId` decide isso à parte, abaixo).
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

type NavItem = { href: string; label: string; route: RouteKey }

// ⚠️ MEDIDO em Chrome real a 390×844: com os 13 destinos como pílulas soltas,
// o `<nav>` ocupava **153px** (três linhas) e empurrava o primeiro card pra
// y=233 — ou seja, mais de um quarto da altura do celular gasto em navegação
// ANTES de qualquer número. A tela do dono tem UMA pergunta; ele não chega
// nela por engano, chega por um link — mas não precisa de treze deles à mão.
//
// A divisão é por FREQUÊNCIA DE USO, não por importância conceitual: o que
// ele abre todo dia (ver a home, lançar um gasto, conferir o extrato, cobrar
// uma dívida, olhar o comprometido) fica sempre à mão; o resto — cadastro
// (contas, categorias, recorrentes), operação pontual (importar) e leitura
// ocasional (reserva, fluxo, insight, configurações) — mora no "Mais".
const NAV_PRIMARIOS: NavItem[] = [
  { href: '#/', label: 'Início', route: 'home' },
  { href: '#/lancar', label: 'Lançar', route: 'lancar' },
  { href: '#/extrato', label: 'Extrato', route: 'extrato' },
  { href: '#/dividas', label: 'Dívidas', route: 'dividas' },
  { href: '#/comprometido', label: 'Comprometido', route: 'comprometido' },
]

const NAV_SECUNDARIOS: NavItem[] = [
  { href: '#/contas', label: 'Contas', route: 'contas' },
  { href: '#/categorias', label: 'Categorias', route: 'categorias' },
  { href: '#/recorrentes', label: 'Recorrentes', route: 'recorrentes' },
  { href: '#/regras', label: 'Regras', route: 'regras' },
  { href: '#/reserva', label: 'Reserva', route: 'reserva' },
  { href: '#/importar', label: 'Importar', route: 'importar' },
  { href: '#/fluxo', label: 'Fluxo de caixa', route: 'fluxo' },
  { href: '#/insight', label: 'Insight', route: 'insight' },
  { href: '#/configuracoes', label: 'Configurações', route: 'configuracoes' },
]

const CLASSE_PILULA =
  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors'
const CLASSE_ATIVA = 'bg-primary text-primary-foreground'
const CLASSE_INATIVA =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground'

/**
 * Os destinos que não cabem no bolso do polegar, atrás de um `dropdown-menu`
 * do design system (primeiro consumidor dele no monorepo — o componente já
 * existia em `@piluvitu/ui` com zero imports).
 *
 * ⚠️ **O gatilho ASSUME o rótulo da seção corrente quando a rota ativa mora
 * aqui dentro** — sem isso, estar em `#/fluxo` deixaria o nav inteiro sem
 * NENHUMA marca de "onde estou", que é justamente o que o estado ativo
 * existe pra responder. O `aria-current="page"` continua no `<a>` de
 * verdade, dentro do menu (é ele que é a página), e o gatilho ganha
 * `data-secao-ativa` — atributo próprio, não `aria-current`, porque o botão
 * que ABRE um menu não é a página corrente e anunciá-lo como tal mentiria
 * pro leitor de tela.
 */
function NavMais({ route }: { route: RouteKey }) {
  const ativo = NAV_SECUNDARIOS.find((i) => i.route === route)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="nav-mais"
        data-secao-ativa={ativo ? 'true' : undefined}
        aria-label={
          ativo
            ? `Mais destinos — ${ativo.label} é a seção atual`
            : 'Mais destinos'
        }
        className={cn(
          CLASSE_PILULA,
          'cursor-pointer',
          ativo ? CLASSE_ATIVA : CLASSE_INATIVA,
        )}
      >
        {ativo ? ativo.label : 'Mais'} ▾
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {NAV_SECUNDARIOS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <a
              href={item.href}
              aria-current={item.route === route ? 'page' : undefined}
              className="cursor-pointer"
            >
              {item.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppShell() {
  const { data: sessao } = useSession()
  const hash = useHash()
  const debtId = hash.startsWith('#/dividas/')
    ? hash.slice('#/dividas/'.length)
    : null
  const route = resolveRoute(hash)
  // A aba de transferência é uma SUB-rota de `#/lancar`, não um destino novo
  // do nav: `resolveRoute` já resolve qualquer `#/lancar*` pra `'lancar'`
  // (é `startsWith`), então a pílula "Lançar" continua marcada como ativa e o
  // `<nav>` não cresce nem um pixel. O porquê dessa escolha (com a medição em
  // Chrome real) está em `AbasLancar`, `pages/new-entry.tsx`. Mesmo padrão do
  // `debtId` acima: quem lê o hash pra escolher a tela é o AppShell.
  const transferindo = hash.startsWith('#/lancar/transferir')

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm">
          {sessao?.user.email}
        </span>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          Sair
        </Button>
      </header>
      <nav
        aria-label="Navegação principal"
        className="flex flex-wrap items-center gap-1 border-b pb-3"
      >
        {NAV_PRIMARIOS.map((item) => {
          const active = item.route === route
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                CLASSE_PILULA,
                active ? CLASSE_ATIVA : CLASSE_INATIVA,
              )}
            >
              {item.label}
            </a>
          )
        })}
        <NavMais route={route} />
      </nav>
      {debtId ? (
        <DebtDetailPage debtId={debtId} />
      ) : route === 'dividas' ? (
        <DividasPage />
      ) : route === 'extrato' ? (
        <ExtratoPage />
      ) : route === 'comprometido' ? (
        <CommitmentsPage from={competenciaAtual()} />
      ) : route === 'fluxo' ? (
        <FluxoPage />
      ) : route === 'insight' ? (
        <InsightPage />
      ) : route === 'lancar' ? (
        transferindo ? (
          <TransferirPage />
        ) : (
          <NewEntryPage />
        )
      ) : route === 'recorrentes' ? (
        <RecorrentesPage />
      ) : route === 'regras' ? (
        <RegrasPage />
      ) : route === 'reserva' ? (
        <ReservaPage />
      ) : route === 'importar' ? (
        <ImportarPage />
      ) : route === 'contas' ? (
        <AccountsPage />
      ) : route === 'categorias' ? (
        <CategoriasPage />
      ) : route === 'configuracoes' ? (
        <ConfigPage />
      ) : (
        <HomePage />
      )}
    </div>
  )
}

export function App() {
  return (
    <Gate>
      <AppShell />
    </Gate>
  )
}
