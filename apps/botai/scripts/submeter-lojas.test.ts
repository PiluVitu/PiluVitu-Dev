// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = path.resolve(import.meta.dirname, 'submeter-lojas.sh')
const VERSAO = '1.2.3'
const TIPOS = ['chrome', 'firefox', 'sources', 'opera'] as const

let pasta: string
let zips: string
const zip = (tipo: (typeof TIPOS)[number]) =>
  path.join(zips, `botai-${VERSAO}-${tipo}.zip`)

beforeEach(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'botai-lojas-'))
  zips = path.join(pasta, 'botai-zips')
  mkdirSync(zips)
  for (const tipo of TIPOS) writeFileSync(zip(tipo), '')
  // pnpm falso: mostra o que chegaria ao `wxt submit`, sem rede nem credencial.
  const bin = path.join(pasta, 'bin')
  mkdirSync(bin)
  writeFileSync(
    path.join(bin, 'pnpm'),
    [
      '#!/usr/bin/env bash',
      'echo "PNPM $*"',
      'echo "CHROME_PUBLISH_TYPE=${CHROME_PUBLISH_TYPE-<unset>}"',
      'echo "CHROME_EXTENSION_ID=${CHROME_EXTENSION_ID-<unset>}"',
      'echo "EDGE_PRODUCT_ID=${EDGE_PRODUCT_ID-<unset>}"',
      '',
    ].join('\n'),
  )
  chmodSync(path.join(bin, 'pnpm'), 0o755)
})

afterEach(() => rmSync(pasta, { recursive: true, force: true }))

const CHROME = { CHROME_SERVICE_ACCOUNT_PRIVATE_KEY: 'chave' }
const FIREFOX = { FIREFOX_JWT_ISSUER: 'emissor', FIREFOX_JWT_SECRET: 'segredo' }
const EDGE = { EDGE_CLIENT_ID: 'cliente', EDGE_API_KEY: 'api' }

// Sem herdar process.env: um secret exportado na máquina de quem roda não pode vazar para o teste.
function rodar(env: Record<string, string>) {
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${path.join(pasta, 'bin')}:${process.env.PATH}`,
      EVENTO: 'push',
      VERSAO,
      PASTA_ZIPS: zips,
      ORIGEM_REF: `refs/tags/botai-v${VERSAO}`,
      ...env,
    },
  })
  return { status: r.status, saida: `${r.stdout}${r.stderr}` }
}

describe('pull_request: só imprime, mesmo com secrets', () => {
  it('imprime o comando de cada loja em ::notice:: e não chama o wxt submit', () => {
    const { status, saida } = rodar({
      EVENTO: 'pull_request',
      ORIGEM_REF: 'refs/pull/7/merge',
      ...CHROME,
      ...FIREFOX,
      ...EDGE,
    })
    expect(status).toBe(0)
    expect(saida).toContain(
      `::notice::Chrome: wxt submit --chrome-zip ${zip('chrome')}`,
    )
    expect(saida).toContain(
      `::notice::Firefox: wxt submit --firefox-zip ${zip('firefox')} --firefox-sources-zip ${zip('sources')}`,
    )
    expect(saida).toContain(
      `::notice::Edge: wxt submit --edge-zip ${zip('chrome')}`,
    )
    expect(saida).toContain(`::notice::Opera: envio manual de ${zip('opera')}`)
    expect(saida).not.toContain('PNPM')
  })

  it('falha quando falta um zip no artifact, mesmo sem enviar', () => {
    rmSync(zip('sources'))
    const { status, saida } = rodar({ EVENTO: 'pull_request' })
    expect(status).toBe(1)
    expect(saida).toContain(`::error::Falta ${zip('sources')}`)
  })
})

describe('push de tag: submeter', () => {
  it('sem nenhum secret sai com ::notice:: e exit 0', () => {
    const { status, saida } = rodar({})
    expect(status).toBe(0)
    expect(saida).toContain('::notice::Nenhuma loja com secrets')
    expect(saida).not.toContain('PNPM')
  })

  it('só a Chrome: --chrome-zip, publicando direto (sem STAGED_PUBLISH)', () => {
    const { status, saida } = rodar({ ...CHROME, CHROME_EXTENSION_ID: 'abc' })
    expect(status).toBe(0)
    expect(saida).toContain(
      `PNPM exec wxt submit --chrome-zip ${zip('chrome')}\n`,
    )
    expect(saida).toContain('CHROME_PUBLISH_TYPE=<unset>')
    expect(saida).toContain('CHROME_EXTENSION_ID=abc')
  })

  it('ADIAR_CHROME=true liga o STAGED_PUBLISH', () => {
    const { saida } = rodar({ ...CHROME, ADIAR_CHROME: 'true' })
    expect(saida).toContain('CHROME_PUBLISH_TYPE=STAGED_PUBLISH')
  })

  it('ADIAR_CHROME vazio (push de tag) e CHROME_PUBLISH_TYPE vazio herdado não chegam ao publicador', () => {
    const { saida } = rodar({
      ...CHROME,
      ADIAR_CHROME: '',
      CHROME_PUBLISH_TYPE: '',
    })
    expect(saida).toContain('CHROME_PUBLISH_TYPE=<unset>')
  })

  it('Firefox manda o zip de fontes junto', () => {
    const { saida } = rodar(FIREFOX)
    expect(saida).toContain(
      `PNPM exec wxt submit --firefox-zip ${zip('firefox')} --firefox-sources-zip ${zip('sources')}\n`,
    )
  })

  it('Edge usa o zip do Chrome', () => {
    const { saida } = rodar(EDGE)
    expect(saida).toContain(
      `PNPM exec wxt submit --edge-zip ${zip('chrome')}\n`,
    )
  })

  it('as três lojas num só wxt submit', () => {
    const { status, saida } = rodar({ ...CHROME, ...FIREFOX, ...EDGE })
    expect(status).toBe(0)
    expect(saida).toContain('::notice::submeter: Chrome Firefox Edge')
    expect(saida).toContain(
      `PNPM exec wxt submit --chrome-zip ${zip('chrome')} --firefox-zip ${zip('firefox')} --firefox-sources-zip ${zip('sources')} --edge-zip ${zip('chrome')}\n`,
    )
  })

  it('loja sem secret não recebe as variables dela (o publicador validaria valor vazio)', () => {
    const { saida } = rodar({
      ...FIREFOX,
      CHROME_EXTENSION_ID: '',
      EDGE_PRODUCT_ID: 'produto',
    })
    expect(saida).toContain('CHROME_EXTENSION_ID=<unset>')
    expect(saida).toContain('EDGE_PRODUCT_ID=<unset>')
  })

  it('secret pela metade é erro de cadastro, não loja pulada', () => {
    const { status, saida } = rodar({ FIREFOX_JWT_ISSUER: 'emissor' })
    expect(status).toBe(1)
    expect(saida).toContain('::error::Firefox: só parte dos secrets')
    expect(saida).not.toContain('PNPM')
  })
})

describe('workflow_dispatch: o input lojas decide', () => {
  const dispatch = (entrada: string, extra: Record<string, string> = {}) =>
    rodar({ EVENTO: 'workflow_dispatch', ENTRADA_LOJAS: entrada, ...extra })

  it('nenhuma só imprime', () => {
    const { status, saida } = dispatch('nenhuma', CHROME)
    expect(status).toBe(0)
    expect(saida).toContain('::notice::Chrome: wxt submit')
    expect(saida).not.toContain('PNPM')
  })

  it('dry-run disparado a partir de uma tag continua dry-run (não vira submeter)', () => {
    const { status, saida } = dispatch('dry-run', {
      ...EDGE,
      ORIGEM_REF: `refs/tags/botai-v${VERSAO}`,
    })
    expect(status).toBe(0)
    expect(saida).toContain('::notice::dry-run: Edge')
    expect(saida).toContain(
      `PNPM exec wxt submit --edge-zip ${zip('chrome')} --dry-run\n`,
    )
  })

  it('dry-run aceita qualquer branch', () => {
    const { status } = dispatch('dry-run', {
      ...EDGE,
      ORIGEM_REF: 'refs/heads/feat/qualquer',
    })
    expect(status).toBe(0)
  })

  it('submeter a partir da main é aceito', () => {
    const { status, saida } = dispatch('submeter', {
      ...CHROME,
      ORIGEM_REF: 'refs/heads/main',
    })
    expect(status).toBe(0)
    expect(saida).toContain(
      `PNPM exec wxt submit --chrome-zip ${zip('chrome')}\n`,
    )
  })

  it('submeter a partir de outra branch é recusado', () => {
    const { status, saida } = dispatch('submeter', {
      ...CHROME,
      ORIGEM_REF: 'refs/heads/feat/qualquer',
    })
    expect(status).toBe(1)
    expect(saida).toContain('::error::submeter só roda a partir da main')
    expect(saida).not.toContain('PNPM')
  })

  it('valor desconhecido é erro', () => {
    const { status, saida } = dispatch('publicar')
    expect(status).toBe(1)
    expect(saida).toContain('::error::Modo desconhecido: publicar')
  })
})

it('evento sem modo definido é erro', () => {
  const { status, saida } = rodar({ EVENTO: 'schedule' })
  expect(status).toBe(1)
  expect(saida).toContain('::error::Evento sem modo definido: schedule')
})
