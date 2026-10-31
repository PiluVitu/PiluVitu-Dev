import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { EMAIL_DA_PILUTECH, mailtoDaPilutech } from '@piluvitu/tools/contato'
import { PageTopBar } from '@/components/page-top-bar'
import { metadataDaPagina } from '@/lib/pilulabs'

const VIGENCIA = { iso: '2026-10-26', texto: '26 de outubro de 2026' }
const MAILTO_DA_PRIVACIDADE = mailtoDaPilutech('PiluVitu', 'Privacidade')
const POLITICA_DA_VERCEL = 'https://vercel.com/legal/privacy-policy'
const ANPD = 'https://www.gov.br/anpd/pt-br'
const ABRE_EM_ABA_NOVA = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const
const LINK = 'text-primary font-medium underline underline-offset-4'

export const metadata: Metadata = metadataDaPagina({
  caminho: '/privacidade',
  titulo: 'Política de privacidade | Paulo Victor Torres Silva',
  descricao:
    'O que o piluvitu.com.br registra: estatísticas de visita sem cookie, o login da votação de filmes, o formulário de contato e os seus direitos na LGPD.',
})

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold tracking-tight">{titulo}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Email() {
  return (
    <a href={MAILTO_DA_PRIVACIDADE} className={`${LINK} wrap-anywhere`}>
      {EMAIL_DA_PILUTECH}
    </a>
  )
}

function Codigo({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted rounded px-1 font-mono text-[0.9em] wrap-anywhere">
      {children}
    </code>
  )
}

export default function PrivacidadePage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8 sm:px-8 xl:py-10">
      <PageTopBar backHref="/" backLabel="Paulo Victor" />

      <article className="mt-10 max-w-3xl leading-relaxed">
        <h1 className="text-4xl font-bold tracking-tight">
          Política de privacidade
        </h1>
        <p className="text-muted-foreground mt-3 font-mono text-sm">
          Em vigor desde <time dateTime={VIGENCIA.iso}>{VIGENCIA.texto}</time>
        </p>
        <p className="mt-8">
          Em resumo: este é o site pessoal de Paulo Victor Torres Silva e não
          tem anúncios. Ele conta as visitas com o Vercel Web Analytics e mede a
          velocidade das páginas com o Vercel Speed Insights, sem cookie e sem
          identificar quem visita. A votação de filmes, o Votaí, pede login com
          o Google para votar e grava um cookie para manter você conectado; o
          histórico das votações encerradas é público e só mostra contagens. O
          formulário de contato passa por um serviço de terceiros.
        </p>

        <Secao titulo="Quem é o responsável">
          <p>
            O site piluvitu.com.br é de Paulo Victor Torres Silva, em Teresina
            (PI), que responde pelo tratamento dos dados descritos aqui. Dúvidas
            e pedidos sobre os seus dados: <Email />.
          </p>
          <p>
            O responsável não vende dados, não os usa para publicidade e não os
            compartilha com mais ninguém, salvo por ordem judicial ou obrigação
            legal.
          </p>
        </Secao>

        <Secao titulo="Estatísticas de visita">
          <p>
            Para ter uma visão geral do público, o site usa o Vercel Web
            Analytics, da mesma Vercel que o hospeda. A cada página vista, ele
            registra a página, a página de onde você veio, o país, a região e a
            cidade aproximados, o tipo de dispositivo, o sistema e o navegador,
            além de parâmetros do endereço filtrados pela Vercel. Ele não usa
            cookie: a visita é reconhecida por um código calculado a partir da
            requisição, descartado em 24 horas, e os relatórios só mostram
            números somados.
          </p>
          <p>
            O Vercel Speed Insights mede a velocidade de cada carregamento (as
            Web Vitals), com a página, a velocidade da conexão, o navegador, o
            tipo e o sistema do dispositivo e o país, também sem cookie e sem
            identificar quem visita.
          </p>
          <p>
            Ficam de fora da medição a votação de filmes (o Votaí, em
            votai.piluvitu.com.br, com o histórico) e o painel de administração.
            A base legal é o legítimo interesse do responsável em entender o uso
            do site (LGPD, art. 7º, IX). A Vercel trata esses dados em nome do
            responsável, e os números somados ficam no painel dela pelo prazo do
            plano (hoje, até 1 mês).
          </p>
        </Secao>

        <Secao titulo="Registros da hospedagem">
          <p>
            O site é hospedado pela Vercel Inc., empresa dos Estados Unidos.
            Como em qualquer site, o servidor registra dados técnicos de cada
            acesso: endereço IP, navegador e sistema, página pedida, data e
            hora, e a cidade e o país aproximados a partir do IP. A Vercel trata
            esses registros em nome do responsável e pode processá-los fora do
            Brasil (veja a{' '}
            <a href={POLITICA_DA_VERCEL} className={LINK} {...ABRE_EM_ABA_NOVA}>
              política de privacidade da Vercel
            </a>
            ).
          </p>
          <p>
            Esses registros só servem para manter o site no ar e seguro, por
            legítimo interesse (LGPD, art. 7º, IX), e não são cruzados com nada
            para identificar ninguém.
          </p>
        </Secao>

        <Secao titulo="Votação de filmes">
          <p>
            A votação de filmes, o Votaí, fica em votai.piluvitu.com.br. Ela é
            de um grupo de amigos e pede login com o Google para votar. Os dados
            ficam num serviço à parte, em ramielle.piluvitu.com.br, hospedado
            pela Cloudflare, Inc., empresa dos Estados Unidos, que trata os
            dados em nome do responsável e pode processá-los fora do Brasil. O
            login em si é feito pelo Google, que segue a própria política de
            privacidade.
          </p>
          <p>
            Ao entrar, o serviço guarda o identificador do Google, o nome, o
            e-mail, a foto e os tokens de acesso que o Google entrega no login;
            a cada voto, guarda a sessão de votação, o filme e a data. Para
            manter você conectado, guarda também um registro do acesso com o
            endereço IP e o navegador, e grava o cookie{' '}
            <Codigo>__Secure-better-auth.session_token</Codigo>, só no endereço
            desse serviço (ramielle.piluvitu.com.br). Ele dura 7 dias, renovados
            enquanto você usa a votação. Sair apaga o cookie. Durante o login,
            um cookie temporário confere que a resposta veio mesmo do Google.
          </p>
          <p>
            Você vê os seus votos e o resultado somado. Só o administrador vê
            quem votou em quê e a lista de participantes.
          </p>
          <p>
            As votações encerradas ficam públicas, sem login, em
            votai.piluvitu.com.br/anteriores: o título, a data, os filmes, a
            contagem de votos de cada filme, o vencedor (inclusive o sorteado na
            roleta) e o número de participantes. O histórico não mostra quem
            votou nem em quê, e nenhum nome, e-mail ou foto de quem participou.
          </p>
          <p>
            A base legal é a execução do serviço que você pede ao entrar (LGPD,
            art. 7º, V). Os dados ficam enquanto a votação existir, e o
            responsável apaga os seus quando você pedir. As cópias de segurança
            do serviço, as 30 mais recentes, ficam no computador do responsável.
          </p>
        </Secao>

        <Secao titulo="Formulário de contato">
          <p>
            O formulário de contato envia o nome, o e-mail, o assunto e a
            mensagem que você escrever pelo FormSubmit (formsubmit.co), que os
            encaminha para o e-mail do responsável, hospedado pelo Google
            (Gmail). Antes do envio, o reCAPTCHA do Google confere que quem
            escreve não é um robô. Cada serviço segue a própria política de
            privacidade.
          </p>
          <p>
            Esses dados servem só para responder (LGPD, art. 7º, V) e ficam
            enquanto a conversa for útil; você pode pedir para apagar a qualquer
            momento.
          </p>
        </Secao>

        <Secao titulo="Conteúdo de outros sites">
          <p>
            A lista de artigos vem da API do dev.to, chamada direto do seu
            navegador, e alguns logos e capas são carregados dos sites de
            origem. Nesses pedidos, esses serviços recebem o seu endereço IP e o
            seu navegador, como em qualquer acesso, e seguem as próprias
            políticas de privacidade.
          </p>
        </Secao>

        <Secao titulo="O que fica só no seu navegador">
          <p>
            O site guarda no seu navegador, sem enviar para lugar nenhum: o tema
            claro ou escuro que você escolher e o quadro do /tasks, que funciona
            sem internet. As ferramentas do /tools rodam no seu navegador, e a
            câmera do leitor de QR e da roleta é usada só no seu aparelho:
            nenhuma imagem sai dele.
          </p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            A Lei Geral de Proteção de Dados (LGPD, art. 18) garante a você,
            sobre os dados pessoais que o responsável tiver: a confirmação de
            que eles são tratados e o acesso a eles; a correção; a anonimização,
            o bloqueio ou a eliminação do que for desnecessário ou tratado em
            desacordo com a lei; a portabilidade; a informação de com quem são
            compartilhados; e a oposição a um tratamento feito por legítimo
            interesse que descumpra a lei.
          </p>
          <p>
            Para pedir, escreva para <Email />. A resposta vem em até 15 dias, e
            pode ser preciso confirmar que o pedido é seu. Se achar que não foi
            resolvido, você pode reclamar à{' '}
            <a href={ANPD} className={LINK} {...ABRE_EM_ABA_NOVA}>
              Autoridade Nacional de Proteção de Dados (ANPD)
            </a>
            .
          </p>
        </Secao>

        <Secao titulo="Mudanças nesta política">
          <p>
            Quando esta política mudar, a data no topo muda junto, e a mudança
            vale a partir dela.
          </p>
        </Secao>
      </article>
    </main>
  )
}
