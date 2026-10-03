import { cn } from '@piluvitu/ui/cn'
import { EMAIL_DA_PILUTECH } from '@/lib/contato'
import { CONTEUDO } from './classes'
import { PiluTechMark } from './pilutech-mark'

export function Rodape({ ano }: { ano: number }) {
  return (
    <footer className="dark bg-background text-foreground border-border border-t">
      <div
        className={cn(
          CONTEUDO,
          'flex flex-wrap items-center justify-between gap-5 py-8',
        )}
      >
        <PiluTechMark tamanho={28} lockup />
        <p className="text-muted-foreground font-mono text-[13px]">
          © {ano} PiluTech · Paulo Victor T S · {EMAIL_DA_PILUTECH}
        </p>
      </div>
    </footer>
  )
}
