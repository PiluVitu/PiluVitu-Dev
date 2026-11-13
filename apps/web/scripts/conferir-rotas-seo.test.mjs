import assert from 'node:assert/strict'
import { test } from 'node:test'
import { problemasDasRotas, ROTAS } from './conferir-rotas-seo.mjs'

const estatica = { initialRevalidateSeconds: false }
const isr = { initialRevalidateSeconds: 1800 }

test('confere o robots, o sitemap e os dois llms', () => {
  assert.deepEqual(Object.keys(ROTAS), [
    '/robots.txt',
    '/sitemap.xml',
    '/llms.txt',
    '/llms-full.txt',
  ])
})

test('tudo pré-renderizado passa, com o robots estático e os outros com o ISR dos posts', () => {
  assert.deepEqual(
    problemasDasRotas({
      '/robots.txt': estatica,
      '/sitemap.xml': isr,
      '/llms.txt': isr,
      '/llms-full.txt': estatica,
    }),
    [],
  )
})

test('rota fora do manifesto falha: virou dinâmica ou sumiu', () => {
  assert.deepEqual(
    problemasDasRotas({
      '/robots.txt': estatica,
      '/sitemap.xml': isr,
      '/llms.txt': isr,
    }),
    ['/llms-full.txt: fora do prerender-manifest (dinâmica ou sumiu)'],
  )
})

test('o robots com revalidate falha', () => {
  assert.deepEqual(
    problemasDasRotas({
      '/robots.txt': isr,
      '/sitemap.xml': isr,
      '/llms.txt': isr,
      '/llms-full.txt': isr,
    }),
    ['/robots.txt: tem revalidate 1800, devia ser estática'],
  )
})

test('a rota não é confundida com outra parecida', () => {
  assert.deepEqual(
    problemasDasRotas(
      { '/llms.txt/x': estatica, '/llms.txt.bak': estatica },
      { '/llms.txt': 'prerenderizada' },
    ),
    ['/llms.txt: fora do prerender-manifest (dinâmica ou sumiu)'],
  )
})
