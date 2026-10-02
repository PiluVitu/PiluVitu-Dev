/** @jest-environment node */
import { parse } from 'yaml'
import { serializeEntry, parseEntry } from './content-yaml'
import { COLLECTIONS } from './content-registry'

const botai = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao:
    'Extensão para Chrome, Edge, Opera e Firefox que gera uma pessoa brasileira de teste, com CPF, CNPJ, RG e CEP válidos, e preenche o formulário da página com um atalho.',
  tipo: 'extensao' as const,
  tags: ['Extensão', 'QA'],
  logo: '/pilulabs/botai/icone-128.png',
  sigla: '',
  site: 'https://botai.pilutech.com.br',
  repo: '',
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  destaque: true,
  data: '2026-10-01',
  listado: true,
  paginaPropria: true,
}

describe('content-yaml', () => {
  it('round-trips an item through serialize → parse', () => {
    const yaml = serializeEntry(COLLECTIONS.pilulabs, botai)
    expect(typeof yaml).toBe('string')
    expect(parseEntry(COLLECTIONS.pilulabs, yaml)).toEqual(botai)
  })

  it('emits keys in registry order', () => {
    const yaml = serializeEntry(COLLECTIONS.pilulabs, botai)
    const keys = yaml
      .split('\n')
      .map((l) => l.match(/^([a-zA-Z]+):/)?.[1])
      .filter(Boolean)
    expect(keys).toEqual(COLLECTIONS.pilulabs.keyOrder)
    expect(keys.slice(0, 3)).toEqual(['slug', 'order', 'nome'])
  })

  // O fields.date do Keystatic recusa `data: ''`, e um item que não abre
  // derruba o reader da coleção (e o build do site).
  it('omits an empty data, which the Keystatic date field rejects', () => {
    const yaml = serializeEntry(COLLECTIONS.pilulabs, { ...botai, data: '' })
    expect(parse(yaml)).not.toHaveProperty('data')
    expect(parseEntry(COLLECTIONS.pilulabs, yaml).data).toBe('')
  })

  it('writes the date as AAAA-MM-DD and reads it back as text', () => {
    const yaml = serializeEntry(COLLECTIONS.pilulabs, botai)
    expect(yaml).toContain('\ndata: "2026-10-01"\n')
    expect(parseEntry(COLLECTIONS.pilulabs, yaml).data).toBe('2026-10-01')
  })

  // O reader do Keystatic usa js-yaml (YAML 1.1), que lê `2026-10-01` sem aspas
  // como Date: num fields.text isso lança erro e derruba a coleção inteira (o
  // `.all()` é um Promise.all). O `yaml` daqui é 1.2 e não vê o problema.
  it('quotes date-shaped text, so a YAML 1.1 reader keeps it a string', () => {
    const yaml = serializeEntry(COLLECTIONS.pilulabs, {
      ...botai,
      sigla: '2026-10-01',
      subtitulo: '2026-10-01T10:00:00Z',
    })
    const comoOKeystaticLe = parse(yaml, { version: '1.1' })
    expect(comoOKeystaticLe.sigla).toBe('2026-10-01')
    expect(comoOKeystaticLe.subtitulo).toBe('2026-10-01T10:00:00Z')
    expect(comoOKeystaticLe.data).toBe('2026-10-01')
  })

  it('keeps every other empty string: only the listed keys are omitted', () => {
    expect(serializeEntry(COLLECTIONS.pilulabs, botai)).toContain(
      '\nsigla: ""\n',
    )
  })

  it('writes the multiline descricao as a block literal', () => {
    expect(serializeEntry(COLLECTIONS.pilulabs, botai)).toContain(
      'descricao: |-\n  Extensão para Chrome',
    )
  })

  it('rejects content that fails the schema on parse', () => {
    expect(() =>
      parseEntry(COLLECTIONS.pilulabs, 'slug: Bad Slug\norder: 0\nnome: x'),
    ).toThrow()
  })
})
