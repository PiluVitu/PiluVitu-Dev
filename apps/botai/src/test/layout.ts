export function retangulo(
  x: number,
  y: number,
  largura: number,
  altura: number,
): DOMRect {
  return {
    x,
    y,
    width: largura,
    height: altura,
    top: y,
    left: x,
    right: x + largura,
    bottom: y + altura,
    toJSON: () => ({}),
  }
}

// Todo elemento passa a medir 200×24 px e a estar visível; devolve a função que desfaz.
export function simularLayout(): () => void {
  const visibilidade = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'checkVisibility',
  )
  const medida = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'getBoundingClientRect',
  )
  Object.defineProperty(Element.prototype, 'checkVisibility', {
    value: () => true,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    value: () => retangulo(0, 0, 200, 24),
    configurable: true,
    writable: true,
  })
  return () => {
    if (visibilidade)
      Object.defineProperty(Element.prototype, 'checkVisibility', visibilidade)
    else Reflect.deleteProperty(Element.prototype, 'checkVisibility')
    if (medida)
      Object.defineProperty(Element.prototype, 'getBoundingClientRect', medida)
  }
}
