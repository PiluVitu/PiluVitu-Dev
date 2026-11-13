import Image from 'next/image'
import { cn } from '@piluvitu/ui/cn'
import type { AppPiluTech, EstadoApp } from '@/lib/home/catalogo-pilutech'
import { STACK } from '@/lib/home/stack'

const PILUTECH = 'https://pilutech.com.br'

const PONTO: Record<EstadoApp, string> = {
  ativo: 'bg-ok',
  revisao: 'bg-warn',
  desenvolvimento: 'bg-muted-foreground',
}

const overline =
  'font-mono text-[11px] font-semibold tracking-[.2em] text-muted-foreground'

export function HomePiluTech({
  apps,
  className,
}: {
  apps: AppPiluTech[]
  className?: string
}) {
  return (
    <section
      id="servicos"
      aria-labelledby="pilutech-heading"
      className={cn(
        'border-accent-line bg-card flex flex-col gap-3.5 rounded-[28px] border p-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <p className={cn(overline, 'text-primary')}>
            PILUTECH · {String(apps.length).padStart(2, '0')} SERVIÇOS
          </p>
          <h2 id="pilutech-heading" className="text-2xl font-extrabold">
            Meus apps agora moram na PiluTech
          </h2>
        </div>
        <a
          href={`${PILUTECH}/apps`}
          className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-2xl px-4 text-sm font-bold"
        >
          pilutech.com.br/apps →
        </a>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-2.5">
        {apps.map((app) => (
          <a
            key={app.slug}
            href={app.url}
            className="border-border bg-background hover:bg-accent flex min-h-11 items-center gap-3 rounded-2xl border p-3 transition-colors"
          >
            {app.icone ? (
              <Image
                src={app.icone}
                alt=""
                width={38}
                height={38}
                className="size-[38px] shrink-0 rounded-xl"
              />
            ) : (
              <span
                aria-hidden
                className="bg-secondary text-foreground grid size-[38px] shrink-0 place-items-center rounded-xl font-extrabold"
              >
                {app.nome[0]}
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="truncate text-sm">{app.nome}</b>
              <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className={cn(
                    'size-[7px] shrink-0 rounded-full',
                    PONTO[app.estado],
                  )}
                />
                <span className="truncate">{app.status}</span>
              </span>
            </span>
            <span aria-hidden className="text-primary shrink-0">
              →
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}

export function HomeStack({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="stack-heading"
      className={cn(
        'border-border bg-card flex flex-col gap-4 rounded-3xl border p-6',
        className,
      )}
    >
      <h2 id="stack-heading" className={overline}>
        STACK
      </h2>
      <p className="font-mono text-xs">
        <span className="text-ok">$</span> cat stack.yaml
      </p>
      {STACK.map(({ grupo, itens }) => (
        <div key={grupo} className="flex flex-col gap-2">
          <span className="text-muted-foreground font-mono text-[11px]">
            <span className="text-primary">{grupo}</span>:
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {itens.map((item) => (
              <li
                key={item}
                className="border-accent-line bg-accent-soft rounded-full border px-2.5 py-1.5 text-xs font-semibold"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

export function HomeContato({ className }: { className?: string }) {
  return (
    <section
      id="contato"
      aria-label="Contato"
      className={cn(
        'border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-[28px] border p-7',
        className,
      )}
    >
      <p className="font-mono">
        <span className="text-ok">$</span> ping paulo{' '}
        <span className="text-muted-foreground">
          # vagas de SRE, consultoria ou um app
        </span>
      </p>
      <div className="flex flex-wrap gap-2.5">
        <a
          href="mailto:help@pilutech.com.br"
          className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-2xl px-4 text-sm font-bold"
        >
          Falar comigo →
        </a>
        <a
          href={PILUTECH}
          className="border-border inline-flex min-h-11 items-center rounded-2xl border px-4 text-sm font-semibold"
        >
          Serviços da PiluTech →
        </a>
      </div>
    </section>
  )
}
