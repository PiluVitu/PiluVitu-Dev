export function SessionStatusBadge({ status }: { status: 'open' | 'closed' }) {
  if (status === 'open') {
    return (
      <span className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium">
        <span
          className="bg-primary-foreground size-1.5 rounded-full"
          aria-hidden
        />
        Aberta
      </span>
    )
  }
  return (
    <span className="border-border text-muted-foreground inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-sm">
      Encerrada
    </span>
  )
}
