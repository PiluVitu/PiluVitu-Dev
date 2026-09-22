repo: PiluVitu/PiluVitu-Dev
branch: main
path: apps/financas

## Last sync

date: 2026-09-21T21:58:00Z

### Updated in this project

- Redesenho completo das 14 telas do módulo Finanças (`apps/financas/web`), em claro e escuro.
- Nova hierarquia por tela: overline mono + título + faixa de KPIs antes do detalhe.
- Gráficos redesenhados: composição empilhada do Comprometido, rosca de categorias, fluxo com acumulado.
- Shell responsivo: sidebar agrupada no desktop, top bar + tab bar de 5 slots no mobile.

## Screen map

| Tela no projeto                     | Arquivos de origem                                                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Início                              | `apps/financas/web/src/pages/home.tsx`, `blocos/Bloco.tsx`, `blocos/BlocoComprometido.tsx`, `blocos/BlocoSaldos.tsx`, `blocos/BlocoDividas.tsx`, `blocos/BlocoCategorias.tsx`, `blocos/NumeroCard.tsx` |
| Lançar / Transferência              | `pages/new-entry.tsx`, `pages/transferir.tsx`                                                                                                                                                          |
| Extrato                             | `pages/extrato.tsx`                                                                                                                                                                                    |
| Dívidas                             | `pages/DividasPage.tsx`                                                                                                                                                                                |
| Dívida (detalhe)                    | `pages/debt-detail.tsx`, `pages/NovoItemForm.tsx`                                                                                                                                                      |
| Comprometido                        | `pages/commitments.tsx`, `lib/commitments.ts`                                                                                                                                                          |
| Importar                            | `pages/importar.tsx`                                                                                                                                                                                   |
| Contas                              | `pages/accounts.tsx`, `blocos/PagarFatura.tsx`                                                                                                                                                         |
| Categorias                          | `pages/categorias.tsx`, `lib/categories.ts`                                                                                                                                                            |
| Recorrentes                         | `pages/recorrentes.tsx`                                                                                                                                                                                |
| Regras                              | `pages/regras.tsx`                                                                                                                                                                                     |
| Fluxo de caixa                      | `pages/fluxo.tsx`, `lib/cashflow.ts`                                                                                                                                                                   |
| Insight                             | `pages/insight.tsx`, `lib/insight.ts`                                                                                                                                                                  |
| Reserva                             | `pages/reserva.tsx`, `lib/reserve.ts`                                                                                                                                                                  |
| Configurações                       | `pages/config.tsx`, `lib/theme.ts`                                                                                                                                                                     |
| Shell (nav, top bar, tab bar, tema) | `web/src/App.tsx`, `web/src/styles.css`, `lib/tipografia.ts`, `lib/breakpoint.ts`, `lib/form-classes.ts`                                                                                               |
