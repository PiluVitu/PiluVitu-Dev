import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const manifesto = (pasta: string) =>
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, '.output', pasta, 'manifest.json'),
      'utf8',
    ),
  )

test('manifesto de produção: só activeTab, sem host_permissions nem content_scripts', () => {
  const m = manifesto('chrome-mv3')
  expect('host_permissions' in m).toBe(false)
  expect('content_scripts' in m).toBe(false)
  expect('web_accessible_resources' in m).toBe(false)
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
    version: '0.1.0',
    minimum_chrome_version: '123',
    commands: {
      'botai-preencher': {
        // Alt+Shift+P é atalho do próprio Chrome no Windows e no Linux
        // ("criar novo grupo de abas", kTabGroupAcceleratorMap) e o Chrome
        // não o cede à extensão: lá o padrão é Ctrl+Shift+Y.
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' },
        description: 'Preencher esta página',
      },
    },
    action: {
      default_title: 'Botaí',
      default_popup: 'popup.html',
    },
    background: { service_worker: 'background.js' },
  })
  expect(Object.keys(m.commands)).toEqual(['botai-preencher'])
  expect(Object.keys(m.icons).sort()).toEqual(['128', '16', '32', '48'])
})

test('o build e2e é o único com host_permissions, e só para teste.local', () => {
  expect(manifesto('chrome-mv3-e2e').host_permissions).toEqual([
    'http://teste.local/*',
  ])
})
