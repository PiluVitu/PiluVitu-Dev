import { EMAIL_DA_PILUTECH, mailtoDaPilutech } from '@piluvitu/tools/contato'

export type Trecho =
  | string
  | { tipo: 'link'; texto: string; href: string }
  | { tipo: 'email' }
  | { tipo: 'codigo'; texto: string }

export type Paragrafo = readonly Trecho[]

export type SecaoDaPolitica = {
  titulo: string
  paragrafos: readonly Paragrafo[]
}

export const MAILTO_DA_PRIVACIDADE = mailtoDaPilutech('PiluVitu', 'Privacidade')

const EMAIL: Trecho = { tipo: 'email' }

export const POLITICA_DE_PRIVACIDADE: {
  titulo: string
  vigencia: { iso: string; texto: string }
  resumo: Paragrafo
  secoes: readonly SecaoDaPolitica[]
} = {
  titulo: 'Política de privacidade',
  vigencia: { iso: '2026-11-16', texto: '16 de novembro de 2026' },
  resumo: [
    'Em resumo: este é o site pessoal de Paulo Victor Torres Silva e não tem anúncios. Ele conta as visitas com o Vercel Web Analytics e o Cloudflare Web Analytics e mede a velocidade das páginas com o Vercel Speed Insights, sem cookie e sem identificar quem visita. A Cloudflare, que fica na frente do site, grava um cookie para separar pessoas de robôs. A votação de filmes, o Votaí, pede login com o Google para votar e grava um cookie para manter você conectado; o histórico das votações encerradas é público e só mostra contagens. O formulário de contato passa por um serviço de terceiros.',
  ],
  secoes: [
    {
      titulo: 'Quem é o responsável',
      paragrafos: [
        [
          'O site piluvitu.com.br é de Paulo Victor Torres Silva, em Teresina (PI), que responde pelo tratamento dos dados descritos aqui. Dúvidas e pedidos sobre os seus dados: ',
          EMAIL,
          '.',
        ],
        [
          'O responsável não vende dados, não os usa para publicidade e não os compartilha com mais ninguém, salvo por ordem judicial ou obrigação legal.',
        ],
      ],
    },
    {
      titulo: 'Estatísticas de visita',
      paragrafos: [
        [
          'Para ter uma visão geral do público, o site usa o Vercel Web Analytics, da mesma Vercel que o hospeda. A cada página vista, ele registra a página, a página de onde você veio, o país, a região e a cidade aproximados, o tipo de dispositivo, o sistema e o navegador, além de parâmetros do endereço filtrados pela Vercel. Ele não usa cookie: a visita é reconhecida por um código calculado a partir da requisição, descartado em 24 horas, e os relatórios só mostram números somados.',
        ],
        [
          'O Vercel Speed Insights mede a velocidade de cada carregamento (as Web Vitals), com a página, a velocidade da conexão, o navegador, o tipo e o sistema do dispositivo e o país, também sem cookie e sem identificar quem visita.',
        ],
        [
          'Ficam de fora da medição da Vercel a votação de filmes (o Votaí, em votai.piluvitu.com.br, com o histórico) e o painel de administração; a da Cloudflare vale para todas as páginas (veja "A Cloudflare na frente do site"). A base legal é o legítimo interesse do responsável em entender o uso do site (LGPD, art. 7º, IX). A Vercel trata esses dados em nome do responsável, e os números somados ficam no painel dela pelo prazo do plano (hoje, até 1 mês).',
        ],
      ],
    },
    {
      titulo: 'Registros da hospedagem',
      paragrafos: [
        [
          'O site é hospedado pela Vercel Inc., empresa dos Estados Unidos. Como em qualquer site, o servidor registra dados técnicos de cada acesso: endereço IP, navegador e sistema, página pedida, data e hora, e a cidade e o país aproximados a partir do IP. A Vercel trata esses registros em nome do responsável e pode processá-los fora do Brasil (veja a ',
          {
            tipo: 'link',
            texto: 'política de privacidade da Vercel',
            href: 'https://vercel.com/legal/privacy-policy',
          },
          ').',
        ],
        [
          'Esses registros só servem para manter o site no ar e seguro, por legítimo interesse (LGPD, art. 7º, IX), e não são cruzados com nada para identificar ninguém.',
        ],
      ],
    },
    {
      titulo: 'A Cloudflare na frente do site',
      paragrafos: [
        [
          'Os pedidos ao piluvitu.com.br e ao votai.piluvitu.com.br passam antes pela rede da Cloudflare, Inc., empresa dos Estados Unidos, que fica na frente da Vercel para entregar o site mais rápido e protegê-lo de ataques e robôs. Ela recebe cada pedido, com o endereço IP, o navegador e a página pedida, e trata esses dados em nome do responsável, principalmente nos Estados Unidos e no Espaço Econômico Europeu (veja a ',
          {
            tipo: 'link',
            texto: 'política de privacidade da Cloudflare',
            href: 'https://www.cloudflare.com/privacypolicy/',
          },
          ').',
        ],
        [
          'A Cloudflare também conta as visitas, com o Cloudflare Web Analytics, em todas as páginas, inclusive o Votaí e o painel de administração. Um script dela, de ',
          { tipo: 'codigo', texto: 'static.cloudflareinsights.com' },
          ', registra a cada página vista a página (sem os parâmetros do endereço), a página de onde você veio, o país, o tipo de dispositivo, o sistema, o navegador e os tempos de carregamento, e manda isso para a própria Cloudflare. Ele não usa cookie nem guarda nada no seu navegador, e a Cloudflare não identifica quem visita pelo endereço IP nem pelo navegador. Os dados completos ficam 7 dias; depois sobra uma amostra, por até 6 meses.',
        ],
        [
          'Para separar pessoas de robôs, a Cloudflare põe em cada página um teste invisível em JavaScript, de ',
          { tipo: 'codigo', texto: '/cdn-cgi/challenge-platform' },
          '. O resultado fica no cookie ',
          { tipo: 'codigo', texto: 'cf_clearance' },
          ', que ela grava no domínio piluvitu.com.br: ele guarda só a prova de que o teste passou, o site não o usa para mais nada, e vale por 1 ano. Pelos mesmos recursos contra robôs, a Cloudflare pode gravar também o cookie ',
          { tipo: 'codigo', texto: '__cf_bm' },
          ', que expira depois de 30 minutos sem uso.',
        ],
        [
          'A Cloudflare ainda esconde dos robôs os endereços de e-mail escritos na página (um script dela os mostra no seu navegador), indica ao navegador páginas que ele pode carregar antes de você clicar e pede que ele avise quando um pedido ao site falhar (o Network Error Logging). Esse aviso descreve a falha de rede, e a Cloudflare diz que não guarda o seu IP nele.',
        ],
        [
          'A base legal é o legítimo interesse do responsável em manter o site no ar, rápido e protegido, e em entender o uso (LGPD, art. 7º, IX).',
        ],
      ],
    },
    {
      titulo: 'Votação de filmes',
      paragrafos: [
        [
          'A votação de filmes, o Votaí, fica em votai.piluvitu.com.br. Ela é de um grupo de amigos e pede login com o Google para votar. Os dados ficam num serviço à parte, em ramielle.piluvitu.com.br, hospedado pela Cloudflare, Inc., empresa dos Estados Unidos, que trata os dados em nome do responsável e pode processá-los fora do Brasil. O login em si é feito pelo Google, que segue a própria política de privacidade.',
        ],
        [
          'Ao entrar, o serviço guarda o identificador do Google, o nome, o e-mail, a foto e os tokens de acesso que o Google entrega no login; a cada voto, guarda a sessão de votação, o filme e a data. Para manter você conectado, guarda também um registro do acesso com o endereço IP e o navegador, e grava o cookie ',
          { tipo: 'codigo', texto: '__Secure-better-auth.session_token' },
          ', só no endereço desse serviço (ramielle.piluvitu.com.br). Ele dura 7 dias, renovados enquanto você usa a votação. Sair apaga o cookie. Durante o login, um cookie temporário confere que a resposta veio mesmo do Google.',
        ],
        [
          'Você vê os seus votos e o resultado somado. Só o administrador vê quem votou em quê e a lista de participantes.',
        ],
        [
          'As votações encerradas ficam públicas, sem login, em votai.piluvitu.com.br/anteriores: o título, a data, os filmes, a contagem de votos de cada filme, o vencedor (inclusive o sorteado na roleta) e o número de participantes. O histórico não mostra quem votou nem em quê, e nenhum nome, e-mail ou foto de quem participou.',
        ],
        [
          'A base legal é a execução do serviço que você pede ao entrar (LGPD, art. 7º, V). Os dados ficam enquanto a votação existir, e o responsável apaga os seus quando você pedir. As cópias de segurança do serviço, as 30 mais recentes, ficam no computador do responsável.',
        ],
      ],
    },
    {
      titulo: 'Formulário de contato',
      paragrafos: [
        [
          'O formulário de contato envia o nome, o e-mail, o assunto e a mensagem que você escrever pelo FormSubmit (formsubmit.co), que os encaminha para o e-mail do responsável, hospedado pelo Google (Gmail). Antes do envio, o reCAPTCHA do Google confere que quem escreve não é um robô. Cada serviço segue a própria política de privacidade.',
        ],
        [
          'Esses dados servem só para responder (LGPD, art. 7º, V) e ficam enquanto a conversa for útil; você pode pedir para apagar a qualquer momento.',
        ],
      ],
    },
    {
      titulo: 'Conteúdo de outros sites',
      paragrafos: [
        [
          'A lista de artigos vem da API do dev.to, chamada direto do seu navegador, e alguns logos e capas são carregados dos sites de origem. Nesses pedidos, esses serviços recebem o seu endereço IP e o seu navegador, como em qualquer acesso, e seguem as próprias políticas de privacidade.',
        ],
      ],
    },
    {
      titulo: 'O que fica só no seu navegador',
      paragrafos: [
        [
          'O site guarda no seu navegador, sem enviar para lugar nenhum: o tema claro ou escuro que você escolher e o quadro do /tasks, que funciona sem internet. As ferramentas do /tools rodam no seu navegador, e a câmera do leitor de QR e da roleta é usada só no seu aparelho: nenhuma imagem sai dele.',
        ],
      ],
    },
    {
      titulo: 'Seus direitos',
      paragrafos: [
        [
          'A Lei Geral de Proteção de Dados (LGPD, art. 18) garante a você, sobre os dados pessoais que o responsável tiver: a confirmação de que eles são tratados e o acesso a eles; a correção; a anonimização, o bloqueio ou a eliminação do que for desnecessário ou tratado em desacordo com a lei; a portabilidade; a informação de com quem são compartilhados; e a oposição a um tratamento feito por legítimo interesse que descumpra a lei.',
        ],
        [
          'Para pedir, escreva para ',
          EMAIL,
          '. A resposta vem em até 15 dias, e pode ser preciso confirmar que o pedido é seu. Se achar que não foi resolvido, você pode reclamar à ',
          {
            tipo: 'link',
            texto: 'Autoridade Nacional de Proteção de Dados (ANPD)',
            href: 'https://www.gov.br/anpd/pt-br',
          },
          '.',
        ],
      ],
    },
    {
      titulo: 'Mudanças nesta política',
      paragrafos: [
        [
          'Quando esta política mudar, a data no topo muda junto, e a mudança vale a partir dela.',
        ],
      ],
    },
  ],
}

export function textoDoTrecho(trecho: Trecho): string {
  if (typeof trecho === 'string') return trecho
  return trecho.tipo === 'email' ? EMAIL_DA_PILUTECH : trecho.texto
}

export function textoDoParagrafo(paragrafo: Paragrafo): string {
  return paragrafo.map(textoDoTrecho).join('')
}
