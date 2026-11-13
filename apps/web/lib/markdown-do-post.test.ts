import { markdownDoPost } from './markdown-do-post'

const URL_DO_POST = 'https://piluvitu.com.br/posts/husky'

const converter = (mdx: string, primeiroNivel = 4) =>
  markdownDoPost(mdx, { urlDoPost: URL_DO_POST, primeiroNivel })

// Os posts de exemplo seguem os artigos de avaliação do apps/ramielle
// (scripts/__fixtures__/avaliacao): título, parágrafo, cerca de código, tabela,
// componente JSX, citação, imagem relativa, lista e cerca sem fechamento.
describe('markdownDoPost: o Markdown do post passa como está', () => {
  it('título, parágrafo, lista, código e link', () => {
    const md = converter(
      [
        '## Instalação',
        '',
        'Rode o comando e veja a [documentação](https://typicode.github.io/husky/).',
        '',
        '- Primeiro passo',
        '- Segundo passo com `npx husky init`',
        '',
        '```ts',
        "export const passos = ['lint', 'test', 'build']",
        'const objeto = { chave: 1 }',
        '```',
      ].join('\n'),
    )
    expect(md).toBe(
      [
        '#### Instalação',
        '',
        'Rode o comando e veja a [documentação](https://typicode.github.io/husky/).',
        '',
        '- Primeiro passo',
        '- Segundo passo com `npx husky init`',
        '',
        '```ts',
        "export const passos = ['lint', 'test', 'build']",
        'const objeto = { chave: 1 }',
        '```',
      ].join('\n'),
    )
  })

  it('tabela e citação', () => {
    const tabela = [
      '| Banco    | Custo   |',
      '| -------- | ------- |',
      '| SQLite   | zero    |',
    ].join('\n')
    const citacao =
      '> Uma citação que eu gosto: o melhor código é o que você apaga.'
    expect(converter(`${tabela}\n\n${citacao}`)).toBe(`${tabela}\n\n${citacao}`)
  })

  // No llms-full.txt vem outro post depois: a cerca aberta engoliria o título dele.
  it('cerca de código sem fechamento vai até o fim, como no MDX, e é fechada', () => {
    const mdx = [
      'O trecho abaixo é o começo:',
      '',
      '````ts',
      '// <Componente> e {chave} ficam no código',
      'app.onError((err, c) => {',
      '  return c.json({ ok: false }, 500)',
      '```',
    ].join('\n')
    expect(converter(mdx)).toBe(mdx + '\n````')
  })

  it('cerca com til e cerca dentro de item de lista', () => {
    const mdx = [
      '- Passo:',
      '',
      '    ```bash',
      '    # não é título',
      '    echo {a,b}',
      '    ```',
      '',
      '~~~',
      '<Tag prop={1} />',
      '~~~',
    ].join('\n')
    expect(converter(mdx)).toBe(mdx)
  })
})

describe('markdownDoPost: o que é do MDX sai', () => {
  it('import e export somem, inclusive em várias linhas', () => {
    const md = converter(
      [
        "import { Callout } from '../components/callout'",
        'import {',
        '  Tabs,',
        '  Tab,',
        "} from '../components/tabs'",
        '',
        "export const meta = { autor: 'eu' }",
        '',
        'Texto do post.',
      ].join('\n'),
    )
    expect(md).toBe('Texto do post.')
  })

  // O MDX 3 só fecha o bloco ESM na linha em branco quando o código já está
  // completo (o acorn não reclama do fim): com chave, parêntese, colchete,
  // string ou template abertos, a linha em branco é parte do bloco e a página
  // não mostra nada dele.
  it('bloco de import ou export com linha em branco no meio sai inteiro', () => {
    const md = converter(
      [
        'Intro.',
        '',
        'export const config = {',
        '  rota: "/admin",',
        '',
        '  chave: "nao-renderizada",',
        '}',
        '',
        'import {',
        '  A,',
        '',
        '  B,',
        "} from './x'",
        '',
        'export const lista = [',
        '',
        '  fn(',
        '',
        '    1,',
        '  ),',
        ']',
        '',
        'export const texto = `primeira',
        '',
        'segunda {`',
        '',
        'Texto depois.',
      ].join('\n'),
    )
    expect(md).toBe('Intro.\n\nTexto depois.')
  })

  it('aspas em comentário não seguram o bloco aberto', () => {
    const md = converter(
      ["export const a = 1 // don't", "/* it's { */", '', 'Texto depois.'].join(
        '\n',
      ),
    )
    expect(md).toBe('Texto depois.')
  })

  it('expressões JS somem, no texto e sozinhas na linha', () => {
    const md = converter(
      [
        'O total é {1 + 1} itens.',
        '',
        '{/* comentário que não aparece */}',
        '',
        "Objeto {{ a: '}' }} e fim.",
      ].join('\n'),
    )
    expect(md).toBe('O total é  itens.\n\nObjeto  e fim.')
  })

  it('chave em código inline e escapada fica', () => {
    expect(converter('Use `{ chave }` e \\{literal\\}.')).toBe(
      'Use `{ chave }` e \\{literal\\}.',
    )
  })

  it('componente que embrulha texto vira o texto de dentro', () => {
    const md = converter(
      [
        'Neste post vamos montar um aviso.',
        '',
        '<Callout tipo="aviso">',
        '  Isso não funciona no Safari antigo, e tudo bem.',
        '</Callout>',
        '',
        'Com o componente pronto, dá para reaproveitar.',
      ].join('\n'),
    )
    expect(md).toBe(
      [
        'Neste post vamos montar um aviso.',
        '',
        'Isso não funciona no Safari antigo, e tudo bem.',
        '',
        'Com o componente pronto, dá para reaproveitar.',
      ].join('\n'),
    )
  })

  it('componentes aninhados, com atributos em várias linhas, e Markdown dentro', () => {
    const md = converter(
      [
        '<Tabs',
        '  padrao="npm"',
        '  rotulos={["npm", "pnpm"]}',
        '>',
        '  <Tab valor="npm">',
        '    ## Com npm',
        '',
        '    - `npm i -D husky`',
        '  </Tab>',
        '</Tabs>',
      ].join('\n'),
    )
    expect(md).toBe('#### Com npm\n\n- `npm i -D husky`')
  })

  it('componente sem texto some', () => {
    const md = converter(
      [
        'Antes.',
        '',
        '<YouTube id="dQw4w9WgXcQ" />',
        '<Mermaid chart="graph TD; A-->B;" />',
        '',
        'Depois.',
      ].join('\n'),
    )
    expect(md).toBe('Antes.\n\nDepois.')
  })

  it('componente no meio da frase vira o texto de dentro', () => {
    expect(
      converter('Aperte <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd>, e<br />pronto.'),
    ).toBe('Aperte Ctrl + C, e pronto.')
  })

  it('cerca de código dentro de componente fica inteira', () => {
    const md = converter(
      ['<Callout>', '  ```js', '  const a = {}', '  ```', '</Callout>'].join(
        '\n',
      ),
    )
    expect(md).toBe('```js\nconst a = {}\n```')
  })

  it('<img> com alt vira imagem do Markdown com URL absoluta; sem alt, some', () => {
    const md = converter(
      [
        '<img src="diagrama.png" alt="Diagrama da arquitetura" />',
        '',
        '<img src="/enfeite.png" alt="" />',
        '',
        '<Image src="https://cdn.exemplo.com/a.png" alt="Outra" width={200} />',
      ].join('\n'),
    )
    expect(md).toBe(
      [
        '![Diagrama da arquitetura](https://piluvitu.com.br/uploads/diagrama.png)',
        '',
        '![Outra](https://cdn.exemplo.com/a.png)',
      ].join('\n'),
    )
  })

  it('<a> vira link do Markdown com URL absoluta', () => {
    expect(converter('Veja o <a href="/tools/cpf">gerador de CPF</a>.')).toBe(
      'Veja o [gerador de CPF](https://piluvitu.com.br/tools/cpf).',
    )
  })
})

describe('markdownDoPost: links e imagens', () => {
  it('link relativo e âncora viram absolutos na origem do site', () => {
    expect(
      converter(
        'Leia [o outro post](/posts/outro), [a seção](#instalacao) e [o vizinho](vizinho "Título").',
      ),
    ).toBe(
      'Leia [o outro post](https://piluvitu.com.br/posts/outro), [a seção](https://piluvitu.com.br/posts/husky#instalacao) e [o vizinho](https://piluvitu.com.br/posts/vizinho "Título").',
    )
  })

  it('imagem do Markdown: relativa ganha o /uploads da página, colada no /uploads é corrigida, sem alt some', () => {
    const md = converter(
      [
        '![Diagrama da arquitetura nova](/imagens/arquitetura.png)',
        '',
        '![Capa](capa.png)',
        '',
        '![Do dev.to](/uploadshttps://dev-to-uploads.s3.amazonaws.com/a/x.png)',
        '',
        '![](enfeite.png)',
      ].join('\n'),
    )
    expect(md).toBe(
      [
        '![Diagrama da arquitetura nova](https://piluvitu.com.br/imagens/arquitetura.png)',
        '',
        '![Capa](https://piluvitu.com.br/uploads/capa.png)',
        '',
        '![Do dev.to](https://dev-to-uploads.s3.amazonaws.com/a/x.png)',
      ].join('\n'),
    )
  })

  it('link que não é http(s) fica só com o texto: nada de mailto, tel ou javascript', () => {
    expect(
      converter(
        'Fale [comigo](mailto:alguem@exemplo.com.br), [ligue](tel:+5586999990000) ou [clique](javascript:alert(1)).',
      ),
    ).toBe('Fale comigo, ligue ou clique.')
  })

  it('definição de referência relativa vira absoluta', () => {
    expect(converter('Veja [a doc][doc].\n\n[doc]: /tools "Ferramentas"')).toBe(
      'Veja [a doc][doc].\n\n[doc]: https://piluvitu.com.br/tools "Ferramentas"',
    )
  })

  it('definição com título entre aspas simples ou parênteses, ou destino entre <>', () => {
    expect(
      converter(
        [
          "[a]: /tools 'Ferramentas'",
          '[b]: /tasks (Kanban)',
          '[c]: </tools/json>',
        ].join('\n'),
      ),
    ).toBe(
      [
        "[a]: https://piluvitu.com.br/tools 'Ferramentas'",
        '[b]: https://piluvitu.com.br/tasks (Kanban)',
        '[c]: https://piluvitu.com.br/tools/json',
      ].join('\n'),
    )
  })

  // Pelo CommonMark, a definição acaba no destino ou no título: com mais texto
  // na linha, é parágrafo. E [^1]: é nota de rodapé do GFM (o remark-gfm está
  // ligado na página), não definição.
  it('nota de rodapé e parágrafo que começa com [rótulo]: ficam como estão', () => {
    const mdx = [
      'Texto com nota[^1] e outra[^2].',
      '',
      '[^1]: Nota de rodapé do autor.',
      '',
      '[^2]: /posts/outro',
      '',
      '[Atualização]: o post foi revisado em março.',
      '',
      '[Nota]: /posts/outro e mais texto',
      '',
      '[Título]: /posts/outro "título" e sobra',
    ].join('\n')
    expect(converter(mdx)).toBe(mdx)
  })

  it('definição dentro de citação e de item de lista vira absoluta', () => {
    expect(
      converter(
        [
          '> Veja [aqui][r].',
          '>',
          '> [r]: /posts/outro',
          '',
          '- Veja [aqui][s].',
          '- [s]: /posts/outro',
          '',
          '1. > [t]: /tools',
        ].join('\n'),
      ),
    ).toBe(
      [
        '> Veja [aqui][r].',
        '>',
        '> [r]: https://piluvitu.com.br/posts/outro',
        '',
        '- Veja [aqui][s].',
        '- [s]: https://piluvitu.com.br/posts/outro',
        '',
        '1. > [t]: https://piluvitu.com.br/tools',
      ].join('\n'),
    )
  })

  it('definição que não é http(s) sai, e a referência a ela fica só com o texto, como no link', () => {
    expect(
      converter(
        [
          'Fale [comigo][c], [clique][J ] ou [j]; veja [isto][] e ![logo][j].',
          '',
          '[c]: mailto:alguem@example.com',
          '[j]: javascript:alert(1) "t"',
          '> [isto]: tel:+5586999990000',
          '- [r]: mailto:outro@example.com',
          '',
          'Fim.',
        ].join('\n'),
      ),
    ).toBe('Fale comigo, clique ou j; veja isto e .\n\nFim.')
  })
})

// Revisão da Lupa no #105: o '<' que o conversor não reconhecia passava cru, e
// HTML com atributo sem aspas e autolinks do CommonMark chegavam inteiros ao
// llms-full.txt. Autolink só fica se for http(s), como os links; o resto vira
// texto, e todo '<' não reconhecido fora de código sai escapado.
describe('markdownDoPost: HTML cru e autolinks', () => {
  it('<img> com atributo sem aspas é tag: sem alt, some com o onerror', () => {
    expect(converter('Antes.\n\n<img src=x onerror=alert(1)>\n\nDepois.')).toBe(
      'Antes.\n\nDepois.',
    )
  })

  it('autolink javascript:, mailto: e tel: vira só texto', () => {
    expect(converter('Veja <javascript:alert(1)> aqui.')).toBe(
      'Veja javascript:alert(1) aqui.',
    )
    expect(converter('Escreva para <mailto:alguem@example.com>.')).toBe(
      'Escreva para mailto:alguem@example.com.',
    )
    expect(converter('Ligue <tel:+5586999990000>.')).toBe(
      'Ligue tel:+5586999990000.',
    )
  })

  it('autolink de e-mail sem esquema também vira só texto', () => {
    expect(converter('Ou <alguem@example.com>.')).toBe('Ou alguem@example.com.')
  })

  it('autolink http(s) fica como está', () => {
    const md = 'Site: <https://exemplo.com/a?b=1> e <http://exemplo.com>.'
    expect(converter(md)).toBe(md)
  })

  it('todo < não reconhecido fora de código sai escapado', () => {
    expect(converter('Se a < b e x <3, <!-- nota --> e <a b=> no fim <')).toBe(
      'Se a \\< b e x \\<3, \\<!-- nota --> e \\<a b=> no fim \\<',
    )
  })

  it('nenhum dos quatro exemplos sobra como HTML ou autolink', () => {
    const md = converter(
      [
        '<img src=x onerror=alert(1)>',
        '',
        '<javascript:alert(1)> <mailto:alguem@example.com> <tel:+5586999990000>',
      ].join('\n'),
    )
    expect(md).not.toMatch(/(^|[^\\])</)
    expect(md).not.toContain('onerror')
  })

  it('cerca e código inline ficam como estão, e link https também', () => {
    const md = [
      'Em `<img src=x onerror=alert(1)>` e `<javascript:alert(1)>` nada muda.',
      '',
      '```html',
      '<img src=x onerror=alert(1)>',
      '<mailto:alguem@example.com> <tel:+5586999990000> a < b',
      '```',
      '',
      'Veja o [site](https://exemplo.com/docs).',
    ].join('\n')
    expect(converter(md)).toBe(md)
  })
})

describe('markdownDoPost: títulos', () => {
  it('o maior título do corpo vira o primeiro nível pedido, e os outros acompanham até o 6', () => {
    const md = converter(
      ['# Um', '', '## Dois', '', '### Três', '', '#### Quatro'].join('\n'),
      4,
    )
    expect(md).toBe(
      [
        '#### Um',
        '',
        '##### Dois',
        '',
        '###### Três',
        '',
        '###### Quatro',
      ].join('\n'),
    )
  })

  it('título sublinhado (setext) vira título com #', () => {
    expect(converter('Título\n======\n\nSub\n---\n\nTexto.', 4)).toBe(
      '#### Título\n\n##### Sub\n\nTexto.',
    )
  })

  it('#hashtag não é título', () => {
    expect(converter('#hashtag no começo da linha')).toBe(
      '#hashtag no começo da linha',
    )
  })
})

describe('markdownDoPost: espaço', () => {
  it('quebra de linha do Windows, linhas em branco repetidas e bordas', () => {
    expect(converter('\r\n\r\nUm.\r\n\r\n\r\n\r\nDois.\r\n\r\n')).toBe(
      'Um.\n\nDois.',
    )
  })

  it('post vazio vira texto vazio', () => {
    expect(converter('')).toBe('')
    expect(converter("import x from 'y'\n")).toBe('')
  })
})
