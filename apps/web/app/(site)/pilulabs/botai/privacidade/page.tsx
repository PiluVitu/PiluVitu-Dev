import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { PageTopBar } from '@/components/page-top-bar'
import { metadataDoProduto } from '@/lib/pilulabs'
import { CONTEXTO_SCHEMA, jsonLdBreadcrumb } from '@/lib/pilulabs-json-ld'
import { getProdutos } from '@/lib/site-content'
import { getCanonicalSiteUrl } from '@/lib/site-url'

const SLUG = 'botai'
const CAMINHO_PRODUTO = '/pilulabs/botai'
const CAMINHO = '/pilulabs/botai/privacidade'
const EMAIL = 'pilutechinformatica@gmail.com'
// Data em texto pronto: formatar "2026-10-01" em BRT mostraria 30 de setembro.
const ATUALIZADA_EM = { iso: '2026-10-01', texto: '1 de outubro de 2026' }
const HISTORICO =
  'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx'

const PERMISSOES = [
  {
    nome: 'activeTab',
    paraQue:
      'Acesso temporário só à aba em que você aciona a extensão (ícone, atalho ou menu), para ler os campos do formulário e escrever os dados de teste. O acesso acaba quando a aba navega.',
    onde: 'Todos',
  },
  {
    nome: 'scripting',
    paraQue:
      'Rodar, só nessa aba e só nesse momento, o script que reconhece e preenche os campos.',
    onde: 'Todos',
  },
  {
    nome: 'contextMenus',
    paraQue:
      'Os itens “Preencher esta página” e “Inserir › CPF / E-mail / CEP…” do botão direito.',
    onde: 'Todos',
  },
  {
    nome: 'storage',
    paraQue:
      'Guardar no seu navegador a pessoa fictícia gerada, para repetir o mesmo cadastro.',
    onde: 'Todos',
  },
  {
    nome: 'menus',
    paraQue:
      'Saber em qual campo você clicou com o botão direito, para o “Inserir” escrever nele.',
    onde: 'Só no Firefox',
  },
]

async function lerProduto() {
  const produtos = await getProdutos()
  return produtos.find((p) => p.slug === SLUG)
}

export async function generateMetadata(): Promise<Metadata> {
  const produto = await lerProduto()
  if (!produto) return {}
  return metadataDoProduto(produto, {
    caminho: CAMINHO,
    titulo: `Política de privacidade do ${produto.nome} | PiluLabs`,
    descricao: `Como o ${produto.nome} trata os dados: nada sai do seu navegador.`,
  })
}

export default async function PrivacidadeBotaiPage() {
  const produto = await lerProduto()
  if (!produto) notFound()

  const jsonLd = {
    '@context': CONTEXTO_SCHEMA,
    ...jsonLdBreadcrumb(getCanonicalSiteUrl(), [
      { nome: 'PiluLabs', caminho: '/pilulabs' },
      { nome: produto.nome, caminho: CAMINHO_PRODUTO },
      { nome: 'Política de privacidade', caminho: CAMINHO },
    ]),
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 xl:py-10">
      <JsonLd dados={jsonLd} />
      <PageTopBar backHref={CAMINHO_PRODUTO} backLabel={produto.nome} />

      <article className="mt-10">
        <header className="border-border flex flex-col gap-4 border-b pb-8">
          <p className="text-primary font-mono text-sm break-all">
            ~/pilulabs/{SLUG}/privacidade
          </p>
          <h1 className="text-4xl leading-tight font-bold tracking-tight">
            Política de privacidade do {produto.nome}
          </h1>
          <p className="text-muted-foreground font-mono text-xs">
            Última atualização:{' '}
            <time dateTime={ATUALIZADA_EM.iso}>{ATUALIZADA_EM.texto}</time>
          </p>
          <p className="bg-accent-soft border-accent-line rounded-lg border p-4 text-pretty">
            <strong>Em resumo:</strong> o {produto.nome} não coleta nem envia
            dados. Ele só lê os formulários da aba em que você o aciona, no seu
            navegador, e guarda nele a pessoa fictícia que gerou.
          </p>
        </header>

        <div className="prose dark:prose-invert post-prose mt-10 max-w-none">
          <h2>Quem é o responsável</h2>
          <p>
            O {produto.nome} é um produto da PiluTech. Dúvidas, pedidos sobre
            esta política e suporte: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
          </p>

          <h2>O que o {produto.nome} acessa, e quando</h2>
          <ul>
            <li>
              Os campos de formulário da aba em que você aciona a extensão, pelo
              ícone, pelo atalho ou pelo menu do botão direito: o tipo, o nome,
              o rótulo, os atributos e o valor atual de cada campo. É para
              decidir o que escrever em cada um e conferir o que ficou escrito.
            </li>
            <li>
              O endereço dessa aba, para saber se o navegador deixa a extensão
              agir ali.
            </li>
            <li>
              No Firefox, qual campo recebeu o clique do botão direito, para o
              “Inserir” escrever nele.
            </li>
          </ul>
          <p>
            Quem libera o acesso é o próprio navegador, só no momento do gesto e
            só para aquela aba. Tudo acontece no seu computador: nada da página
            é guardado nem enviado.
          </p>

          <h2>O que fica guardado</h2>
          <p>
            Só a pessoa fictícia gerada (nome, documentos, endereço, contato,
            empresa e cartão de teste), no armazenamento local da extensão no
            seu navegador (<code>storage.local</code>). Assim você repete o
            mesmo cadastro até pedir outra pessoa. Ela não é sincronizada entre
            dispositivos.
          </p>

          <h2>O que é enviado</h2>
          <p>
            Nada. O {produto.nome} não tem servidor e não faz requisições de
            rede. Também não usa analytics, cookies nem anúncios, e não carrega
            código remoto: todo o código está no pacote publicado nas lojas. Na
            Firefox Add-ons, ele declara que não coleta dados.
          </p>

          <h2>Sites que ele abre, só quando você clica</h2>
          <ul>
            <li>
              <strong>Abrir caixa de entrada</strong> abre{' '}
              <code>{'https://tuamaeaquelaursa.com/<usuário>'}</code>, a caixa
              pública do e-mail fictício gerado. É um serviço de terceiro, e
              qualquer pessoa que souber o endereço lê as mensagens. O{' '}
              {produto.nome} só abre a página e não chama a API do serviço.
            </li>
            <li>
              <strong>Powered by PiluTech</strong> abre{' '}
              <code>https://pilutech.com.br</code>.
            </li>
            <li>
              <strong>Alterar ou definir o atalho</strong> abre a página de
              atalhos do próprio navegador.
            </li>
          </ul>
          <p>
            O que esses sites fazem com os seus dados segue a política de cada
            um.
          </p>

          <h2>Dados fictícios e pessoas reais</h2>
          <p>
            Os documentos são gerados ao acaso, com dígitos verificadores
            válidos. Um CPF, um CNPJ ou um celular gerado pode pertencer a
            alguém de verdade: use o {produto.nome} só em localhost e em
            ambientes de teste.
          </p>

          <h2>Permissões</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Permissão</th>
                <th scope="col">Para quê</th>
                <th scope="col">Navegadores</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSOES.map((permissao) => (
                <tr key={permissao.nome}>
                  <th scope="row">
                    <code>{permissao.nome}</code>
                  </th>
                  <td>{permissao.paraQue}</td>
                  <td>{permissao.onde}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Ele não pede acesso a todos os sites e não lê histórico, abas,
            favoritos nem cookies.
          </p>

          <h2>Como apagar os dados</h2>
          <p>
            “Nova pessoa”, no popup, troca a pessoa guardada por outra. Remover
            a extensão apaga o armazenamento local dela.
          </p>

          <h2>Mudanças nesta política</h2>
          <p>
            Quando esta política mudar, a data no topo muda junto. As versões
            anteriores ficam no{' '}
            <a href={HISTORICO} target="_blank" rel="noopener noreferrer">
              histórico do código-fonte do site
            </a>
            .
          </p>
        </div>
      </article>
    </div>
  )
}
