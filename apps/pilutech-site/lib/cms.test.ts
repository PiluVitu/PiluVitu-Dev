import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ITEM_DO_BOTAI, lerFaseDoBotai } from './cms'

describe('lerFaseDoBotai', () => {
  let pasta: string

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'pilutech-cms-'))
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
    expect(ITEM_DO_BOTAI).toMatch(
      /apps\/web\/content\/pilulabs\/botai\/index\.yaml$/,
    )
  })

  it('lê o item real e devolve uma das duas fases', () => {
    expect(['em-breve', 'disponivel']).toContain(lerFaseDoBotai())
  })

  it('sem loja publicada: em breve', () => {
    expect(lerFaseDoBotai(yaml("chromeUrl: ''\nfirefoxUrl:\n"))).toBe(
      'em-breve',
    )
  })

  it('uma loja publicada basta: disponível', () => {
    expect(
      lerFaseDoBotai(
        yaml(
          "firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'\n",
        ),
      ),
    ).toBe('disponivel')
  })

  // O dono cola o link pelo /admin/pilulabs: link de outra loja ou em http não publica nada.
  it('URL de outra loja ou em http continua em breve', () => {
    expect(
      lerFaseDoBotai(
        yaml(
          "chromeUrl: 'https://addons.mozilla.org/x'\nedgeUrl: 'http://microsoftedge.microsoft.com/addons/detail/botai/x'\n",
        ),
      ),
    ).toBe('em-breve')
  })

  // Sem o YAML o build tem de quebrar: em silêncio, o selo diria "em breve" com a loja publicada.
  it('arquivo que não existe lança', () => {
    expect(() => lerFaseDoBotai(join(pasta, 'nao-existe.yaml'))).toThrow(
      /ENOENT/,
    )
  })

  // Só o playwright.lojas.config.ts define a variável: builda a landing com um YAML de teste.
  it('BOTAI_CMS_ITEM troca o arquivo lido por padrão', () => {
    process.env.BOTAI_CMS_ITEM = yaml(
      "firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'\n",
    )
    try {
      expect(lerFaseDoBotai()).toBe('disponivel')
    } finally {
      delete process.env.BOTAI_CMS_ITEM
    }
  })
})
