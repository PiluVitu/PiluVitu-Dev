import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAddressBook,
  faBuilding,
  faCreditCard,
  faIdCard,
  faLocationDot,
} from '@fortawesome/free-solid-svg-icons'

export const NOME = 'Botaí'
export const PROPOSTA =
  'Gerador de dados fake para formulários (CPF, CNPJ, CEP)'
export const URL_DA_PILUTECH = 'https://pilutech.com.br'
export const EMAIL_DE_SUPORTE = 'pilutechinformatica@gmail.com'

export type Recurso = { titulo: string; texto: string; icone: IconDefinition }

export const RECURSOS: Recurso[] = [
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

export const REQUISITOS =
  'Chrome, Edge e Opera a partir do Chromium 123. Firefox a partir da versão 153.'
export const REQUISITOS_DO_SOFTWARE =
  'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior'
