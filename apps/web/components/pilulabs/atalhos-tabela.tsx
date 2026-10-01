import type { Loja, Sistema } from '@/lib/pilulabs'

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

type AtalhosTabelaProps = {
  atalhos: Record<Loja, Record<Sistema, string>>
}

export function AtalhosTabela({ atalhos }: AtalhosTabelaProps) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Atalho para preencher a página, por navegador e sistema
        </caption>
        <thead className="text-muted-foreground font-mono text-xs uppercase">
          <tr>
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
                  <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                    {atalhos[loja][sistema]}
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
