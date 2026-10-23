import { describe, expect, test } from 'vitest'
import {
  getCategories,
  layoutDoCabecalho,
  parseRow,
  rangeDoCabecalho,
  readMovies,
  type SheetMovie,
} from './gsheets'
import {
  gerarServiceAccountDeTeste,
  instalarMockGoogleSheets,
} from '../test-support/gsheets-mock'

describe('parseRow', () => {
  test('linha REAL da planilha: título na coluna B (índice 1), categoria na D (índice 3)', () => {
    const row = ['1', '(500) Dias com Ela', 'Filme', 'Romance', 'FALSE']
    expect(parseRow(row)).toEqual<SheetMovie>({
      number: 1,
      title: '(500) Dias com Ela',
      type: 'filme',
      category: 'romance',
      watched: false,
      halloween: false,
    })
  })

  test('len(row) < 5 descarta', () => {
    expect(parseRow(['1', 'Título', 'Filme', 'Categoria'])).toBeNull()
    expect(parseRow(['1', 'Título'])).toBeNull()
    expect(parseRow([])).toBeNull()
  })

  test('largura 6 (nota na coluna F) continua usável', () => {
    expect(
      parseRow(['1', 'Título', 'Filme', 'Categoria', 'sim', '8']),
    ).not.toBeNull()
  })

  test('título vazio (após trim) descarta', () => {
    expect(parseRow(['1', '   ', 'Filme', 'Categoria', 'sim'])).toBeNull()
    expect(parseRow(['1', '', 'Filme', 'Categoria', 'sim'])).toBeNull()
  })

  test('categoria vazia (após trim) descarta', () => {
    expect(parseRow(['1', 'Título', 'Filme', '   ', 'sim'])).toBeNull()
    expect(parseRow(['1', 'Título', 'Filme', '', 'sim'])).toBeNull()
  })

  test('categoria vai para minúscula, trimada', () => {
    expect(
      parseRow(['1', 'Título', 'Filme', '  Aventura  ', 'sim'])?.category,
    ).toBe('aventura')
  })

  // ⚠️ Mutação obrigatória do brief: trocar o índice 3 pelo 1 na leitura da
  // categoria faz este teste (e o da linha real acima) FALHAR — categoria
  // viraria "(500) dias com ela" (o título minúsculo) em vez de "romance".
  test('a categoria NÃO é a coluna do título — troca de índice quebraria isto', () => {
    const row = ['1', 'Título do Filme', 'Filme', 'Suspense', 'sim']
    const parsed = parseRow(row)
    expect(parsed?.category).toBe('suspense')
    expect(parsed?.category).not.toBe('título do filme')
  })

  test.each([
    ['abc', 0],
    ['', 0],
    ['   ', 0],
    ['12.5', 0], // Atoi rejeita float — não é parse parcial (não vira 12)
    ['-3', -3],
    ['42', 42],
  ])(
    'number tolerante: %p vira %p (nunca descarta a linha por causa disso)',
    (raw, esperado) => {
      const row = [raw, 'Título', 'Filme', 'Categoria', 'sim']
      const parsed = parseRow(row)
      expect(parsed).not.toBeNull()
      expect(parsed?.number).toBe(esperado)
    },
  )

  test.each([
    ['serie', 'serie'],
    ['série', 'serie'], // planilha real usa a forma acentuada
    ['SÉRIE', 'serie'],
    ['  Série  ', 'serie'],
    ['Filme', 'filme'],
    ['filme', 'filme'],
    ['qualquer coisa', 'filme'],
    ['', 'filme'],
  ])('type: %p vira %p', (raw, esperado) => {
    const row = ['1', 'Título', raw, 'Categoria', 'sim']
    expect(parseRow(row)?.type).toBe(esperado)
  })

  test.each([
    ['sim', true],
    ['SIM', true],
    ['TRUE', true], // checkbox marcado
    ['verdadeiro', true],
    ['FALSE', false],
    ['  sim  ', true],
    ['yes', true],
    ['true', true],
    ['1', true],
    ['não', false],
    ['no', false],
    ['0', false],
    ['', false],
    ['qualquer coisa', false],
  ])('watched: %p vira %p', (raw, esperado) => {
    const row = ['1', 'Título', 'Filme', 'Categoria', raw]
    expect(parseRow(row)?.watched).toBe(esperado)
  })
})

// --------------------------------------------------------------------------
// readMovies/getCategories — NUNCA chamam o Google de verdade. Mocka
// globalThis.fetch interceptando só o token endpoint (SA de teste) e o
// endpoint de values do Sheets, delegando o resto pro fetch original,
// restaurado num `finally` — mesmo padrão de lib/auth.test.ts e
// lib/google-auth.test.ts (o fetchMock do cloudflare:test não existe na
// versão instalada). `gerarServiceAccountDeTeste`/`instalarMockGoogleSheets`
// vêm de `../test-support/gsheets-mock` (fatia ③, Task 4 — extraído daqui,
// era a 1ª de 3 cópias idênticas; ver o cabeçalho daquele arquivo).
// --------------------------------------------------------------------------

describe('readMovies — descarte em massa (paridade com a planilha real)', () => {
  test('4 linhas — 1 curta (len<5), 1 sem título, 1 sem categoria, 1 boa ⇒ devolve 1', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-descarte@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-descarte',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      [
        ['1', 'Curta'], // len < 5, descarta
        ['2', '   ', 'Filme', 'Drama', 'sim'], // sem título, descarta
        ['3', 'Sem Categoria', 'Filme', '   ', 'sim'], // sem categoria, descarta
        ['4', 'Boa', 'Filme', 'Comédia', 'sim'], // boa, sobrevive
      ],
    )
    try {
      const movies = await readMovies(cfg)
      expect(movies).toHaveLength(1)
      expect(movies[0]).toEqual<SheetMovie>({
        number: 4,
        title: 'Boa',
        type: 'filme',
        category: 'comédia',
        watched: true,
        halloween: false,
      })
    } finally {
      mock.restaurar()
    }
  })

  test('resposta sem "values" (planilha vazia) devolve lista vazia, não lança', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-vazia@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-vazia',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      [],
    )
    try {
      await expect(readMovies(cfg)).resolves.toEqual([])
    } finally {
      mock.restaurar()
    }
  })

  test('resposta não-ok do Sheets lança (a rota mapeia isto pra 502)', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-falha-sheets@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-falha',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      500,
    )
    try {
      await expect(readMovies(cfg)).rejects.toThrow()
    } finally {
      mock.restaurar()
    }
  })
})

describe('getCategories — dedupe + ordenação de BYTE, não localeCompare', () => {
  test('categorias reais medidas, incluindo acentuadas, saem deduplicadas e na ordem de byte/codepoint UTF', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-categorias@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-categorias',
      range: 'A2:F',
    }
    // Entrada fora de ordem, com uma duplicata proposital (Romance 2x).
    const categoriasEntrada = [
      'Terror',
      'Romance',
      'Ação',
      'Animação',
      'Aventura',
      'Comédia',
      'Crime / Investigação',
      'Documentário',
      'Drama',
      'Ficção Científica',
      'Suspense',
      'Romance',
    ]
    const rows = categoriasEntrada.map((cat, i) => [
      String(i + 1),
      `Filme ${i}`,
      'Filme',
      cat,
      'sim',
    ])
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      rows,
    )
    try {
      const categorias = await getCategories(cfg)
      // ⚠️ Esta ordem SÓ passa com comparação de byte/codepoint (o `sort()`
      // default do JS). Sob `localeCompare('pt-BR')`, `ação` colateria perto
      // do início (`ç`~`c`), produzindo
      // [ação, animação, aventura, comédia, ...] em vez desta — MEDIDO.
      expect(categorias).toEqual([
        'animação',
        'aventura',
        'ação',
        'comédia',
        'crime / investigação',
        'documentário',
        'drama',
        'ficção científica',
        'romance',
        'suspense',
        'terror',
      ])
      // Dedupe: 12 linhas de entrada (Romance duplicado), 11 categorias únicas.
      expect(categorias).toHaveLength(11)
    } finally {
      mock.restaurar()
    }
  })
})

// O cabeçalho real medido em 2026-10-23: a coluna "Halloween" entrou em E e
// empurrou "Assistido?" pra F. Com índice fixo, o checkbox do Halloween
// virava "assistido" e os filmes de Halloween sumiam do sorteio.
const CABECALHO_REAL = [
  'N°',
  'Título',
  'Filme ou Série?',
  'Gênero',
  'Halloween',
  'Assistido?',
  'Nota?',
]

describe('layoutDoCabecalho', () => {
  test('acha as colunas pelo nome, com acento e pontuação', () => {
    expect(layoutDoCabecalho(CABECALHO_REAL)).toEqual({
      number: 0,
      title: 1,
      type: 2,
      category: 3,
      halloween: 4,
      watched: 5,
      minLength: 4,
    })
  })

  test('sem a coluna Halloween, halloween fica null', () => {
    expect(
      layoutDoCabecalho([
        'N°',
        'Título',
        'Filme ou Série?',
        'Gênero',
        'Assistido?',
      ])?.halloween,
    ).toBeNull()
  })

  test('sem Título ou Gênero não é cabeçalho', () => {
    expect(layoutDoCabecalho([])).toBeNull()
    expect(
      layoutDoCabecalho(['1', 'Duna', 'Filme', 'Ficção', 'FALSE']),
    ).toBeNull()
  })

  test('com o layout do cabeçalho real, E é Halloween e F é Assistido', () => {
    const layout = layoutDoCabecalho(CABECALHO_REAL)!
    const row = ['7', 'Corra!', 'Filme', 'Terror', 'TRUE', 'FALSE']
    expect(parseRow(row, layout)).toEqual<SheetMovie>({
      number: 7,
      title: 'Corra!',
      type: 'filme',
      category: 'terror',
      watched: false,
      halloween: true,
    })
  })

  test('célula vazia no fim da linha (o Sheets corta) vale false', () => {
    const layout = layoutDoCabecalho(CABECALHO_REAL)!
    const parsed = parseRow(['8', 'Duna', 'Filme', 'Ficção'], layout)
    expect(parsed).toMatchObject({ watched: false, halloween: false })
  })
})

describe('rangeDoCabecalho', () => {
  test.each([
    ['A2:F', '1:1'],
    ['Página5!A2:F', 'Página5!1:1'],
    ["'Minha aba'!A2:G", "'Minha aba'!1:1"],
  ])('%p ⇒ %p', (range, esperado) => {
    expect(rangeDoCabecalho(range)).toBe(esperado)
  })
})

describe('readMovies — colunas pelo cabeçalho', () => {
  test('lê a linha 1 à parte e usa o layout dela no range de dados', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-cabecalho@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-cabecalho',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      [
        ['1', 'Corra!', 'Filme', 'Terror', 'TRUE', 'FALSE'],
        ['2', 'Duna', 'Filme', 'Ficção', 'FALSE', 'TRUE'],
      ],
      undefined,
      CABECALHO_REAL,
    )
    try {
      const movies = await readMovies(cfg)
      expect(movies.map((m) => [m.title, m.halloween, m.watched])).toEqual([
        ['Corra!', true, false],
        ['Duna', false, true],
      ])
    } finally {
      mock.restaurar()
    }
  })

  test('range que inclui a linha 1 não vira filme', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-cabecalho-no-range@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-cabecalho-no-range',
      range: 'A1:G',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      [CABECALHO_REAL, ['1', 'Corra!', 'Filme', 'Terror', 'TRUE', 'FALSE']],
      undefined,
      CABECALHO_REAL,
    )
    try {
      const movies = await readMovies(cfg)
      expect(movies.map((m) => m.title)).toEqual(['Corra!'])
    } finally {
      mock.restaurar()
    }
  })

  test('falha ao ler o cabeçalho lança (a rota mapeia pra 502)', async () => {
    const sa = await gerarServiceAccountDeTeste(
      'teste-cabecalho-falha@projeto-de-teste.iam.gserviceaccount.com',
    )
    const cfg = {
      serviceAccount: sa,
      spreadsheetId: 'planilha-cabecalho-falha',
      range: 'A2:F',
    }
    const mock = instalarMockGoogleSheets(
      sa.token_uri,
      cfg.spreadsheetId,
      cfg.range,
      [['1', 'Corra!', 'Filme', 'Terror', 'TRUE', 'FALSE']],
      undefined,
      500,
    )
    try {
      await expect(readMovies(cfg)).rejects.toThrow()
    } finally {
      mock.restaurar()
    }
  })
})
