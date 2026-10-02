import type { Metadata } from 'next'
import Link from 'next/link'
import { Documento } from '@/components/documento'
import { JsonLd } from '@/components/json-ld'
import {
  EMAIL_DE_SUPORTE,
  historicoDe,
  NOME,
  URL_DA_LICENCA,
} from '@/lib/conteudo'
import { jsonLdDaTrilha } from '@/lib/json-ld'
import {
  DESCRICAO_DOS_TERMOS,
  metadataDaPagina,
  TITULO_DOS_TERMOS,
} from '@/lib/seo'
import { urlDoSite } from '@/lib/site'

const VIGENCIA = { iso: '2026-10-02', texto: '2 de outubro de 2026' }

export const metadata: Metadata = metadataDaPagina({
  caminho: '/termos',
  titulo: TITULO_DOS_TERMOS,
  descricao: DESCRICAO_DOS_TERMOS,
})

export default function TermosPage() {
  return (
    <>
      <JsonLd
        dados={jsonLdDaTrilha(urlDoSite(), {
          nome: 'Termos de uso',
          caminho: '/termos',
        })}
      />
      <Documento
        rotulo="~/pilulabs/botai/termos"
        titulo={TITULO_DOS_TERMOS}
        vigencia={VIGENCIA}
        resumo={
          <>
            o {NOME} é grátis, de código aberto (MIT) e serve só para testar
            software com dados fictícios. Não use os dados para fraude, cadastro
            real nem para burlar verificação de identidade. Ele vem sem
            garantia, e quem usa responde pelo uso que faz.
          </>
        }
      >
        <h2>Aceitação</h2>
        <p>
          Estes termos valem para quem instala ou usa a extensão {NOME} e para
          quem usa este site. Ao instalar ou usar, você concorda com eles e com
          a <Link href="/privacidade">política de privacidade</Link>. Se não
          concordar, não instale nem use.
        </p>

        <h2>O que é o {NOME}</h2>
        <p>
          O {NOME} é uma extensão gratuita para Chrome, Edge, Opera e Firefox,
          feita pela PiluTech. Ele gera os dados fictícios de uma pessoa
          brasileira de teste e os escreve nos campos de um formulário quando
          você pede, pelo ícone, pelo atalho ou pelo menu do botão direito.
          Estes termos tratam da extensão distribuída pela PiluTech, pelas lojas
          de extensões ou pelo código-fonte, e deste site.
        </p>

        <h2>A licença do código</h2>
        <p>
          O código do {NOME} é aberto, sob a{' '}
          <a href={URL_DA_LICENCA} target="_blank" rel="noopener noreferrer">
            licença MIT
          </a>
          : você pode usar, copiar, modificar e distribuir o código, inclusive
          para fins comerciais, desde que mantenha o aviso de copyright e o da
          licença. Estes termos não tiram nenhum desses direitos. Se algum
          trecho destes termos parecer limitar o que a MIT permite fazer com o
          código, vale a MIT.
        </p>
        <p>
          A MIT cobre o código. Ela não autoriza ninguém a se apresentar como a
          PiluTech nem a distribuir uma versão modificada como se fosse o {NOME}{' '}
          oficial.
        </p>

        <h2>Para que serve</h2>
        <p>
          O {NOME} serve para desenvolver, testar e demonstrar software: em
          localhost, em homologação e em outros ambientes de teste. Todos os
          dados que ele gera são fictícios. Confira o formulário antes de
          enviar: o {NOME} escreve por cima do que já estiver nos campos.
        </p>

        <h2>O que é proibido</h2>
        <p>Você não pode usar o {NOME} nem os dados que ele gera para:</p>
        <ul aria-label="Proibições">
          <li>
            se passar por outra pessoa ou criar uma identidade falsa, o que pode
            ser crime (falsidade ideológica, falsa identidade e estelionato,
            arts. 299, 307 e 171 do Código Penal);
          </li>
          <li>
            fazer cadastro, conta, compra, pedido de crédito ou qualquer
            contratação real em serviços em produção, como bancos, lojas,
            operadoras e órgãos públicos;
          </li>
          <li>
            burlar verificação de identidade, sistemas antifraude ou limites de
            cadastro, como os de período de teste gratuito;
          </li>
          <li>
            mandar SMS, fazer ligação, enviar correspondência ou consultar birôs
            de crédito com um documento, um celular ou um endereço gerado;
          </li>
          <li>
            tentar pagar com o cartão de teste fora do modo de teste de um meio
            de pagamento;
          </li>
          <li>
            enviar formulários em massa, spam ou cadastros automáticos a sites
            de terceiros sem autorização;
          </li>
          <li>
            qualquer outra coisa que viole a lei ou direitos de terceiros.
          </li>
        </ul>
        <p>
          Essas proibições tratam do que você faz com a extensão e com os dados,
          não dos direitos sobre o código.
        </p>

        <h2>Dados que podem ser de alguém</h2>
        <p>
          O CPF, o CNPJ, o RG, o PIS/NIS, o título de eleitor e o celular são
          sorteados ao acaso, e os documentos saem com dígitos verificadores
          válidos. Não existe faixa reservada para teste, então qualquer um
          deles pode pertencer a uma pessoa ou a uma empresa de verdade. O
          endereço completo também pode existir: o CEP, a rua, o bairro e a
          cidade são reais, para passar nas buscas de CEP, e o número é sorteado
          dentro da numeração daquele CEP. O nome, a data de nascimento e a
          empresa são montados ao acaso, sem partir dos dados de ninguém, mas
          podem coincidir com os de alguém. Se um dado gerado for de alguém, não
          o use para contatar, consultar nem cadastrar ninguém.
        </p>

        <h2>A caixa de e-mail pública</h2>
        <p>
          O e-mail gerado usa o domínio <code>tuamaeaquelaursa.com</code>, uma
          caixa de entrada pública de terceiro, que a PiluTech não controla.
          Qualquer pessoa que souber o endereço lê as mensagens. O serviço pode
          mudar, sair do ar ou apagar mensagens a qualquer momento, sem aviso, e
          a PiluTech não garante que ele entregue nada. Nunca use esse e-mail
          para conta real, recuperação de senha ou dado sensível.
        </p>

        <h2>Sem garantia</h2>
        <p>
          O {NOME} é gratuito e vem como está. A PiluTech se esforça para que
          ele funcione, mas não garante que ele reconheça todos os campos, que
          funcione em todo site ou versão de navegador, que os dados passem em
          toda validação nem que continue recebendo atualizações. Sites, lojas e
          navegadores mudam, e o {NOME} pode deixar de funcionar em algum deles.
        </p>

        <h2>Limite de responsabilidade</h2>
        <p>Dentro do que a lei permite, a PiluTech não responde por:</p>
        <ul aria-label="Limites de responsabilidade">
          <li>danos causados por uso fora do que estes termos permitem;</li>
          <li>
            dados enviados a sistemas em produção, a cadastros reais ou a
            serviços de terceiros;
          </li>
          <li>
            o uso de um CPF, um CNPJ, um RG, um PIS/NIS, um título de eleitor,
            um celular ou um endereço gerado que pertença a alguém;
          </li>
          <li>
            valores que o {NOME} escreveu por cima do que já estava nos campos;
          </li>
          <li>
            o conteúdo, o funcionamento ou as regras de sites de terceiros, como
            a caixa de e-mail pública e as lojas de extensões;
          </li>
          <li>lucros cessantes e danos indiretos.</li>
        </ul>
        <p>
          Nada nestes termos afasta a responsabilidade por dolo nem os direitos
          que a lei garante e que um contrato não pode afastar, como os do
          Código de Defesa do Consumidor, quando ele se aplicar.
        </p>

        <h2>Marcas de terceiros</h2>
        <p>
          Chrome e Chrome Web Store são marcas da Google LLC; Firefox, da
          Mozilla Foundation; Microsoft Edge, da Microsoft Corporation; Opera,
          da Opera Norway AS; Stripe, da Stripe, Inc. Esses e os demais nomes de
          produtos citados neste site (React, Vue, jQuery, Pagar.me e outros)
          pertencem aos seus titulares e aparecem só para dizer onde e com o que
          o {NOME} funciona. Nenhum deles patrocina, endossa ou tem vínculo com
          o {NOME} ou com a PiluTech. O cartão de teste é o que a Stripe
          documenta para o modo de teste dela.
        </p>

        <h2>Privacidade</h2>
        <p>
          Como a extensão e este site tratam dados está na{' '}
          <Link href="/privacidade">política de privacidade</Link>. Em resumo: a
          extensão não coleta nem envia nada.
        </p>

        <h2>Mudanças</h2>
        <p>
          A PiluTech pode mudar estes termos. A versão em vigor é a desta
          página, a partir da data no topo; as anteriores ficam no{' '}
          <a
            href={historicoDe('app/termos/page.tsx')}
            target="_blank"
            rel="noopener noreferrer"
          >
            histórico do código-fonte do site
          </a>
          . A PiluTech também pode mudar, suspender ou encerrar a extensão e o
          site a qualquer momento; o código continua sob a MIT.
        </p>

        <h2>Lei e foro</h2>
        <p>
          Estes termos seguem as leis do Brasil. Fica eleito o foro da comarca
          de Teresina/PI para qualquer questão sobre eles, ressalvado o direito
          de quem for consumidor, quando o Código de Defesa do Consumidor se
          aplicar, de propor a ação no foro do próprio domicílio (CDC, art. 101,
          I). Se uma cláusula for considerada inválida, as demais continuam
          valendo.
        </p>

        <h2>Contato</h2>
        <p>
          Dúvidas sobre estes termos:{' '}
          <a href={`mailto:${EMAIL_DE_SUPORTE}`}>{EMAIL_DE_SUPORTE}</a>.
        </p>
      </Documento>
    </>
  )
}
