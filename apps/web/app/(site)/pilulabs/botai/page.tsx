import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAddressBook,
  faArrowRight,
  faBuilding,
  faCode,
  faCreditCard,
  faEnvelope,
  faIdCard,
  faLocationDot,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { PageTopBar } from '@/components/page-top-bar'
import { AtalhosTabela } from '@/components/pilulabs/atalhos-tabela'
import { BotoesLoja } from '@/components/pilulabs/botoes-loja'
import { CapturasGaleria } from '@/components/pilulabs/capturas-galeria'
import { StatusProduto } from '@/components/pilulabs/status-produto'
import { SectionHeader } from '@/components/section-header'
import { ATALHOS, fase, lojasPublicadas } from '@piluvitu/tools/pilulabs'
import { listarCapturas, metadataDoItem } from '@/lib/pilulabs'
import { jsonLdDoItem } from '@/lib/pilulabs-json-ld'
import { subdominiosAtivos, urlPublica } from '@/lib/pilutech-dominios'
import { getPiluLabs } from '@/lib/site-content'
import { getCanonicalSiteUrl } from '@/lib/site-url'

const SLUG = 'botai'
const CAMINHO = '/pilulabs/botai'
const EMAIL_SUPORTE = 'pilutechinformatica@gmail.com'

const RECURSOS: { titulo: string; texto: string; icone: IconDefinition }[] = [
  {
    titulo: 'Documentos',
    texto:
      'CPF, CNPJ, RG, PIS/NIS e título de eleitor, com os dígitos verificadores certos.',
    icone: faIdCard,
  },
  {
    titulo: 'Endereço',
    texto: 'CEP real, com rua, bairro, cidade e UF que batem com ele.',
    icone: faLocationDot,
  },
  {
    titulo: 'Contato',
    texto: 'Nome, data de nascimento, celular, e-mail e senha.',
    icone: faAddressBook,
  },
  {
    titulo: 'Empresa',
    texto: 'Razão social, nome fantasia e CNPJ.',
    icone: faBuilding,
  },
  {
    titulo: 'Cartão',
    texto:
      'O cartão de teste documentado da Stripe: número, nome impresso, validade e CVV.',
    icone: faCreditCard,
  },
]

const CUIDADOS = [
  'A caixa de e-mail é pública. O e-mail gerado é do tuamaeaquelaursa.com, e qualquer um que souber o endereço lê as mensagens. Nunca use para conta real.',
  'CPF, CNPJ e celular gerados podem pertencer a alguém de verdade. Use só em localhost e em ambientes de teste.',
  'Iframe de outro domínio (Stripe Elements, Pagar.me) fica de fora: o navegador só libera a página de cima.',
  'Quando a aba navega, o navegador retira o acesso. A página seguinte precisa de um novo gesto, e o atalho resolve.',
]

async function lerProduto() {
  const itens = await getPiluLabs()
  return itens.find((item) => item.slug === SLUG)
}

export async function generateMetadata(): Promise<Metadata> {
  const produto = await lerProduto()
  if (!produto) return {}
  return metadataDoItem(
    produto,
    {
      caminho: CAMINHO,
      titulo: `${produto.nome} | PiluLabs`,
      descricao: produto.subtitulo,
    },
    subdominiosAtivos(),
  )
}

export default async function BotaiPage() {
  const produto = await lerProduto()
  if (!produto) notFound()
  const subdominios = subdominiosAtivos()
  const hrefPiluLabs = urlPublica('/pilulabs', subdominios)

  const lojas = lojasPublicadas(produto)
  const capturas = listarCapturas(SLUG)
  const jsonLd = jsonLdDoItem({
    item: produto,
    siteUrl: getCanonicalSiteUrl(),
    caminho: CAMINHO,
    capturas,
    detalhes: {
      applicationSubCategory: 'Extensão de navegador',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS',
      softwareRequirements:
        'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior',
      featureList: RECURSOS.map((r) => `${r.titulo}: ${r.texto}`),
    },
    subdominios,
  })

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-8 xl:py-10">
      <JsonLd dados={jsonLd} />
      <PageTopBar backHref={hrefPiluLabs} backLabel="PiluLabs" />

      <header className="border-border mt-10 flex flex-col gap-5 border-b pb-10">
        <p className="text-primary font-mono text-sm">~/pilulabs/{SLUG}</p>
        <div className="flex flex-wrap items-center gap-5">
          {produto.logo ? (
            <Image
              src={produto.logo}
              alt={`Ícone do ${produto.nome}`}
              width={64}
              height={64}
              loading="eager"
              className="rounded-2xl"
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-bold tracking-tight">
                {produto.nome}
              </h1>
              <StatusProduto fase={fase(produto)} />
            </div>
            <p className="text-muted-foreground text-lg text-pretty">
              {produto.subtitulo}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          Extensão para Chrome, Firefox, Edge e Opera · Powered by PiluTech
        </p>
        {lojas.length > 0 ? (
          <BotoesLoja lojas={lojas} />
        ) : (
          <p className="text-muted-foreground">
            Chegando às lojas do Chrome, do Firefox, do Edge e do Opera.
          </p>
        )}
      </header>

      <div className="mt-12 flex flex-col gap-14">
        <section aria-labelledby="nome-heading" className="flex flex-col gap-4">
          <SectionHeader id="nome-heading" label="De onde vem o nome" />
          <p className="text-pretty">
            {produto.nome} vem de “bota aí”, expressão piauiense, e é o que ele
            faz: bota os dados nos campos do formulário. É uma extensão para
            quem desenvolve e testa formulários brasileiros. Ela gera uma pessoa
            de teste falsa e coerente e preenche a página num clique ou num
            atalho.
          </p>
        </section>

        <section
          aria-labelledby="recursos-heading"
          className="flex flex-col gap-5"
        >
          <SectionHeader
            id="recursos-heading"
            label="O que ele bota"
            count={RECURSOS.length}
          />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((recurso) => (
              <li
                key={recurso.titulo}
                className="bg-card border-border flex flex-col gap-3 rounded-lg border p-5"
              >
                <div className="bg-accent-soft text-primary flex size-10 items-center justify-center rounded-xl">
                  <FontAwesomeIcon icon={recurso.icone} className="size-4" />
                </div>
                <h3 className="font-semibold">{recurso.titulo}</h3>
                <p className="text-muted-foreground text-sm">{recurso.texto}</p>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">
            Funciona com React, Vue, máscaras de campo e sites que buscam o
            endereço pelo CEP.
          </p>
        </section>

        {capturas.length > 0 ? (
          <section
            aria-labelledby="capturas-heading"
            className="flex flex-col gap-5"
          >
            <SectionHeader
              id="capturas-heading"
              label="Capturas"
              count={capturas.length}
            />
            <CapturasGaleria capturas={capturas} />
          </section>
        ) : null}

        <section aria-labelledby="uso-heading" className="flex flex-col gap-5">
          <SectionHeader id="uso-heading" label="Como usar" />
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              <strong>A página inteira:</strong> o atalho da tabela abaixo, ou
              clique no ícone do {produto.nome} e em “Preencher esta página”.
            </li>
            <li>
              <strong>Um campo só:</strong> botão direito no campo ›{' '}
              {produto.nome} › Inserir › CPF (ou E-mail, CEP…).
            </li>
            <li>
              <strong>Ver e copiar os dados:</strong> o popup mostra a pessoa
              inteira, e “Nova pessoa” gera outra.
            </li>
          </ol>
          <AtalhosTabela atalhos={ATALHOS} />
          <p className="text-muted-foreground text-sm">
            Se outro programa já usa a tecla, o popup mostra “definir atalho” e
            abre a página de atalhos do navegador.
          </p>
        </section>

        <section
          aria-labelledby="privacidade-heading"
          className="flex flex-col gap-4"
        >
          <SectionHeader id="privacidade-heading" label="Privacidade" />
          <p>
            Nada sai do seu navegador: o {produto.nome} não tem servidor, não
            usa analytics e só guarda a pessoa fictícia que gerou.
          </p>
          <p>
            <Link
              href={urlPublica(`${CAMINHO}/privacidade`, subdominios)}
              className="text-primary inline-flex items-center gap-2 hover:underline"
            >
              Política de privacidade
              <FontAwesomeIcon icon={faArrowRight} className="size-3" />
            </Link>
          </p>
        </section>

        <section
          aria-labelledby="cuidados-heading"
          className="flex flex-col gap-4"
        >
          <SectionHeader id="cuidados-heading" label="Cuidados" />
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {CUIDADOS.map((cuidado) => (
              <li key={cuidado}>{cuidado}</li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="border-border mt-14 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <div className="flex flex-col">
          <span className="font-semibold">
            Feito por Paulo Victor Torres Silva
          </span>
          <Link
            href={hrefPiluLabs}
            className="text-muted-foreground hover:text-foreground font-mono text-xs"
          >
            Powered by PiluTech
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          {produto.repo ? (
            <Button asChild variant="outline" className="gap-2">
              <a href={produto.repo} target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faCode} className="size-3.5" />
                Código-fonte
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="gap-2">
            <a href={`mailto:${EMAIL_SUPORTE}`}>
              <FontAwesomeIcon icon={faEnvelope} className="size-3.5" />
              Suporte
            </a>
          </Button>
        </div>
      </footer>
    </div>
  )
}
