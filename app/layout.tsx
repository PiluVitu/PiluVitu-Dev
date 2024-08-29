import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const inter = Inter({ subsets: ['latin'] })

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
  ],
  creator: 'Paulo Victor Torres Silva',
  formatDetection: {
    address: false,
    telephone: false,
  },
  publisher: 'PiluTech',
  title: {
    template: '%s | Paulo Victor Torres Silva',
    default: 'Paulo Victor Torres Silva | DevOps Engineer',
  },
  description:
    'DevOps Engineer que acelera a entrega de software e otimiza processos.Tenho experiência em automatizar pipelines de CI/ CD e implementar aplicações em nuvem.Entre em contato para discutir como posso ajudar seu time a alcançar seus objetivos!',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}
