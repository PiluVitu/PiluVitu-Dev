import { describe, expect, it } from 'vitest'
import { LINHAS_DO_DESIGN, resumoDe } from '../test/resumos'
import {
  aposPreencher,
  estadoAoAbrir,
  rodapeDaTela,
  statusDoHost,
  verDados,
} from './estado-popup'
import type { LinhaCampo } from './resultado'

const RECUSADO: LinhaCampo = {
  documentId: 'doc-0',
  idx: 3,
  rotulo: 'Senha (recusou o valor)',
  seletor: 'input[name="senha"]',
}

describe('estadoAoAbrir', () => {
  it('página comum abre nos dados (o 1a ou o 1b, conforme a pessoa)', () => {
    expect(estadoAoAbrir('ok')).toEqual({
      tela: 'dados',
      situacao: 'ok',
      resumo: null,
    })
  })

  it('página proibida pela URL abre direto no 1e, sem injetar nada', () => {
    expect(estadoAoAbrir('proibida')).toEqual({
      tela: 'proibida',
      situacao: 'proibida',
      resumo: null,
    })
    expect(estadoAoAbrir('arquivo-sem-acesso')).toEqual({
      tela: 'proibida',
      situacao: 'arquivo-sem-acesso',
      resumo: null,
    })
  })
})

describe('aposPreencher', () => {
  it('com algum campo preenchido vai para o 1c', () => {
    const resumo = resumoDe(12, LINHAS_DO_DESIGN)
    expect(aposPreencher({ ok: true, resumo })).toEqual({
      tela: 'resultado',
      situacao: 'ok',
      resumo,
    })
  })

  it('só recusados (X = 0) ainda é 1c: a lista mostra o que recusou', () => {
    expect(
      aposPreencher({ ok: true, resumo: resumoDe(0, [RECUSADO]) }).tela,
    ).toBe('resultado')
  })

  it('nada preenchido nem recusado vai para o 1d', () => {
    expect(
      aposPreencher({ ok: true, resumo: resumoDe(0, LINHAS_DO_DESIGN) }).tela,
    ).toBe('nenhum-campo')
  })

  it('Y = 0 também é 1d', () => {
    expect(aposPreencher({ ok: true, resumo: resumoDe(0) }).tela).toBe(
      'nenhum-campo',
    )
  })

  it('"Preencher" recusado pelo Chrome (PDF, Web Store, file: sem acesso) vira 1e', () => {
    expect(aposPreencher({ ok: false, motivo: 'proibida' })).toEqual({
      tela: 'proibida',
      situacao: 'proibida',
      resumo: null,
    })
    expect(
      aposPreencher({ ok: false, motivo: 'arquivo-sem-acesso' }),
    ).toMatchObject({
      tela: 'proibida',
      situacao: 'arquivo-sem-acesso',
    })
  })
})

describe('verDados', () => {
  it('volta ao 1b sem esquecer a situação da página nem o último preenchimento', () => {
    const resumo = resumoDe(0, LINHAS_DO_DESIGN)
    expect(verDados({ tela: 'nenhum-campo', situacao: 'ok', resumo })).toEqual({
      tela: 'dados',
      situacao: 'ok',
      resumo,
    })
    expect(verDados(estadoAoAbrir('proibida'))).toEqual({
      tela: 'dados',
      situacao: 'proibida',
      resumo: null,
    })
  })
})

describe('statusDoHost', () => {
  it('cadeado na página proibida, inclusive no 1b aberto a partir do 1e', () => {
    expect(statusDoHost(estadoAoAbrir('proibida'))).toBe('lock')
    expect(statusDoHost(verDados(estadoAoAbrir('arquivo-sem-acesso')))).toBe(
      'lock',
    )
  })

  it('warn depois de um preenchimento com X = 0, inclusive depois de "Ver os dados"', () => {
    const depois = aposPreencher({
      ok: true,
      resumo: resumoDe(0, LINHAS_DO_DESIGN),
    })
    expect(statusDoHost(depois)).toBe('warn')
    expect(statusDoHost(verDados(depois))).toBe('warn')
    expect(
      statusDoHost(
        aposPreencher({ ok: true, resumo: resumoDe(0, [RECUSADO]) }),
      ),
    ).toBe('warn')
  })

  it('ok nos outros casos', () => {
    expect(statusDoHost(estadoAoAbrir('ok'))).toBe('ok')
    expect(statusDoHost(aposPreencher({ ok: true, resumo: resumoDe(1) }))).toBe(
      'ok',
    )
  })
})

describe('rodapeDaTela', () => {
  it('muda o texto por estado, e o 1e não tem rodapé', () => {
    expect(rodapeDaTela('dados', false)).toEqual({
      texto: 'preenche sem abrir o popup',
      comAlterar: false,
    })
    expect(rodapeDaTela('dados', true)).toEqual({
      texto: 'preenche sem abrir',
      comAlterar: true,
    })
    expect(rodapeDaTela('resultado', true)).toEqual({
      texto: 'preenche de novo',
      comAlterar: false,
    })
    expect(rodapeDaTela('nenhum-campo', true)).toEqual({
      texto: 'preenche sem abrir',
      comAlterar: false,
    })
    expect(rodapeDaTela('proibida', true)).toBeNull()
  })
})
