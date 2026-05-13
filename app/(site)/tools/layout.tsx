import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ferramentas',
  description: 'Conjunto de ferramentas utilitárias para desenvolvedores',
}

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <main className="min-h-screen">{children}</main>
}
