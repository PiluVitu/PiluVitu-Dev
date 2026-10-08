import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PACOTE = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8'),
) as { dependencies: Record<string, string> }

describe('package.json do web', () => {
  // Versão exata: uma 0.4.x nova (de uma conta do npm invadida, por exemplo) não entra sem PR.
  it('usa o @pilutech/botai-core do npm com versão exata', () => {
    expect(PACOTE.dependencies['@pilutech/botai-core']).toMatch(
      /^\d+\.\d+\.\d+$/,
    )
  })

  // CPF e CNPJ do /tools vêm do motor do Botaí; o @piluvitu/tools não tem mais esses módulos.
  it.each([
    ['cpf-tool.tsx', 'cpf'],
    ['cnpj-tool.tsx', 'cnpj'],
  ])('%s importa do @pilutech/botai-core', (arquivo, modulo) => {
    const fonte = readFileSync(
      join(__dirname, 'components', 'tools', arquivo),
      'utf8',
    )
    expect(fonte).toContain(`from '@pilutech/botai-core/${modulo}'`)
    expect(fonte).not.toContain('@piluvitu/tools')
  })
})
