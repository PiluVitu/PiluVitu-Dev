import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { ReactQueryProvider } from '@/utils/providers/react-query-provider'

export default function AdminGroupLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ReactQueryProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <div className="bg-background text-foreground min-h-screen">
          {children}
        </div>
        <Toaster />
      </ThemeProvider>
    </ReactQueryProvider>
  )
}
