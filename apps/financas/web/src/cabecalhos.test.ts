import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aplicarTema } from './lib/theme'

/**
 * A SPA é servida pelo Static Assets, não pelo Worker: os cabeçalhos dela
 * moram em `public/_headers`. Este teste fica em `src/` (e não ao lado de
 * `public/`) porque tudo em `public/` vai cru para o `dist`, teste incluso.
 */
const WEB = join(dirname(fileURLToPath(import.meta.url)), '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')

function regrasDoHeaders(texto: string): Map<string, Map<string, string>> {
  const regras = new Map<string, Map<string, string>>()
  let atual: Map<string, string> | null = null
  for (const linha of texto.split('\n')) {
    if (linha.trim() === '' || linha.trim().startsWith('#')) continue
    if (!/^\s/.test(linha)) {
      atual = new Map()
      regras.set(linha.trim(), atual)
      continue
    }
    const i = linha.indexOf(':')
    atual?.set(
      linha.slice(0, i).trim().toLowerCase(),
      linha.slice(i + 1).trim(),
    )
  }
  return regras
}

function diretivas(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((partes) => partes[0])
      .map(([nome, ...valores]) => [nome!, valores]),
  )
}

const cabecalhosDaSpa = () => regrasDoHeaders(ler('public/_headers')).get('/*')
const csp = () =>
  diretivas(cabecalhosDaSpa()?.get('content-security-policy') ?? '')

/** O que a CSP barraria em silêncio num HTML: a tela quebra sem erro de build. */
function bloqueiosDaCsp(html: string, politica = csp()): string[] {
  const libera = (diretiva: string, url: string) => {
    const valores = politica.get(diretiva) ?? politica.get('default-src') ?? []
    return /^https?:\/\//i.test(url)
      ? valores.includes(new URL(url).origin)
      : valores.includes("'self'")
  }
  const atributo = (tag: string, nome: string) =>
    new RegExp(`\\s${nome}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1]

  const semComentarios = html.replace(/<!--[\s\S]*?-->/g, '')
  const problemas: string[] = []
  for (const tag of semComentarios.match(/<[a-z][^>]*>/gi) ?? []) {
    if (/\son[a-z]+\s*=/i.test(tag)) problemas.push(`handler inline: ${tag}`)
    if (/\s(?:href|src|action)\s*=\s*["']\s*javascript:/i.test(tag))
      problemas.push(`URL javascript: ${tag}`)
    if (/^<script\b/i.test(tag)) {
      const src = atributo(tag, 'src')
      if (!src) problemas.push(`script inline: ${tag}`)
      else if (!libera('script-src', src))
        problemas.push(`script de outra origem: ${tag}`)
    }
    if (/^<link\b/i.test(tag) && atributo(tag, 'rel') === 'stylesheet') {
      const href = atributo(tag, 'href') ?? ''
      if (!libera('style-src', href))
        problemas.push(`folha de estilo de outra origem: ${tag}`)
    }
  }
  return problemas
}

describe('detector do que a CSP barraria', () => {
  const casos = {
    'script inline': '<script>window.__x = 1</script>',
    'handler inline': `<link rel="stylesheet" href="/a.css" media="print" onload="this.media='all'" />`,
    'URL javascript:': '<a href="javascript:void(0)">x</a>',
    'script de outra origem':
      '<script src="https://cdn.exemplo.com/a.js"></script>',
    'folha de estilo de outra origem':
      '<link rel="stylesheet" href="https://cdn.exemplo.com/a.css" />',
  }

  it.each(Object.entries(casos))('pega %s', (_, html) => {
    expect(bloqueiosDaCsp(html)).not.toEqual([])
  })

  it('deixa passar o que a CSP libera', () => {
    expect(
      bloqueiosDaCsp(
        '<script src="/tema.js"></script><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X" /><!-- <script>comentário</script> -->',
      ),
    ).toEqual([])
  })
})

describe('index.html sem script inline', () => {
  it('todo <script> tem src', () => {
    const scripts = ler('index.html').match(/<script\b[^>]*>/gi) ?? []
    expect(scripts.length).toBeGreaterThan(0)
    for (const tag of scripts) expect(tag).toMatch(/\ssrc=["'][^"']+["']/)
  })

  it('nada no index.html que a CSP barre', () => {
    expect(bloqueiosDaCsp(ler('index.html'))).toEqual([])
  })

  // Um plugin do Vite pode injetar script no build; o dist só existe depois dele.
  it.skipIf(!existsSync(join(WEB, 'dist/index.html')))(
    'nada no dist/index.html que a CSP barre',
    () => {
      expect(bloqueiosDaCsp(ler('dist/index.html'))).toEqual([])
    },
  )

  it('o tema vem de /tema.js, síncrono no <head> e antes do bundle', () => {
    const html = ler('index.html')
    const head = html.slice(0, html.indexOf('</head>'))
    const tag = /<script\b[^>]*src=["']\/tema\.js["'][^>]*>/.exec(head)?.[0]
    expect(tag).toBeDefined()
    expect(tag).not.toMatch(/\b(defer|async|type=["']module["'])/)
    expect(html.indexOf('/tema.js')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })

  it('toda origem externa citada no index.html está liberada na CSP', () => {
    const origens = new Set(
      [
        ...ler('index.html').matchAll(/(?:href|src)=["'](https:\/\/[^/"']+)/g),
      ].map((m) => m[1]!),
    )
    expect([...origens].sort()).toEqual([
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ])
    expect(csp().get('style-src')).toContain('https://fonts.googleapis.com')
    expect(csp().get('font-src')).toContain('https://fonts.gstatic.com')
  })
})

describe('public/tema.js — o mesmo comportamento do script que saiu do HTML', () => {
  const rodar = () => new Function(ler('public/tema.js'))()

  function sistemaEscuro(escuro: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: escuro,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  }

  afterEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('tema salvo pelo app (aplicarTema) é o que o script lê', () => {
    sistemaEscuro(false)
    aplicarTema('escuro')
    document.documentElement.classList.remove('dark')
    rodar()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('"claro" salvo vence o sistema escuro', () => {
    sistemaEscuro(true)
    localStorage.setItem('financas-tema', 'claro')
    rodar()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('sem tema salvo, segue o sistema', () => {
    sistemaEscuro(true)
    rodar()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('localStorage que lança não derruba a página', () => {
    sistemaEscuro(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError')
    })
    expect(rodar).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

describe('public/_headers — cabeçalhos da SPA', () => {
  it('tem uma regra para todo caminho', () => {
    expect(cabecalhosDaSpa()).toBeDefined()
  })

  it('CSP: script só do próprio site, sem unsafe-inline nem unsafe-eval', () => {
    expect(csp().get('default-src')).toEqual(["'self'"])
    expect(csp().get('script-src')).toEqual(["'self'"])
  })

  it('CSP: unsafe-inline só em style-src', () => {
    for (const [nome, valores] of csp()) {
      if (nome === 'style-src') continue
      expect(valores, nome).not.toContain("'unsafe-inline'")
    }
    expect(csp().get('style-src')).toContain("'unsafe-inline'")
  })

  it("CSP: frame-ancestors 'none', connect-src 'self', object-src 'none'", () => {
    expect(csp().get('frame-ancestors')).toEqual(["'none'"])
    expect(csp().get('connect-src')).toEqual(["'self'"])
    expect(csp().get('object-src')).toEqual(["'none'"])
    expect(csp().get('base-uri')).toEqual(["'self'"])
    expect(csp().get('form-action')).toEqual(["'self'"])
  })

  it('os outros cabeçalhos', () => {
    const h = cabecalhosDaSpa()!
    expect(h.get('x-content-type-options')).toBe('nosniff')
    expect(h.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(h.get('x-frame-options')).toBe('DENY')
    expect(h.get('strict-transport-security')).toBe(
      'max-age=15552000; includeSubDomains',
    )
  })

  it('Permissions-Policy não bloqueia a passkey (WebAuthn)', () => {
    const politica = cabecalhosDaSpa()!.get('permissions-policy') ?? ''
    expect(politica).toContain('publickey-credentials-get=(self)')
    expect(politica).toContain('publickey-credentials-create=(self)')
    expect(politica).toContain('camera=()')
  })
})
