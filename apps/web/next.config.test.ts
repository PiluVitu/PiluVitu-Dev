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

describe('next.config.mjs: redirecionamentos do editor de PDF', () => {
  const todos = redirecionamentos()

  it.each([
    ['/tools/pdf/assinar', '/tools/pdf'],
    ['/tools/mesclar-pdf', '/tools/pdf/mesclar'],
  ])('%s vai para %s com 308', (origem, destino) => {
    expect(todos.filter((r) => r.source === origem)).toEqual([
      { source: origem, destination: destino, permanent: true },
    ])
  })
})
