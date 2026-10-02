import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { lerFaseDoBotai } from '../lib/cms'
import { BOTAI, SOMBRAI } from '../lib/conteudo'

// Roda só pelo playwright.lojas.config.ts, que builda a landing com este YAML no lugar do CMS.
test('a fixture: Firefox publicado, então o Botaí está disponível', () => {
  expect(lerFaseDoBotai(join(__dirname, 'lojas-publicadas.yaml'))).toBe(
    'disponivel',
  )
})

test('o selo do Botaí diz disponível, e o do Sombraí continua em breve', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator(`a[href="${BOTAI.url}"]`)).toContainText(
    'Extensão de navegador · disponível',
  )
  await expect(page.locator(`a[href="${SOMBRAI.url}"]`)).toContainText(
    'App Android e iPhone · em breve',
  )
})
