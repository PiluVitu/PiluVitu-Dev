import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const { ignoreCommand } = JSON.parse(
  readFileSync(join(__dirname, 'vercel.json'), 'utf8'),
) as { ignoreCommand: string }

const [comando, caminhos] = ignoreCommand.split(' -- ')

describe('vercel.json (Ignored Build Step)', () => {
  // exit 0 cancela o build; o git diff --quiet sai 0 quando nada mudou.
  it('cancela o build só quando nada que a landing usa mudou', () => {
    expect(comando).toBe('git diff --quiet HEAD^ HEAD')
  })

  // O selo do Botaí sai do YAML do apps/web: sem ele aqui, publicar uma loja pelo /admin não rebuilda a landing.
  it('vigia o app, os pacotes, a entrada do Botaí no CMS e os arquivos de install e build', () => {
    expect(caminhos.split(' ')).toEqual([
      '.',
      '../../packages/ui',
      '../../packages/tools',
      '../web/content/pilulabs/botai',
      '../../pnpm-lock.yaml',
      '../../pnpm-workspace.yaml',
      '../../package.json',
      '../../scripts/check-tailwind-source.mjs',
    ])
  })

  it('todo caminho vigiado existe (um rename deixaria o build preso no passado)', () => {
    for (const caminho of caminhos.split(' '))
      expect([caminho, existsSync(join(__dirname, caminho))]).toEqual([
        caminho,
        true,
      ])
  })
})
