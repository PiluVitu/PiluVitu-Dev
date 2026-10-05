import { faBrain } from '@fortawesome/free-solid-svg-icons'
import { MENSAGENS_DO_WHATSAPP, WHATSAPP } from './contato'
import {
  BOTAI,
  cartoesDosProjetos,
  DUVIDAS,
  ETAPAS,
  LINHAS_DO_TERMINAL,
  PLANOS,
  SECOES_DA_BARRA,
  seloDoProjeto,
  SERVICOS,
  SOMBRAI,
  TECNOLOGIAS,
} from './conteudo'

const SEM_DUVIDAS = [
  SECOES_DA_BARRA,
  LINHAS_DO_TERMINAL,
  SERVICOS.map((servico) => ({ ...servico, icone: undefined })),
  ETAPAS,
  BOTAI,
  SOMBRAI,
  TECNOLOGIAS,
  PLANOS,
]
const TODOS_OS_TEXTOS = JSON.stringify([...SEM_DUVIDAS, DUVIDAS])

describe('conteúdo do design', () => {
  it('a barra leva às 5 seções, na ordem do design', () => {
    expect(SECOES_DA_BARRA.map((s) => `${s.rotulo}#${s.id}`)).toEqual([
      'Serviços#servicos',
      'Como funciona#como-funciona',
      'Projetos#projetos',
      'Planos#planos',
      'Dúvidas#duvidas',
    ])
  })

  it('o terminal lista os serviços na ordem do foco: infraestrutura, IA e o resto', () => {
    expect(LINHAS_DO_TERMINAL).toEqual([
      'provisionamento de infraestrutura',
      'orçamento de infraestrutura',
      'implementação de IA sob medida',
      'criação e manutenção de aplicativos',
      'desenvolvimento fullstack',
    ])
  })

  it('4 serviços, 4 etapas, 3 grupos de tecnologia, 3 planos e 5 dúvidas, na ordem', () => {
    expect(SERVICOS.map((s) => `${s.area}: ${s.titulo}`)).toEqual([
      'Infraestrutura: Provisionamento e orçamento',
      'Inteligência artificial: IA sob medida',
      'Aplicativos: Criação e manutenção',
      'Fullstack: Desenvolvimento sob medida',
    ])
    expect(ETAPAS.map((e) => e.titulo)).toEqual([
      'Conversa',
      'Proposta',
      'Desenvolvimento',
      'Entrega e acompanhamento',
    ])
    expect(TECNOLOGIAS.map((g) => g.grupo)).toEqual([
      'Front-end',
      'Back-end',
      'Infraestrutura',
    ])
    expect(PLANOS.map((p) => p.nome)).toEqual([
      'Essencial',
      'Evolução',
      'Infraestrutura',
    ])
    expect(DUVIDAS.map((d) => d.pergunta)).toEqual([
      'Quanto custa um aplicativo?',
      'Você assume um aplicativo que outra pessoa fez?',
      'Como funciona o orçamento de infraestrutura?',
      'O atendimento é só em Teresina?',
      'A PiluTech ainda faz manutenção de computadores e impressoras?',
    ])
  })

  it('cada serviço tem 3 itens e um nome completo para o JSON-LD', () => {
    for (const servico of SERVICOS) expect(servico.itens).toHaveLength(3)
    expect(SERVICOS.map((s) => s.nome)).toEqual([
      'Provisionamento e orçamento de infraestrutura',
      'Implementação de IA sob medida',
      'Criação e manutenção de aplicativos',
      'Desenvolvimento fullstack sob medida',
    ])
  })

  it('o cartão de IA logo depois do de infraestrutura, com o ícone do cérebro', () => {
    expect(SERVICOS[1]).toEqual({
      area: 'Inteligência artificial',
      titulo: 'IA sob medida',
      nome: 'Implementação de IA sob medida',
      texto:
        'Assistentes, automações e buscas com IA ajustados aos seus dados e processos, com modelos na nuvem ou rodando no seu próprio servidor.',
      itens: [
        'Assistentes que respondem com os seus documentos',
        'Automação de tarefas com modelos de linguagem',
        'Modelos locais para dados sensíveis',
      ],
      icone: faBrain,
    })
  })

  it('os outros três cartões mantêm os textos e os ícones', () => {
    expect(
      SERVICOS.filter((s) => s.area !== 'Inteligência artificial').map((s) => [
        s.texto,
        s.itens,
        s.icone.iconName,
      ]),
    ).toEqual([
      [
        'Servidores, banco de dados, rede e monitoramento configurados como código, com o custo mensal estimado antes de contratar.',
        [
          'Infraestrutura como código',
          'Custo estimado por item',
          'Monitoramento e alertas',
        ],
        'server',
      ],
      [
        'Aplicativos web e mobile do protótipo à publicação, e manutenção contínua depois do lançamento.',
        ['Web e mobile', 'Publicação nas lojas', 'Correções e atualizações'],
        'mobile-screen',
      ],
      [
        'Front-end, back-end e integrações para sistemas internos, painéis e APIs.',
        [
          'APIs e integrações',
          'Painéis e sistemas internos',
          'Modelagem de banco de dados',
        ],
        'layer-group',
      ],
    ])
  })

  it('cada plano pede proposta com a mensagem dele no WhatsApp', () => {
    expect(PLANOS.map((p) => p.whatsapp)).toEqual([
      WHATSAPP.essencial,
      WHATSAPP.evolucao,
      WHATSAPP.infraestrutura,
    ])
    expect(new URL(PLANOS[1].whatsapp).searchParams.get('text')).toBe(
      MENSAGENS_DO_WHATSAPP.evolucao,
    )
  })
})

describe('regras da marca (marca-CLAUDE.md)', () => {
  it('nenhum emoji', () => {
    expect(TODOS_OS_TEXTOS).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  // Nunca anunciar manutenção de computadores e impressoras: a única menção é a dúvida que diz que não.
  it('computadores e impressoras só aparecem na dúvida que responde "Não."', () => {
    expect(JSON.stringify(SEM_DUVIDAS)).not.toMatch(/computador|impressora/i)
    const mencoes = DUVIDAS.filter((d) =>
      /computador|impressora/i.test(d.pergunta + d.resposta),
    )
    expect(mencoes).toHaveLength(1)
    expect(mencoes[0].resposta).toMatch(/^Não\./)
  })

  it('nenhum texto fixo diz "disponível"', () => {
    expect(TODOS_OS_TEXTOS).not.toMatch(/dispon[ií]vel/i)
  })
})

describe('projetos', () => {
  it('sem loja publicada, os dois selos dizem em breve', () => {
    expect(cartoesDosProjetos('em-breve').map((c) => c.selo)).toEqual([
      'Extensão de navegador · em breve',
      'App Android e iPhone · em breve',
    ])
  })

  // O Sombraí não tem fonte de fase (o CMS só guarda lojas de extensão): fica em breve.
  it('com o Botaí publicado, só o selo dele muda', () => {
    expect(cartoesDosProjetos('disponivel').map((c) => c.selo)).toEqual([
      'Extensão de navegador · disponível',
      'App Android e iPhone · em breve',
    ])
  })

  it('o selo é o tipo e a fase', () => {
    expect(seloDoProjeto({ tipo: 'X' }, 'em-breve')).toBe('X · em breve')
  })

  it('cada cartão leva ao domínio do produto', () => {
    expect(cartoesDosProjetos('em-breve').map((c) => c.url)).toEqual([
      'https://botai.pilutech.com.br/',
      'https://sombrai.pilutech.com.br/',
    ])
  })

  it('as imagens são as OG dos domínios, sem o parâmetro de hash', () => {
    expect(BOTAI.imagem.src).toBe(
      'https://botai.pilutech.com.br/opengraph-image',
    )
    expect(SOMBRAI.imagem.src).toBe(
      'https://sombrai.pilutech.com.br/opengraph-image.png',
    )
    for (const projeto of [BOTAI, SOMBRAI])
      expect(new URL(projeto.imagem.src).search).toBe('')
  })
})
