type CabecalhoSecaoProps = {
  id: string
  rotulo: string
  contagem?: number
}

export function CabecalhoSecao({ id, rotulo, contagem }: CabecalhoSecaoProps) {
  return (
    <div className="flex items-center gap-3">
      <h2
        id={id}
        className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase"
      >
        {rotulo}
      </h2>
      {contagem === undefined ? null : (
        <span className="text-muted-foreground font-mono text-xs">
          {String(contagem).padStart(2, '0')}
        </span>
      )}
      <span aria-hidden className="bg-border h-px flex-1" />
    </div>
  )
}
