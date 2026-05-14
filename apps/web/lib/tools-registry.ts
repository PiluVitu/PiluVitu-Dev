import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowsLeftRight,
  faBuilding,
  faCode,
  faFingerprint,
  faIdCard,
  faKey,
  faQrcode,
} from '@fortawesome/free-solid-svg-icons'

export type ToolGroup = 'qr' | 'geradores' | 'dev'

export type ToolMeta = {
  slug: string
  title: string
  description: string
  icon: IconDefinition
  group: ToolGroup
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
]

export const TOOL_GROUPS: { id: ToolGroup; label: string }[] = [
  { id: 'qr', label: 'QR Code' },
  { id: 'geradores', label: 'Geradores' },
  { id: 'dev', label: 'Utilitários Dev' },
]
