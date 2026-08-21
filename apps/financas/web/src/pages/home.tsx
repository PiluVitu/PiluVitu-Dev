import { BlocoCategorias } from '../blocos/BlocoCategorias'
import { BlocoComprometido } from '../blocos/BlocoComprometido'
import { BlocoDividas } from '../blocos/BlocoDividas'
import { BlocoSaldos } from '../blocos/BlocoSaldos'

/**
 * Casca da home (`#/`, novo default — Task 6). Task 6 trouxe só o bloco
 * Comprometido; a Task 7 somou Saldos e Dívidas; esta task (8) fecha com o
 * quarto e último, Categorias — "para onde foi o dinheiro", a pergunta que
 * justifica o módulo inteiro (ver brief da Task 8). Grid responsivo: 1
 * coluna no Android (onde o dono lança gasto), 2 a partir de `md`
 * (MacBook) — cada bloco decide seu próprio conteúdo/estado via `Bloco`,
 * então um bloco que falhar não derruba os demais nem o título da página
 * (ver `home.test.tsx`, incl. o teste de isolamento real da Task 7 — não
 * só "os N cards existem").
 */
export function HomePage() {
  return (
    // ⚠️ O `<h1>Início</h1>` saiu daqui (e das outras 15 telas) — ele mora em
    // `App.tsx`, que o renderiza na top bar fixa no celular e acima do
    // conteúdo no desktop. Ver `TITULO_DA_ROTA` lá pro porquê.
    <section className="space-y-6" data-testid="pagina-inicio">
      <p className="text-muted-foreground text-sm">
        Visão geral das suas finanças — Comprometido, saldos, dívidas em aberto
        e pra onde foi o dinheiro este mês.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BlocoComprometido />
        <BlocoSaldos />
        <BlocoDividas />
        <BlocoCategorias />
      </div>
    </section>
  )
}
