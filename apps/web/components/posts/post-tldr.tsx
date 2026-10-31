export function PostTldr({ texto }: { texto: string }) {
  const limpo = texto.trim()
  if (!limpo) return null
  return (
    <aside
      aria-label="TL;DR"
      className="border-primary bg-accent-soft mt-10 rounded-r-lg border-l-2 px-5 py-4"
    >
      <p className="text-primary font-mono text-xs font-semibold tracking-[0.2em] uppercase">
        TL;DR
      </p>
      <p className="text-foreground mt-2 text-base leading-relaxed text-pretty whitespace-pre-line">
        {limpo}
      </p>
    </aside>
  )
}
