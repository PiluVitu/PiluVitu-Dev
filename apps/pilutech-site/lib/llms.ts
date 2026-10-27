import type { Fase } from '@piluvitu/tools/pilulabs'
import { EMAIL_DA_PILUTECH, WHATSAPP } from './contato'
import { cartoesDosProjetos, SERVICOS, type CartaoDeProjeto } from './conteudo'
import { DESCRICAO_DA_HOME } from './seo'
import { urlAbsoluta } from './site'

function linhaDoProjeto({ nome, url, selo, texto }: CartaoDeProjeto): string {
  const titulo = url ? `[${nome}](${url})` : nome
  return `- ${titulo}: ${selo}. ${texto}`
}

export function llmsTxt({
  faseDoBotai,
  siteUrl,
}: {
  faseDoBotai: Fase
  siteUrl: string
}): string {
  return [
    '# PiluTech',
    '',
    `> ${DESCRICAO_DA_HOME}`,
    '',
    'A PiluTech também cria produtos próprios. Cada produto com site mora num subdomínio de pilutech.com.br.',
    '',
    '## Produtos',
    '',
    ...cartoesDosProjetos(faseDoBotai).map(linhaDoProjeto),
    '',
    '## Serviços',
    '',
    ...SERVICOS.map(({ nome, texto }) => `- ${nome}: ${texto}`),
    '',
    '## Site',
    '',
    `- [Página inicial](${urlAbsoluta('/', siteUrl)}): serviços, como funciona, produtos, planos de manutenção e dúvidas.`,
    `- [Política de privacidade](${urlAbsoluta('/privacidade', siteUrl)}): o que o site registra e os direitos na LGPD.`,
    '',
    '## Contato',
    '',
    `- E-mail: ${EMAIL_DA_PILUTECH}`,
    `- [WhatsApp](${WHATSAPP.geral})`,
    '',
  ].join('\n')
}
