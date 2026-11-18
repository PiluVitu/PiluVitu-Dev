import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowsLeftRight,
  faBuilding,
  faCode,
  faDharmachakra,
  faFilePdf,
  faFingerprint,
  faIdCard,
  faKey,
  faLayerGroup,
  faPenToSquare,
  faQrcode,
  faTableCellsLarge,
} from '@fortawesome/free-solid-svg-icons'

export type ToolGroup = 'qr' | 'geradores' | 'dev' | 'documentos'

export type ModoDaFerramenta = {
  slug: string
  title: string
  description: string
  icon: IconDefinition
}

export type ToolMeta = {
  slug: string
  title: string
  description: string
  icon: IconDefinition
  group: ToolGroup
  /** Cada modo tem página própria em /tools/<slug>/<modo>, com metadata, sitemap e llms.txt. */
  modos?: readonly ModoDaFerramenta[]
}

export const TOOLS: ToolMeta[] = [
  {
    slug: 'qr-reader',
    title: 'Leitor de QR',
    description: 'Lê QR codes pela câmera',
    icon: faQrcode,
    group: 'qr',
  },
  {
    slug: 'qr-generator',
    title: 'Gerador de QR',
    description: 'Gera QR code de texto ou URL',
    icon: faQrcode,
    group: 'qr',
  },
  {
    slug: 'cpf',
    title: 'CPF',
    description: 'Gerar e validar CPF',
    icon: faIdCard,
    group: 'geradores',
  },
  {
    slug: 'cnpj',
    title: 'CNPJ',
    description: 'Gerar e validar CNPJ',
    icon: faBuilding,
    group: 'geradores',
  },
  {
    slug: 'json',
    title: 'JSON',
    description: 'Formatar, minificar e validar JSON',
    icon: faCode,
    group: 'dev',
  },
  {
    slug: 'base64',
    title: 'Base64',
    description: 'Encode e decode UTF-8',
    icon: faArrowsLeftRight,
    group: 'dev',
  },
  {
    slug: 'jwt',
    title: 'JWT',
    description: 'Decodificar header e payload',
    icon: faKey,
    group: 'dev',
  },
  {
    slug: 'uuid',
    title: 'UUID',
    description: 'Gerador de UUID v4',
    icon: faFingerprint,
    group: 'dev',
  },
  {
    slug: 'roleta',
    title: 'Roleta / Sorteio',
    description: 'Sorteio com entropia da câmera',
    icon: faDharmachakra,
    group: 'geradores',
  },
  {
    slug: 'pdf',
    title: 'Editor de PDF',
    description: 'Mesclar, organizar e editar páginas de PDF',
    icon: faFilePdf,
    group: 'documentos',
    modos: [
      {
        slug: 'mesclar',
        title: 'Mesclar PDF',
        description: 'Junta vários PDFs em um só arquivo',
        icon: faLayerGroup,
      },
      {
        slug: 'organizar',
        title: 'Organizar páginas',
        description: 'Gira, apaga, reordena e extrai páginas de um PDF',
        icon: faTableCellsLarge,
      },
      {
        slug: 'editar',
        title: 'Editar PDF',
        description:
          'Organiza as páginas e escreve, desenha, põe imagens e cobre trechos por cima delas',
        icon: faPenToSquare,
      },
    ],
  },
]

export const TOOL_GROUPS: { id: ToolGroup; label: string }[] = [
  { id: 'qr', label: 'QR Code' },
  { id: 'geradores', label: 'Geradores' },
  { id: 'dev', label: 'Utilitários Dev' },
  { id: 'documentos', label: 'Documentos' },
]
