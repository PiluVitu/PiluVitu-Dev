import { cn } from '@piluvitu/ui/cn'
import Link from 'next/link'
import { EMAIL_DA_PILUTECH } from '@/lib/contato'
import { ANEL_DE_FOCO, CONTEUDO } from './classes'
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-muted-foreground font-mono text-[13px]">
            © {ano} PiluTech · Paulo Victor T S · {EMAIL_DA_PILUTECH}
          </p>
          <Link
            href="/privacidade"
            className={cn(
              'text-muted-foreground hover:text-foreground rounded font-mono text-[13px] underline underline-offset-4',
              ANEL_DE_FOCO,
            )}
          >
            Política de privacidade
          </Link>
        </div>
      </div>
    </footer>
  )
}
