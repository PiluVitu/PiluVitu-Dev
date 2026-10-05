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
      'criação e implementação de IA personalizada',
      'criação e manutenção de aplicativos',
      'desenvolvimento fullstack',
    ])
  })

  it('4 serviços, 4 etapas, 4 grupos de tecnologia, 4 planos e 7 dúvidas, na ordem', () => {
    expect(SERVICOS.map((s) => `${s.area}: ${s.titulo}`)).toEqual([
      'Infraestrutura: Provisionamento e orçamento',
      'Inteligência artificial: IA personalizada',
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
      'Infraestrutura',
      'IA',
      'Back-end',
      'Front-end',
    ])
    expect(PLANOS.map((p) => p.nome)).toEqual([
      'Infraestrutura',
      'IA',
      'Essencial',
      'Evolução',
    ])
    expect(DUVIDAS.map((d) => d.pergunta)).toEqual([
      'Quanto custa um aplicativo?',
      'Você assume um aplicativo que outra pessoa fez?',
      'Como funciona o orçamento de infraestrutura?',
      'Meus dados ficam seguros com IA?',
      'Quanto custa usar IA no dia a dia?',
      'O atendimento é só em Teresina?',
      'A PiluTech ainda faz manutenção de computadores e impressoras?',
    ])
  })

  it('cada serviço tem 3 itens e um nome completo para o JSON-LD', () => {
    for (const servico of SERVICOS) expect(servico.itens).toHaveLength(3)
    expect(SERVICOS.map((s) => s.nome)).toEqual([
      'Provisionamento e orçamento de infraestrutura',
      'Criação e implementação de IA personalizada',
      'Criação e manutenção de aplicativos',
      'Desenvolvimento fullstack sob medida',
    ])
  })

  it('o cartão de IA logo depois do de infraestrutura, com o ícone do cérebro', () => {
    expect(SERVICOS[1]).toEqual({
      area: 'Inteligência artificial',
      titulo: 'IA personalizada',
      nome: 'Criação e implementação de IA personalizada',
      texto:
        'Criação de assistentes, agentes e automações com IA para os seus dados e processos, com modelos na nuvem ou rodando no seu próprio servidor.',
      itens: [
        'Modelos treinados com os dados da sua empresa',
        'Assistentes que respondem com os seus documentos',
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
      WHATSAPP.infraestrutura,
      WHATSAPP.ia,
      WHATSAPP.essencial,
      WHATSAPP.evolucao,
    ])
    expect(new URL(PLANOS[3].whatsapp).searchParams.get('text')).toBe(
      MENSAGENS_DO_WHATSAPP.evolucao,
    )
  })

  it('o plano de IA logo depois do de infraestrutura', () => {
    expect(PLANOS[1]).toEqual({
      nome: 'IA',
      para: 'Para quem já usa IA no dia a dia.',
      itens: [
        'Acompanhamento do custo e do uso dos modelos',
        'Ajuste das respostas e das instruções',
        'Novo treino dos modelos com os dados mais recentes',
        'Atualização dos modelos e da base de documentos',
        'Relatório mensal do que foi feito',
      ],
      whatsapp: WHATSAPP.ia,
    })
    expect(new URL(PLANOS[1].whatsapp).searchParams.get('text')).toBe(
      'Olá! Quero uma proposta do plano de IA.',
    )
  })

  it('os outros três planos mantêm os textos', () => {
    expect(
      PLANOS.filter((p) => p.nome !== 'IA').map((p) => [p.para, p.itens]),
    ).toEqual([
      [
        'Para quem quer alguém cuidando da nuvem.',
        [
          'Revisão mensal de custos',
          'Ajuste de capacidade',
          'Alertas e resposta a incidentes',
          'Atualização dos servidores',
        ],
      ],
      [
        'Para manter o app no ar e seguro.',
        [
          'Correção de bugs',
          'Atualização de dependências e segurança',
          'Monitoramento de disponibilidade',
          'Backup verificado',
        ],
      ],
      [
        'Para quem continua lançando funcionalidades.',
        [
          'Tudo do Essencial',
          'Horas mensais para novas funcionalidades',
          'Relatório mensal do que foi feito',
          'Prioridade no atendimento',
        ],
      ],
    ])
  })

  it('o grupo de IA logo depois do de infraestrutura, e os outros com as mesmas ferramentas', () => {
    expect(TECNOLOGIAS.map((g) => [g.grupo, g.itens])).toEqual([
      [
        'Infraestrutura',
        [
          'Docker',
          'Kubernetes',
          'Terraform',
          'AWS',
          'Cloudflare',
          'GitHub Actions',
        ],
      ],
      ['IA', ['OpenAI', 'Claude', 'Ollama', 'Whisper', 'RAG']],
      ['Back-end', ['Go', 'Node.js', 'Python', 'PostgreSQL']],
      ['Front-end', ['React', 'Next.js', 'TypeScript', 'Tailwind CSS']],
    ])
  })

  it('as duas dúvidas de IA logo depois da do orçamento de infraestrutura', () => {
    expect(DUVIDAS.slice(2, 5)).toEqual([
      {
        pergunta: 'Como funciona o orçamento de infraestrutura?',
        resposta:
          'É feito um levantamento do uso esperado e cada item recebe uma estimativa de custo: servidores, banco de dados, armazenamento, rede e monitoramento. Quando faz sentido, a comparação inclui mais de um provedor.',
      },
      {
        pergunta: 'Meus dados ficam seguros com IA?',
        resposta:
          'Dá para usar modelos que rodam no seu próprio servidor, sem mandar dados para fora. Quando o modelo é na nuvem, a proposta diz qual provedor recebe os dados e como eles são tratados.',
      },
      {
        pergunta: 'Quanto custa usar IA no dia a dia?',
        resposta:
          'Depende do volume e do modelo. A proposta estima o custo mensal do uso, seja por consumo do modelo ou pelo servidor, junto com o da infraestrutura.',
      },
    ])
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

  // A resposta lista o que a PiluTech atende: sem a IA, contradiria o cartão 02 dos Serviços.
  it('a dúvida dos computadores lista os serviços na ordem dos cartões, com a IA', () => {
    const resposta = DUVIDAS.find((d) =>
      /computador/i.test(d.pergunta),
    )?.resposta
    expect(resposta).toBe(
      'Não. A PiluTech atende apenas infraestrutura, IA, aplicativos e desenvolvimento de software.',
    )
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
