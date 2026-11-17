import type { Caixa, Tamanho } from '@piluvitu/tools/pdf-regras'

const pct = (valor: number, total: number) => `${(valor / total) * 100}%`

// Em pixels da tela, para o contorno ficar por fora do campo e não tapar o que está nele.
const FOLGA = 3

/**
 * Onde fica o campo focado no formulário, por cima da página. Decorativo para o leitor de tela, que já tem
 * o rótulo e o "Na página N" do campo. O fundo é a página do PDF, não o tema do site: o anel escuro (o
 * primário do tema claro, 7,5:1 no branco) com a borda branca por dentro aparece em página clara e escura.
 */
export function DestaqueDoCampo({
  caixas,
  tamanho,
}: {
  caixas: readonly Caixa[]
  tamanho: Tamanho
}) {
  if (!caixas.length) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      data-testid="editar-pdf-destaque"
    >
      {caixas.map((caixa, indice) => (
        <div
          key={indice}
          className="absolute rounded-sm border-2 border-white ring-[3px] ring-[hsl(198_93%_26%)]"
          style={{
            left: `calc(${pct(caixa.x, tamanho.largura)} - ${FOLGA}px)`,
            top: `calc(${pct(caixa.y, tamanho.altura)} - ${FOLGA}px)`,
            width: `calc(${pct(caixa.largura, tamanho.largura)} + ${2 * FOLGA}px)`,
            height: `calc(${pct(caixa.altura, tamanho.altura)} + ${2 * FOLGA}px)`,
          }}
          data-testid="editar-pdf-destaque-caixa"
        />
      ))}
    </div>
  )
}
