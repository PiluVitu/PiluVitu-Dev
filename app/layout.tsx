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

export const metadata: Metadata = {
  generator: 'Next.js',
  applicationName: 'Portfólio | Paulo Victor Torres Silva',
  referrer: 'origin-when-cross-origin',
  keywords: [
    'Next.js',
    'React',
    'JavaScript',
    'DevHatt',
    'DevHat',
    'TypeScript',
    'PiluVitu',
    'Pilu Vitu',
    'Paulo Victor',
    'PiluVituDev',
    'Pilu Vitu Dev',
    'Paulo Victor Dev',
    'Paulo Dev',
    'Devopos',
    'PiluTech',
    'TechPilu',
    'Paulo Victor DevOps',
    'Pilu Vitu DevOps',
    'PiluVitu DevOps',
    'Pilu Devopos',
    'Tecnologia',
    'Desenvolvedor',
    'Programador',
    'FullStack',
    'Fullstack',
    'Desenvolvedor Web',
    'Desenvolvedor Web FullStack',
    'Desenvolvedor Web Fullstack',
    'Desenvolvedor Web Full Stack',
    'Terraform',
    'k8s',
    'kubernets',
    'argoCD',
    'docker',
    'CI/CD',
    'CI',
    'CD',
    'linux',
  ],
  creator: 'Paulo Victor Torres Silva',
  formatDetection: {
    address: false,
    telephone: false,
  },
  publisher: 'PiluTech',
  title: {
    template: '%s | Paulo Victor Torres Silva',
    default: 'Paulo Victor Torres Silva | DevOps Developer',
  },
  metadataBase: new URL(`${siteUrl}/`),
  description:
    'DevOps Engineer que acelera a entrega de software e otimiza processos.Tenho experiência em automatizar pipelines de CI/ CD e implementar aplicações em nuvem.Entre em contato para discutir como posso ajudar seu time a alcançar seus objetivos!',
  openGraph: {
    siteName: siteHostname,
    url: `${siteUrl}/`,
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
