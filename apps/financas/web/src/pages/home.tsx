import { BlocoCategorias } from '../blocos/BlocoCategorias'
import { BlocoComprometido } from '../blocos/BlocoComprometido'
import { BlocoDividas } from '../blocos/BlocoDividas'
import { BlocoSaldos } from '../blocos/BlocoSaldos'
import { FaixaKpiInicio } from '../blocos/FaixaKpiInicio'
import { GRID_BLOCOS } from '../lib/superficie'
import { SUBTITULO_PAGINA } from '../lib/tipografia'

/**
 * Casca da home (`#/`). Faixa de KPIs (a régua "como eu estou") e depois os
 * quatro blocos, cada um dono do próprio carregamento/erro/vazio via
 * `Bloco` — um bloco que falhe não derruba os demais nem a faixa (ver
 * `home.test.tsx`).
 */
export function HomePage() {
  return (
    // ⚠️ O `<h1>Início</h1>` não mora aqui (nem nas outras 13 telas) — ele
    // vive em `App.tsx`, na top bar fixa do celular e no cabeçalho de
    // página do desktop. Ver `TITULO_DA_ROTA` lá pro porquê.
    <section className="space-y-5" data-testid="pagina-inicio">
      <p className={SUBTITULO_PAGINA}>
        Visão geral das suas finanças — Comprometido, saldos, dívidas em aberto
        e pra onde foi o dinheiro este mês.
      </p>
      <FaixaKpiInicio />
      <div className={GRID_BLOCOS}>
        <BlocoComprometido />
        <BlocoSaldos />
        <BlocoDividas />
        <BlocoCategorias />
      </div>
    </section>
  )
}
