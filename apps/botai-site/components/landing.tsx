import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'
import Image from 'next/image'
import Link from 'next/link'
import { CAPTURAS } from '@/lib/capturas'
import {
  NOME,
  PROPOSTA,
  RECURSOS,
  REQUISITOS,
  URL_DA_PILUTECH,
} from '@/lib/conteudo'
import type { ModeloDaLanding } from '@/lib/modelo'
import { AtalhoLocal } from './atalho-local'
import { BotoesLoja } from './botoes-loja'
import { CabecalhoSecao } from './cabecalho-secao'
import { CapturasAbas } from './capturas-abas'
import { ImagemPorTema } from './imagem-por-tema'
import { Rodape } from './rodape'
import { SeloFase } from './selo-fase'
import { TabelaAtalhos } from './tabela-atalhos'
import { Topo } from './topo'

const CARTAO = 'bg-card border-border rounded-lg border'
const TEXTO_DE_CARTAO = 'text-muted-foreground text-pretty'

export function Landing({ fase, lojas, notaDasLojas }: ModeloDaLanding) {
  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-accent-soft),transparent)]"
      />
      <div className="relative mx-auto max-w-[1080px] px-6 pt-8 pb-10">
        <Topo
          voltar={{ href: URL_DA_PILUTECH, rotulo: 'PiluLabs' }}
          ancoras={[
            { href: '#como-usar', rotulo: 'como usar' },
            { href: '#capturas', rotulo: 'capturas' },
          ]}
        />

        <header className="mt-[72px] flex flex-col gap-6">
          <p className="text-primary font-mono text-sm">~/pilulabs/botai</p>
          <div className="flex flex-wrap items-center gap-5">
            <Image
              src="/icone-128.png"
              alt={`Ícone do ${NOME}`}
              width={72}
              height={72}
              loading="eager"
              className="rounded-[20px]"
            />
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[56px] leading-none font-extrabold tracking-[-0.03em]">
                {NOME}
              </p>
              <SeloFase fase={fase} />
            </div>
          </div>
          <h1 className="max-w-[820px] text-[40px] leading-[1.12] font-bold tracking-[-0.02em] text-balance">
            <span className="sr-only">{NOME}: </span>
            {PROPOSTA}
          </h1>
          <p className="text-muted-foreground max-w-[680px] text-lg leading-[1.55] text-pretty">
            Uma extensão de navegador que gera uma pessoa brasileira de teste,
            falsa e coerente, e bota os dados nos campos do formulário num
            clique ou num atalho.
          </p>
          <BotoesLoja lojas={lojas} className="mt-2" />
          <div className="text-muted-foreground flex flex-wrap items-center gap-2.5 font-mono text-xs">
            <span>{notaDasLojas}</span>
            <span aria-hidden>·</span>
            <AtalhoLocal />
          </div>
          <div className={cn(CARTAO, 'mt-6 overflow-hidden shadow-sm')}>
            <ImagemPorTema
              variantes={CAPTURAS[0].variantes}
              sizes="(min-width: 1080px) 1032px, calc(100vw - 48px)"
              destaque
            />
          </div>
        </header>

        <main className="mt-24 flex flex-col gap-24">
          <section
            aria-labelledby="porque-heading"
            className="flex flex-col gap-6"
          >
            <CabecalhoSecao id="porque-heading" rotulo="Por que existe" />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-8">
              <div className="flex flex-col gap-4 text-lg leading-[1.6] text-pretty">
                <p>
                  Testar um cadastro brasileiro pede um CPF com os dígitos
                  verificadores certos, um CEP que existe e um endereço que bate
                  com ele. Digitar isso à mão a cada teste é lento, e dado
                  inventado costuma travar na validação.
                </p>
                <p className="text-muted-foreground">
                  O Botaí foi feito para quem desenvolve e testa formulários
                  brasileiros. Ele gera uma pessoa de teste falsa e coerente e
                  escreve os dados nos campos certos da página. A pessoa fica
                  guardada até você pedir outra, para repetir o mesmo cadastro.
                </p>
              </div>
              <div className={cn(CARTAO, 'flex flex-col gap-3 p-6 shadow-sm')}>
                <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
                  De onde vem o nome
                </p>
                <p className="text-primary text-[32px] leading-tight font-bold tracking-[-0.02em]">
                  “bota aí”
                </p>
                <p className={cn(TEXTO_DE_CARTAO, 'text-base/[1.55]')}>
                  Expressão piauiense, e é o que a extensão faz: bota dados nos
                  campos do formulário.
                </p>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="recursos-heading"
            className="flex flex-col gap-6"
          >
            <CabecalhoSecao
              id="recursos-heading"
              rotulo="O que ele bota"
              contagem={RECURSOS.length}
            />
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
              {RECURSOS.map((recurso) => (
                <li
                  key={recurso.titulo}
                  className={cn(CARTAO, 'flex flex-col gap-3 p-5')}
                >
                  <div className="bg-accent-soft text-primary flex size-10 items-center justify-center rounded-[14px]">
                    <FontAwesomeIcon icon={recurso.icone} className="size-4" />
                  </div>
                  <h3 className="text-base leading-tight font-semibold">
                    {recurso.titulo}
                  </h3>
                  <p className={cn(TEXTO_DE_CARTAO, 'text-sm/[1.55]')}>
                    {recurso.texto}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-sm">
              Funciona com React, Vue, máscaras (imask, jQuery Mask,
              react-number-format e outras) e sites que buscam o endereço pelo
              CEP.
            </p>
          </section>

          <section
            id="capturas"
            aria-labelledby="capturas-heading"
            className="flex scroll-mt-6 flex-col gap-6"
          >
            <CabecalhoSecao
              id="capturas-heading"
              rotulo="Capturas"
              contagem={CAPTURAS.length}
            />
            <CapturasAbas capturas={CAPTURAS} rotuladoPor="capturas-heading" />
          </section>

          <section
            id="como-usar"
            aria-labelledby="uso-heading"
            className="flex scroll-mt-6 flex-col gap-6"
          >
            <CabecalhoSecao id="uso-heading" rotulo="Como usar" />
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
              <li className={cn(CARTAO, 'flex flex-col gap-2.5 p-6')}>
                <span className="text-primary font-mono text-xs">01</span>
                <h3 className="text-lg leading-tight font-semibold">
                  A página inteira
                </h3>
                <p className={cn(TEXTO_DE_CARTAO, 'text-[15px]/[1.55]')}>
                  Use o atalho da tabela abaixo, ou clique no ícone do Botaí e
                  em “Preencher esta página”.
                </p>
              </li>
              <li className={cn(CARTAO, 'flex flex-col gap-2.5 p-6')}>
                <span className="text-primary font-mono text-xs">02</span>
                <h3 className="text-lg leading-tight font-semibold">
                  Um campo só
                </h3>
                <p className={cn(TEXTO_DE_CARTAO, 'text-[15px]/[1.55]')}>
                  Botão direito no campo ›{' '}
                  <span className="text-foreground font-mono text-[13px]">
                    Botaí › Inserir › CPF
                  </span>{' '}
                  (ou E-mail, CEP…), para o que a detecção automática errar.
                </p>
              </li>
              <li className={cn(CARTAO, 'flex flex-col gap-2.5 p-6')}>
                <span className="text-primary font-mono text-xs">03</span>
                <h3 className="text-lg leading-tight font-semibold">
                  Ver e copiar os dados
                </h3>
                <p className={cn(TEXTO_DE_CARTAO, 'text-[15px]/[1.55]')}>
                  O popup mostra a pessoa inteira, e “Nova pessoa” gera outra.
                  Depois de preencher, ele mostra quantos campos entraram e leva
                  até os que ficaram de fora.
                </p>
              </li>
            </ol>
            <TabelaAtalhos />
            <p className="text-muted-foreground text-sm">
              Se outro programa já usa a tecla, o popup mostra “definir atalho”
              e abre a página de atalhos do navegador.
            </p>
          </section>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-12">
            <section
              aria-labelledby="privacidade-heading"
              className="flex flex-col gap-4"
            >
              <CabecalhoSecao id="privacidade-heading" rotulo="Privacidade" />
              <p className="text-base leading-[1.6] text-pretty">
                Nada sai do seu navegador: o Botaí não tem servidor, não usa
                analytics e só guarda a pessoa fictícia que gerou. Ele só age na
                aba em que você o aciona.
              </p>
              <Link
                href="/privacidade"
                className="text-primary inline-flex items-center gap-2 text-[15px] hover:underline"
              >
                Política de privacidade
                <FontAwesomeIcon icon={faArrowRight} className="size-3" />
              </Link>
            </section>
            <section
              aria-labelledby="cuidados-heading"
              className="flex flex-col gap-4"
            >
              <CabecalhoSecao id="cuidados-heading" rotulo="Cuidados" />
              <ul className="flex list-disc flex-col gap-2.5 pl-5 text-[15px] leading-[1.55] text-pretty">
                <li>
                  A caixa de e-mail é pública. O e-mail gerado é do{' '}
                  <span className="font-mono text-[13px]">
                    tuamaeaquelaursa.com
                  </span>
                  , e qualquer um que souber o endereço lê as mensagens. Nunca
                  use para conta real.
                </li>
                <li>
                  CPF, CNPJ e celular gerados podem pertencer a alguém de
                  verdade. Use só em localhost e em ambientes de teste.
                </li>
                <li>
                  Iframe de outro domínio (Stripe Elements, Pagar.me) fica de
                  fora: o navegador só libera a página de cima.
                </li>
                <li>
                  Quando a aba navega, o navegador retira o acesso. A página
                  seguinte precisa de um novo gesto, e o atalho resolve.
                </li>
              </ul>
              <Link
                href="/termos"
                className="text-primary inline-flex items-center gap-2 text-[15px] hover:underline"
              >
                Termos de uso
                <FontAwesomeIcon icon={faArrowRight} className="size-3" />
              </Link>
            </section>
          </div>

          <section
            aria-labelledby="instalar-heading"
            className={cn(
              CARTAO,
              'relative flex flex-col items-center gap-5 overflow-hidden rounded-[32px] px-8 py-12 text-center shadow-sm',
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,var(--color-accent-soft),transparent)]"
            />
            <Image
              src="/icone-128.png"
              alt=""
              width={56}
              height={56}
              className="relative rounded-2xl"
            />
            <h2
              id="instalar-heading"
              className="relative text-[36px] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance"
            >
              Bota aí no seu navegador
            </h2>
            <p className="text-muted-foreground relative max-w-[520px] text-base leading-[1.55] text-pretty">
              {REQUISITOS}
            </p>
            <BotoesLoja
              lojas={lojas}
              variante="outline"
              className="relative mt-2 justify-center"
            />
          </section>
        </main>

        <Rodape />
      </div>
    </div>
  )
}
