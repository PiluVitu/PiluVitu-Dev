// O que o pdf.js pede à página para desenhar fiel: os decodificadores de JPEG 2000 e JBIG2 (comuns em PDF
// escaneado) e as fontes Symbol e ZapfDingbats (as outras padrão saem das fontes do sistema, pelo
// useSystemFonts). Servidos da própria origem, em public/pdfjs/<versão>/, cópia exata do pacote instalado.
export const RECURSOS_DO_PDFJS = {
  wasmUrl: { pasta: 'wasm', arquivos: ['openjpeg.wasm', 'jbig2.wasm'] },
  standardFontDataUrl: {
    pasta: 'standard_fonts',
    arquivos: ['FoxitSymbol.pfb', 'FoxitDingbats.pfb'],
  },
} as const

// As licenças vão junto com os binários, como no pacote.
export const LICENCAS_DOS_RECURSOS = {
  wasm: [
    'LICENSE_OPENJPEG',
    'LICENSE_PDFJS_OPENJPEG',
    'LICENSE_JBIG2',
    'LICENSE_PDFJS_JBIG2',
  ],
  standard_fonts: ['LICENSE_FOXIT'],
} as const

export function pastaDosRecursos(versao: string): string {
  return `/pdfjs/${versao}/`
}

type PedidoDoPdfjs = { kind: string; filename: string }

// O pdf.js cria a fábrica com new e pede cada arquivo por fetch({ kind, filename }). Só o que está na
// lista é buscado: o cMap (texto CJK com CMap pré-definido) e qualquer outro nome falham sem ir à rede.
export function criarFabricaDeRecursos(
  versao: string,
  buscar: (url: string) => Promise<Response> = (url) => fetch(url),
) {
  const base = pastaDosRecursos(versao)
  return class FabricaDeRecursosDoPdfjs {
    async fetch({ kind, filename }: PedidoDoPdfjs): Promise<Uint8Array> {
      const recurso = Object.hasOwn(RECURSOS_DO_PDFJS, kind)
        ? RECURSOS_DO_PDFJS[kind as keyof typeof RECURSOS_DO_PDFJS]
        : null
      if (
        !recurso ||
        !(recurso.arquivos as readonly string[]).includes(filename)
      ) {
        throw new Error(
          `recurso do pdf.js que não é servido: ${kind} ${filename}`,
        )
      }
      const url = `${base}${recurso.pasta}/${filename}`
      const resposta = await buscar(url)
      if (!resposta.ok) {
        throw new Error(`${url}: ${resposta.status}`)
      }
      return new Uint8Array(await resposta.arrayBuffer())
    }
  }
}
