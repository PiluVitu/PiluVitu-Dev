import { srcDaImagem } from './src-da-imagem'

describe('srcDaImagem', () => {
  it('URL absoluta passa como está', () => {
    expect(srcDaImagem('https://dev-to-uploads.s3.amazonaws.com/a/x.png')).toBe(
      'https://dev-to-uploads.s3.amazonaws.com/a/x.png',
    )
  })

  // Sobra da migração do TinaCMS nos MDX do piluvitu-blog: a pasta de mídia
  // dele (/uploads) colada na frente da URL do dev.to.
  it.each([
    '/uploadshttps://dev-to-uploads.s3.amazonaws.com/a/x.png',
    'uploadshttps://dev-to-uploads.s3.amazonaws.com/a/x.png',
    '/uploads/https://dev-to-uploads.s3.amazonaws.com/a/x.png',
  ])('tira o /uploads colado numa URL absoluta: %s', (src) => {
    expect(srcDaImagem(src)).toBe(
      'https://dev-to-uploads.s3.amazonaws.com/a/x.png',
    )
  })

  it('caminho relativo ganha o /uploads', () => {
    expect(srcDaImagem('capa.png')).toBe('/uploads/capa.png')
  })

  it('caminho que já começa em / fica como está', () => {
    expect(srcDaImagem('/uploads/capa.png')).toBe('/uploads/capa.png')
    expect(srcDaImagem('/profile-2.jpg')).toBe('/profile-2.jpg')
  })

  it('vazio vira undefined (sem src, sem preload quebrado)', () => {
    expect(srcDaImagem('')).toBeUndefined()
    expect(srcDaImagem(undefined)).toBeUndefined()
  })
})
