// Roda o conjunto de avaliação da revisão contra a API real da Claude, com o
// mesmo código de produção (revisao.ts + chamarClaude do @piluvitu/ia). Gasta
// dinheiro: só roda à mão, com o OK do dono, nunca no CI nem no vitest.
//
//   ANTHROPIC_API_KEY=... pnpm --filter @piluvitu/ramielle eval:revisao
import { readdirSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// O Node 22 tira os tipos do .ts, mas não resolve import sem extensão.
registerHooks({
  resolve(especificador, contexto, proximo) {
    try {
      return proximo(especificador, contexto)
    } catch (err) {
      const relativo =
        especificador.startsWith('.') || especificador.startsWith('/')
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !relativo) throw err
      return proximo(`${especificador}.ts`, contexto)
    }
  },
})

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error(
    'ANTHROPIC_API_KEY não está no ambiente. Rode:\n' +
      '  ANTHROPIC_API_KEY=<sua chave> pnpm --filter @piluvitu/ramielle eval:revisao\n' +
      'A chave é lida só do ambiente e nunca é impressa.',
  )
  process.exit(2)
}

const { chamarClaude } = await import('@piluvitu/ia/claude')
const {
  consolidar,
  criarChatMedido,
  estimarCustoMicro,
  formatarRelatorio,
  rodarAvaliacao,
} = await import('./avaliar-revisao.ts')

const dir = fileURLToPath(new URL('./__fixtures__/avaliacao/', import.meta.url))
const ler = (arquivo) => readFileSync(join(dir, arquivo), 'utf8')

const casos = readdirSync(dir)
  .filter((arquivo) => arquivo.endsWith('.md'))
  .sort()
  .map((arquivo) => {
    const id = arquivo.slice(0, -'.md'.length)
    return {
      id,
      original: ler(arquivo),
      esperado: JSON.parse(ler(`${id}.esperado.json`)),
    }
  })
const entradaHooks = JSON.parse(ler('artigo-hooks.json'))

const estimadoMicro = estimarCustoMicro(casos, entradaHooks)
console.log(
  `${casos.length} artigos e ${entradaHooks.plataformas.length} hooks; custo estimado US$ ${(estimadoMicro / 1e6).toFixed(4).replace('.', ',')}\n`,
)

const { chat, medicao } = criarChatMedido((pedido) =>
  chamarClaude(apiKey, pedido),
)

let resultado
try {
  resultado = await rodarAvaliacao(casos, entradaHooks, chat)
} catch (err) {
  // As mensagens dos erros do @piluvitu/ia não carregam a chave nem o corpo da API.
  console.error(
    `A rodada parou: ${err?.name ?? 'Erro'}: ${err?.message ?? String(err)}`,
  )
  console.error(
    `custo até aqui: US$ ${(medicao().custoMicro / 1e6).toFixed(4).replace('.', ',')}`,
  )
  process.exit(1)
}

const nota = consolidar(resultado)
console.log(
  formatarRelatorio(resultado, nota, { estimadoMicro, medicao: medicao() }),
)
process.exit(nota.aprovado ? 0 : 1)
