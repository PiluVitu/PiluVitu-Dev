import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  lerProdutosDoConteudo,
  rotasFaltando,
  rotasObrigatorias,
} from './pilulabs-conteudo'

const RAIZ_WEB = join(__dirname, '..')

describe('catálogo em content/produtos', () => {
  const produtos = lerProdutosDoConteudo(RAIZ_WEB)

  it('tem o Botaí, com o ícone de 128 px', () => {
    expect(produtos.find((p) => p.slug === 'botai')).toMatchObject({
      nome: 'Botaí',
      tipo: 'extensao',
      icone: '/pilulabs/botai/icone-128.png',
    })
  })

  it('todo produto tem ícone, e o ícone existe em public/', () => {
    for (const p of produtos) {
      expect(p.icone).not.toBe('')
      expect(existsSync(join(RAIZ_WEB, 'public', p.icone))).toBe(true)
    }
  })

  // Trava do modelo híbrido: o catálogo mora no YAML e a página em TSX.
  // Um produto listado sem rota viraria um card apontando para 404.
  it('todo produto listado tem página e política de privacidade', () => {
    expect(
      rotasFaltando(produtos, (caminho) => existsSync(join(RAIZ_WEB, caminho))),
    ).toEqual([])
  })
})

describe('rotasFaltando', () => {
  it('as rotas obrigatórias são a página do produto e a política', () => {
    expect(rotasObrigatorias('botai')).toEqual([
      'app/(site)/pilulabs/botai/page.tsx',
      'app/(site)/pilulabs/botai/privacidade/page.tsx',
    ])
  })

  it('acusa as duas rotas que faltam a um produto listado', () => {
    expect(
      rotasFaltando([{ slug: 'novo', listado: true }], () => false),
    ).toEqual(rotasObrigatorias('novo'))
  })

  it('ignora o produto não listado, que pode existir antes da página', () => {
    expect(
      rotasFaltando([{ slug: 'novo', listado: false }], () => false),
    ).toEqual([])
  })
})
