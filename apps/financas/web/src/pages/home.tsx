import { BlocoComprometido } from '../blocos/BlocoComprometido'
import { BlocoDividas } from '../blocos/BlocoDividas'
import { BlocoSaldos } from '../blocos/BlocoSaldos'

/**
 * Casca da home (`#/`, novo default — Task 6). Task 6 trouxe só o bloco
 * Comprometido; esta task (7) soma Saldos e Dívidas — a Task 8 fecha com o
 * quarto. Grid responsivo: 1 coluna no Android (onde o dono lança gasto), 2
 * a partir de `md` (MacBook) — cada bloco decide seu próprio conteúdo/estado
 * via `Bloco`, então um bloco que falhar não derruba os demais nem o título
 * da página (ver `home.test.tsx`, incl. o teste de isolamento real da
 * Task 7 — não só "os 3 cards existem").
 */
export function HomePage() {
  return (
    <section>
      <h1>Início</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BlocoComprometido />
        <BlocoSaldos />
        <BlocoDividas />
      </div>
    </section>
  )
}
