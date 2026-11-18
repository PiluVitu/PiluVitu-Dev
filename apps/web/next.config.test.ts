import { execFileSync } from 'node:child_process'

type Redirecionamento = {
  source: string
  destination: string
  permanent: boolean
}

// O next.config.mjs é ESM e o Jest daqui é CommonJS: um Node filho importa o arquivo e devolve
// os redirects() em JSON. O CI não roda o E2E do web, que é o outro lugar que confere o 308.
function redirecionamentos(): Redirecionamento[] {
  const saida = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "const { default: c } = await import('./next.config.mjs'); process.stdout.write(JSON.stringify(await c.redirects()))",
    ],
    { cwd: __dirname, encoding: 'utf8' },
  )
  return JSON.parse(saida) as Redirecionamento[]
}

// P5 (decidida pelo Paulo em 2026-11-18): as rotas antigas do editor caem nele, como o Assinar.
const ROTAS_ANTIGAS = [
  '/tools/pdf/assinar',
  '/tools/pdf/mesclar',
  '/tools/pdf/organizar',
  '/tools/pdf/editar',
  '/tools/mesclar-pdf',
]

describe('next.config.mjs: redirecionamentos do editor de PDF', () => {
  const todos = redirecionamentos()

  it.each(ROTAS_ANTIGAS)('%s vai para /tools/pdf com 308', (rota) => {
    expect(todos.filter((r) => r.source === rota)).toEqual([
      { source: rota, destination: '/tools/pdf', permanent: true },
    ])
  })

  it('num salto só: /tools/pdf não redireciona, e nenhum destino é uma rota antiga', () => {
    expect(todos.filter((r) => r.source === '/tools/pdf')).toEqual([])
    for (const { destination } of todos)
      expect(ROTAS_ANTIGAS).not.toContain(destination)
  })
})
