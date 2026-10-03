import { LINHAS_DO_TERMINAL } from '@/lib/conteudo'

export function Terminal() {
  return (
    <div className="bg-card border-border min-w-0 overflow-hidden rounded-3xl border">
      <div className="border-border text-muted-foreground flex items-center justify-between border-b px-[22px] py-4 font-mono text-[13px] tracking-[0.12em]">
        <span>~/pilutech</span>
        <span aria-hidden className="flex gap-1.5">
          <span className="bg-border size-[9px] rounded-[3px]" />
          <span className="bg-border size-[9px] rounded-[3px]" />
          <span className="bg-primary size-[9px] rounded-[3px]" />
        </span>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-[26px] font-mono text-[clamp(14px,1.4vw,17px)] leading-[1.4]">
        <p>
          <span aria-hidden className="text-primary">
            $
          </span>{' '}
          pilutech servicos
        </p>
        <ul className="flex flex-col gap-3.5">
          {LINHAS_DO_TERMINAL.map((linha) => (
            <li key={linha}>
              <span aria-hidden className="text-ok">
                ✓
              </span>{' '}
              {linha}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          <span aria-hidden className="text-primary">
            ●
          </span>{' '}
          agenda aberta para novos projetos
        </p>
      </div>
    </div>
  )
}
