import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rotasNaoEstaticas } from './conferir-rotas-estaticas.mjs'

const estatica = { initialRevalidateSeconds: false }

test('rota estática passa, com ou sem o sufixo de hash das imagens', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/': estatica, '/opengraph-image-1a2b3c': estatica }, [
      '/',
      '/opengraph-image',
    ]),
    [],
  )
})

test('rota com revalidate falha', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/': { initialRevalidateSeconds: 60 } }, ['/']),
    ['/'],
  )
})

test('rota fora do manifesto falha: virou dinâmica ou sumiu', () => {
  assert.deepEqual(rotasNaoEstaticas({}, ['/privacidade']), ['/privacidade'])
})

test('a rota não é confundida com uma filha', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/privacidade/opengraph-image': estatica }, [
      '/privacidade',
    ]),
    ['/privacidade'],
  )
})
