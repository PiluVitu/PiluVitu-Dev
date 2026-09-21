#!/usr/bin/env node
/**
 * Confere se alguma FAMÍLIA nova apareceu no Pluggy desde a última vez.
 *
 * Categoria-folha nova cai sozinha na família existente (o mapeamento é por
 * prefixo), então só família nova exige ação — e é isto que este script
 * detecta. Roda contra a API real; credenciais em `apps/financas/.dev.vars`.
 *
 *   node scripts/pluggy-categorias.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const MIGRATION = resolve(AQUI, '../migrations/0010_categorias_pluggy.sql')
const DEV_VARS = resolve(AQUI, '../.dev.vars')

function env() {
  const txt = readFileSync(DEV_VARS, 'utf8')
  const vars = {}
  for (const linha of txt.split('\n')) {
    const t = linha.trim()
    if (t === '' || t.startsWith('#') || !t.includes('=')) continue
    vars[t.slice(0, t.indexOf('=')).trim()] = t.slice(t.indexOf('=') + 1).trim()
  }
  if (!vars.PLUGGY_CLIENT_ID || !vars.PLUGGY_CLIENT_SECRET) {
    console.error('✗ PLUGGY_CLIENT_ID/SECRET ausentes em apps/financas/.dev.vars')
    process.exit(1)
  }
  return vars
}

const { PLUGGY_CLIENT_ID: clientId, PLUGGY_CLIENT_SECRET: clientSecret } = env()

const { apiKey } = await (
  await fetch('https://api.pluggy.ai/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  })
).json()

const corpo = await (
  await fetch('https://api.pluggy.ai/categories', { headers: { 'X-API-KEY': apiKey } })
).json()

const familias = (corpo.results ?? corpo)
  .filter((c) => !c.parentId)
  .map((c) => ({ fam: c.id.slice(0, 2), nome: c.descriptionTranslated || c.description }))
  .sort((a, b) => a.fam.localeCompare(b.fam))

const sql = readFileSync(MIGRATION, 'utf8')
const conhecidas = new Set([...sql.matchAll(/'pluggy-(\d{2})(?:-\w+)?'/g)].map((m) => m[1]))
// 99 ("Outros") é deliberadamente não mapeada — ver a migration.
conhecidas.add('99')

const novas = familias.filter((f) => !conhecidas.has(f.fam))

console.log(`famílias no Pluggy: ${familias.length} | já mapeadas: ${conhecidas.size - 1}`)

if (novas.length === 0) {
  console.log('✓ nenhuma família nova — nada a fazer')
  process.exit(0)
}

console.log(`\n⚠️  ${novas.length} família(s) NOVA(S). Acrescente ao seed:\n`)
for (const { fam, nome } of novas) {
  console.log(
    `  ('cat-pluggy-${fam}', '${nome.replace(/'/g, "''")}', 'expense', 'pluggy-${fam}', datetime('now')),`,
  )
}
console.log('\n⚠️  Confira o `kind` de cada uma antes de rodar: o script chuta')
console.log('   `expense`, que é o caso comum mas não é sempre certo.')
process.exit(1)
