import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ferramentas',
}

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <main className="min-h-screen">{children}</main>
}
