import { DocumentoPdfProvider } from '@/components/tools/pdf/documento-pdf'

export default function EditorDePdfLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DocumentoPdfProvider>{children}</DocumentoPdfProvider>
}
