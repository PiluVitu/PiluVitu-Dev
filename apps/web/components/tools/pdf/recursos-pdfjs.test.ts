/**
 * @jest-environment node
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  LICENCAS_DOS_RECURSOS,
  RECURSOS_DO_PDFJS,
  criarFabricaDeRecursos,
  pastaDosRecursos,
} from './recursos-pdfjs'

// A cópia em public/pdfjs/<versão>/ tem que ser a do pacote instalado: o pdf.js só aceita o .wasm da
// mesma versão. Quem subir o pdfjs-dist vê este teste falhar até copiar os arquivos da versão nova.
const PACOTE = dirname(require.resolve('pdfjs-dist/package.json'))
const VERSAO: string = JSON.parse(
  readFileSync(join(PACOTE, 'package.json'), 'utf8'),
).version
const PUBLICO = join(__dirname, '..', '..', '..', 'public', 'pdfjs')

const servidos = Object.values(RECURSOS_DO_PDFJS).flatMap(
  ({ pasta, arquivos }) => arquivos.map((arquivo) => `${pasta}/${arquivo}`),
)
const licencas = Object.entries(LICENCAS_DOS_RECURSOS).flatMap(
  ([pasta, arquivos]) => arquivos.map((arquivo) => `${pasta}/${arquivo}`),
)

const sha256 = (caminho: string) =>
  createHash('sha256').update(readFileSync(caminho)).digest('hex')

function arquivosDe(pasta: string): string[] {
  return readdirSync(pasta, { recursive: true, withFileTypes: true })
    .filter((entrada) => entrada.isFile())
    .map((entrada) =>
      join(entrada.parentPath, entrada.name).slice(pasta.length + 1),
    )
    .sort()
}

describe('a cópia servida dos recursos do pdf.js', () => {
  it('só existe a pasta da versão instalada', () => {
    expect(readdirSync(PUBLICO)).toEqual([VERSAO])
  })

  it('tem só os arquivos que a fábrica serve, mais as licenças deles', () => {
    expect(arquivosDe(join(PUBLICO, VERSAO))).toEqual(
      [...servidos, ...licencas].sort(),
    )
  })

  it.each([...servidos, ...licencas])(
    '%s é igual ao do pacote, byte a byte (sha256)',
    (arquivo) => {
      expect(sha256(join(PUBLICO, VERSAO, arquivo))).toBe(
        sha256(join(PACOTE, arquivo)),
      )
    },
  )
})

describe('a fábrica que o pdf.js chama', () => {
  function fabrica() {
    const buscados: string[] = []
    const Fabrica = criarFabricaDeRecursos(VERSAO, async (url) => {
      buscados.push(url)
      return new Response(new Uint8Array([1, 2, 3]))
    })
    return { instancia: new Fabrica(), buscados }
  }

  it('busca na própria origem, na pasta da versão, os decodificadores e as duas fontes', async () => {
    const { instancia, buscados } = fabrica()

    for (const [kind, { arquivos }] of Object.entries(RECURSOS_DO_PDFJS)) {
      for (const filename of arquivos) {
        await expect(instancia.fetch({ kind, filename })).resolves.toEqual(
          new Uint8Array([1, 2, 3]),
        )
      }
    }

    expect(buscados).toEqual(
      servidos.map((arquivo) => `${pastaDosRecursos(VERSAO)}${arquivo}`),
    )
    expect(buscados.every((url) => url.startsWith(`/pdfjs/${VERSAO}/`))).toBe(
      true,
    )
  })

  it.each([
    ['cMapUrl', 'UniGB-UCS2-H.bcmap'],
    ['standardFontDataUrl', 'LiberationSans-Regular.ttf'],
    ['wasmUrl', 'qcms_bg.wasm'],
    ['wasmUrl', '../../segredo'],
    ['toString', 'openjpeg.wasm'],
  ])('recusa %s %s sem ir à rede', async (kind, filename) => {
    const { instancia, buscados } = fabrica()

    await expect(instancia.fetch({ kind, filename })).rejects.toThrow(
      'não é servido',
    )
    expect(buscados).toEqual([])
  })

  it('resposta que não é 200 vira erro, e o pdf.js segue sem o recurso', async () => {
    const Fabrica = criarFabricaDeRecursos(
      VERSAO,
      async () => new Response('', { status: 404 }),
    )

    await expect(
      new Fabrica().fetch({ kind: 'wasmUrl', filename: 'jbig2.wasm' }),
    ).rejects.toThrow('404')
  })
})
