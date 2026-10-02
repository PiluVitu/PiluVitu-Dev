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

  it('o terminal lista os 5 serviços do design', () => {
    expect(LINHAS_DO_TERMINAL).toEqual([
      'criação de aplicativos',
      'manutenção de aplicativos',
      'provisionamento de infraestrutura',
      'orçamento de infraestrutura',
      'desenvolvimento fullstack',
    ])
  })

  it('3 serviços, 4 etapas, 3 grupos de tecnologia, 3 planos e 5 dúvidas, na ordem', () => {
    expect(SERVICOS.map((s) => `${s.area}: ${s.titulo}`)).toEqual([
      'Aplicativos: Criação e manutenção',
      'Infraestrutura: Provisionamento e orçamento',
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
      'Criação e manutenção de aplicativos',
      'Provisionamento e orçamento de infraestrutura',
      'Desenvolvimento fullstack sob medida',
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
