export function foraDaVotacao<Evento extends { url: string }>(
  evento: Evento,
): Evento | null {
  const { hostname, pathname } = new URL(evento.url)
  const naVotacao =
    hostname.startsWith('votai.') ||
    pathname === '/votacao' ||
    pathname.startsWith('/votacao/')
  return naVotacao ? null : evento
}
