import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import manifest from './manifest'

function tamanhoDoPng(arquivo: string) {
  const png = readFileSync(join(__dirname, arquivo))
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) }
}

it('nome, idioma, cores e o ícone de 300×300', () => {
  expect(manifest()).toEqual({
    name: 'Botaí',
    short_name: 'Botaí',
    description:
      'Extensão para Chrome, Firefox, Edge e Opera que gera dados de teste: CPF e CNPJ válidos, CEP real com endereço, e preenche o formulário com um atalho.',
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: '#090b11',
    theme_color: '#090b11',
    icons: [{ src: '/icon.png', sizes: '300x300', type: 'image/png' }],
  })
})

// O Google aceita favicon PNG quadrado; SVG não.
it('icon.png e apple-icon.png são PNG quadrados de 300 px', () => {
  for (const arquivo of ['icon.png', 'apple-icon.png'])
    expect([arquivo, tamanhoDoPng(arquivo)]).toEqual([
      arquivo,
      { largura: 300, altura: 300 },
    ])
})
