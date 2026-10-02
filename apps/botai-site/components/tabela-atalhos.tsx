import { ATALHOS, type Loja, type Sistema } from '@piluvitu/tools/pilulabs'

const NAVEGADORES: { loja: Loja; nome: string }[] = [
  { loja: 'chrome', nome: 'Chrome' },
  { loja: 'edge', nome: 'Edge' },
  { loja: 'opera', nome: 'Opera' },
  { loja: 'firefox', nome: 'Firefox' },
]

const SISTEMAS: { sistema: Sistema; nome: string }[] = [
  { sistema: 'windows', nome: 'Windows' },
  { sistema: 'mac', nome: 'macOS' },
  { sistema: 'linux', nome: 'Linux' },
]

const LEGENDA = 'tabela-atalhos-legenda'

export function TabelaAtalhos() {
  return (
    <div
      role="region"
      aria-labelledby={LEGENDA}
      tabIndex={0}
      className="bg-card border-border focus-visible:ring-ring overflow-x-auto rounded-lg border outline-none focus-visible:ring-2"
    >
      <table className="w-full border-collapse text-sm">
        <caption id={LEGENDA} className="sr-only">
          Atalho para preencher a página, por navegador e sistema
        </caption>
        <thead>
          <tr className="text-muted-foreground font-mono text-xs uppercase">
            <th scope="col" className="px-4 py-3 text-left font-semibold">
              Navegador
            </th>
            {SISTEMAS.map(({ sistema, nome }) => (
              <th
                key={sistema}
                scope="col"
                className="px-4 py-3 text-left font-semibold"
              >
                {nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NAVEGADORES.map(({ loja, nome }) => (
            <tr key={loja} className="border-border border-t">
              <th scope="row" className="px-4 py-3 text-left font-medium">
                {nome}
              </th>
              {SISTEMAS.map(({ sistema }) => (
                <td key={sistema} className="px-4 py-3">
                  <kbd className="bg-muted rounded-[6px] px-1.5 py-0.5 font-mono text-xs">
                    {ATALHOS[loja][sistema]}
                  </kbd>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
