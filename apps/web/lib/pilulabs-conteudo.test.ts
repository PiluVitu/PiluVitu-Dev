import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lojasPublicadas, urlsDasLojas } from '@piluvitu/tools/pilulabs'
import { pilulabsSchema } from './admin/content-schemas'
import { itensListados, linkDoItem } from './pilulabs'
import {
  camposInvalidosNoYaml,
  lerItensDoConteudo,
  lerYamlsDoConteudo,
  paginasSemItem,
  rotasFaltando,
  rotasObrigatorias,
  slugsComPaginaPropria,
} from './pilulabs-conteudo'

const RAIZ_WEB = join(__dirname, '..')
const itens = lerItensDoConteudo(RAIZ_WEB)
const existe = (caminho: string) => existsSync(join(RAIZ_WEB, caminho))
const doSlug = (slug: string) => itens.find((i) => i.slug === slug)

// A largura de um PNG fica nos bytes 16–19 do cabeçalho IHDR.
function larguraDoPng(caminhoPublico: string): number {
  return readFileSync(join(RAIZ_WEB, 'public', caminhoPublico)).readUInt32BE(16)
}

describe('catálogo em content/pilulabs', () => {
  it('o Botaí: extensão listada e em destaque, sem página aqui: o site é a landing do repo PiluVitu/Botai', () => {
    expect(doSlug('botai')).toMatchObject({
      nome: 'Botaí',
      tipo: 'extensao',
      subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      descricao:
        'Extensão para Chrome, Edge, Opera e Firefox que gera uma pessoa brasileira de teste, com CPF, CNPJ, RG e CEP válidos, e preenche o formulário da página com um atalho.',
      tags: ['Extensão', 'Formulários', 'QA', 'CPF', 'CEP'],
      logo: '/pilulabs/botai/icone-128.png',
      site: 'https://botai.pilutech.com.br',
      repo: 'https://github.com/PiluVitu/Botai',
      destaque: true,
      order: 0,
      data: '2026-10-01',
      listado: true,
      paginaPropria: false,
    })
  })

  // O card daqui e o selo na landing da PiluTech leem estas URLs; a landing do
  // Botaí (repo PiluVitu/Botai) lê as mesmas do site/lojas.json de lá. Chrome
  // desde 2026-10-05 e Firefox desde 2026-10-08 (AMO: status public, 1.0.0);
  // Edge e Opera entram quando aprovarem.
  it('o Botaí está publicado na Chrome Web Store e na Firefox Add-ons; Edge e Opera ainda não', () => {
    expect(lojasPublicadas(urlsDasLojas(doSlug('botai')))).toEqual([
      {
        loja: 'chrome',
        url: 'https://chromewebstore.google.com/detail/bota%C3%AD/mblmjomopainbcdjipkdmioglamdinnc',
      },
      {
        loja: 'firefox',
        url: 'https://addons.mozilla.org/pt-BR/firefox/addon/bota%C3%AD/',
      },
    ])
  })

  it('o Sombraí: app mobile com o site no subdomínio, sem repo', () => {
    expect(doSlug('sombrai')).toMatchObject({
      nome: 'Sombraí',
      tipo: 'mobile',
      subtitulo: 'Plante sombra em Teresina',
      descricao:
        'App para iPhone e Android que mostra quais árvores e plantas nativas do Piauí cabem no seu quintal, na calçada, na varanda ou no vaso, como cuidar delas no calor de Teresina e quais são seguras para cães e gatos.',
      tags: ['Swift', 'SwiftUI', 'Kotlin', 'Jetpack Compose', 'Next.js'],
      logo: '/pilulabs/sombrai/icone.png',
      site: 'https://sombrai.pilutech.com.br',
      repo: '',
      destaque: true,
      order: 1,
      data: '2026-09-23',
      listado: true,
      paginaPropria: false,
    })
  })

  it('o ícone do Sombraí foi reduzido para 256 px', () => {
    expect(larguraDoPng('/pilulabs/sombrai/icone.png')).toBe(256)
  })

  it('o Live PRs: app web com a sigla LPR e o site de hoje', () => {
    expect(doSlug('live-prs')).toMatchObject({
      nome: 'Live PRs',
      tipo: 'web',
      subtitulo: 'agregador de pull requests',
      logo: '/pr-live-dark.svg',
      sigla: 'LPR',
      site: 'https://pr-live-folder-front.vercel.app/',
      repo: '',
      destaque: false,
      order: 2,
      data: '2024-08-28',
      listado: true,
      paginaPropria: false,
    })
  })

  // O site lê pelo reader do Keystatic, mais estrito que o normalizarItem: um
  // campo que ele recusa lança erro, e o Promise.all do .all() derruba a coleção
  // inteira (home, /pilulabs, OG e o next build). Este arquivo e os E2E
  // leem pelo `yaml` + normalizarItem, e sem esta trava não veriam nada.
  it('todo YAML abre no reader do Keystatic: nenhum campo fora do tipo dele', () => {
    for (const [slug, bruto] of lerYamlsDoConteudo(RAIZ_WEB))
      expect([slug, camposInvalidosNoYaml(bruto)]).toEqual([slug, []])
  })

  // O GET /api/admin/content/pilulabs valida cada YAML no pilulabsSchema dentro
  // de um Promise.all: um item recusado (http, loja de outro host, chave sem
  // valor) vira 502 na lista inteira do admin, e o reorder também falha.
  it('todo YAML passa no pilulabsSchema do admin', () => {
    for (const [slug, bruto] of lerYamlsDoConteudo(RAIZ_WEB)) {
      const resultado = pilulabsSchema.safeParse(bruto)
      expect([
        slug,
        resultado.success
          ? []
          : resultado.error.issues.map(
              (i) => `${i.path.join('.')}: ${i.message}`,
            ),
      ]).toEqual([slug, []])
    }
  })

  it('todo item com página própria tem a rota, e a política se for extensão', () => {
    expect(rotasFaltando(itens, existe)).toEqual([])
  })

  // Só o item com paginaPropria leva à rota própria: sem ele, a página fica órfã.
  it('toda rota própria em app/(site)/pilulabs tem item com paginaPropria', () => {
    expect(paginasSemItem(slugsComPaginaPropria(RAIZ_WEB), itens)).toEqual([])
  })

  it('todo listado tem descrição, link e o logo em public/', () => {
    for (const item of itensListados(itens)) {
      expect([item.slug, item.descricao !== '']).toEqual([item.slug, true])
      expect([item.slug, linkDoItem(item) !== null]).toEqual([item.slug, true])
      if (item.logo.startsWith('/'))
        expect([
          item.logo,
          existsSync(join(RAIZ_WEB, 'public', item.logo)),
        ]).toEqual([item.logo, true])
    }
  })
})

describe('camposInvalidosNoYaml', () => {
  const CRU = {
    slug: 'botai',
    order: 0,
    nome: 'Botaí',
    tipo: 'extensao',
    tags: ['QA'],
    sigla: '',
    destaque: true,
    data: '2026-10-01',
    listado: true,
  }

  // A chave sem valor (`sigla:`) o reader lê como ausente.
  it('aceita cada campo no tipo do reader, a chave ausente e a sem valor', () => {
    expect(camposInvalidosNoYaml(CRU)).toEqual([])
    expect(camposInvalidosNoYaml({})).toEqual([])
    expect(camposInvalidosNoYaml({ ...CRU, sigla: null, tipo: null })).toEqual(
      [],
    )
    expect(camposInvalidosNoYaml('slug: botai')).toEqual([
      '(o arquivo inteiro)',
    ])
  })

  // Os seis primeiros lançam no reader (select, checkbox, integer, text e
  // array do keystatic-core). A data vazia o fields.date recusa; a que não
  // existe ele aceita, e o js-yaml a rola (2026-02-30 vira 2026-03-02).
  it.each([
    ['tipo fora das opções', { tipo: 'desktop' }, 'tipo'],
    ['booleano em texto', { listado: 'true' }, 'listado'],
    ['order em texto', { order: '2' }, 'order'],
    ['order quebrado', { order: 1.5 }, 'order'],
    ['texto em número', { nome: 12 }, 'nome'],
    ['tags fora de lista', { tags: 'QA' }, 'tags'],
    ['data vazia', { data: '' }, 'data'],
    ['data que não existe', { data: '2026-02-30' }, 'data'],
  ])('acusa %s', (_caso, parcial, campo) => {
    expect(camposInvalidosNoYaml({ ...CRU, ...parcial })).toEqual([campo])
  })
})

describe('rotasObrigatorias e rotasFaltando', () => {
  it('extensão com página própria: a página e a política', () => {
    expect(
      rotasObrigatorias({
        slug: 'botai',
        tipo: 'extensao',
        paginaPropria: true,
      }),
    ).toEqual([
      'app/(site)/pilulabs/botai/page.tsx',
      'app/(site)/pilulabs/botai/privacidade/page.tsx',
    ])
  })

  it('outro tipo com página própria: só a página', () => {
    expect(
      rotasObrigatorias({ slug: 'zap', tipo: 'cli', paginaPropria: true }),
    ).toEqual(['app/(site)/pilulabs/zap/page.tsx'])
  })

  it('sem página própria: nada', () => {
    expect(
      rotasObrigatorias({
        slug: 'sombrai',
        tipo: 'mobile',
        paginaPropria: false,
      }),
    ).toEqual([])
  })

  it('acusa o que falta', () => {
    expect(
      rotasFaltando(
        [{ slug: 'novo', tipo: 'extensao', paginaPropria: true }],
        () => false,
      ),
    ).toEqual(
      rotasObrigatorias({
        slug: 'novo',
        tipo: 'extensao',
        paginaPropria: true,
      }),
    )
  })
})

describe('paginasSemItem', () => {
  it('acusa a pasta de rota sem item com paginaPropria', () => {
    expect(
      paginasSemItem(
        ['botai', 'orfa'],
        [
          { slug: 'botai', paginaPropria: true },
          { slug: 'orfa', paginaPropria: false },
        ],
      ),
    ).toEqual(['orfa'])
  })
})
