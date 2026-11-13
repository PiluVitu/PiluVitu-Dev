import { MedicaoDaVercel } from '@/components/medicao-da-vercel'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ReactQueryProvider } from '@/utils/providers/react-query-provider'
import { previewAtivo } from '@/lib/preview'

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const preview = await previewAtivo()

  return (
    <ReactQueryProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        {preview ? (
          <div
            className="fixed right-0 bottom-0 left-0 z-[100] flex flex-wrap items-center justify-between gap-3 border-t border-amber-600/40 bg-amber-500 px-4 py-3 text-sm text-amber-950 shadow-lg"
            role="status"
          >
            <span className="font-medium">
              Pré-visualização do ramo <code>{preview.branch}</code>: conteúdo
              lido do GitHub, por até 1 hora. O site público só atualiza após
              merge e novo deploy.
            </span>
            <form method="POST" action="/preview/end">
              <button
                type="submit"
                className="rounded-md bg-amber-950 px-3 py-1.5 font-medium text-amber-50 transition-colors hover:bg-amber-900"
              >
                Encerrar pré-visualização
              </button>
            </form>
          </div>
        ) : null}
        {children}
        <Toaster />
        <MedicaoDaVercel rascunho={preview !== null} />
      </ThemeProvider>
    </ReactQueryProvider>
  )
}
