import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECURSOS, REQUISITOS, REQUISITOS_DO_SOFTWARE } from './conteudo'

const WXT_CONFIG = readFileSync(
  join(__dirname, '..', '..', 'botai', 'wxt.config.ts'),
  'utf8',
)

describe('conteúdo da landing', () => {
  it('os 5 recursos do design, na ordem', () => {
    expect(RECURSOS.map((r) => r.titulo)).toEqual([
      'Documentos',
      'Endereço',
      'Contato',
      'Empresa',
      'Cartão',
    ])
  })

  // A página promete versões mínimas: elas têm de ser as do manifesto da extensão.
  it('os pisos de versão do texto são os do wxt.config.ts do Botaí', () => {
    const chromium = /minimum_chrome_version: '(\d+)'/.exec(WXT_CONFIG)?.[1]
    const firefox = /strict_min_version: '(\d+)\.0'/.exec(WXT_CONFIG)?.[1]
    expect([chromium, firefox]).toEqual(['123', '153'])
    expect(REQUISITOS).toBe(
      `Chrome, Edge e Opera a partir do Chromium ${chromium}. Firefox a partir da versão ${firefox}.`,
    )
    expect(REQUISITOS_DO_SOFTWARE).toBe(
      `Chrome, Edge ou Opera com Chromium ${chromium} ou superior, ou Firefox ${firefox} ou superior`,
    )
  })
})
