import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const MORCEGOS = [
  { topo: '12%', escala: 1, duracao: '19s', atraso: '0s' },
  { topo: '24%', escala: 0.7, duracao: '24s', atraso: '-9s' },
  { topo: '7%', escala: 0.55, duracao: '28s', atraso: '-17s' },
]

function Morcego() {
  return (
    <svg viewBox="0 0 64 28" className="h-6 w-14" fill="currentColor">
      <path d="M32 9c-1.6-3-3.1-4.5-4-4.6.4 1.3.3 2.6-.3 3.6C25 4.6 19.5 1.5 12 1c3 2.6 4.1 5.6 3.7 8.4C12.5 7.2 6.7 6.5 0 8.3c5.6 1.6 9.6 5.6 11 10.4 2.5-2.3 6.2-2.8 9.4-1.2.6-2.6 2.6-4.3 5-4.3.5 3 2.9 5.6 6.6 7.5 3.7-1.9 6.1-4.5 6.6-7.5 2.4 0 4.4 1.7 5 4.3 3.2-1.6 6.9-1.1 9.4 1.2 1.4-4.8 5.4-8.8 11-10.4-6.7-1.8-12.5-1.1-15.7 1.1C48.9 6.6 50 3.6 53 1c-7.5.5-13 3.6-15.7 7-.6-1-.7-2.3-.3-3.6-.9.1-2.4 1.6-4 4.6Z" />
    </svg>
  )
}

function Fantasma({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 48"
      className={cn('halloween-fantasma text-foreground/20', className)}
      fill="currentColor"
    >
      <path d="M20 0C9 0 2 8.5 2 19v27l6-5 6 5 6-5 6 5 6-5 6 5V19C38 8.5 31 0 20 0Zm-7 22a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm14 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
    </svg>
  )
}

function Teia() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="text-foreground/15 absolute -top-1 -left-1 h-40 w-40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M0 0 120 120M0 0l60 120M0 0l120 60M0 0v120M0 0h120" />
      <path d="M0 24c8 2 16 0 24-4 4 8 2 16-4 24M0 50c16 4 32 0 48-8 8 16 4 32-8 48M0 78c24 6 48 0 72-12 12 24 6 48-12 72" />
    </svg>
  )
}

function Lua() {
  return (
    <div
      className="absolute top-10 right-8 size-24 rounded-full sm:right-16 sm:size-32"
      style={{
        background:
          'radial-gradient(circle at 35% 35%, hsl(45 100% 92%), hsl(40 90% 72%) 55%, hsl(30 80% 55%))',
        boxShadow:
          '0 0 60px 18px hsl(40 100% 70% / 0.25), 0 0 140px 40px hsl(280 80% 50% / 0.2)',
        opacity: 0.85,
      }}
    />
  )
}

/** Cenário decorativo atrás do conteúdo; nunca recebe clique nem leitor de tela. */
export function HalloweenBackdrop() {
  return (
    <div
      aria-hidden
      data-testid="halloween-backdrop"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <Lua />
      <Teia />
      {MORCEGOS.map((m) => (
        <div
          key={m.topo}
          className="halloween-morcego absolute left-0 text-black/80"
          style={
            {
              top: m.topo,
              '--escala': m.escala,
              '--duracao': m.duracao,
              '--atraso': m.atraso,
            } as CSSProperties
          }
        >
          <Morcego />
        </div>
      ))}
      <Fantasma className="absolute top-[45%] left-4 hidden w-10 md:block" />
      <Fantasma className="absolute top-[70%] right-6 hidden w-8 [animation-delay:-3s] md:block" />
      <div className="absolute inset-x-0 bottom-0 h-40 overflow-hidden">
        <div
          className="halloween-nevoa h-full w-[200%]"
          style={{
            background:
              'radial-gradient(ellipse 25% 60% at 25% 100%, hsl(270 30% 80% / 0.12), transparent 70%), radial-gradient(ellipse 25% 60% at 75% 100%, hsl(270 30% 80% / 0.12), transparent 70%)',
          }}
        />
      </div>
    </div>
  )
}

/** Aplica a paleta de Halloween (classe `.halloween` em `globals.css`) e o cenário. */
export function HalloweenScope({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-theme-votacao="halloween"
      className={cn('halloween relative isolate min-h-screen', className)}
    >
      <HalloweenBackdrop />
      {children}
    </div>
  )
}

export function HalloweenHeading({ title }: { title: string }) {
  return (
    <div>
      <p className="text-primary font-mono text-xs tracking-[0.3em] uppercase">
        🎃 Sessão de Halloween
      </p>
      <h1 className="halloween-title mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
        {title}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Escolha os filmes que vão assombrar a noite. Quem tiver coragem vota em
        todos.
      </p>
    </div>
  )
}
