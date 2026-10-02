// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lerSecoes, permissoesJustificadas } from './textos'

const ler = (arquivo: string) =>
  readFileSync(path.join(import.meta.dirname, arquivo), 'utf8')
const textos = lerSecoes(ler('textos.md'))
const notas = lerSecoes(ler('notas-revisores.md'))
const caracteres = (texto = '') => [...texto].length

describe('textos da listagem', () => {
  it('nome com acento', () => {
    expect(textos.get('Nome')).toBe('Botaí')
  })

  it('resumo cabe nos 250 caracteres da AMO', () => {
    expect(caracteres(textos.get('Resumo'))).toBeGreaterThan(0)
    expect(caracteres(textos.get('Resumo'))).toBeLessThanOrEqual(250)
  })

  it('descrição tem ao menos os 250 caracteres que o Edge exige', () => {
    expect(caracteres(textos.get('Descrição'))).toBeGreaterThanOrEqual(250)
  })

  it('propósito único, categoria e dados preenchidos', () => {
    for (const secao of ['Propósito único', 'Categoria', 'Dados'])
      expect(caracteres(textos.get(secao))).toBeGreaterThan(0)
  })

  it('código remoto: não', () => {
    expect(textos.get('Código remoto')).toMatch(/^Não\./)
  })

  it('licença MIT', () => {
    expect(textos.get('Licença')).toMatch(/^MIT\./)
  })

  it('endereços batem com o homepage_url, a política e o contato de suporte', () => {
    const enderecos = textos.get('Endereços')
    expect(enderecos).toContain('https://botai.pilutech.com.br\n')
    expect(enderecos).toContain('https://botai.pilutech.com.br/privacidade')
    expect(enderecos).toContain('pilutechinformatica@gmail.com')
    expect(enderecos).toContain('Publicador: PiluTech')
  })

  it('a descrição e os endereços apontam para os termos de uso', () => {
    const termos = 'Termos de uso: https://botai.pilutech.com.br/termos'
    expect(textos.get('Descrição')).toContain(termos)
    expect(textos.get('Endereços')).toContain(termos)
  })

  it('o README do Botaí leva à política e aos termos', () => {
    const readme = ler('../README.md')
    expect(readme).toContain('https://botai.pilutech.com.br/privacidade')
    expect(readme).toContain('https://botai.pilutech.com.br/termos')
  })

  // O endereço antigo vive em piluvitu.com.br e passa a responder 308: a loja
  // não pode guardar um link que redireciona. `ler` parte de loja/.
  it.each(['textos.md', '../README.md', '../CLAUDE.md'])(
    '%s não aponta mais para piluvitu.com.br/pilulabs',
    (arquivo) => {
      expect(ler(arquivo)).not.toContain('piluvitu.com.br/pilulabs')
    },
  )

  it('uma justificativa por permissão, menus inclusive', () => {
    expect(permissoesJustificadas(textos).sort()).toEqual([
      'activeTab',
      'contextMenus',
      'menus',
      'scripting',
      'storage',
    ])
    for (const permissao of permissoesJustificadas(textos))
      expect(
        caracteres(textos.get(`Justificativa: ${permissao}`)),
      ).toBeGreaterThan(0)
  })

  // "Abrir caixa de entrada" leva a um site de terceiro: a justificativa não
  // pode citar só parte do menu.
  it('a justificativa do contextMenus cita cada item do menu', () => {
    const itens = [
      ...ler('../src/lib/menus.ts').matchAll(/title: '([^']+)'/g),
    ].map((m) => m[1])
    expect(itens).toEqual([
      'Preencher esta página',
      'Inserir',
      'Nova pessoa',
      'Abrir caixa de entrada',
    ])
    for (const item of itens)
      expect(textos.get('Justificativa: contextMenus')).toContain(`"${item}`)
  })

  it.each(['textos.md', 'notas-revisores.md', 'README.md'])(
    '%s nunca escreve a marca com a grafia errada',
    (arquivo) => {
      expect(ler(arquivo)).not.toMatch(/BotAi|Bota Aí|BOTAI|Botai/)
    },
  )
})

describe('notas para os revisores', () => {
  it.each(['AMO', 'Opera'])(
    '%s aponta para o SOURCE-CODE-REVIEW.md',
    (loja) => {
      expect(notas.get(loja)).toContain('apps/botai/SOURCE-CODE-REVIEW.md')
    },
  )
})

// A política em botai.pilutech.com.br/privacidade diz que a extensão não envia nada e só
// guarda a pessoa em local:botai_pessoa. Se um destes falhar, atualize a política antes.
describe('o que a política promete, o código da extensão cumpre', () => {
  const src = path.join(import.meta.dirname, '..', 'src')
  const fontes = readdirSync(src, { recursive: true, encoding: 'utf8' })
    .filter((arquivo) => /\.(ts|tsx)$/.test(arquivo))
    .filter((arquivo) => !/\.(test|stories|e2e)\.tsx?$/.test(arquivo))
    .filter((arquivo) => !arquivo.startsWith(`test${path.sep}`))
    .map((arquivo) => readFileSync(path.join(src, arquivo), 'utf8'))

  it('nenhuma chamada de rede', () => {
    for (const fonte of fontes)
      expect(fonte).not.toMatch(
        /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/,
      )
  })

  it('uma chave de storage só, local:botai_pessoa, e nada em sync', () => {
    const chaves = fontes.flatMap((fonte) =>
      [...fonte.matchAll(/['"`]((?:local|sync|session|managed):[\w-]+)/g)].map(
        (m) => m[1],
      ),
    )
    expect(chaves).toEqual(['local:botai_pessoa'])
  })
})
