import { formatBRL } from '@piluvitu/tools/money'
import type { AccountView } from '../pages/accounts'

/**
 * Rótulo da conta no `<select>`, com o SALDO junto.
 *
 * ⚠️ **Esta era a única operação do app em que o dono decidia um valor às
 * cegas.** Escolher a conta de origem é escolher de onde o dinheiro sai — e a
 * pergunta "tem quanto lá?" ficava a uma tela de distância (`#/contas`),
 * enquanto `balance_cents` já vinha carregado em `AccountView`, no mesmo
 * `GET /api/accounts` que preenche este select. Transferir mais do que a
 * conta tem não é recusado por ninguém: as duas pernas gravam, o saldo fica
 * negativo, e o erro só aparece depois.
 *
 * Vale pros DOIS selects de `pages/transferir.tsx`, não só o de origem: o
 * destino com saldo à vista é o que deixa conferir, sem sair da tela, que o
 * dinheiro chegou onde devia.
 *
 * ⚠️ **Mudou de casa (nasceu em `pages/transferir.tsx`) quando ganhou o
 * segundo consumidor: `blocos/PagarFatura.tsx`.** Bloco importando de PÁGINA
 * é seta na direção errada — a página é quem compõe blocos —, e lá o achado
 * pesa ainda mais que na transferência: pagar fatura tira o valor INTEIRO da
 * conta de uma vez, sem o dono digitar quanto. Mesmo raciocínio já registrado
 * para `lib/commitments.ts` ter saído de `pages/commitments.tsx`: lugar
 * único, sem duas grafias do mesmo rótulo. `pages/transferir.tsx` continua
 * reexportando o nome, então nada que já importava de lá quebrou.
 *
 * `formatBRL` (centavos inteiros) — nunca float, nunca `toFixed`.
 */
export function rotuloConta(c: AccountView): string {
  return `${c.name} · ${formatBRL(c.balance_cents)}`
}
