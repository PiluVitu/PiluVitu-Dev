import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ehHttps } from '@piluvitu/tools/pilulabs'
import { ITEM_NO_CMS, lerUrlsDasLojas } from './cms'

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'

describe('lerUrlsDasLojas', () => {
  let pasta: string

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'botai-cms-'))
  })
  afterEach(() => {
    rmSync(pasta, { recursive: true, force: true })
  })

  function yaml(conteudo: string): string {
    const caminho = join(pasta, 'index.yaml')
    writeFileSync(caminho, conteudo)
    return caminho
  }

  // O dono edita em /admin/pilulabs, que grava neste arquivo do apps/web.
  it('aponta para o item botai do CMS do apps/web', () => {
    expect(ITEM_NO_CMS).toMatch(
      /apps\/web\/content\/pilulabs\/botai\/index\.yaml$/,
    )
  })

  it('lê o item real: as 4 URLs, vazias ou https', () => {
    const urls = lerUrlsDasLojas()
    expect(Object.keys(urls).sort()).toEqual([
      'chromeUrl',
      'edgeUrl',
      'firefoxUrl',
      'operaUrl',
    ])
    for (const url of Object.values(urls))
      expect(url === '' || ehHttps(url)).toBe(true)
  })

  it('apara espaços e ignora o resto do item', () => {
    expect(
      lerUrlsDasLojas(
        yaml(
          `slug: botai\nnome: Botaí\nchromeUrl: '  ${URL_CHROME} '\nfirefoxUrl: ''\nedgeUrl: ''\noperaUrl: ''\n`,
        ),
      ),
    ).toEqual({
      chromeUrl: URL_CHROME,
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
    })
  })

  // O Keystatic apaga do YAML o campo opcional vazio.
  it('campo ausente, nulo ou que não é texto vira vazio', () => {
    expect(
      lerUrlsDasLojas(yaml('chromeUrl: 12\nfirefoxUrl:\nedgeUrl: [a]\n')),
    ).toEqual({ chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' })
  })

  it('arquivo vazio: nenhuma loja', () => {
    expect(lerUrlsDasLojas(yaml(''))).toEqual({
      chromeUrl: '',
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
    })
  })

  // Sem o YAML o build tem de quebrar: em silêncio, a landing sairia "Em breve" com a loja já publicada.
  it('arquivo que não existe lança', () => {
    expect(() => lerUrlsDasLojas(join(pasta, 'nao-existe.yaml'))).toThrow(
      /ENOENT/,
    )
  })

  // Só o playwright.lojas.config.ts define a variável: builda a landing com um YAML de teste.
  it('BOTAI_CMS_ITEM troca o arquivo lido por padrão', () => {
    process.env.BOTAI_CMS_ITEM = yaml(`chromeUrl: '${URL_CHROME}'\n`)
    try {
      expect(lerUrlsDasLojas().chromeUrl).toBe(URL_CHROME)
    } finally {
      delete process.env.BOTAI_CMS_ITEM
    }
  })
})
