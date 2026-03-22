'use client'

import {
  getVisitCardFaIcon,
  VISIT_CARD_FA_SELECT_OPTIONS,
} from '@/lib/visit-card-fontawesome'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'

export default function KeystaticIconPreviewPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <nav>
        <Link
          href="/keystatic"
          className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
        >
          ← Voltar ao Keystatic
        </Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pré-visualização — ícones Font Awesome do cartão de visita
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          No site, os SVG seguem{' '}
          <code className="bg-muted text-foreground rounded px-1.5 py-0.5">
            currentColor
          </code>{' '}
          com{' '}
          <code className="bg-muted text-foreground rounded px-1.5 py-0.5">
            text-foreground
          </code>{' '}
          (tema claro / escuro). Abaixo, dois fundos de referência para ver o
          contraste.
        </p>
        <p className="text-muted-foreground text-sm">
          Documentação oficial:{' '}
          <a
            href="https://docs.fontawesome.com/web/use-with/react/"
            className="text-primary underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
          >
            Font Awesome + React
          </a>
        </p>
      </header>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VISIT_CARD_FA_SELECT_OPTIONS.map((opt) => {
          const icon = getVisitCardFaIcon(opt.value)
          if (!icon) return null
          return (
            <li
              key={opt.value}
              className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-900"
                  title="Referência claro"
                >
                  <FontAwesomeIcon icon={icon} className="size-8" />
                </div>
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-50"
                  title="Referência escuro"
                >
                  <FontAwesomeIcon icon={icon} className="size-8" />
                </div>
                <div className="border-border bg-background flex min-w-0 flex-1 items-center justify-center rounded-lg border px-2 py-3">
                  <FontAwesomeIcon
                    icon={icon}
                    className="text-foreground size-8"
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-xs leading-snug">
                {opt.label}
              </p>
              <code className="text-foreground text-[11px] break-all">
                {opt.value}
              </code>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
