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

// P5: as quatro rotas antigas do editor saem sem redirecionamento e dão 404.
const QUATRO_ROTAS = [
  '/tools/pdf/mesclar',
  '/tools/pdf/organizar',
  '/tools/pdf/editar',
  '/tools/mesclar-pdf',
]

describe('next.config.mjs: redirecionamentos do editor de PDF', () => {
  const todos = redirecionamentos()

  it('/tools/pdf/assinar vai para /tools/pdf com 308, num salto só', () => {
    expect(todos.filter((r) => r.source === '/tools/pdf/assinar')).toEqual([
      {
        source: '/tools/pdf/assinar',
        destination: '/tools/pdf',
        permanent: true,
      },
    ])
    expect(todos.filter((r) => r.source === '/tools/pdf')).toEqual([])
  })

  it.each(QUATRO_ROTAS)('%s não tem redirecionamento', (rota) => {
    expect(todos.filter((r) => r.source === rota)).toEqual([])
  })

  it('nenhum redirecionamento aponta para as quatro: nunca há cadeia até um 404', () => {
    for (const { destination } of todos)
      expect(QUATRO_ROTAS).not.toContain(destination)
  })
})
