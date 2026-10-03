import type { Metadata } from 'next'
import Link from 'next/link'
import { Fragment } from 'react'
import { Documento } from '@/components/documento'
import { JsonLd } from '@/components/json-ld'
import {
  EMAIL_DE_SUPORTE,
  historicoDe,
  MAILTO,
  NOME,
  REPOSITORIO,
} from '@/lib/conteudo'
import { jsonLdDaTrilha } from '@/lib/json-ld'
import {
  DESCRICAO_DA_PRIVACIDADE,
  metadataDaPagina,
  TITULO_DA_PRIVACIDADE,
} from '@/lib/seo'
import { urlDoSite } from '@/lib/site'

const VIGENCIA = { iso: '2026-10-02', texto: '2 de outubro de 2026' }
const POLITICA_DA_VERCEL = 'https://vercel.com/legal/privacy-policy'
const POLITICA_DO_GOOGLE = 'https://policies.google.com/privacy'
const ANPD = 'https://www.gov.br/anpd/pt-br'

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
      'Rodar nessa aba, quando você aciona a extensão, o script que reconhece e preenche os campos. O script fica na página até ela ser recarregada, trocada por outra ou fechada.',
    onde: 'Todos',
  },
  {
    nome: 'contextMenus',
    paraQue:
      'Os itens do botão direito: “Preencher esta página”, “Inserir › CPF / E-mail / CEP…”, “Nova pessoa” e “Abrir caixa de entrada”, que abre numa aba nova a caixa pública do e-mail gerado, num site de terceiro.',
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

const TRATAMENTOS = [
  {
    dado: 'A pessoa fictícia gerada',
    paraQue: 'Repetir o mesmo cadastro até você pedir outra pessoa.',
    base: 'Não se aplica: ela é inventada e fica só no seu navegador. A PiluTech não a recebe.',
    comQuem: 'Ninguém.',
    prazo: 'Até você clicar em “Nova pessoa” ou remover a extensão.',
  },
  {
    dado: 'Os campos e o endereço da aba',
    paraQue:
      'Decidir o que escrever em cada campo, levar você até os que ficaram de fora e saber se o navegador deixa a extensão agir ali.',
    base: 'Não se aplica: são lidos só no seu navegador, quando você aciona a extensão. A PiluTech não os recebe.',
    comQuem: 'Ninguém.',
    prazo:
      'Na memória da página, até ela ser recarregada, trocada por outra ou fechada. Nada é gravado nem enviado.',
  },
  {
    dado: 'A escolha de tema claro ou escuro',
    paraQue: 'Abrir este site no tema que você escolheu.',
    base: 'Não se aplica: fica só no seu navegador (localStorage) e não é enviada.',
    comQuem: 'Ninguém.',
    prazo: 'Até você limpar os dados do site no navegador.',
  },
  {
    dado: 'Os registros de acesso a este site',
    paraQue: 'Entregar as páginas e proteger o site contra abuso e falhas.',
    base: 'Legítimo interesse da PiluTech em manter o site no ar e seguro (LGPD, art. 7º, IX).',
    comQuem: 'Vercel, a hospedagem, que os trata em nome da PiluTech.',
    prazo:
      'O prazo de retenção da Vercel. A PiluTech não os copia para outro lugar.',
  },
  {
    dado: 'O que você manda ao suporte por e-mail',
    paraQue: 'Responder ao seu pedido.',
    base: 'Legítimo interesse em atender quem nos procura (art. 7º, IX) e, nos pedidos sobre os seus dados, cumprimento de obrigação legal (art. 7º, II).',
    comQuem: 'Google, que hospeda o e-mail da PiluTech (Gmail).',
    prazo:
      'Enquanto for útil para o atendimento. Você pode pedir para apagar a qualquer momento.',
  },
]

export const metadata: Metadata = metadataDaPagina({
  caminho: '/privacidade',
  titulo: TITULO_DA_PRIVACIDADE,
  descricao: DESCRICAO_DA_PRIVACIDADE,
})

function Email() {
  return <a href={MAILTO.privacidade}>{EMAIL_DE_SUPORTE}</a>
}

export default function PrivacidadePage() {
  return (
    <>
      <JsonLd
        dados={jsonLdDaTrilha(urlDoSite(), {
          nome: 'Política de privacidade',
          caminho: '/privacidade',
        })}
      />
      <Documento
        rotulo="~/pilulabs/botai/privacidade"
        titulo={`Política de privacidade do ${NOME}`}
        vigencia={VIGENCIA}
        resumo={
          <>
            a extensão {NOME} não coleta nem envia dados. Ela só lê os
            formulários da aba em que você a aciona, no seu navegador, e guarda
            nele a pessoa fictícia que gerou. Este site não usa cookies nem
            analytics; a hospedagem registra dados técnicos de acesso, como em
            qualquer site.
          </>
        }
      >
        <h2>Quem é o responsável</h2>
        <p>
          O {NOME} e este site são da PiluTech, que responde pelo tratamento dos
          dados descritos nesta política. Dúvidas, pedidos sobre os seus dados e
          suporte: <Email />.
        </p>

        <h2>O que o {NOME} acessa, e quando</h2>
        <ul>
          <li>
            Os campos de formulário da aba em que você aciona a extensão, pelo
            ícone, pelo atalho ou pelo menu do botão direito: o tipo, o nome, o
            rótulo, os atributos e o valor atual de cada campo. É para decidir o
            que escrever em cada um e conferir o que ficou escrito.
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
          só para aquela aba. Tudo acontece no seu computador: o que o {NOME} lê
          fica só na memória da página, até ela ser recarregada, trocada por
          outra ou fechada, e nada da página é gravado nem enviado.
        </p>

        <h2>O que fica guardado</h2>
        <p>
          Só a pessoa fictícia gerada (nome, documentos, endereço, contato,
          empresa e cartão de teste), no armazenamento local da extensão no seu
          navegador (<code>storage.local</code>). Assim você repete o mesmo
          cadastro até pedir outra pessoa. Ela não é sincronizada entre
          dispositivos.
        </p>

        <h2>O que é enviado</h2>
        <p>
          Nada. A extensão não tem servidor e não faz requisições a servidor
          nenhum. Também não usa analytics, cookies nem anúncios, e não carrega
          código remoto: todo o código está no pacote da extensão. No Firefox, o
          próprio pacote declara que não coleta dados. Copiar um dado no popup
          só o põe na área de transferência do seu computador.
        </p>

        <h2>Sites que ele abre, só quando você clica</h2>
        <ul>
          <li>
            <strong>Abrir caixa de entrada</strong> abre{' '}
            <code className="wrap-anywhere">
              {'https://tuamaeaquelaursa.com/<usuário>'}
            </code>
            , a caixa pública do e-mail fictício gerado. É um serviço de
            terceiro, e qualquer pessoa que souber o endereço lê as mensagens. O{' '}
            {NOME} só abre a página e não chama a API do serviço.
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
          O que esses sites fazem com os seus dados segue a política de cada um.
        </p>

        <h2>Dados fictícios e pessoas reais</h2>
        <p>
          Os dados são gerados ao acaso, e os documentos saem com dígitos
          verificadores válidos. Um CPF, um CNPJ, um RG, um PIS/NIS, um título
          de eleitor ou um celular gerado pode pertencer a alguém de verdade, e
          o endereço também pode existir: o CEP e a rua são reais, e o número é
          sorteado dentro da numeração daquele CEP. Use o {NOME} só em localhost
          e em ambientes de teste. Os <Link href="/termos">termos de uso</Link>{' '}
          dizem o que é proibido fazer com esses dados.
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
          Ele não pede acesso a todos os sites e não lê o histórico, outras
          abas, favoritos nem cookies.
        </p>

        <h2>Como apagar os dados</h2>
        <p>
          “Nova pessoa”, no popup, troca a pessoa guardada por outra. Remover a
          extensão apaga o armazenamento local dela.
        </p>

        <h2>Este site</h2>
        <p>
          O site botai.pilutech.com.br não usa cookies, analytics nem anúncios,
          e não carrega nada de terceiros: as fontes e as imagens vêm dele
          mesmo. A escolha de tema claro ou escuro fica guardada no seu
          navegador (<code>localStorage</code>) e não é enviada.
        </p>
        <p>
          A hospedagem é da Vercel Inc., empresa dos Estados Unidos. Como em
          qualquer site, o servidor registra dados técnicos de cada acesso:
          endereço IP, navegador e sistema, página pedida, data e hora, e a
          cidade e o país aproximados a partir do IP. A Vercel trata esses
          registros em nome da PiluTech e pode processá-los fora do Brasil (veja
          a{' '}
          <a
            href={POLITICA_DA_VERCEL}
            target="_blank"
            rel="noopener noreferrer"
          >
            política de privacidade da Vercel
          </a>
          ). A PiluTech só os usa para manter o site no ar e seguro, e não os
          cruza com nada para identificar ninguém.
        </p>

        <h2>Quando você escreve para o suporte</h2>
        <p>
          Se você mandar um e-mail, recebemos o seu endereço, o nome que aparece
          nele e o que você escrever, e usamos isso só para responder. O e-mail
          da PiluTech é hospedado pelo Google (Gmail), que pode guardar as
          mensagens fora do Brasil (veja a{' '}
          <a
            href={POLITICA_DO_GOOGLE}
            target="_blank"
            rel="noopener noreferrer"
          >
            política de privacidade do Google
          </a>
          ). Não mande o que não for necessário, como documentos seus.
        </p>

        <h2>Cada dado, para quê e por quanto tempo</h2>
        {TRATAMENTOS.map((tratamento) => (
          <Fragment key={tratamento.dado}>
            <h3>{tratamento.dado}</h3>
            <dl>
              <dt>Para quê</dt>
              <dd>{tratamento.paraQue}</dd>
              <dt>Base legal</dt>
              <dd>{tratamento.base}</dd>
              <dt>Com quem</dt>
              <dd>{tratamento.comQuem}</dd>
              <dt>Por quanto tempo</dt>
              <dd>{tratamento.prazo}</dd>
            </dl>
          </Fragment>
        ))}
        <p>
          A PiluTech não vende dados, não os usa para publicidade e não os
          compartilha com mais ninguém, salvo por ordem judicial ou obrigação
          legal.
        </p>

        <h2>Segurança</h2>
        <p>
          A extensão não envia nada, então não existe dado dela num servidor
          para vazar. A pessoa fictícia fica no perfil do seu navegador, sem
          criptografia própria: quem usa o seu computador e o seu perfil
          consegue vê-la. Este site só responde por HTTPS. O código da extensão
          e o do site são{' '}
          <a href={REPOSITORIO} target="_blank" rel="noopener noreferrer">
            abertos
          </a>{' '}
          e podem ser conferidos.
        </p>

        <h2>Seus direitos</h2>
        <p>
          A Lei Geral de Proteção de Dados (LGPD, art. 18) garante a você, sobre
          os dados pessoais que a PiluTech tiver:
        </p>
        <ul>
          <li>a confirmação de que tratamos dados seus, e o acesso a eles;</li>
          <li>a correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            a anonimização, o bloqueio ou a eliminação de dados desnecessários,
            excessivos ou tratados em desacordo com a lei;
          </li>
          <li>a portabilidade dos dados;</li>
          <li>
            a eliminação dos dados e a informação de com quem os compartilhamos;
          </li>
          <li>
            a oposição a um tratamento feito por legítimo interesse, se ele
            descumprir a lei.
          </li>
        </ul>
        <p>
          Nenhum tratamento descrito aqui depende do seu consentimento; se um
          dia depender, você poderá negá-lo ou revogá-lo. Para exercer qualquer
          direito, escreva para <Email />. Respondemos em até 15 dias e podemos
          pedir que você confirme que o pedido é seu. Lembre que a PiluTech não
          tem nenhum dado da extensão: o que ela guarda fica no seu navegador, e
          você apaga como explicado em “Como apagar os dados”. Se achar que não
          resolvemos, você pode reclamar à{' '}
          <a href={ANPD} target="_blank" rel="noopener noreferrer">
            Autoridade Nacional de Proteção de Dados (ANPD)
          </a>
          .
        </p>

        <h2>Crianças e adolescentes</h2>
        <p>
          O {NOME} e este site são feitos para quem desenvolve e testa software,
          não para crianças e adolescentes. Nenhum dos dois coleta dados de
          ninguém, crianças inclusive.
        </p>

        <h2>Mudanças nesta política</h2>
        <p>
          Quando esta política mudar, a data no topo muda junto, e a mudança
          vale a partir dela. Se um dia a extensão passar a coletar algum dado,
          isso só vai acontecer numa versão nova, com esta política atualizada
          antes. As versões anteriores ficam no{' '}
          <a
            href={historicoDe('app/privacidade/page.tsx')}
            target="_blank"
            rel="noopener noreferrer"
          >
            histórico do código-fonte do site
          </a>
          .
        </p>
      </Documento>
    </>
  )
}
