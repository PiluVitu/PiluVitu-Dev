/**
 * Toda PK do schema é TEXT com UUID gerado na aplicação (invariante 2 do §5.1
 * do spec). Dois motivos, ambos medidos:
 *  - o binding do D1 devolve INTEGER como Number do JS (52 bits), então id
 *    numérico grande perde precisão em silêncio;
 *  - não existe last_insert_rowid() confiável ENTRE statements de um batch(),
 *    e o gerador de parcelas (Task 8) precisa pré-montar 60 linhas com os ids
 *    já conhecidos antes de mandar o batch.
 */
export function newId(): string {
  return crypto.randomUUID()
}
