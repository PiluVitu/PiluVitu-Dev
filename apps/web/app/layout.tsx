import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { getCanonicalSiteUrl } from '@/lib/site-url'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const siteUrl = getCanonicalSiteUrl()
const siteHostname = (() => {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, '')
  } catch {
    return 'piluvitu.com.br'
  }
})()

const siteDescription =
  'DevOps Engineer com 3 anos de experiência focado em sistemas em nuvem com alta disponibilidade e custo eficiente. Especialista em automatizar operações com ferramentas de mercado, monitorar a saúde das aplicações em tempo real e antecipar falhas antes que afetem o usuário final.'

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
  description: siteDescription,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: siteHostname,
    url: `${siteUrl}/`,
    title: defaultTitle,
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: siteDescription,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
