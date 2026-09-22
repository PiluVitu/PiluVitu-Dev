/**
 * O registro de requisições em voo de `lib/requisicao-unica.ts`.
 *
 * ⚠️ **Mora num módulo próprio por causa do `vi.mock` do Vitest**, e não por
 * gosto de arquivo pequeno: `test/setup.ts` precisa zerar o registro entre
 * casos, e importá-lo de `requisicao-unica.ts` arrastaria `api.ts` junto —
 * o setup roda ANTES da hoisting do `vi.mock('../api')` de cada arquivo de
 * teste, então o módulo ficaria instanciado com o `api` REAL em cache e
 * todo `vi.mock` dele deixaria de valer (medido: os 4 casos de
 * `requisicao-unica.test.ts` caíam em `fetch` de verdade). Este arquivo não
 * importa nada, então o setup pode tocá-lo sem efeito colateral.
 */
export const emVoo = new Map<string, Promise<unknown>>()

/** Só para teste: impede que uma busca em voo vaze de um caso para o outro. */
export function limparRequisicoesEmVoo(): void {
  emVoo.clear()
}
