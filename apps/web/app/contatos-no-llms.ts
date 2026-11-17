const CONTATO =
  /[\w.+-]+@([\w-]+(?:\.[\w-]+)+)|mailto:|\btel:|wa\.me|whatsapp/gi
const WHATSAPP = /wa\.me|whatsapp/i
const DOMINIO_DE_EXEMPLO =
  /^(?:[\w-]+\.)*example\.(?:com|org|net)$|^(?:[\w-]+\.)+invalid$/i

/** Os contatos do texto que não são o e-mail permitido nem um e-mail num domínio de exemplo (RFC 2606). */
export function contatosProibidos(texto: string, permitido: string): string[] {
  return [...texto.matchAll(CONTATO)]
    .filter(
      ([contato, dominio]) =>
        dominio === undefined ||
        WHATSAPP.test(contato) ||
        (contato.toLowerCase() !== permitido.toLowerCase() &&
          !DOMINIO_DE_EXEMPLO.test(dominio)),
    )
    .map(([contato]) => contato)
}
