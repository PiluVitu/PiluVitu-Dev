const PODS = [
  { nome: 'orai', atraso: '' },
  { nome: 'listai', atraso: '[--atraso-pod:.8s]' },
  { nome: 'sombrai', atraso: '[--atraso-pod:1.6s]' },
  { nome: 'apurai', atraso: '[--atraso-pod:2.4s]' },
  { nome: 'botai', atraso: '[--atraso-pod:3.2s]' },
]

const linha = 'grid grid-cols-[1.3fr_1.1fr_.6fr]'

export function HomeKubectl() {
  return (
    <div
      aria-hidden
      data-testid="home-kubectl"
      className="border-border bg-card rounded-2xl border px-3.5 py-2.5 font-mono text-[11.5px] leading-relaxed"
    >
      <div>
        <span className="text-ok">$</span> kubectl get pods -n pilutech
      </div>
      <div className={`${linha} text-muted-foreground`}>
        <span>NAME</span>
        <span>STATUS</span>
        <span>RST</span>
      </div>
      {PODS.map((pod) => (
        <div key={pod.nome} className={`${linha} ${pod.atraso}`}>
          <span>{pod.nome}</span>
          <span className="relative">
            <span className="home-pod-pendente">Pending</span>
            <span className="home-pod-rodando">Running</span>
          </span>
          <span className="text-muted-foreground">0</span>
        </div>
      ))}
    </div>
  )
}
