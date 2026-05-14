import '@/app/globals.css'

export default function KeystaticIconPreviewLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="bg-background text-foreground min-h-screen p-6 sm:p-10">
      {children}
    </div>
  )
}
