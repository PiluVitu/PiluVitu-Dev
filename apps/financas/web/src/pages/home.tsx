import { BlocoComprometido } from '../blocos/BlocoComprometido'

/**
 * Casca da home (`#/`, novo default — Task 6). Nesta task só o bloco
 * Comprometido; as Tasks 7/8 adicionam os outros três no mesmo grid. Grid
 * responsivo: 1 coluna no Android (onde o dono lança gasto), 2 a partir de
 * `md` (MacBook) — cada bloco decide seu próprio conteúdo/estado via
 * `Bloco`, então um bloco que falhar não derruba os demais nem o título da
 * página (ver `home.test.tsx`).
 */
export function HomePage() {
  return (
    <section>
      <h1>Início</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BlocoComprometido />
      </div>
    </section>
  )
}
