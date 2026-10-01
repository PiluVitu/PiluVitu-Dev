import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { lerSecoes, permissoesJustificadas } from './loja/textos'

const ler = (...partes: string[]) =>
  readFileSync(path.resolve(import.meta.dirname, ...partes), 'utf8')
const manifesto = (pasta: string) =>
  JSON.parse(ler('.output', pasta, 'manifest.json'))
const background = (pasta: string) => ler('.output', pasta, 'background.js')

// Lida do package.json: com a versão fixa aqui, todo PR que só sobe a versão ficaria vermelho.
const VERSAO: string = JSON.parse(ler('package.json')).version
const PAGINA_DO_BOTAI = 'https://piluvitu.com.br/pilulabs/botai'
// Alt+Shift+P é atalho do próprio Chrome no Windows e no Linux ("criar novo grupo
// de abas", kTabGroupAcceleratorMap) e o Chrome não o cede à extensão: lá o padrão
// é Ctrl+Shift+Y.
const ATALHO_CHROMIUM = { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }

test('manifesto de produção: só activeTab, sem host_permissions nem content_scripts', () => {
  const m = manifesto('chrome-mv3')
  expect('host_permissions' in m).toBe(false)
  expect('content_scripts' in m).toBe(false)
  expect('web_accessible_resources' in m).toBe(false)
  expect('browser_specific_settings' in m).toBe(false)
  expect([...m.permissions].sort()).toEqual([
    'activeTab',
    'contextMenus',
    'scripting',
    'storage',
  ])
  expect(m).toMatchObject({
    manifest_version: 3,
    name: 'Botaí',
    short_name: 'Botaí',
    description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    version: VERSAO,
    homepage_url: PAGINA_DO_BOTAI,
    minimum_chrome_version: '123',
    action: {
      default_title: 'Botaí',
      default_popup: 'popup.html',
    },
    background: { service_worker: 'background.js' },
  })
  expect(m.commands).toEqual({
    'botai-preencher': {
      suggested_key: ATALHO_CHROMIUM,
      description: 'Preencher esta página',
    },
  })
  expect(Object.keys(m.icons).sort()).toEqual(['128', '16', '32', '48'])
})

test('manifesto do Firefox: MV3 com gecko, a permissão menus e Alt+Shift+P no Linux', () => {
  const m = manifesto('firefox-mv3')
  expect('host_permissions' in m).toBe(false)
  expect('content_scripts' in m).toBe(false)
  expect('minimum_chrome_version' in m).toBe(false)
  expect([...m.permissions].sort()).toEqual([
    'activeTab',
    'contextMenus',
    'menus',
    'scripting',
    'storage',
  ])
  // Sem gecko_android: o Botaí é só para o Firefox de desktop.
  expect(m.browser_specific_settings).toEqual({
    gecko: {
      id: 'botai@pilutech.com.br',
      strict_min_version: '153.0',
      data_collection_permissions: { required: ['none'] },
    },
  })
  // No Firefox para Linux, Ctrl+Shift+Y abre os Downloads e o Firefox não cede a tecla.
  expect(m.commands).toEqual({
    'botai-preencher': {
      suggested_key: { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' },
      description: 'Preencher esta página',
    },
  })
  expect(m).toMatchObject({
    manifest_version: 3,
    name: 'Botaí',
    version: VERSAO,
    homepage_url: PAGINA_DO_BOTAI,
    action: { default_title: 'Botaí', default_popup: 'popup.html' },
    background: { scripts: ['background.js'] },
  })
  expect('service_worker' in m.background).toBe(false)
})

test('Opera: o manifesto do Chrome, com o código próprio sem minificar (regra da loja do Opera)', () => {
  expect(manifesto('opera-mv3')).toEqual(manifesto('chrome-mv3'))
  const opera = background('opera-mv3')
  expect(opera).toMatch(/\bpreencherPagina\b/)
  expect(opera.split('\n').length).toBeGreaterThan(200)
  // O mesmo nome some no Chrome minificado: é isso que faz as asserções acima medirem a minificação.
  expect(background('chrome-mv3')).not.toMatch(/\bpreencherPagina\b/)
})

test('o build e2e é o único com host_permissions, e só para teste.local', () => {
  expect(manifesto('chrome-mv3-e2e').host_permissions).toEqual([
    'http://teste.local/*',
  ])
})

test('toda permissão dos manifestos de Chrome e Firefox tem justificativa em loja/textos.md', () => {
  const permissoes = new Set<string>([
    ...manifesto('chrome-mv3').permissions,
    ...manifesto('firefox-mv3').permissions,
  ])
  const textos = lerSecoes(
    readFileSync(path.resolve(import.meta.dirname, 'loja/textos.md'), 'utf8'),
  )
  expect(permissoesJustificadas(textos).sort()).toEqual([...permissoes].sort())
})
