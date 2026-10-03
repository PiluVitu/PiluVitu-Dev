import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOCUMENTOS,
  EMAIL_DE_SUPORTE,
  historicoDe,
  MAILTO,
  RECURSOS,
  REPOSITORIO,
  REQUISITOS,
  REQUISITOS_DO_SOFTWARE,
  URL_DA_LICENCA,
  URL_DA_PILULABS,
  URL_DA_PILUTECH,
} from './conteudo'

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

describe('documentos e código-fonte', () => {
  it('o histórico de um arquivo do site no GitHub', () => {
    expect(historicoDe('app/privacidade/page.tsx')).toBe(
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/privacidade/page.tsx',
    )
  })

  // Os termos dizem que o código é MIT: o link e o arquivo têm de bater.
  it('a licença citada nos termos é o LICENSE MIT do Botaí', () => {
    expect(URL_DA_LICENCA).toBe(`${REPOSITORIO}/blob/main/apps/botai/LICENSE`)
    const licenca = readFileSync(
      join(__dirname, '..', '..', 'botai', 'LICENSE'),
      'utf8',
    )
    expect(licenca).toMatch(/^MIT License\n\nCopyright \(c\) \d{4} PiluTech\n/)
  })

  it('o rodapé leva à privacidade e aos termos, nessa ordem', () => {
    expect(DOCUMENTOS).toEqual([
      { href: '/privacidade', rotulo: 'Privacidade' },
      { href: '/termos', rotulo: 'Termos de uso' },
    ])
  })
})

describe('contato e links da PiluTech', () => {
  // O dono filtra no Gmail com subject:Botaí: cada link diz de onde veio (RFC 6068, UTF-8).
  it('suporte, privacidade e termos vão para o e-mail da PiluTech com [Botaí] no assunto', () => {
    expect(EMAIL_DE_SUPORTE).toBe('pilutechinformatica@gmail.com')
    expect(MAILTO).toEqual({
      suporte:
        'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Suporte',
      privacidade:
        'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Privacidade',
      termos:
        'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Termos%20de%20uso',
    })
  })

  it('a vitrine PiluLabs mora no piluvitu.com.br, e a PiluTech no pilutech.com.br', () => {
    expect(URL_DA_PILULABS).toBe('https://piluvitu.com.br/pilulabs')
    expect(URL_DA_PILUTECH).toBe('https://pilutech.com.br')
  })
})
