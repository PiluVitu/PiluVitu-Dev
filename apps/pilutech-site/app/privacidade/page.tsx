import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@piluvitu/ui/cn'
import { ANEL_DE_FOCO, CONTEUDO } from '@/components/classes'
import { PiluTechMark } from '@/components/pilutech-mark'
import { Rodape } from '@/components/rodape'
import {
  ABRE_EM_ABA_NOVA,
  EMAIL_DA_PILUTECH,
  MAILTO_DA_PRIVACIDADE,
} from '@/lib/contato'
import {
  DESCRICAO_DA_PRIVACIDADE,
  metadataDaPagina,
  TITULO_DA_PRIVACIDADE,
} from '@/lib/seo'

const VIGENCIA = { iso: '2026-10-11', texto: '11 de outubro de 2026' }
const POLITICA_DA_VERCEL = 'https://vercel.com/legal/privacy-policy'
const ANPD = 'https://www.gov.br/anpd/pt-br'
const LINK = cn(
  'text-primary rounded font-medium underline underline-offset-4',
  ANEL_DE_FOCO,
)

export const metadata: Metadata = metadataDaPagina({
  caminho: '/privacidade',
  titulo: TITULO_DA_PRIVACIDADE,
  descricao: DESCRICAO_DA_PRIVACIDADE,
})

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[22px] font-bold tracking-tight">{titulo}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Email() {
  return (
    <a href={MAILTO_DA_PRIVACIDADE} className={cn(LINK, 'wrap-anywhere')}>
      {EMAIL_DA_PILUTECH}
    </a>
  )
}

export default function PrivacidadePage() {
  return (
    <>
      <header className="dark bg-background text-foreground border-border border-b">
        <div className={cn(CONTEUDO, 'flex h-[68px] items-center')}>
          <Link
            href="/"
            aria-label="PiluTech, voltar para o início"
            className={cn('flex rounded', ANEL_DE_FOCO)}
          >
            <PiluTechMark tamanho={30} lockup />
          </Link>
        </div>
      </header>
      <main className="bg-background text-foreground">
        <div
          className={cn(
            CONTEUDO,
            'py-[clamp(48px,7vw,88px)] text-[17px] leading-relaxed',
          )}
        >
          <article className="max-w-[720px]">
            <h1 className="text-[clamp(32px,5vw,44px)] leading-tight font-extrabold tracking-tight">
              Política de privacidade
            </h1>
            <p className="text-muted-foreground mt-3 font-mono text-[14px]">
              Em vigor desde{' '}
              <time dateTime={VIGENCIA.iso}>{VIGENCIA.texto}</time>
            </p>
            <p className="mt-8">
              Em resumo: este site não usa cookies nem anúncios. Ele conta as
              visitas com o Vercel Web Analytics e mede a velocidade das páginas
              com o Vercel Speed Insights, sem identificar quem visita, e a
              hospedagem registra dados técnicos de acesso, como em qualquer
              site.
            </p>

            <Secao titulo="Quem é o responsável">
              <p>
                O site pilutech.com.br é da PiluTech, de Paulo Victor T S, em
                Teresina (PI), que responde pelo tratamento dos dados descritos
                aqui. Dúvidas e pedidos sobre os seus dados: <Email />.
              </p>
              <p>
                A PiluTech não vende dados, não os usa para publicidade e não os
                compartilha com mais ninguém, salvo por ordem judicial ou
                obrigação legal.
              </p>
            </Secao>

            <Secao titulo="Estatísticas de visita">
              <p>
                Para ter uma visão geral do público, o site usa o Vercel Web
                Analytics, da mesma Vercel que o hospeda. A cada página vista,
                ele registra a página, a página de onde você veio, o país, a
                região e a cidade aproximados, o tipo de dispositivo, o sistema
                e o navegador, além de parâmetros do endereço filtrados pela
                Vercel. Ele não usa cookie: a visita é reconhecida por um código
                calculado a partir da requisição, descartado em 24 horas, e os
                relatórios só mostram números somados.
              </p>
              <p>
                O Vercel Speed Insights mede a velocidade de cada carregamento
                (as Web Vitals), com a página, a velocidade da conexão, o
                navegador, o tipo e o sistema do dispositivo e o país, também
                sem cookie e sem identificar quem visita.
              </p>
              <p>
                A base legal é o legítimo interesse da PiluTech em entender o
                uso do site (LGPD, art. 7º, IX). A Vercel trata esses dados em
                nome da PiluTech, e os números somados ficam no painel dela pelo
                prazo do plano (hoje, até 1 mês).
              </p>
            </Secao>

            <Secao titulo="Registros da hospedagem">
              <p>
                O site é hospedado pela Vercel Inc., empresa dos Estados Unidos.
                Como em qualquer site, o servidor registra dados técnicos de
                cada acesso: endereço IP, navegador e sistema, página pedida,
                data e hora, e a cidade e o país aproximados a partir do IP. A
                Vercel trata esses registros em nome da PiluTech e pode
                processá-los fora do Brasil (veja a{' '}
                <a
                  href={POLITICA_DA_VERCEL}
                  className={LINK}
                  {...ABRE_EM_ABA_NOVA}
                >
                  política de privacidade da Vercel
                </a>
                ).
              </p>
              <p>
                A PiluTech só usa esses registros para manter o site no ar e
                seguro, por legítimo interesse (LGPD, art. 7º, IX), e não os
                cruza com nada para identificar ninguém.
              </p>
            </Secao>

            <Secao titulo="Quando você fala com a PiluTech">
              <p>
                Os botões do site abrem uma conversa no WhatsApp ou um e-mail
                para a PiluTech. Só recebemos o que você mandar, com o seu nome
                e o seu número ou endereço, e usamos isso para responder e
                preparar a proposta que você pedir (LGPD, art. 7º, V). O
                WhatsApp é da Meta, e o e-mail da PiluTech é hospedado pelo
                Google (Gmail): cada um segue a própria política de privacidade.
                Guardamos a conversa enquanto ela for útil para o atendimento, e
                você pode pedir para apagar a qualquer momento.
              </p>
            </Secao>

            <Secao titulo="Seus direitos">
              <p>
                A Lei Geral de Proteção de Dados (LGPD, art. 18) garante a você,
                sobre os dados pessoais que a PiluTech tiver: a confirmação de
                que tratamos dados seus e o acesso a eles; a correção; a
                anonimização, o bloqueio ou a eliminação do que for
                desnecessário ou tratado em desacordo com a lei; a
                portabilidade; a informação de com quem os compartilhamos; e a
                oposição a um tratamento feito por legítimo interesse que
                descumpra a lei.
              </p>
              <p>
                Para pedir, escreva para <Email />. Respondemos em até 15 dias e
                podemos pedir que você confirme que o pedido é seu. Se achar que
                não resolvemos, você pode reclamar à{' '}
                <a href={ANPD} className={LINK} {...ABRE_EM_ABA_NOVA}>
                  Autoridade Nacional de Proteção de Dados (ANPD)
                </a>
                .
              </p>
            </Secao>

            <Secao titulo="Mudanças nesta política">
              <p>
                Quando esta política mudar, a data no topo muda junto, e a
                mudança vale a partir dela.
              </p>
            </Secao>
          </article>
        </div>
      </main>
      <Rodape ano={new Date().getFullYear()} />
    </>
  )
}
