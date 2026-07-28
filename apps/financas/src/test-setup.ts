import { applyD1Migrations, env, reset } from 'cloudflare:test'
import { beforeEach } from 'vitest'

// A 0.18.x REMOVEU a opcao `isolatedStorage` do pool — `WorkersPoolOptions`
// tem exatamente cinco campos (main, remoteBindings, additionalExports,
// miniflare, wrangler) e nenhum deles isola storage. O isolamento passou a
// ser EXPLICITO, via reset() do modulo cloudflare:test.
//
// reset() apaga os dados de TODOS os bindings — inclusive a tabela de
// controle das migrations. Por isso a ordem e reset -> reaplicar migrations,
// nunca o contrario: inverter deixa o banco vazio e sem schema.
//
// beforeEach (nao beforeAll) porque sem storage isolado o estado vaza de um
// teste para o seguinte, e teste de dinheiro que depende de ordem de execucao
// e teste que mente.
beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})
