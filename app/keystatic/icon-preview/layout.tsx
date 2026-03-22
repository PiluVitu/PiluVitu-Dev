import '@/app/globals.css'

export default function KeystaticIconPreviewLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground sm:p-10">
      {children}
    </div>
  )
}
