export function foraDaVotacao<Evento extends { url: string }>(
  evento: Evento,
): Evento | null {
  const { pathname } = new URL(evento.url)
  return pathname === '/votacao' || pathname.startsWith('/votacao/')
    ? null
    : evento
}
