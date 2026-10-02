import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import { TemaProvider } from '@/components/tema-provider'
import { metadataDoSite, VIEWPORT } from '@/lib/seo'
import { urlDoSite } from '@/lib/site'
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

export const metadata: Metadata = metadataDoSite(urlDoSite())
export const viewport: Viewport = VIEWPORT

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <TemaProvider>{children}</TemaProvider>
      </body>
    </html>
  )
}
