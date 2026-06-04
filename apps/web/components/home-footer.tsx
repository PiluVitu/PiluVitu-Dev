import Link from 'next/link'

type HomeFooterProps = {
  name: string
  year?: number
}

export function HomeFooter({
  name,
  year = new Date().getFullYear(),
}: HomeFooterProps) {
  return (
    <footer className="text-muted-foreground border-border mt-2 flex flex-col gap-2 border-t pt-6 font-mono text-xs sm:flex-row sm:items-center sm:justify-between">
      <span>
        © {year} {name}
      </span>
      <span className="flex flex-wrap items-center gap-x-2">
        <span>piluvitu.com.br</span>
        <span aria-hidden>·</span>
        <Link href="/tools" className="hover:text-foreground transition-colors">
          /tools
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/votacao"
          className="hover:text-foreground transition-colors"
        >
          /votação
        </Link>
        <span aria-hidden>·</span>
        <Link href="/admin" className="hover:text-foreground transition-colors">
          admin
        </Link>
      </span>
    </footer>
  )
}
