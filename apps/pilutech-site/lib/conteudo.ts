import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faBrain,
  faLayerGroup,
  faMobileScreen,
  faServer,
} from '@fortawesome/free-solid-svg-icons'
import type { Fase } from '@piluvitu/tools/pilulabs'
import { WHATSAPP } from './contato'

export const SECOES_DA_BARRA = [
  { id: 'servicos', rotulo: 'Serviços' },
  { id: 'como-funciona', rotulo: 'Como funciona' },
  { id: 'projetos', rotulo: 'Projetos' },
  { id: 'planos', rotulo: 'Planos' },
  { id: 'duvidas', rotulo: 'Dúvidas' },
] as const

export const LINHAS_DO_TERMINAL = [
  'provisionamento de infraestrutura',
  'orçamento de infraestrutura',
  'implementação de IA sob medida',
  'criação e manutenção de aplicativos',
  'desenvolvimento fullstack',
] as const

export type Servico = {
  area: string
  titulo: string
  nome: string
  texto: string
  itens: readonly string[]
  icone: IconDefinition
}

export const SERVICOS: readonly Servico[] = [
  {
    area: 'Infraestrutura',
    titulo: 'Provisionamento e orçamento',
    nome: 'Provisionamento e orçamento de infraestrutura',
    texto:
      'Servidores, banco de dados, rede e monitoramento configurados como código, com o custo mensal estimado antes de contratar.',
    itens: [
      'Infraestrutura como código',
      'Custo estimado por item',
      'Monitoramento e alertas',
    ],
    icone: faServer,
  },
  {
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
  },
  {
    area: 'Aplicativos',
    titulo: 'Criação e manutenção',
    nome: 'Criação e manutenção de aplicativos',
    texto:
      'Aplicativos web e mobile do protótipo à publicação, e manutenção contínua depois do lançamento.',
    itens: ['Web e mobile', 'Publicação nas lojas', 'Correções e atualizações'],
    icone: faMobileScreen,
  },
  {
    area: 'Fullstack',
    titulo: 'Desenvolvimento sob medida',
    nome: 'Desenvolvimento fullstack sob medida',
    texto:
      'Front-end, back-end e integrações para sistemas internos, painéis e APIs.',
    itens: [
      'APIs e integrações',
      'Painéis e sistemas internos',
      'Modelagem de banco de dados',
    ],
    icone: faLayerGroup,
  },
]

export type Etapa = { titulo: string; texto: string }

export const ETAPAS: readonly Etapa[] = [
  {
    titulo: 'Conversa',
    texto: 'Você explica pelo WhatsApp o que precisa. Sem formulário longo.',
  },
  {
    titulo: 'Proposta',
    texto:
      'Escopo, prazo e valor por escrito, com o custo mensal estimado da infraestrutura.',
  },
  {
    titulo: 'Desenvolvimento',
    texto: 'Entregas por etapa, com um ambiente de teste para você acompanhar.',
  },
  {
    titulo: 'Entrega e acompanhamento',
    texto:
      'Publicação em produção, documentação e, se quiser, um plano de manutenção.',
  },
]

export type Projeto = {
  nome: string
  url: string
  endereco: string
  tipo: string
  texto: string
  imagem: { src: string; alt: string }
}

export const BOTAI: Projeto = {
  nome: 'Botaí',
  url: 'https://botai.pilutech.com.br/',
  endereco: 'botai.pilutech.com.br',
  tipo: 'Extensão de navegador',
  texto:
    'Gera uma pessoa brasileira de teste com CPF e CNPJ válidos e CEP real com endereço, e preenche o formulário com um atalho. Para Chrome, Firefox, Edge e Opera.',
  imagem: {
    src: 'https://botai.pilutech.com.br/opengraph-image',
    alt: 'Botaí: gerador de dados fake para formulários',
  },
}

export const SOMBRAI: Projeto = {
  nome: 'Sombraí',
  url: 'https://sombrai.pilutech.com.br/',
  endereco: 'sombrai.pilutech.com.br',
  tipo: 'App Android e iPhone',
  texto:
    'Mostra quais árvores e plantas nativas do Piauí cabem no quintal, na calçada, na varanda ou no vaso em Teresina, e como cuidar delas no clima daqui.',
  imagem: {
    src: 'https://sombrai.pilutech.com.br/opengraph-image.png',
    alt: 'O ícone do Sombraí e a tela Início do app',
  },
}

export function seloDoProjeto(
  projeto: Pick<Projeto, 'tipo'>,
  fase: Fase,
): string {
  return `${projeto.tipo} · ${fase === 'disponivel' ? 'disponível' : 'em breve'}`
}

export type CartaoDeProjeto = Projeto & { selo: string }

export function cartoesDosProjetos(faseDoBotai: Fase): CartaoDeProjeto[] {
  return [
    { ...BOTAI, selo: seloDoProjeto(BOTAI, faseDoBotai) },
    { ...SOMBRAI, selo: seloDoProjeto(SOMBRAI, 'em-breve') },
  ]
}

export const TECNOLOGIAS = [
  {
    grupo: 'Infraestrutura',
    itens: [
      'Docker',
      'Kubernetes',
      'Terraform',
      'AWS',
      'Cloudflare',
      'GitHub Actions',
    ],
  },
  { grupo: 'IA', itens: ['OpenAI', 'Claude', 'Ollama', 'Whisper', 'RAG'] },
  { grupo: 'Back-end', itens: ['Go', 'Node.js', 'Python', 'PostgreSQL'] },
  {
    grupo: 'Front-end',
    itens: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
  },
] as const

export type Plano = {
  nome: string
  para: string
  itens: readonly string[]
  whatsapp: string
}

export const PLANOS: readonly Plano[] = [
  {
    nome: 'Infraestrutura',
    para: 'Para quem quer alguém cuidando da nuvem.',
    itens: [
      'Revisão mensal de custos',
      'Ajuste de capacidade',
      'Alertas e resposta a incidentes',
      'Atualização dos servidores',
    ],
    whatsapp: WHATSAPP.infraestrutura,
  },
  {
    nome: 'IA',
    para: 'Para quem já usa IA no dia a dia.',
    itens: [
      'Acompanhamento do custo e do uso dos modelos',
      'Ajuste das respostas e das instruções',
      'Atualização dos modelos e da base de documentos',
      'Relatório mensal do que foi feito',
    ],
    whatsapp: WHATSAPP.ia,
  },
  {
    nome: 'Essencial',
    para: 'Para manter o app no ar e seguro.',
    itens: [
      'Correção de bugs',
      'Atualização de dependências e segurança',
      'Monitoramento de disponibilidade',
      'Backup verificado',
    ],
    whatsapp: WHATSAPP.essencial,
  },
  {
    nome: 'Evolução',
    para: 'Para quem continua lançando funcionalidades.',
    itens: [
      'Tudo do Essencial',
      'Horas mensais para novas funcionalidades',
      'Relatório mensal do que foi feito',
      'Prioridade no atendimento',
    ],
    whatsapp: WHATSAPP.evolucao,
  },
]

export type Duvida = { pergunta: string; resposta: string }

export const DUVIDAS: readonly Duvida[] = [
  {
    pergunta: 'Quanto custa um aplicativo?',
    resposta:
      'Depende do escopo. Depois da conversa inicial você recebe uma proposta por escrito com o que será feito, o prazo e o valor, além do custo mensal estimado da infraestrutura.',
  },
  {
    pergunta: 'Você assume um aplicativo que outra pessoa fez?',
    resposta:
      'Sim. O trabalho começa com uma análise do código e da infraestrutura atuais, e a proposta lista o que precisa ser corrigido antes de seguir.',
  },
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
  {
    pergunta: 'O atendimento é só em Teresina?',
    resposta: 'Não. O atendimento é remoto e vale para todo o Brasil.',
  },
  {
    pergunta: 'A PiluTech ainda faz manutenção de computadores e impressoras?',
    resposta:
      'Não. A PiluTech atende apenas infraestrutura, IA, aplicativos e desenvolvimento de software.',
  },
]
