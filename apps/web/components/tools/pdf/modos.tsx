import Link from 'next/link'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { ModoDaFerramenta } from '@/lib/tools-registry'
import { TEXTOS } from './textos'

export type ModoComRota = ModoDaFerramenta & { href: string }

export function ModosDoEditor({ modos }: { modos: readonly ModoComRota[] }) {
  return (
    <section aria-labelledby="modos-do-editor" className="space-y-4">
      <h2 id="modos-do-editor" className="font-semibold">
        {TEXTOS.editor.modos}
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {modos.map((modo) => (
          <li key={modo.slug}>
            <Link
              href={modo.href}
              data-testid="pdf-modo"
              className="group bg-card border-border hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background flex h-full min-h-11 items-start gap-4 rounded-lg border p-5 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:transition-colors"
            >
              <span className="bg-accent-soft text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                <FontAwesomeIcon
                  icon={modo.icon}
                  className="size-5"
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="font-semibold">{modo.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {modo.description}
                </p>
              </div>
              <FontAwesomeIcon
                icon={faArrowRight}
                className="text-primary mt-1 size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
