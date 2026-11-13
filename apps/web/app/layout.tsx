import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import { DESCRICAO_DO_SITE } from '@/lib/rotas-publicas'
import { getCanonicalSiteUrl } from '@/lib/site-url'
import './globals.css'

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

const siteUrl = getCanonicalSiteUrl()
const siteHostname = (() => {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'piluvitu.com.br'
  }
})()

const defaultTitle =
  'Paulo Victor Torres Silva | SRE, DevOps & Cloud & Platform Engineering'

export const metadata: Metadata = {
  generator: 'Next.js',
  applicationName: 'Paulo Victor Torres Silva — Portfólio',
  referrer: 'origin-when-cross-origin',
  keywords: [
    'Paulo Victor Torres Silva',
    'Paulo Victor',
    'PiluVitu',
    'SRE',
    'Site Reliability Engineering',
    'DevOps',
    'Engenheiro DevOps',
    'Cloud Engineering',
    'Platform Engineering',
    'AWS',
    'EC2',
    'ECS',
    'CloudWatch',
    'Cloudflare',
    'FinOps',
    'Terraform',
    'Ansible',
    'Docker',
    'GitHub Actions',
    'CI/CD',
    'Prometheus',
    'Grafana',
    'OpenTelemetry',
    'SLI',
    'SLO',
    'Observabilidade',
    'Infraestrutura como código',
    'Disaster Recovery',
    'Kubernetes',
    'Linux',
  ],
  creator: 'Paulo Victor Torres Silva',
  formatDetection: {
    address: false,
    telephone: false,
  },
  publisher: 'PiluTech',
  title: {
    template: '%s | Paulo Victor Torres Silva',
    default: defaultTitle,
  },
  metadataBase: new URL(`${siteUrl}/`),
  description: DESCRICAO_DO_SITE,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: siteHostname,
    url: `${siteUrl}/`,
    title: defaultTitle,
    description: DESCRICAO_DO_SITE,
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: DESCRICAO_DO_SITE,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
