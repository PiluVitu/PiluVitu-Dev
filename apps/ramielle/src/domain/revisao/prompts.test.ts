import { describe, expect, it } from 'vitest'
import {
  INSTRUCAO_PADRAO,
  PROOFREAD_SYSTEM,
  REFINE_SYSTEM,
  SHORTEN_SYSTEM,
  hooksSystem,
} from './prompts'
import promeia from './__fixtures__/prompts-promeia.json'

// Os prompts são contrato byte a byte: o dono os calibrou contra o modelo, e
// a fixture foi gerada do prompts.py do promeia antes de ele ser apagado.
describe('prompts da revisão: idênticos aos do promeia', () => {
  it('PROOFREAD_SYSTEM', () => {
    expect(PROOFREAD_SYSTEM).toBe(promeia.PROOFREAD_SYSTEM)
  })

  it('REFINE_SYSTEM', () => {
    expect(REFINE_SYSTEM).toBe(promeia.REFINE_SYSTEM)
  })

  it('SHORTEN_SYSTEM', () => {
    expect(SHORTEN_SYSTEM).toBe(promeia.SHORTEN_SYSTEM)
  })

  it('INSTRUCAO_PADRAO', () => {
    expect(INSTRUCAO_PADRAO).toBe(promeia.INSTRUCAO_PADRAO)
  })

  it('hooksSystem("bluesky", 300)', () => {
    expect(hooksSystem('bluesky', 300)).toBe(promeia.hooksSystem_bluesky_300)
  })

  it('hooksSystem("mastodon", 500)', () => {
    expect(hooksSystem('mastodon', 500)).toBe(promeia.hooksSystem_mastodon_500)
  })
})
