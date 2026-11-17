// Só para os testes do pdf.ts: lê um PDF com o pdf.js de verdade (build legacy, em Node) e devolve,
// por página, o que ele vê nas coordenadas da tela (vista com escala 1). O Jest daqui é CommonJS e não
// carrega o pdf.js (ESM), então o teste chama este arquivo num processo filho do Node.
'use strict'

const { execFileSync } = require('node:child_process')
const path = require('node:path')

/**
 * @typedef {[number, number, number, number]} CaixaNaTela
 * @typedef {{ str: string, matriz: number[], fonte: string }} TextoLido
 * @typedef {{ tipo: 'caminho', operacao: string, caixa: CaixaNaTela, preenchimento: string | null, contorno: string | null, opacidade: number, mistura: string | null }} CaminhoLido
 * @typedef {{ tipo: 'imagem', caixa: CaixaNaTela }} ImagemLida
 * @typedef {{ view: number[], rotate: number, userUnit: number, largura: number, altura: number, textos: TextoLido[], desenhos: (CaminhoLido | ImagemLida)[] }} PaginaLida
 */

/**
 * `girosParaDesfazer[i]`, em graus, vira a vista da página i para trás antes de ler: é como ler a página
 * como a tela a mostrava antes de ela ser girada (a moldura). `rotate` continua o do PDF.
 * @param {Uint8Array} bytes
 * @param {number[]} [girosParaDesfazer]
 * @returns {{ paginas: PaginaLida[] }}
 */
function lerComPdfjs(bytes, girosParaDesfazer = []) {
  const saida = execFileSync(
    process.execPath,
    [__filename, JSON.stringify(girosParaDesfazer)],
    {
      input: bytes,
      cwd: __dirname,
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  return JSON.parse(saida.toString('utf8'))
}

module.exports = { lerComPdfjs }

function caixaTransformada(minMax, [a, b, c, d, e, f]) {
  const [x1, y1, x2, y2] = minMax
  const cantos = [
    [x1, y1],
    [x2, y1],
    [x1, y2],
    [x2, y2],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])
  const xs = cantos.map((p) => p[0])
  const ys = cantos.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function desenhosDaPagina(pdfjs, operadores, vista) {
  const { OPS, Util } = pdfjs
  const nomes = Object.fromEntries(
    Object.entries(OPS).map(([nome, codigo]) => [codigo, nome]),
  )
  let estado = {
    ctm: vista.transform,
    preenchimento: null,
    contorno: null,
    opacidade: 1,
    mistura: null,
  }
  const pilha = []
  const desenhos = []
  operadores.fnArray.forEach((fn, i) => {
    const args = operadores.argsArray[i]
    switch (fn) {
      case OPS.save:
        pilha.push(estado)
        estado = { ...estado }
        break
      case OPS.restore:
        estado = pilha.pop() ?? estado
        break
      case OPS.transform:
        estado.ctm = Util.transform(estado.ctm, args)
        break
      case OPS.setFillRGBColor:
        estado.preenchimento = String(args[0])
        break
      case OPS.setStrokeRGBColor:
        estado.contorno = String(args[0])
        break
      case OPS.setGState:
        for (const [chave, valor] of args[0]) {
          if (chave === 'ca') estado.opacidade = valor
          if (chave === 'BM') estado.mistura = String(valor)
        }
        break
      case OPS.constructPath: {
        const [operacao, , minMax] = args
        if (!minMax) break
        desenhos.push({
          tipo: 'caminho',
          operacao: nomes[operacao],
          caixa: caixaTransformada(minMax, estado.ctm),
          preenchimento: estado.preenchimento,
          contorno: estado.contorno,
          opacidade: estado.opacidade,
          mistura: estado.mistura,
        })
        break
      }
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
        desenhos.push({
          tipo: 'imagem',
          caixa: caixaTransformada([0, 0, 1, 1], estado.ctm),
        })
        break
    }
  })
  return desenhos
}

async function principal() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const girosParaDesfazer = JSON.parse(process.argv[2] ?? '[]')
  const partes = []
  for await (const parte of process.stdin) partes.push(parte)
  const tarefa = pdfjs.getDocument({
    data: new Uint8Array(Buffer.concat(partes)),
    standardFontDataUrl: path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'standard_fonts/',
    ),
    useWorkerFetch: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  })
  const documento = await tarefa.promise
  const paginas = []
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const pagina = await documento.getPage(numero)
    const desfazer = girosParaDesfazer[numero - 1] ?? 0
    const vista = pagina.getViewport({
      scale: 1,
      rotation: (((pagina.rotate - desfazer) % 360) + 360) % 360,
    })
    const conteudo = await pagina.getTextContent()
    paginas.push({
      view: pagina.view,
      rotate: pagina.rotate,
      userUnit: pagina.userUnit,
      largura: vista.width,
      altura: vista.height,
      textos: conteudo.items
        .filter((item) => 'str' in item && item.str.trim())
        .map((item) => ({
          str: item.str,
          matriz: pdfjs.Util.transform(vista.transform, item.transform),
          fonte: conteudo.styles[item.fontName]?.fontFamily ?? '',
        })),
      desenhos: desenhosDaPagina(pdfjs, await pagina.getOperatorList(), vista),
    })
  }
  await tarefa.destroy()
  process.stdout.write(JSON.stringify({ paginas }))
}

if (require.main === module) {
  principal().catch((erro) => {
    process.stderr.write(String(erro?.stack ?? erro))
    process.exit(1)
  })
}
